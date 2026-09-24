// BBC BASIC V language tests (expected results follow BASIC V 1.16 behaviour).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBasic, immediate } from './helpers.mjs';

const run = (src, o) => runBasic(src, o);
const lines = (...a) => a.map((s, i) => `${(i + 1) * 10} ${s}`).join('\n');

test('number printing with @% (G9 default, E and F formats)', async () => {
  assert.equal(await run(lines('PRINT 1/3', 'PRINT 2/3', 'PRINT 1E10', 'PRINT 0.001', 'PRINT 0.01', 'PRINT 1234567890', 'PRINT 123456789', 'PRINT -2.5', 'PRINT 100', 'PRINT 1E-5')),
    '0.333333333\n0.666666667\n      1E10\n      1E-3\n      0.01\n1.23456789E9\n 123456789\n      -2.5\n       100\n      1E-5\n');
  assert.equal(await run(lines('@%=&2020A:PRINT PI;" ";-1/3;" ";1234.5', '@%=&1030A:PRINT PI;" ";1E6', '@%="F8.2":PRINT 2/3', '@%=0:PRINT 1/7')),
    '      3.14 -0.33 1234.50\n  3.14E0   1.00E6  \n    0.67\n0.1428571429\n');
  assert.equal(await run(lines('PRINT STR$(1/3);" ";STR$(1E10);" ";STR$~255;" ";STR$(-7)', '@%=&1020A+&1000000:PRINT STR$(PI)')),
    '0.3333333333 1E10 FF -7\n3.1E0  \n');
  assert.equal(await run(lines('PRINT 9.9999999999, 99999999.95')), '        10 100000000\n');
});

test('PRINT separators, TAB, SPC, ~ and field widths', async () => {
  assert.equal(await run(lines('PRINT 1,2', 'PRINT 1;2', 'PRINT "a","b"', 'PRINT ~255, ~-1', 'PRINT "x";TAB(5);"y";SPC(3);"z"', 'PRINT 1 2', "PRINT '\"n\"", 'PRINT "a";', 'PRINT "b"')),
    '         1         2\n         12\na         b\n        FF  FFFFFFFF\nx    y   z\n         1         2\n\nn\nab\n');
  assert.equal(await run(lines('PRINT "abcdefgh";TAB(3);"x"')), 'abcdefgh\n   x\n');
  assert.equal(await run(lines('A=COUNT:PRINT "abc";COUNT')), 'abc3\n');
});

test('integer and real arithmetic, precedence and operators', async () => {
  assert.equal(await run(lines('PRINT 2+3*4, (2+3)*4, 2^3^2, -2^2, 7/2, 7 DIV 2, -7 DIV 2, -7 MOD 3, 2^-1')),
    '        14        20        64         4       3.5         3        -3        -1       0.5\n');
  assert.equal(await run(lines('PRINT 1<<31, -8>>1, -8>>>28, 5 AND 3, 5 OR 3, 5 EOR 3, NOT 5')),
    '-2.14748365E9               -4        15         1         7         6        -6\n');
  assert.equal(await run(lines('PRINT 2147483647+1;" ";46340*46340;" ";46341*46341;" ";&7FFFFFFF;" ";&FFFFFFFF;" ";%1010')),
    '-2.14748365E9 2.1473956E9 2.14748828E9 2.14748365E9 -1 10\n');
  assert.equal(await run(lines('PRINT 3=3, 3<>3, 2<3, "a"<"b", "b"<"abc", "ab"<"abc", 1=1.0')),
    '        -1         0        -1        -1         0        -1        -1\n');
  assert.equal(await run(lines('PRINT 1+2=3 AND 4>3', 'PRINT NOT 1=1', 'PRINT 2*3 MOD 4')), '        -1\n         0\n         2\n');
  assert.equal(await run(lines('A%=5:A%+=2:PRINT A%', 'B=1.5:B-=0.25:PRINT B', 'C$="x":C$+="yz":PRINT C$')), '         7\n      1.25\nxyz\n');
  assert.equal(await run(lines('A%=2.9:PRINT A%', 'A%=-2.9:PRINT A%')), '         2\n        -2\n');
});

