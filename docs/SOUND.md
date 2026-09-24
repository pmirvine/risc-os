# Sound (src/core/sound/)

An emulation of the RISC OS 3.71 sound system, ported from the ARM sources in
`vendor/ro371/Sources/OS_Core/HWSupport/Sound`: SoundDMA (`Sound0`), SoundChannels (`Sound1`),
SoundScheduler (`Sound2`) and the ROM voices WaveSynth, StringLib and Percussion (`Voices/`).
There is one sound system for the whole desktop, as on the real machine. The Wimp beep, VDU 7,
BBC BASIC, Maestro, MineHunt and the sound * commands all share it. Plain ES modules with no
dependencies. It runs in the browser (Web Audio) and headless in node (tests, BASIC).

## Modules

| file | contents |
|---|---|
| `tables.js` | period (48 µs = 20833 Hz), buffer length (208), the VIDC log → linear table (Sound0 `convtable`), `buildLogTable` / `buildAmpTable` (Sound1 `BuildLogTable`), `PITCH_TAB`, `pitchToInc` (SoundShared pitch code), `bbcPitchTo15`, `amp7ToLinear32` |
| `wavesynth.js` | `WaveSynthVoice` over a `!WT:` wavetable image; `beepWavetable()` builds the ROM "Beep" table (header, envelope descriptors, the 256-byte log sine) |
| `stringlib.js` | `StringVoice`: the StringLib/Percussion plucked-string engine; `stringLibVoices()`, `percussionVoices()` |
| `system.js` | `SoundSystem`: Level0 (configure, enable, stereo, speaker, the 16-bit mix), Level1 (channel control blocks, SOUND, voices, volume, tuning), Level2 (queue, tempo, beat counter), `swi(num, regs)`, `fill()` |
| `output.js` | `SoundOutput`: the clock (`sync()` to the wall clock) and the Web Audio renderer |
| `index.js` | the shared `soundSystem()` / `soundOutput()`, `vdu7()`, the kernel `bell` variables, `configureSound()`, `voicesText()`, `afterFills()` |
| `commands.js` | `*Voices`, `*ChannelVoice`, `*Volume`, `*Sound`, `*Tuning`, `*Stereo`, `*Speaker`, `*Audio`, `*Tempo`, `*QSound` |

## How it works

`SoundSystem.fill()` is one Level0 sound interrupt, i.e. one 208-sample buffer (9.984 ms, the
"centisecond" of SOUND durations):

