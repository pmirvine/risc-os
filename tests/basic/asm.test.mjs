// Inline ARM assembler encodings and ARM2 emulation via CALL / USR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBasic } from './helpers.mjs';

const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');

/** assemble one instruction at P%=code% and return the hex word */
async function enc(ins) {
  const out = await runBasic(lines('DIM c% 64', 'P%=c%', `[OPT 2:${ins}:]`, 'PRINT ~!c%'));
  return out.trim();
}

test('instruction encodings', async () => {
  const cases = {
    'MOV R0,#65': 'E3A00041',
    'ADD R0,R0,#1': 'E2800001',
    'MOVS PC,R14': 'E1B0F00E',
    'mov r3,r4': 'E1A03004',
    'LDR R0,[R1,#4]': 'E5910004',
    'STR R0,[R1],#4': 'E4810004',
    'LDRB R2,[R3,R4]': 'E7D32004',
    'LDR R0,[R1,-R2,LSL #2]!': 'E7310102',
    'STRB R5,[R6,#-1]': 'E5465001',
    'STMFD R13!,{R0-R3,R14}': 'E92D400F',
    'LDMFD R13!,{R0-R3,PC}^': 'E8FD800F',
    'LDMIA R0,{R1,R2}': 'E8900006',
    'MUL R0,R1,R2': 'E0000291',
    'MLA R0,R1,R2,R3': 'E0203291',
    'TEQP PC,#0': 'E33FF000',
    'MOV R1,R2,ASR R3': 'E1A01352',
    'RSBS R0,R0,#0': 'E2700000',
    'BIC R0,R0,#&FF000000': 'E3C004FF',
    'ORR R0,R0,R1,LSL #8': 'E1800401',
    'ANDEQ R0,R1,R2': '10002',
    'MOVNE R0,#1': '13A00001',
    'MOVEQ R0,#2': '3A00002',
    'EORS R1,R1,R1': 'E0311001',
    'CMP R0,#&46': 'E3500046',
    'CMN R1,#1': 'E3710001',
    'TST R0,#&80000000': 'E3100102',
    'SWI "OS_WriteC"': 'EF000000',
    'SWI "XOS_Write0"': 'EF020002',
    'SWI &100+ASC"A"': 'EF000141',
    'MOV R0,R0,RRX': 'E1A00060',
    'MOV R0,R1,LSR #32': 'E1A00021',
    'ADC R0,R1,R2,ROR #3': 'E0A101E2',
    'SBC R0,R0,R0': 'E0C00000',
    'MVN R0,#0': 'E3E00000',
  };
  for (const [ins, hex] of Object.entries(cases)) assert.equal(await enc(ins), hex, ins);
});

test('assembler errors', async () => {
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 2:FOO R0,R1:]')), 'No such mnemonic at line 30\n');
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 2:MOV R0,#&101:]')), 'Bad immediate constant at line 30\n');
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 2:MOV 16,#1:]')), 'Bad register at line 30\n');
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 2:MOV R16,#1:]')), 'Unknown or missing variable at line 30\n');
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 2:MUL R0,R0,R1:]')), 'Duplicate register in multiply at line 30\n');
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 2:LDR R0,[R1,#4096]:]')), 'Bad address offset at line 30\n');
  // OPT 0 suppresses errors (first pass with forward references)
  assert.equal(await runBasic(lines('DIM c% 64', 'P%=c%', '[OPT 0:B later:MOV R0,#&101:]', 'PRINT "ok"')), 'ok\n');
});

