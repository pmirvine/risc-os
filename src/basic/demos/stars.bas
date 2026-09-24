   10 REM > Stars
   20 REM Starfield: 300 stars fly towards you in 3D.
   30 REM Each star is drawn as a streak from where it was
   40 REM last frame, on a double-buffered screen.
   50 REM Cursor Up/Down change speed, any other key quits.
   60 ON ERROR PROCerror:END
   70 MODE 28:OFF
   80 *FX 4,1
   90 n%=300:speed=0.05
  100 DIM x(n%),y(n%),z(n%),ox%(n%),oy%(n%)
  110 FOR i%=0 TO n%:PROCstar(i%):z(i%)=0.3+RND(1)*5:NEXT
  120 bank%=1:frames%=0:T%=TIME
  130 REPEAT
  140   bank%=3-bank%:SYS "OS_Byte",112,bank%
  150   CLG
  160   FOR i%=0 TO n%
  170     z(i%)-=speed
  180     IF z(i%)<0.15 THEN PROCstar(i%)
  190     sx%=640+x(i%)*480/z(i%):sy%=480+y(i%)*480/z(i%)
  200     IF sx%<0 OR sx%>1279 OR sy%<0 OR sy%>959 THEN
  210       PROCstar(i%)
  220     ELSE
  230       b%=15-z(i%)*3:IF b%<1 THEN b%=1
  240       GCOL (b% DIV 4)*21 TINT (b% MOD 4)*64
  250       IF ox%(i%)<0 THEN POINT sx%,sy% ELSE LINE ox%(i%),oy%(i%),sx%,sy%
  260       IF b%>12 THEN RECTANGLE FILL sx%-2,sy%-2,4,4
  270       ox%(i%)=sx%:oy%(i%)=sy%
  280     ENDIF
  290   NEXT
  300   GCOL 63:VDU 5:MOVE 16,944:PRINT "STARFIELD   speed ";INT(speed*100+0.5):VDU 4:OFF
  310   WAIT:SYS "OS_Byte",113,bank%
  320   frames%+=1
  330   k%=INKEY(0)
  340   IF k%=139 AND speed<0.2 THEN speed+=0.01
  350   IF k%=138 AND speed>0.015 THEN speed-=0.01
  360 UNTIL k%<>-1 AND k%<>138 AND k%<>139
  370 PROCtidy
  380 PRINT frames%;" frames in ";(TIME-T%)/100;" seconds"
  390 END
  400 :
  410 DEF PROCstar(i%)
  420 x(i%)=RND(1)*3.2-1.6:y(i%)=RND(1)*2.4-1.2
  430 z(i%)=5:ox%(i%)=-1
  440 ENDPROC
  450 :
  460 DEF PROCtidy
  470 *FX 112,1
  480 *FX 113,1
  490 *FX 4,0
  500 VDU 4:ON
  510 ENDPROC
  520 :
  530 DEF PROCerror
  540 ON ERROR OFF
  550 PROCtidy
  560 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  570 ENDPROC
