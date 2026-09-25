// !JsEdit's lexers (src/apps/JsEdit/modes.js): token classes of JavaScript, BBC BASIC and Obey lines, and
// the state carried from one line to the next. No browser needed.
import fs from 'node:fs';
import path from 'node:path';
import { parseMode, CLASSES } from '../../src/apps/JsEdit/modes.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const mode = (n) => parseMode(fs.readFileSync(path.join(ROOT, 'src/apps/JsEdit/Modes', n), 'utf8'));
/** "[class]text[class]text..." for each line, carrying the state. */
const spans = (m, lines) => { let st = ''; return lines.map((l) => { const r = m.lex(m, l, st); st = r.state; let out = '', cur = -1; for (let i = 0; i < l.length; i++) { if (r.cls[i] !== cur) { cur = r.cls[i]; if (CLASSES[cur] !== 'text') out += `[${CLASSES[cur]}]`; else out += '[]'; } out += l[i]; } return out; }); };
const res = [];
const eq = (name, got, want) => res.push(`${JSON.stringify(got) === JSON.stringify(want) ? 'PASS' : 'FAIL'} ${name}${JSON.stringify(got) === JSON.stringify(want) ? '' : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`}`);

const js = mode('JavaScript');
eq('keywords, numbers, comments', spans(js, ['const n = 6; // six']), ['[keyword]const[] n [punct]=[] [number]6[punct];[] [comment]// six']);
eq('template with ${...}', spans(js, ['`a ${b + 1} c`']), ['[string]`a ${[]b [punct]+[] [number]1[string]} c`']);
eq('regex after = but not division', spans(js, ['r = /x[/]y/g; d = a / 2;']), ['[]r [punct]=[] [regex]/x[/]y/g[punct];[] d [punct]=[] a [punct]/[] [number]2[punct];']);
eq('block comment over lines', spans(js, ['a /* b', 'c */ d']), ['[]a [comment]/* b', '[comment]c */[] d']);
eq('template over lines', spans(js, ['x = `one', 'two` + y']), ['[]x [punct]=[] [string]`one', '[string]two`[] [punct]+[] y']);
eq('api names, not after a dot', spans(js, ['print(task.name)']), ['[api]print[punct]([api]task[punct].[]name[punct])']);
eq('strings with escapes', spans(js, ["'it\\'s'"]), ["[string]'it\\'s'"]);

const bas = mode('BASIC');
eq('BASIC line number, keywords, string', spans(bas, ['10 PRINT "Hi";A%']), ['[lineno]10[] [keyword]PRINT[] [string]"Hi"[punct];[variable]A%']);
eq('BASIC REM, PROC, hex', spans(bas, ['20 PROCgo(&FF):REM go']), ['[lineno]20[] [keyword]PROC[api]go[punct]([number]&FF[punct]):[comment]REM go']);
eq('BASIC * command', spans(bas, ['30 *Cat']), ['[lineno]30[] [command]*Cat']);
eq('BASIC keyword run into a name', spans(bas, ['PRINTa']), ['[keyword]PRINT[variable]a']);

const obey = mode('Obey');
eq('Obey comment', spans(obey, ['| !Run file']), ['[comment]| !Run file']);
eq('Obey command, variable, parameter', spans(obey, ['Run <App$Dir>.!RunImage %*0']), ['[command]Run[] [api]<App$Dir>[].!RunImage [constant]%*0']);
eq('Obey options', spans(obey, ['WimpSlot -min 32K']), ['[command]WimpSlot[] [keyword]-min[] 32K']);

eq('mode files', ['JavaScript', 'BASIC', 'Obey', 'JSON', 'Text'].map((n) => [mode(n).name, mode(n).types.map((t) => t.toString(16))]), [['JavaScript', ['f81']], ['BASIC', ['ffb']], ['Obey', ['feb', 'ffe']], ['JSON', ['f75']], ['Text', ['fff']]]);
eq('completions parsed', js.complete.find((c) => c.name === 'task.every'), { name: 'task.every', args: '(ms, fn)', about: 'Call fn every ms milliseconds; returns a function that stops it' });
console.log(res.join('\n'));