test('maths functions', async () => {
  assert.equal(await run(lines('PRINT INT(-3.5);INT(3.99);ABS(-4);SGN(-2);SGN(0);SGN(0.1)', 'PRINT SQR(2), PI, DEG(PI), RAD(180)', 'PRINT SIN(PI/2), COS(0), TAN(PI/4), ATN(1)*4', 'PRINT LN(EXP(1)), LOG(100), EXP(1)', 'PRINT ASN(1)*2, ACS(-1)')),
    '        -434-101\n1.414213563.14159265       1803.14159265\n         1         1         13.14159265\n         1         22.71828183\n3.141592653.14159265\n');
});

test('string functions and MID$ assignment', async () => {
  assert.equal(await run(lines(
    'A$="Hello World"',
    'PRINT LEFT$(A$,5);"|";RIGHT$(A$,5);"|";MID$(A$,7);"|";MID$(A$,7,3);"|";LEFT$(A$);"|";RIGHT$(A$)',
    'PRINT LEN(A$);INSTR(A$,"o");INSTR(A$,"o",6);INSTR(A$,"z");INSTR(A$,"")',
    'PRINT STRING$(3,"ab");CHR$(65);ASC("a");ASC("")',
    'PRINT VAL("12.5E1");VAL("-3");VAL("  7x");VAL("x")',
    'B$=A$:MID$(B$,1,3)="JEL":PRINT B$',
    'B$=A$:LEFT$(B$,2)="XYZ":PRINT B$',
    'B$=A$:RIGHT$(B$,3)="!!!":PRINT B$',
    'PRINT LEFT$(A$,0);"|";LEFT$(A$,-1);"|";MID$(A$,0,2);"|";MID$(A$,20);"|"')),
    'Hello|World|World|Wor|Hello Worl|d\n        115801\nabababA97-1\n       125-370\nJELlo World\nXYllo World\nHello Wo!!!\n|Hello World|He||\n');
});

test('EVAL and GET$/INKEY$ via the keyboard buffer', async () => {
  assert.equal(await run(lines('x=6:PRINT EVAL("x*7")', 'PRINT EVAL("""str""")+"ing"', 'PRINT EVAL("FNd(4)")', 'END', 'DEF FNd(n)=n*2')), '        42\nstring\n         8\n');
  assert.equal(await run(lines('A$=GET$:B=GET:C=INKEY(0):D=INKEY(0):PRINT A$;B;C;D'), { input: 'xyz' }), 'x121122-1\n');
  assert.equal(await run(lines('PRINT INKEY(-256)')), '       167\n');
});

test('arrays: DIM, whole-array operations, SUM, DIM()', async () => {
  assert.equal(await run(lines(
    'DIM a(3), b%(1,2), c$(2)',
    'a()=1,2,3,4:PRINT SUM(a()), a(3)',
    'b%()=5:b%(1,2)=7:PRINT SUM(b%()), DIM(b%()), DIM(b%(),2)',
    'DIM d(3):d()=a()*2:PRINT d(0), d(3)',
    'd()=a()+d():PRINT d(1)',
    'd()=-a():PRINT d(2)',
    'd()=10-a():PRINT d(0)',
    'c$()="x":c$(1)="yyy":PRINT SUMLEN(c$()), SUM(c$())',
    'PRINT MOD(a())')),
    '        10         4\n        32         2         2\n         2         8\n         6\n        -3\n         9\n         5xyyyx\n5.47722558\n');
  assert.equal(await run(lines('DIM m(1,1),n(1,1),o(1,1)', 'm()=1,2,3,4:n()=5,6,7,8', 'o()=m().n()', 'PRINT o(0,0);" ";o(0,1);" ";o(1,0);" ";o(1,1)')), '        19 22 43 50\n');
});

