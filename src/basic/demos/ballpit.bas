   10 REM > BallPit
   20 REM Bouncing balls you can throw with the mouse (MODE 28,
   30 REM double buffered with *FX 112 and *FX 113).
   40 REM SELECT: press to pick up a ball where the pointer is,
   50 REM move and let go to throw it. ADJUST pops the ball
   60 REM nearest the pointer. MENU turns gravity off and on.
   70 REM C clears, Q or Escape quits.
   80 REM Try it in !GraphTask: drag it to GraphTask's icon bar
   90 REM icon and it runs in a window. The mouse still works
  100 REM there; choose "Menu button" on the window's menu to
  110 REM give it MENU clicks (Shift-MENU opens the menu again).
  120 ON ERROR PROCtidy:IF ERR<>17 THEN REPORT:PRINT " at line ";ERL:END ELSE END
  130 MODE 28:OFF
  140 max%=40:DIM x(max%),y(max%),vx(max%),vy(max%),r%(max%),c%(max%)
  150 DIM pal%(9):pal%()=&0C,&30,&03,&0F,&33,&3C,&2B,&1E,&39,&27
  160 n%=0:g=-0.7:bank%=1:ob%=0:px%=640:py%=512:held%=FALSE:throws%=0
  170 FOR i%=1 TO 7:PROCadd(RND(1000)+140,RND(400)+400,RND(25)-13,RND(9)-5):NEXT
  180 REPEAT
  190   MOUSE mx%,my%,b%
  200   IF (b% AND 4)<>0 AND (ob% AND 4)=0 THEN held%=TRUE
  210   IF (b% AND 4)=0 AND (ob% AND 4)<>0 AND held% THEN PROCadd(mx%,my%,(mx%-px%)/2,(my%-py%)/2):held%=FALSE:throws%+=1
  220   IF (b% AND 1)<>0 AND (ob% AND 1)=0 THEN PROCpop(mx%,my%)
  230   IF (b% AND 2)<>0 AND (ob% AND 2)=0 THEN IF g THEN g=0 ELSE g=-0.7
  240   PROCmove
  250   bank%=3-bank%:SYS "OS_Byte",112,bank%
  260   PROCdraw
  270   WAIT:SYS "OS_Byte",113,bank%
  280   ob%=b%:px%=mx%:py%=my%
  290   k%=INKEY(0)
  300   IF k%=ASC"c" OR k%=ASC"C" THEN n%=0
  310 UNTIL k%=ASC"q" OR k%=ASC"Q"
  320 PROCtidy
  330 END
  340 :
  350 DEF PROCadd(ax,ay,avx,avy)
  360 LOCAL i%
  370 IF n%=max% THEN FOR i%=1 TO n%-1:x(i%-1)=x(i%):y(i%-1)=y(i%):vx(i%-1)=vx(i%):vy(i%-1)=vy(i%):r%(i%-1)=r%(i%):c%(i%-1)=c%(i%):NEXT:n%-=1
  380 r%(n%)=28+RND(36):c%(n%)=pal%(RND(10)-1)
  390 x(n%)=ax:y(n%)=ay:vx(n%)=avx:vy(n%)=avy
  400 n%+=1
  410 ENDPROC
  420 :
  430 DEF PROCpop(ax,ay)
  440 LOCAL i%,best%,d,bd
  450 IF n%=0 THEN ENDPROC
  460 best%=0:bd=1E9
  470 FOR i%=0 TO n%-1
  480   d=(x(i%)-ax)^2+(y(i%)-ay)^2
  490   IF d<bd THEN bd=d:best%=i%
  500 NEXT
  510 n%-=1
  520 x(best%)=x(n%):y(best%)=y(n%):vx(best%)=vx(n%):vy(best%)=vy(n%):r%(best%)=r%(n%):c%(best%)=c%(n%)
  530 ENDPROC
  540 :
  550 DEF PROCmove
  560 LOCAL i%,r%
  570 FOR i%=0 TO n%-1
  580   r%=r%(i%)
  590   vy(i%)+=g:x(i%)+=vx(i%):y(i%)+=vy(i%)
  600   IF x(i%)<r% THEN x(i%)=r%:vx(i%)=-vx(i%)*0.9
  610   IF x(i%)>1279-r% THEN x(i%)=1279-r%:vx(i%)=-vx(i%)*0.9
  620   IF y(i%)<r% THEN y(i%)=r%:vy(i%)=-vy(i%)*0.86:vx(i%)=vx(i%)*0.98
  630   IF y(i%)>896-r% THEN y(i%)=896-r%:vy(i%)=-vy(i%)*0.9
  640 NEXT
  650 ENDPROC
  660 :
  670 DEF PROCdraw
  680 LOCAL i%,r%
  690 GCOL 0:CLG
  700 GCOL &15:RECTANGLE FILL 0,898,1280,62
  710 FOR i%=0 TO n%-1
  720   r%=r%(i%)
  730   GCOL c%(i%):CIRCLE FILL x(i%),y(i%),r%
  740   GCOL &3F:CIRCLE FILL x(i%)-r%/3,y(i%)+r%/3,r%/5
  750 NEXT
  760 IF held% THEN GCOL &3F:CIRCLE mx%,my%,40:LINE px%,py%,mx%,my%
  770 GCOL &3F:VDU 5
  780 MOVE 16,950:PRINT "Balls ";n%;"  Throws ";throws%;"  Gravity ";FNonoff(g<>0)
  790 MOVE 16,920:PRINT "SELECT: throw   ADJUST: pop   MENU: gravity   C: clear   Q: quit"
  800 VDU 4:OFF
  810 ENDPROC
  820 :
  830 DEF FNonoff(f%)
  840 IF f% THEN ="on"
  850 ="off"
  860 :
  870 DEF PROCtidy
  880 ON ERROR OFF
  890 SYS "OS_Byte",112,1:SYS "OS_Byte",113,1
  900 ON:VDU 4
  910 ENDPROC
