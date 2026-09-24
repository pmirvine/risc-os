   10 REM > Cube
   20 REM A rotating wireframe cube. Each frame is drawn on
   30 REM the hidden screen bank (*FX 112) while the other is
   40 REM shown (*FX 113), then they swap: no flicker.
   50 REM Press any key to stop.
   60 ON ERROR PROCerror:END
   70 MODE 12:OFF
   80 DIM x(7),y(7),z(7),sx%(7),sy%(7),e%(11,1)
   90 FOR i%=0 TO 7:x(i%)=(i% AND 1)*2-1:y(i%)=(i% AND 2)-1:z(i%)=(i% AND 4)/2-1:NEXT
  100 FOR i%=0 TO 11:READ e%(i%,0),e%(i%,1):NEXT
  110 DATA 0,1,1,3,3,2,2,0,4,5,5,7,7,6,6,4,0,4,1,5,2,6,3,7
  120 bank%=1:a=0:b=0:frames%=0:T%=TIME
  130 REPEAT
  140   bank%=3-bank%:SYS "OS_Byte",112,bank%
  150   CLG:GCOL 3:VDU 5:MOVE 16,1008:PRINT "Double-buffered cube  frame ";frames%:VDU 4:OFF
  160   ca=COS(a):sa=SIN(a):cb=COS(b):sb=SIN(b)
  170   FOR i%=0 TO 7
  180     X=x(i%)*ca-z(i%)*sa:Z=x(i%)*sa+z(i%)*ca
  190     Y=y(i%)*cb-Z*sb:Z=y(i%)*sb+Z*cb
  200     sx%(i%)=640+X*900/(Z+4):sy%(i%)=512+Y*900/(Z+4)
  210   NEXT
  220   FOR i%=0 TO 11
  230     GCOL 1+i% MOD 7
  240     LINE sx%(e%(i%,0)),sy%(e%(i%,0)),sx%(e%(i%,1)),sy%(e%(i%,1))
  250   NEXT
  260   GCOL 7:FOR i%=0 TO 7:CIRCLE FILL sx%(i%),sy%(i%),10:NEXT
  270   WAIT:SYS "OS_Byte",113,bank%
  280   a+=0.05:b+=0.031:frames%+=1
  290 UNTIL INKEY(0)<>-1
  300 PROCtidy
  310 PRINT TAB(0,30);frames%;" frames in ";(TIME-T%)/100;" s"
  320 END
  330 :
  340 DEF PROCtidy
  350 *FX 112,1
  360 *FX 113,1
  370 VDU 4:ON
  380 ENDPROC
  390 :
  400 DEF PROCerror
  410 ON ERROR OFF
  420 PROCtidy
  430 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  440 ENDPROC
