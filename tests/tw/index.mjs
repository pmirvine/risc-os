// node --test tests/tw : TaskWindow (Ctrl-F12, *commands, BASIC, suspend/kill, Task Manager).
import { suite } from '../lib/suite.mjs';
suite('tw', [{ name: 'taskwindow', args: ['tests/tw/tw.mjs'] }]);
