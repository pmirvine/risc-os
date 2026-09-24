// Entry point so that `node --test tests/basic/` runs all BASIC tests.
// (Running the files directly also works: node --test tests/basic/*.test.mjs)
import './tokens.test.mjs';
import './lang.test.mjs';
import './asm.test.mjs';
import './graphics.test.mjs';
import './files.test.mjs';
import './machine.test.mjs';
import './vdu.test.mjs';
import './host.test.mjs';