test('control structures', async () => {
  assert.equal(await run(lines(
    'FOR I=1 TO 3:FOR J=1 TO 2:PRINT ;I*10+J;" ";:NEXT J,I:PRINT',
    'FOR K=10 TO 1 STEP -3:PRINT ;K;" ";:NEXT:PRINT',
    'FOR X=0 TO 1 STEP 0.25:PRINT ;X;" ";:NEXT:PRINT',
    'FOR Z=5 TO 1:PRINT "once";:NEXT:PRINT',
    'N%=0:REPEAT N%+=1:UNTIL N%=4:PRINT N%',
    'WHILE N%>0:N%-=1:ENDWHILE:PRINT N%',
    'WHILE FALSE:PRINT "never":ENDWHILE:PRINT "skipped"')),
    '11 12 21 22 31 32 \n10 7 4 1 \n0 0.25 0.5 0.75 1 \nonce\n         4\n         0\nskipped\n');
  assert.equal(await run(lines('IF 1 THEN PRINT "a" ELSE PRINT "b"', 'IF 0 THEN PRINT "a" ELSE PRINT "b"', 'IF 1 PRINT "c"', 'IF 0 THEN 60 ELSE 70', 'PRINT "no"', 'PRINT "skip"', 'PRINT "yes"')),
    'a\nb\nc\nyes\n');
  assert.equal(await run(lines('X=2', 'IF X=1 THEN', 'PRINT "one"', 'ELSE', 'IF X=2 THEN', 'PRINT "two"', 'ENDIF', 'ENDIF', 'PRINT "done"')), 'two\ndone\n');
  assert.equal(await run(lines('FOR V=1 TO 4', 'CASE V OF', 'WHEN 1:PRINT "one"', 'WHEN 2,3:PRINT "two or three"', 'OTHERWISE PRINT "other ";V', 'ENDCASE', 'NEXT', 'A$="b":CASE A$ OF:WHEN "a":PRINT "A"')),
    'one\ntwo or three\ntwo or three\nother 4\nCASE..OF statement must be the last thing on a line at line 80\n');
  assert.equal(await run(lines('GOSUB 50:PRINT "back"', 'X=2:ON X GOTO 30,40:PRINT "fell"', 'PRINT "wrong"', 'ON 5 GOSUB 50,50 ELSE PRINT "else":END', 'PRINT "sub":RETURN')),
    'sub\nback\nelse\n');
  // NEXT without a variable pops an inner REPEAT loop
  assert.equal(await run(lines('FOR I=1 TO 2:REPEAT:NEXT', 'PRINT I')), '         3\n');
});

test('PROC / FN: parameters, LOCAL, RETURN, recursion, arrays', async () => {
  assert.equal(await run(lines(
    'PRINT FNfact(10), FNfib(15)',
    'x=1:y=2:PROCswap(x,y):PRINT x;y',
    'a=5:PROClocal:PRINT a',
    'DIM arr(2):PROCfill(arr()):PRINT arr(2)',
    'PRINT FNstr("ab",3)',
    'END',
    'DEF FNfact(n) IF n<=1 THEN =1 ELSE =n*FNfact(n-1)',
    'DEF FNfib(n) IF n<2 THEN =n ELSE =FNfib(n-1)+FNfib(n-2)',
    'DEF PROCswap(RETURN a, RETURN b):LOCAL t:t=a:a=b:b=t:ENDPROC',
    'DEF PROClocal:LOCAL a:a=99:ENDPROC',
    'DEF PROCfill(q()):q()=7:ENDPROC',
    'DEF FNstr(s$,n%):LOCAL r$:WHILE n%:r$+=s$:n%-=1:ENDWHILE:=r$')),
    '   3628800       610\n         21\n         5\n         7\nababab\n');
  // parameters are evaluated before any are assigned
  assert.equal(await run(lines('a=1:b=2:PROCp(b,a):END', 'DEF PROCp(a,b):PRINT a;b:ENDPROC')), '         21\n');
  // LOCAL is only allowed directly in a PROC
  assert.equal(await run(lines('PROCx:END', 'DEF PROCx:FOR I=1 TO 2:LOCAL Q:NEXT:ENDPROC')), 'Items can only be made local in a function or procedure at line 20\n');
});

