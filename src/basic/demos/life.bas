   10 REM > Life
   20 REM John Conway's Game of Life on an 80 x 56 board.
   30 REM A cell with 3 neighbours is born; one with 2 or 3
   40 REM survives; the rest die. The board is two byte
   50 REM arrays swapped each generation, and only the cells
   60 REM that change are redrawn.
   70 REM R: random soup  G: Gosper glider gun  C: clear
   80 REM Any other key quits.
   90 ON ERROR PROCerror:END
  100 MODE 28:OFF
  110 W%=82:H%=58:S%=16
  120 DIM a% W%*H%,b% W%*H%
  130 PROCframe
  140 PROCsoup
  150 REPEAT
  160   gen%+=1:pop%=0
  170   FOR y%=1 TO H%-2
  180     FOR i%=y%*W%+1 TO y%*W%+W%-2
  190       n%=a%?(i%-W%-1)+a%?(i%-W%)+a%?(i%-W%+1)+a%?(i%-1)+a%?(i%+1)+a%?(i%+W%-1)+a%?(i%+W%)+a%?(i%+W%+1)
  200       IF n%=3 OR (n%=2 AND a%?i%) THEN
  210         b%?i%=1:pop%+=1
  220         IF a%?i%=0 THEN GCOL 0,255,220,60:PROCcell(i%)
  230       ELSE
  240         b%?i%=0
  250         IF a%?i% THEN GCOL 0,0,40,0:PROCcell(i%)
  260       ENDIF
  270     NEXT
  280   NEXT
  290   SWAP a%,b%
  300   COLOUR 63:PRINT TAB(11,0);gen%;TAB(33,0);pop%;"   ";
  310   WAIT
  320   k%=INKEY(0):IF k%>96 THEN k%-=32
  330   IF k%=ASC"R" THEN PROCsoup
  340   IF k%=ASC"G" THEN PROCgun
  350   IF k%=ASC"C" THEN PROCclear
  360 UNTIL k%>0 AND k%<>ASC"R" AND k%<>ASC"G" AND k%<>ASC"C"
  370 VDU 4:ON
  380 END
  390 :
  400 DEF PROCcell(i%)
  410 RECTANGLE FILL (i% MOD W%-1)*S%,912-(i% DIV W%)*S%,S%-4,S%-4
  420 ENDPROC
  430 :
  440 DEF PROCframe
  450 GCOL 0,0,40,0:RECTANGLE FILL 0,0,1279,927
  460 COLOUR 63:PRINT TAB(0,0);"Generation";TAB(22,0);"Population";
  470 PRINT TAB(48,0);"R:soup G:gun C:clear";
  480 ENDPROC
  490 :
  500 DEF PROCclear
  510 LOCAL i%
  520 FOR i%=0 TO W%*H%-1:a%?i%=0:b%?i%=0:NEXT
  530 GCOL 0,0,40,0:RECTANGLE FILL 0,0,1279,927
  540 gen%=0
  550 ENDPROC
  560 :
  570 DEF PROCsoup
  580 LOCAL x%,y%,i%
  590 PROCclear
  600 GCOL 0,120,255,120
  610 FOR y%=4 TO H%-5
  620   FOR x%=6 TO W%-7
  630     IF RND(4)=1 THEN i%=y%*W%+x%:a%?i%=1:PROCcell(i%)
  640   NEXT
  650 NEXT
  660 ENDPROC
  670 :
  680 DEF PROCgun
  690 LOCAL x%,y%,i%,n%
  700 PROCclear
  710 RESTORE
  720 READ n%
  730 GCOL 0,120,255,120
  740 FOR i%=1 TO n%
  750   READ x%,y%:x%=x%+6:y%=y%+6:a%?(y%*W%+x%)=1:PROCcell(y%*W%+x%)
  760 NEXT
  770 ENDPROC
  780 DATA 36
  790 DATA 0,4,0,5,1,4,1,5,10,4,10,5,10,6,11,3,11,7,12,2,12,8,13,2,13,8
  800 DATA 14,5,15,3,15,7,16,4,16,5,16,6,17,5,20,2,20,3,20,4,21,2,21,3,21,4
  810 DATA 22,1,22,5,24,0,24,1,24,5,24,6,34,2,34,3,35,2,35,3
  820 :
  830 DEF PROCerror
  840 ON ERROR OFF
  850 VDU 4:ON
  860 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  870 ENDPROC
