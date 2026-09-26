// The sound of !Browse's pages (tools/browser-server.mjs). This page is opened, unseen, in the headless browser;
// the server calls capture(title, tab) for each tab it opens (the tab is found by a unique title it gives the
// blank page first), and the page's sound comes back through the __riscosAudio binding: "tab:base64", 16-bit
// stereo samples at 48 kHz, silence left out.
const ctx = new AudioContext({ sampleRate: 48000 });
const mute = ctx.createGain();
mute.gain.value = 0;
mute.connect(ctx.destination);
const captures = new Map();

globalThis.capture = async (title, tab) => {
  let found;
  for (let i = 0; i < 30 && !found; i++) {
    [found] = await chrome.tabs.query({ title });
    if (!found) await new Promise((r) => setTimeout(r, 100));
  }
  if (!found) return 'no tab';
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: found.id });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 2, 2);
  src.connect(proc);
  proc.connect(mute);
  proc.onaudioprocess = (e) => {
    const l = e.inputBuffer.getChannelData(0), r = e.inputBuffer.getChannelData(1);
    let peak = 0;
    for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
    if (peak < 1e-4) return;
    const out = new Int16Array(l.length * 2);
    for (let i = 0; i < l.length; i++) {
      out[i * 2] = Math.max(-1, Math.min(1, l[i])) * 32767;
      out[i * 2 + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
    }
    const bytes = new Uint8Array(out.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    globalThis.__riscosAudio?.(tab + ':' + btoa(s));
  };
  captures.set(tab, { stream, src, proc });
  if (ctx.state !== 'running') await ctx.resume();
  return 'ok';
};

globalThis.release = (tab) => {
  const c = captures.get(tab);
  if (!c) return;
  c.proc.disconnect();
  c.src.disconnect();
  for (const t of c.stream.getTracks()) t.stop();
  captures.delete(tab);
};