test('DATA / READ / RESTORE', async () => {
  assert.equal(await run(lines('READ a,b$,c', 'PRINT a;b$;c', 'RESTORE 90:READ d:PRINT d', 'RESTORE 80:READ e$,f:PRINT e$;f', 'RESTORE 100:READ g:PRINT g', 'END', 'DATA 1,"two, and",3', 'DATA  spaced out ,&10', 'DATA 42', 'DATA 2*3')),
    '         1two, and3\n        42\nspaced out 16\n         6\n');
  assert.equal(await run(lines('RESTORE +2:READ x:PRINT x', 'DATA 1', 'DATA 2')), '         2\n');
  assert.equal(await run(lines('READ a:READ b', 'DATA 1')), 'Out of data at line 10\n');
  assert.equal(await run(lines('READ a:PROCp:READ b:PRINT a;b:END', 'DEF PROCp:LOCAL DATA', 'RESTORE 50:READ z:PRINT z:ENDPROC', 'DATA 1,2', 'DATA 9')), '         9\n         12\n');
});

test('errors: messages, numbers, ERL, ON ERROR, LOCAL ERROR, REPORT', async () => {
  assert.equal(await run(lines('PRINT X')), 'Unknown or missing variable at line 10\n');
  assert.equal(await run(lines('X=1 2')), 'Syntax error at line 10\n');
  assert.equal(await run(lines('fred')), 'Mistake at line 10\n');
  assert.equal(await run(lines('PRINT 1/0')), 'Division by zero at line 10\n');
  assert.equal(await run(lines('PRINT (1+2')), 'Missing ) at line 10\n');
  assert.equal(await run(lines('PRINT "abc')), 'Missing " at line 10\n');
  assert.equal(await run(lines('GOTO 99')), 'No such line at line 10\n');
  assert.equal(await run(lines('PROCnone')), 'No such function/procedure at line 10\n');
  assert.equal(await run(lines('DIM A(2):A(3)=1')), 'Subscript out of range at line 10\n');
  assert.equal(await run(lines('A$=1')), 'Type mismatch: string needed at line 10\n');
  assert.equal(await run(lines('A=SQR(-1)')), 'Negative root at line 10\n');
  assert.equal(await run(lines('A=LN(0)')), 'Logarithm range at line 10\n');
  assert.equal(await run(lines('A%=1E10')), 'Number too big at line 10\n');
  assert.equal(await run(lines('A$=STRING$(200,"ab")')), 'String too long at line 10\n');
  assert.equal(await run(lines('NEXT')), 'Not in a FOR loop at line 10\n');
  assert.equal(await run(lines('UNTIL 1')), 'Not in a REPEAT loop at line 10\n');
  assert.equal(await run(lines('RETURN')), 'Not in a subroutine at line 10\n');
  assert.equal(await run(lines('ENDPROC')), 'Not in a procedure at line 10\n');
  assert.equal(await run(lines('STOP')), 'Stopped at line 10\n');
  assert.equal(await run(lines('ERROR 123,"Custom error"')), 'Custom error at line 10\n');
  assert.equal(await run(lines('ON ERROR PRINT REPORT$;" (";ERR;") at ";ERL:END', 'X=1/0')), 'Division by zero (18) at 20\n');
  assert.equal(await run(lines('ON ERROR REPORT:PRINT " err=";ERR:END', 'ERROR 7,"Seven"')), '\nSeven err=7\n');
  assert.equal(await run(lines(
    'PROCtry:PRINT "after"', 'END',
    'DEF PROCtry', 'LOCAL ERROR', 'ON ERROR LOCAL PRINT "caught ";REPORT$:ENDPROC', 'Q=1/0', 'ENDPROC')),
  'caught Division by zero\nafter\n');
  assert.equal(await immediate(['PRINT X', 'fred', 'PRINT 3+']), '\nUnknown or missing variable\n\nMistake\n\nUnknown or missing variable\n');
});

test('indirection operators and DIM space', async () => {
  assert.equal(await run(lines('DIM b% 20', '?b%=65:b%?1=66:PRINT ?b%;b%?1', '!b%=&12345678:PRINT ~b%?0;" ";~b%!0', '$b%="Hi there":PRINT $b%;LEN($b%)', 'b%!4=-1:PRINT b%!4;b%?5', '|b%=PI:PRINT |b%', 'PRINT b%>=LOMEM AND b%<HIMEM')),
    '        6566\n        78 12345678\nHi there8\n        -1255\n3.14159265\n        -1\n');
  assert.equal(await run(lines('DIM a% -1:DIM b% 3:PRINT b%-a%')), '        12\n');
});