test('directives, labels, forward references and listing', async () => {
  const out = await runBasic(lines(
    'DIM c% 100',
    'FOR pass=0 TO 2 STEP 2',
    'P%=c%',
    '[OPT pass',
    '.start B fwd',
    '.bytes EQUB 1:EQUB 2:EQUW &304:ALIGN',
    '.str EQUS "Hi":EQUB 0:ALIGN',
    '.fwd ADR R0,str',
    '.word EQUD &DEADBEEF:DCD 7:DCW 8:DCB 9:= "AB"',
    ']',
    'NEXT',
    'PRINT ;~start!0;" ";~bytes!0;" ";CHR$(str?0);CHR$(str?1);" ";fwd-c%;" ";~word!0;" ";~word!4;" ";word?8;word?10;word?11;word?12',
    'PRINT ;~!fwd'));
  assert.equal(out, 'EA000001 3040201 Hi 12 DEADBEEF 7 896566\nE24F000C\n');
  const listing = await runBasic(lines('DIM c% 16', 'P%=c%', '[OPT 1', '.lab MOV R0,#1 ; comment', 'SWI "OS_WriteC"', ']'));
  const ls = listing.split('\n').filter(Boolean);
  assert.match(ls[1], /^[0-9A-F]{8} E3A00001 \.lab      MOV R0,#1 ; comment$/);
  assert.match(ls[2], /^[0-9A-F]{8} EF000000           SWI "OS_WriteC"$/);
});

test('CALL and USR run ARM code with A%-H% in R0-R7', async () => {
  const out = await runBasic(lines(
    'DIM code% 256',
    'FOR pass=0 TO 2 STEP 2',
    'P%=code%',
    '[OPT pass',
    '.print MOV R0,#65',
    '.loop SWI "OS_WriteC"',
    'ADD R0,R0,#1:CMP R0,#ASC"E":BLE loop',
    'SWI "OS_NewLine":MOV PC,R14',
    '.add ADD R0,R0,R1:ADD R0,R0,R2:MOV PC,R14',
    '.mul MUL R3,R0,R1:MOV R0,R3:MOV PC,R14',
    '.fact MOV R1,#1',
    '.fl CMP R0,#1:MOVLE R0,R1:MOVLE PC,R14',
    'MUL R2,R1,R0:MOV R1,R2:SUB R0,R0,#1:B fl',
    '.stack STMFD R13!,{R4,R14}:MOV R4,R0:BL sq:ADD R0,R0,R4:LDMFD R13!,{R4,PC}',
    '.sq MUL R1,R0,R0:MOV R0,R1:MOV PC,R14',
    '.str ADR R0,msg:SWI "OS_Write0":MOV PC,R14',
    '.msg EQUS "Hello from ARM":EQUB 0:ALIGN',
    '.flags MOVS R0,#0:MOV PC,R14',
    ']',
    'NEXT',
    'CALL print',
    'A%=1:B%=2:C%=3:PRINT USR add',
    'A%=6:B%=7:PRINT USR mul',
    'A%=10:PRINT USR fact',
    'A%=5:PRINT USR stack',
    'CALL str:PRINT',
    'A%=-5:PRINT USR (add)'));
  assert.equal(out, 'ABCDE\n         6\n        42\n   3628800\n        30\nHello from ARM\n         5\n');
});

test('ARM data processing flags, shifts and memory access', async () => {
  const out = await runBasic(lines(
    'DIM code% 512, buf% 64',
    'FOR pass=0 TO 2 STEP 2',
    'P%=code%',
    '[OPT pass',
    '.carry MOV R1,#&80000000:ADDS R1,R1,R1:MOV R0,#0:ADC R0,R0,#0:MOV PC,R14',
    '.over MOV R1,#&7F000000:ORR R1,R1,#&FF0000:ORR R1,R1,#&FF00:ORR R1,R1,#&FF:ADDS R1,R1,#1:MOVVS R0,#1:MOVVC R0,#0:MOV PC,R14',
    '.shifts MOV R1,#1:MOV R0,R1,LSL #31:MOV R0,R0,ASR #4:MOV PC,R14',
    '.rot MOV R1,#&F:MOV R0,R1,ROR #4:MOV PC,R14',
    '.mem MOV R2,#&41:STRB R2,[R0]:ADD R2,R2,#1:STRB R2,[R0,#1]!:MOV R2,#13:STRB R2,[R0,#1]:MOV PC,R14',
    '.ldm MOV R1,#1:MOV R2,#2:MOV R3,#3:STMIA R0,{R1-R3}:LDMIB R0!,{R4,R5}:ADD R0,R4,R5:MOV PC,R14',
    '.cmp CMP R0,R1:MOVLT R0,#1:MOVGE R0,#2:MOVEQ R0,#3:MOV PC,R14',
    '.rsb RSB R0,R0,#100:MOV PC,R14',
    ']',
    'NEXT',
    'PRINT USR carry;USR over;" ";~USR shifts;" ";~USR rot',
    'A%=buf%:CALL mem:PRINT $buf%',
    'A%=buf%:PRINT USR ldm',
    'A%=1:B%=2:PRINT ;USR cmp;:A%=2:B%=1:PRINT ;USR cmp;:A%=2:B%=2:PRINT ;USR cmp',
    'A%=30:PRINT USR rsb'));
  assert.equal(out, '         11 F8000000 F0000000\nAB\n         5\n123\n        70\n');
});

test('SYS with strings, outputs and flags', async () => {
  const out = await runBasic(lines(
    'SYS "OS_ConvertHex4",&1234,buf%,16 TO a$,b%,c%:PRINT a$',
    'SYS "OS_ReadModeVariable",-1,4 TO ,,x%:PRINT x%',
    'SYS "XOS_ReadVarVal","NoSuchVar",0,-1,0,0 TO ;f%:PRINT f% AND 1',
    'SYS "OS_SWINumberFromString",,"OS_WriteC" TO n%:PRINT n%',
    'SYS &100+ASC"Z":SYS "OS_NewLine"').replace('10 SYS', '5 DIM buf% 16\n10 SYS'));
  assert.equal(out, '1234\n         1\n         1\n         0\nZ\n');
});

test('BBC MOS emulation via CALL &FFEE / USR &FFF4', async () => {
  const out = await runBasic(lines('A%=66:CALL &FFEE:A%=10:CALL &FFE3:PRINT', 'A%=0:X%=1:R%=USR &FFF4:PRINT (R% AND &FF00) DIV 256'));
  assert.equal(out, 'B\n\n         6\n');
});
