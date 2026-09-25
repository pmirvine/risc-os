   10 REM > MouseTest
   20 REM Shows which mouse buttons are pressed, as a program
   30 REM sees them: MOUSE x,y,b and the INKEY key scans.
   40 REM Select = 4, Menu = 2, Adjust = 1 in b.
   50 REM Hold a button and move to draw in its colour.
   60 REM C clears the drawing, Q or Escape quits.
   70 ON ERROR PROCerror:END
   80 MODE 28:OFF
   90 *FX 4,1
  100 MOUSE ON
  110 max%=2000:DIM tx%(max%),ty%(max%),tc%(max%):n%=0
  120 DIM name$(2),bit%(2),key%(2),col%(2),clicks%(2)
  130 name$()="SELECT","MENU","ADJUST"
  140 bit%()=4,2,1:key%()=-10,-11,-12
  150 col%()=&0C,&30,&03:REM green, blue, red (256 colour GCOL)
  160 bank%=1:ob%=0:last$="(none yet)"
  170 REPEAT
  180   MOUSE x%,y%,b%
  190   FOR i%=0 TO 2
  200     IF (b% AND bit%(i%))<>0 AND (ob% AND bit%(i%))=0 THEN clicks%(i%)+=1:last$=name$(i%)+" at "+STR$x%+","+STR$y%
  210   NEXT
  220   IF b%<>0 AND n%<max% AND y%<760 THEN PROCplot
  230   ob%=b%
  240   bank%=3-bank%:SYS "OS_Byte",112,bank%
  250   PROCdraw
  260   WAIT:SYS "OS_Byte",113,bank%
  270   k%=INKEY(0)
  280   IF k%=ASC"c" OR k%=ASC"C" THEN n%=0
  290 UNTIL k%=ASC"q" OR k%=ASC"Q"
  300 PROCtidy
  310 END
  320 :
  330 DEF PROCplot
  340 LOCAL c%
  350 IF b% AND 4 THEN c%=col%(0)
  360 IF b% AND 2 THEN c%=c% OR col%(1)
  370 IF b% AND 1 THEN c%=c% OR col%(2)
  380 tx%(n%)=x%:ty%(n%)=y%:tc%(n%)=c%:n%+=1
  390 ENDPROC
  400 :
  410 DEF PROCdraw
  420 LOCAL i%,bx%,down%,scan%
  430 GCOL 0:CLG
  440 REM the drawing so far
  450 FOR i%=0 TO n%-1
  460   GCOL tc%(i%):RECTANGLE FILL tx%(i%)-4,ty%(i%)-4,8,8
  470 NEXT
  480 REM the three buttons
  490 FOR i%=0 TO 2
  500   bx%=100+i%*380
  510   down%=(b% AND bit%(i%))<>0
  520   scan%=INKEY(key%(i%))
  530   IF down% THEN GCOL col%(i%) ELSE GCOL &15
  540   RECTANGLE FILL bx%,780,320,140
  550   GCOL &3F:RECTANGLE bx%,780,320,140
  560   VDU 5
  570   MOVE bx%+160-LEN(name$(i%))*16,880:PRINT name$(i%)
  580   MOVE bx%+24,832:PRINT "b AND ";bit%(i%);": ";FNyn(down%)
  590   MOVE bx%+24,808:PRINT "INKEY(";key%(i%);"): ";FNyn(scan%)
  600   VDU 4:OFF
  610 NEXT
  620 REM the read-out
  630 GCOL &3F:VDU 5
  640 MOVE 100,740:PRINT "MOUSE x,y,b  =  ";x%;", ";y%;", ";b%;"   (binary ";FNbin(b%);")"
  650 MOVE 100,708:PRINT "Presses: Select ";clicks%(0);"  Menu ";clicks%(1);"  Adjust ";clicks%(2)
  660 MOVE 100,676:PRINT "Last press: ";last$
  670 MOVE 100,40:PRINT "Hold a button and move to draw.  C clears, Q or Escape quits."
  680 VDU 4:OFF
  690 REM a cross-hair at the pointer
  700 GCOL &3F:LINE x%-24,y%,x%+24,y%:LINE x%,y%-24,x%,y%+24
  710 ENDPROC
  720 :
  730 DEF FNyn(f%)
  740 IF f% THEN ="down"
  745 ="up"
  750 DEF FNbin(v%)
  760 LOCAL s$,i%
  770 FOR i%=2 TO 0 STEP -1:s$+=STR$((v% >> i%) AND 1):NEXT
  780 =s$
  790 :
  800 DEF PROCtidy
  810 SYS "OS_Byte",112,1:SYS "OS_Byte",113,1
  820 *FX 4,0
  830 ON:VDU 4:CLS
  840 ENDPROC
  850 :
  860 DEF PROCerror
  870 PROCtidy
  880 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  890 ENDPROC
