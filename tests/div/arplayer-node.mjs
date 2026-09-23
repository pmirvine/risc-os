// node tests/div/arplayer-node.mjs - ARMovie header parsing / sound decoding for !ARPlayer (no browser)
import fs from 'fs';
import path from 'path';
import { readHeader, movieLength, decodeTrack, helpfulSprite, parseInfoFile } from '../../src/apps/ARPlayer/armovie.js';
const dir = 'assets/disc/HardDisc4/Diversions/AudioDemos';
const info = parseInfoFile(fs.readFileSync('assets/disc/HardDisc4/=21Boot/Resources/=21ARMovie/Sound16/adpcm/Info', 'latin1'));
let fail = 0;
for (const f of fs.readdirSync(dir)) {
  const b = new Uint8Array(fs.readFileSync(path.join(dir, f)));
  const h = readHeader(b, (n) => (n === 'adpcm' ? info : null));
  if (!h) continue;
  const { length, nframes } = movieLength(h);
  const s = decodeTrack(b, h, 1);
  const n = s?.channels[0].length ?? 0;
  const peak = s ? s.channels[0].reduce((m, v) => Math.max(m, Math.abs(v)), 0) : 0;
  console.log(f.padEnd(10), `v${h.videoFormat} ${h.xsize}x${h.ysize} ${h.fps}fps tracks=${h.nsoundtracks} ${h.sound[0]?.filename} ${h.sound[0]?.rate}Hz ch${h.sound[0]?.channels}`,
    `chunks=${h.nchunks} cat=${h.catalogue.length} len=${length}cs frames=${nframes} samples=${n} (${(n / (s?.rate || 1)).toFixed(2)}s) peak=${peak.toFixed(2)} sprite=${helpfulSprite(b, h)?.length}`);
  if (!n || peak <= 0.01 || peak > 1.01) fail++;
}
if (fail) { console.log('FAIL', fail); process.exit(1); } else console.log('OK');
