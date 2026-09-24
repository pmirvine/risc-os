// Entry point so that `node --test tests/sound/` runs all the sound system tests.
// (Running the files directly also works: node --test tests/sound/*.test.mjs)
import './tables.test.mjs';
import './wavesynth.test.mjs';
import './voices.test.mjs';
import './system.test.mjs';
import './clients.test.mjs';
import './output.test.mjs';
