// SOUND / ENVELOPE for BBC BASIC V using Web Audio (silent where Web Audio is unavailable).
//
// SOUND channel, amplitude, pitch, duration [, beat]
//   channel   1..8 (0 = noise); high nibbles as on the BBC: &HSFC (F=flush, H=hold)
//   amplitude -15..0 (loudest..silent), 1..16 = envelope number, &100..&17F logarithmic volume
//   pitch     0..255 BBC quarter-semitones (53 = middle C, 89 = A440), or &xyyy
//             RISC OS 15-bit pitch (octave in bits 12-14, &4000 = middle C)
//   duration  in 1/20 second units (255 = until stopped/replaced)
// Each channel has a queue; when more than 4 notes are pending SOUND waits (returns a Promise)
// like the RISC OS sound scheduler does, so music timing loops work.

export class Sound {
  constructor(opts = {}) {
    this.ctx = null;
    this.enabled = true;
    this.envelopes = new Map();
    this.chanEnd = new Array(9).fill(0);   // audio-clock time at which each channel's queue ends
    this.chanNodes = new Array(9).fill(null).map(() => []);
    this.stereoPos = new Array(9).fill(0);
    this.master = null;
    this.volume = opts.volume ?? 0.25;
    this.waiters = [];
  }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }
  /** call from a user gesture to unlock audio in browsers */
  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume(); }
  enable(on) { this.enabled = on; }
  stereo(c, p) { if (c >= 1 && c <= 8) this.stereoPos[c] = Math.max(-127, Math.min(127, p)) / 127; }
  voices() {}
  voice() {}

  envelope(a) {
    // BBC ENVELOPE N,T,PI1,PI2,PI3,PN1,PN2,PN3,AA,AD,AS,AR,ALA,ALD
    this.envelopes.set(a[0] & 15, a.slice(1));
  }

  static bbcPitchToFreq(p) { return 440 * Math.pow(2, (p - 89) / 48); }
  static freq(pitch) {
    if (pitch >= 256) return 261.6256 * Math.pow(2, ((pitch & 0x7FFF) - 0x4000) / 4096);
    return Sound.bbcPitchToFreq(pitch & 255);
  }

  queued(ch) {
    const c = this.ctx; if (!c) return 0;
    return this.chanNodes[ch].filter((n) => n.end > c.currentTime).length;
  }

  sound(channel, amp, pitch, dur) {
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c) return;
    const ch = channel & 15;
    const flush = (channel >> 4) & 1;
    const now = c.currentTime;
    const list = this.chanNodes[ch & 7] || (this.chanNodes[ch & 7] = []);
    if (flush) {
      for (const n of list) { try { n.osc.stop(); } catch (e) { /* ignore */ } }
      list.length = 0;
      this.chanEnd[ch] = now;
    }
    const pending = list.filter((n) => n.end > now);
    this.chanNodes[ch & 7] = pending;
    const start = Math.max(now + 0.005, this.chanEnd[ch] || 0);
    let seconds = dur >= 255 || dur < 0 ? 5 : Math.max(dur, 0) / 20;
    let level = 0; let env = null;
    if (amp <= 0 && amp >= -15) level = -amp / 15;
    else if (amp >= 1 && amp <= 16) { env = this.envelopes.get(amp); level = 1; }
    else if (amp >= 0x100) level = Math.pow((amp & 0x7F) / 127, 2);
    const node = this.playTone(ch, start, seconds, level, pitch, env);
    this.chanEnd[ch] = start + seconds;
    if (node) this.chanNodes[ch & 7].push(node);
    // queue full -> wait (4 notes per channel like the BBC/RISC OS queue)
    if (this.chanNodes[ch & 7].filter((n) => n.start > c.currentTime).length > 4) {
      const waitUntil = this.chanNodes[ch & 7][this.chanNodes[ch & 7].length - 4].start;
      const ms = Math.max(0, (waitUntil - c.currentTime) * 1000);
      return new Promise((res) => setTimeout(res, ms));
    }
  }

  playTone(ch, start, seconds, level, pitch, env) {
    const c = this.ctx;
    if (seconds <= 0) return null;
    const g = c.createGain();
    g.gain.value = 0;
    let src;
    if (ch === 0) {
      const len = Math.max(1, Math.floor(c.sampleRate * seconds));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      src = c.createBufferSource(); src.buffer = buf;
    } else {
      src = c.createOscillator();
      src.type = 'square';
      src.frequency.setValueAtTime(Sound.freq(pitch), start);
    }
    let out = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = this.stereoPos[ch] || 0;
      g.connect(p); out = p;
    }
    src.connect(g);
    out.connect(this.master);
    const peak = level * 0.6;
    if (env && ch !== 0) {
      // Pitch envelope sections and ADSR from the BBC ENVELOPE parameters
      const [T, PI1, PI2, PI3, PN1, PN2, PN3, AA, AD, AS, AR, ALA, ALD] = env;
      const step = Math.max(1, T & 127) / 100;
      let t = start; let p = pitch & 255;
      const secs = [[PI1, PN1], [PI2, PN2], [PI3, PN3]];
      let guard = 0;
      while (t < start + seconds && guard++ < 2000) {
        for (const [pi, pn] of secs) {
          for (let i = 0; i < (pn & 255) && t < start + seconds; i++) { p = (p + pi) & 255; src.frequency.setValueAtTime(Sound.bbcPitchToFreq(p), t); t += step; }
        }
        if (T & 128) break; // no auto-repeat
        if (!PN1 && !PN2 && !PN3) break;
      }
      const a1 = Math.max(0, Math.min(126, ALA)) / 126, a2 = Math.max(0, Math.min(126, ALD)) / 126;
      const ta = AA > 0 ? (ALA / AA) * step : 0.001;
      const td = AD < 0 ? ((ALA - ALD) / -AD) * step : 0.001;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak * a1, start + ta);
      g.gain.linearRampToValueAtTime(peak * a2, start + ta + td);
      const rel = AR < 0 ? (ALD / -AR) * step : 0.05;
      g.gain.setValueAtTime(peak * a2, start + seconds);
      g.gain.linearRampToValueAtTime(0, start + seconds + Math.min(rel, 2));
      src.start(start); src.stop(start + seconds + Math.min(rel, 2) + 0.01);
    } else {
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.004);
      g.gain.setValueAtTime(peak, start + seconds - 0.004);
      g.gain.linearRampToValueAtTime(0, start + seconds);
      src.start(start); src.stop(start + seconds + 0.01);
    }
    return { osc: src, start, end: start + seconds };
  }

  /** VDU 7 */
  bell() { this.sound(1, -15, 200, 2); }
}
