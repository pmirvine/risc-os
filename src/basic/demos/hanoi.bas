   10 REM > Hanoi
   20 REM The Towers of Hanoi, solved by a recursive PROC.
   30 REM To move n discs from A to C: move n-1 from A to B,
   40 REM move the biggest disc to C, then move n-1 from B
   50 REM to C. That takes 2^n-1 moves. Each frame is drawn
   60 REM on the hidden screen bank, then shown.
   70 REM Press any key to stop.
   80 ON ERROR PROCerror:END
   90 MODE 28:OFF
  100 N%=7:DH%=36
  110 DIM peg%(2,N%),top%(2),px%(2),r%(N%),g%(N%),b%(N%)
  120 FOR i%=0 TO 2:px%(i%)=240+i%*400:NEXT
  130 FOR i%=1 TO N%
  140   r%(i%)=128+127*SIN(i%*0.9):g%(i%)=128+127*SIN(i%*0.9+2.1):b%(i%)=128+127*SIN(i%*0.9+4.2)
  150 NEXT
  160 FOR i%=N% TO 1 STEP -1:peg%(0,top%(0))=i%:top%(0)+=1:NEXT
  170 moves%=0:quit%=FALSE:bank%=1
  180 PROCframe(0,0,0):PROCframe(0,0,0)
  190 PROChanoi(N%,0,2,1)
  200 IF NOT quit% THEN
  210   PROCframe(0,0,0):PROCframe(0,0,0)
  220   t%=TIME+300:REPEAT UNTIL TIME>t% OR INKEY(10)<>-1
  230 ENDIF
  240 PROCtidy
  250 END
  260 :
  270 DEF PROChanoi(n%,a%,c%,b%)
  280 IF n%=0 OR quit% THEN ENDPROC
  290 PROChanoi(n%-1,a%,b%,c%)
  300 IF NOT quit% THEN PROCmove(a%,c%)
  310 PROChanoi(n%-1,b%,c%,a%)
  320 ENDPROC
  330 :
  340 DEF PROCmove(f%,t%)
  350 LOCAL d%,x%,y%,ty%,dx%
  360 top%(f%)-=1:d%=peg%(f%,top%(f%))
  370 x%=px%(f%):y%=120+top%(f%)*DH%
  380 REPEAT y%+=80:IF y%>700 THEN y%=700
  390   PROCframe(d%,x%,y%)
  400 UNTIL y%=700 OR quit%
  410 dx%=SGN(px%(t%)-x%)*80
  420 REPEAT x%+=dx%:IF ABS(x%-px%(t%))<80 THEN x%=px%(t%)
  430   PROCframe(d%,x%,y%)
  440 UNTIL x%=px%(t%) OR quit%
  450 ty%=120+top%(t%)*DH%
  460 REPEAT y%-=80:IF y%<ty% THEN y%=ty%
  470   PROCframe(d%,x%,y%)
  480 UNTIL y%=ty% OR quit%
  490 peg%(t%,top%(t%))=d%:top%(t%)+=1:moves%+=1
  500 ENDPROC
  510 :
  520 DEF PROCframe(d%,x%,y%)
  530 LOCAL p%,i%
  540 bank%=3-bank%:SYS "OS_Byte",112,bank%
  550 FOR i%=0 TO 15:GCOL 0,10+i%*3,10+i%*3,40+i%*8:RECTANGLE FILL 0,i%*60,1279,60:NEXT
  560 GCOL 0,110,70,30:RECTANGLE FILL 60,80,1160,40
  570 FOR p%=0 TO 2
  580   GCOL 0,150,100,50:RECTANGLE FILL px%(p%)-8,120,16,DH%*N%+40
  590   FOR i%=0 TO top%(p%)-1
  600     PROCdisc(peg%(p%,i%),px%(p%),120+i%*DH%)
  610   NEXT
  620 NEXT
  630 IF d% THEN PROCdisc(d%,x%,y%)
  640 GCOL 0,255,255,255:VDU 5
  650 MOVE 24,940:PRINT "TOWERS OF HANOI   ";N%;" discs"
  660 MOVE 24,900:PRINT "Move ";moves%;" of ";2^N%-1
  670 MOVE 216,60:PRINT "A";:MOVE 616,60:PRINT "B";:MOVE 1016,60:PRINT "C";
  680 VDU 4
  690 WAIT:SYS "OS_Byte",113,bank%
  700 IF INKEY(0)<>-1 THEN quit%=TRUE
  710 ENDPROC
  720 :
  730 DEF PROCdisc(d%,x%,y%)
  740 LOCAL w%
  750 w%=24+d%*22
  760 GCOL 0,r%(d%),g%(d%),b%(d%)
  770 RECTANGLE FILL x%-w%,y%+2,w%*2,DH%-4
  780 GCOL 0,r%(d%)/2,g%(d%)/2,b%(d%)/2
  790 RECTANGLE x%-w%,y%+2,w%*2,DH%-4
  800 ENDPROC
  810 :
  820 DEF PROCtidy
  830 *FX 112,1
  840 *FX 113,1
  850 VDU 4:ON
  860 ENDPROC
  870 :
  880 DEF PROCerror
  890 ON ERROR OFF
  900 PROCtidy
  910 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  920 ENDPROC