test('TIME, TIME$ and RND', async () => {
  const out = await run(lines('TIME=0:T%=TIME:PRINT T%<10', 'PRINT LEN(TIME$)', 'PRINT MID$(TIME$,4,1);MID$(TIME$,16,1);MID$(TIME$,19,1)'));
  assert.equal(out, '        -1\n        24\n,.:\n');
  // RND(-n) reseeds: the sequence is repeatable
  const a = await run(lines('X=RND(-42):FOR I=1 TO 5:PRINT RND(100);:NEXT:PRINT', 'X=RND(-42):FOR I=1 TO 5:PRINT RND(100);:NEXT:PRINT', 'R=RND(1):PRINT R>=0 AND R<1', 'PRINT RND(0)=R'));
  const [l1, l2, l3, l4] = a.split('\n');
  assert.equal(l1, l2);
  assert.equal(l3, '        -1');
  assert.equal(l4, '        -1');
});

test('SWAP, LOCAL arrays, CLEAR, ERL in immediate', async () => {
  assert.equal(await run(lines('a=1:b=2:SWAP a,b:PRINT a;b', 'DIM x(1),y(1):x(0)=5:SWAP x(),y():PRINT y(0)', 'A$="p":B$="q":SWAP A$,B$:PRINT A$;B$')), '         21\n         5\nqp\n');
  assert.equal(await run(lines('PROCa:END', 'DEF PROCa:LOCAL z():DIM z(3):z(3)=4:PRINT z(3):ENDPROC')), '         4\n');
});

test('immediate mode commands: LIST, RENUMBER, DELETE, NEW/OLD', async () => {
  const out = await immediate(['10 PRINT "A"', '20 PRINT "B"', '30 PRINT "C"', 'DELETE 20,20', 'RENUMBER 100,5', 'LIST', 'NEW', 'LIST', 'OLD', 'LIST 105']);
  assert.equal(out, '  100 PRINT "A"\n  105 PRINT "C"\n  105 PRINT "C"\n');
});

test('INPUT and INPUT LINE from the keyboard buffer', async () => {
  assert.equal(await run(lines('INPUT "Name",N$:PRINT "Hi ";N$', 'INPUT A,B:PRINT A+B', 'INPUT LINE L$:PRINT L$'), { input: 'Fred\r3,4\r  a, b  \r' }),
    'Name?Fred\nHi Fred\n?3,4\n         7\n?  a, b  \n  a, b  \n');
});

test('LOCAL ERROR / RESTORE ERROR and ERROR EXT', async () => {
  assert.equal(await run(lines('ON ERROR PRINT "outer":END', 'PROCp', 'X=1/0', 'DEF PROCp:LOCAL ERROR:ON ERROR LOCAL PRINT "inner":ENDPROC', 'ENDPROC')), 'outer\n');
});

test('FN side effects: left operands are evaluated before the FN (left to right)', async () => {
  const { runBasic } = await import('./helpers.mjs');
  const out = await runBasic([
    '10 x=1:PRINT x+FNinc',
    '20 p%=1:s$="abc":PRINT MID$(s$,p%,1)+FNnext+MID$(s$,p%,1)',
    '30 A$="a":A$=A$+FNapp:PRINT A$',
    '40 x=10:y=x*2+FNinc*100:PRINT y',
    '50 x=1:PRINT x=FNinc,x',
    '60 END',
    '70 DEF FNinc:x+=1:=x',
    '80 DEF FNnext:p%+=1:=""',
    '90 DEF FNapp:A$="zzz":="b"',
  ].join('\n'));
  assert.equal(out, '         3\nab\nab\n      1120\n         0         2\n');
});

test('"str" + FNx where FNx has no $ in its name (dynamically typed, as in crunched programs)', async () => {
  assert.equal(await run(lines('PRINT ">"+FNa("M1")', 'PRINT ">"+FNb', 'END', 'DEF FNa(k$)="<"+k$+">"', 'DEF FNb=1')),
    '><M1>\nType mismatch: string needed at line 20\n');
});
