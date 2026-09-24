   10 REM > Fire
   20 REM Fire: each cell of the flame is the average of the
   30 REM four cells below it, a little cooler, and the bottom
   40 REM row is fed with random heat. Heat 0-63 becomes a
   50 REM colour through a table built with ColourTrans, and
   60 REM each cell is written to screen memory as 2 x 2 pixels.
   70 REM Press any key to put the fire out.
   80 ON ERROR PROCerror:END
   90 MODE 13:OFF
  100 W%=160:H%=100
  110 DIM h% W%*(H%+2)+8,n% 4100,lo%(63),hi%(63),v% 12
  120 PRINT TAB(15,2);"F I R E"
  130 FOR i%=0 TO 63
  140   r%=i%*10:g%=(i%-22)*7:b%=(i%-44)*14
  150   IF r%>255 THEN r%=255
  160   IF g%<0 THEN g%=0 ELSE IF g%>255 THEN g%=255
  170   IF b%<0 THEN b%=0 ELSE IF b%>255 THEN b%=255
  180   SYS "ColourTrans_ReturnColourNumber",(b%<<24)+(g%<<16)+(r%<<8) TO c%
  190   lo%(i%)=c% OR c%<<8:hi%(i%)=c%<<16 OR c%<<24
  200 NEXT
  210 FOR i%=0 TO W%*(H%+2)-1 STEP 4:h%!i%=0:NEXT
  220 FOR i%=0 TO 4099:n%?i%=RND(9) DIV 6:NEXT
  230 v%!0=148:v%!4=6:v%!8=-1:SYS "OS_ReadVduVariables",v%,v%
  240 row%=v%!4:base%=v%!0+(256-H%*2)*row%
  250 REPEAT
  260   p%=h%+H%*W%
  270   FOR x%=0 TO W%-1 STEP 4
  280     IF RND(3)>1 THEN c%=&3F3F3F3F ELSE c%=RND(20)*&01010101
  290     p%!x%=c%:p%!(x%+W%)=c%
  300   NEXT
  310   FOR y%=0 TO H%-1
  320     q%=h%+y%*W%:o%=n%+RND(3900)-q%
  330     FOR x%=q%+1 TO q%+W%-2
  340       t%=(x%?(W%-1)+x%?W%+x%?(W%+1)+x%?(W%*2))>>2
  350       IF t%>1 THEN ?x%=t%-o%?x% ELSE ?x%=0
  360     NEXT
  370   NEXT
  380   FOR y%=0 TO H%-1
  390     q%=h%+y%*W%:s%=base%+y%*2*row%
  400     FOR x%=0 TO W%-2 STEP 2
  410       w%=lo%(q%?x%) OR hi%(q%?(x%+1))
  420       s%!(x%*2)=w%:s%!(x%*2+row%)=w%
  430     NEXT
  440   NEXT
  450 UNTIL INKEY(0)<>-1
  460 PROCtidy
  470 END
  480 :
  490 DEF PROCtidy
  500 VDU 4:ON
  510 ENDPROC
  520 :
  530 DEF PROCerror
  540 ON ERROR OFF
  550 PROCtidy
  560 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  570 ENDPROC