1. **Level2** (`qDispatch`): the tempo accumulator (`QTempo`, &1000 = one tick per buffer) advances.
   The beat counter (`QBeat`, wrapping at `BEATS`) counts. Events queued with `Sound_QSchedule` for
   the reached ticks are dispatched: SOUND, an SWI, or a JS function. JS "Level2 clients" in
   `listeners` run too (Maestro's player, `afterFills`).
2. **Level1**: for each of the first `VOICES` channels, the SCCB flags pick the voice entry
   (GateOff > GateOn > Update > Fill). The voice fills the channel's buffer with VIDC log samples
   and returns Active or Flush. Quiet channels are flushed twice (double buffering).
3. **Level0 mix**: the 3.71 16-bit output code. Each log byte goes through `convtable` (±3952),
   is weighted by its channel's stereo image (1-7: left/right weights 6/0, 5/1, 4/2, 3/3, ...),
   summed, and scaled by ×11 >> (3 + log2 channels). The result goes to `left` / `right` Float32
   (value / 32768).

`SoundOutput` drives it. While anything may sound, a 25 ms timer renders fills up to 120 ms ahead
of `AudioContext.currentTime`. It resamples them to the context rate with linear interpolation
from a persistent FIFO (continuous across buffers, like Sound0's 2× linear oversampling) and
schedules them as `AudioBufferSourceNode`s at exact frame positions, so buffers join without gaps.
When everything is quiet (`idle()`) it stops. Commands then call `sync()` first, which runs fills
up to the wall clock without output, so the beat counter, note durations and scheduled events
keep real time with no audio at all (node, or before the browser allows audio). After a
main-thread stall the renderer skips the missed fills rather than scheduling into the past.
Audio starts on the first user gesture (pointer/key listeners resume the context).

## Semantics (as the ARM code)

* **SOUND c,a,p,d** is OS_Word 7 → `Sound_ControlPacked`. It is immediate: the note replaces
  whatever channel c is playing, and there is no per-channel queue (unlike the BBC Micro).
  **SOUND c,a,p,d,b** is `Sound_QSchedule` at beat b of the current bar.
  * channel: only the low 4 bits, 1-8. The BBC H/S/flush bits are ignored, so `&1011` is
    channel 1. Only the first `VOICES` channels are filled (1 at power-on).
  * amplitude: −15..0 → 7-bit log amplitude `((a−1) AND 15) << 2 EOR &7F`. 0 is silent (gate
    off + gate on). &100-&17F is gate on with a 7-bit log amplitude, &180-&1FF a smooth update
    (new pitch/amplitude, same phase and envelope). 1-&FF (envelopes) are ignored:
    OS_Word 8 / ENVELOPE does nothing in 3.71.
  * pitch: 0-255 is the BBC scale (48 per octave, 53 = middle C, via `BBCPitchInc16`),
    &100-&7FFF is 15-bit (octave in bits 12-14, &1000 per octave, 8 significant fraction bits,
    &4000 = middle C), and ≥ &8000 is the raw phase increment. Sound_Tuning (default &6AB0) is added.
  * duration: 1/20 s (×5 buffer fills), 255 = forever, 0 = keep the previous duration.
* **VDU 7** (`vdu7()`, `wimp.beep()`, BASIC's bell, the F12 console) builds OS_Word 7 from the
  kernel's bell variables (OS_Byte 211-214): channel 1, BELLinfo &90 (−13, *Configure Loud) or
  &D0 (−5, Quiet), pitch 100, duration 6. That is WaveSynth-Beep at 434.9 Hz for 0.3 s plus release.
* **Voices** in ROM install order: 1 WaveSynth-Beep, 2-5 StringLib-Soft/Pluck/Steel/Hard,
  6-9 Percussion-Soft/Medium/Snare/Noise.
* **Volume**: `Sound_Volume` 1-127 rebuilds the log tables. The CMOS loudness 0-7 maps to &01..&7F
  (`(L<<4)|(L<<1)|1`), and config.js applies it.

### The voices

* **WaveSynth-Beep**: a 16.16 phase accumulator plays the 256-byte log sine. Amplitude is applied
  in the log domain: each byte minus 2 × (note attenuation + envelope attenuation), clamped at 0.
  The envelope walks the table's descriptors. Attack ramps up to &7F, one step per 2 groups of 4
  samples (~49 ms). Decay goes to &70 at one step per 32 groups (~92 ms). Sustain ramps to 0 at one
  step per 501 groups, so a "forever" note fades out after ~10.9 s. Release is one step per 2 groups
  when the duration ends. Segment changes wait for a zero crossing. An explicit gate off (a new
  note with amplitude 0) cuts to silence, as the ARM code does. `new WaveSynthVoice(bytes)` plays
  any `!WT:` wavetable (e.g. !BrassOrgn's Brass15 and Organ01) through `installVoice()`.
* **StringLib**: a one-period (128-sample) Karplus-Strong string. GateOn fills the delay line with
  ±amplitude from a 33-bit shift-register generator, always seeded &AAAAAAAA, so every note starts
  identically, and mutes the first buffer. Every ~2 cs the period is filtered,
  y = x₋₁/2ᵃ + x₊₁/2ᵃ + x − x/2ᵃ⁻¹ (a = 2 Soft, 3 Pluck, 4 Steel, 5 Hard), and converted to log
  through the volume-scaled log table. Notes stop dead after their duration, which is 12 bits of
  centiseconds (255 = 4091 cs).
* **Percussion**: the same engine at a fixed increment of &100 (81.4 Hz; the SOUND pitch is
  ignored). It filters every ~1.2 cs with a = 3 Soft, 4 Medium, 5 Snare, 6 Noise, and flips each
  sample's sign when an LFSR (mask &1D872B41) shifts out a 1, which gives a decaying noise burst.

## Fidelity notes

Ported instruction by instruction, and tested:
* the log ↔ linear tables, `BuildLogTable` and the amplitude table, `PitchTab` and the pitch
  arithmetic including its truncations, and SoundShared's parameter decoding and flag rules;
* Level1's entry priority, the flag patch-up after each voice call, flushes, and the forced flush
  when the channel count changes;
* WaveSynth's sample loop, envelope interpreter and zero-crossing segment changes. This includes
  the extra count tick at every buffer boundary, which makes the attack 26, 53, 79, 106 after
  1-4 fills;
* StringLib/Percussion: the random generator, the filters (with the ARM's wrap-around quirk: new
  sample 0 is used as sample 128), the log conversion, and the tempo/evolution accumulators with
  their signed-overflow tests;
* Level2's tempo accumulator, beat counter, `QLast`, relative times, and each dispatch running the
  current slot and the reached ones (an event at tick t fires in buffer t−1);
* the 3.71 16-bit output mix and ConvImages' stereo positions.

Differences and approximations:
* **Pitch**: at the 48 µs period the ARM tables give middle C (53 / &4000) an increment of 813,
  which is **258.45 Hz**, about 21 cents flat. Sound1's DefMasterPitch comment claims 261.6 Hz,
  but the code computes 258.45, and so do we. A (89) is 434.9 Hz.
* **Default voice attachment**: Sound1's initialisation attaches the CMOS voice to channel 1 only;
  channels 2-8 start with no voice. Here every channel starts on WaveSynth-Beep, so `VOICES 4 :
  SOUND 2,...` works without `VOICE` (`new SoundSystem({attachAll: false})` gives the ROM
  behaviour). The CMOS channel 1 voice (Configure) is applied once at boot, as in Sound1.
* **Output path**: this is RiscPC 16-bit output emulation. The 8-bit VIDC DAC and the analogue
  filtering of older machines are not modelled. Resampling to the Web Audio rate is linear
  interpolation.
* **Latency**: commands act on the next buffer to be rendered. That is ~30 ms after an idle
  start, and up to ~150 ms while sound is already playing (the look-ahead). Durations, tempo and
  scheduling are exact relative to each other.
* **Scheduler storage**: the queue is a map from absolute tick to events, not the 256-slot wheel.
  Capacity is counted like the 8K free list: 445 elements, 3 for each new time and 1 for each
  further event at that time. `Sound_QFree` gives 111 − depth.
* Voice generators in ARM code can't be installed (`Sound_InstallVoice` flavours 0/2/3 and JS
  voice objects work). `Sound_Mode` reports a mu-law-only system. `Sound_LinearHandler`,
  `Sound_SampleRate`, overrun flags and `Event_Sound` to the OS are not emulated; beat-counter
  wraps call `eventHandlers`. `Sound_ReadControlBlock` covers the first 32 bytes of the SCCB.
* **Maestro** plays each note as the original does (`SOUND c, vol OR &100, Line()+Aoff(), D%`,
  with `Sound_Configure 8`, `Sound_AttachVoice` and `Sound_Stereo` per channel, and
  `Sound_Volume`). The notes are dispatched from the sound interrupt by elapsed buffers rather
  than by `Sound_QSchedule` ticks; it's the same 1 cs grid. Unlike the original it restores the
  system volume when playback stops. Its stereo positions truncate like `Stereo%()`, so "Left"
  (−84) is fully left, as in 3.71.
* **MineHunt**'s speech samples aren't on the disc, so WaveSynth-Beep notes and Percussion-Noise
  stand in for them. Sample players (ARPlayer, !Player) use Web Audio directly.

## API

```js
import { soundSystem, soundOutput, vdu7, configureSound, afterFills } from './src/core/sound/index.js';
const s = soundSystem();
s.configure(4);                         // Sound_Configure (VOICES 4): returns [old channels, buffer, period, 0, 0]
s.attachNamedVoice(2, 'StringLib-Steel');   // VOICE 2,"StringLib-Steel" (SoundError if unknown)
s.stereo(2, -127);                      // Sound_Stereo (-128 reads)
s.control(2, -15, 53, 20);              // Sound_Control: SOUND 2,-15,53,20
s.controlPacked(r0, r1);                // Sound_ControlPacked / OS_Word 7
s.qSchedule(beat, 0, d0, d1);           // Sound_QSchedule (control 0 = SOUND, &0F000000|swi, or a function)
s.qTempoSWI(t); s.qBeatSWI(n);          // Sound_QTempo / Sound_QBeat (0 reads the beat, -1 the bar length)
s.volume(v); s.tuning(t); s.enable(r0); s.speaker(r0); s.qInit(); s.hush();
s.swi(SWI.Sound_AttachVoice, regs);     // any Sound_* SWI by number, registers in place
s.voices();                             // [{n, name, local, channels}]
s.installVoice(new WaveSynthVoice(bytes));  // another voice: returns its number
vdu7();                                 // the bell
configureSound({ volume: 0-7, speaker, loud, voice });   // from the CMOS settings (config.js)
afterFills(n, (sys) => ...);            // run code from the sound interrupt n buffers later
soundOutput().resume();                 // from a user gesture
```

Headless: `new SoundSystem()` and `fill()` give `left`/`right` buffers directly (the tests do
this). `new SoundOutput(sys, { audio: false })` adds the wall clock. BASIC uses
`new Sound()` (src/basic/sound.js, see docs/BASIC.md), which is the shared system in the desktop.
`new Sound({ system })` gives a separate one.

## Tests

`node --test tests/sound/`:
* `tables`: log/linear, log table, volume scaling, pitch (53 = 813 = 258.45 Hz, 48 per octave, &4000, fine pitch, raw increments, tuning);
* `wavesynth`: the Beep table image, the samples = table − 2 × attenuation, the envelope milestones, release, log-domain amplitude and volume, smooth update, loading Organ01 (when vendor/ is present);
* `voices`: each StringLib and Percussion voice's period, duration, damping and decay;
* `system`: SOUND semantics, channels, the mix and stereo, enable/speaker, the scheduler, the beat counter, VDU 7, escape, the clock;
* `clients`: BASIC statements and SWIs, `*Voices`, VDU 7 on the shared system, Maestro's note parameters;
* `output`: frame-contiguous click-free buffers and stall recovery with a fake AudioContext.
