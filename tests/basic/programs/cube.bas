   10 REM > Cube
   20 REM Rotating wireframe cube, double buffered with OS_Byte 112/113
   30 MODE 12:OFF
   40 DIM x(7),y(7),z(7),sx%(7),sy%(7),e%(11,1)
   50 FOR i%=0 TO 7:x(i%)=(i% AND 1)*2-1:y(i%)=(i% AND 2)-1:z(i%)=(i% AND 4)/2-1:NEXT
   60 FOR i%=0 TO 11:READ e%(i%,0),e%(i%,1):NEXT
   70 DATA 0,1,1,3,3,2,2,0,4,5,5,7,7,6,6,4,0,4,1,5,2,6,3,7
   80 bank%=1:a=0:b=0:frames%=0:T%=TIME
   90 REPEAT
  100   bank%=3-bank%:SYS "OS_Byte",112,bank%
  110   CLG:GCOL 3:VDU 5:MOVE 16,1008:PRINT "Double-buffered cube  frame ";frames%:VDU 4
  120   ca=COS(a):sa=SIN(a):cb=COS(b):sb=SIN(b)
  130   FOR i%=0 TO 7
  140     X=x(i%)*ca-z(i%)*sa:Z=x(i%)*sa+z(i%)*ca
  150     Y=y(i%)*cb-Z*sb:Z=y(i%)*sb+Z*cb
  160     sx%(i%)=640+X*900/(Z+4):sy%(i%)=512+Y*900/(Z+4)
  170   NEXT
  180   FOR i%=0 TO 11
  190     GCOL 1+i% MOD 6+8*(i%>5)
  200     LINE sx%(e%(i%,0)),sy%(e%(i%,0)),sx%(e%(i%,1)),sy%(e%(i%,1))
  210   NEXT
  220   GCOL 7:FOR i%=0 TO 7:CIRCLE FILL sx%(i%),sy%(i%),10:NEXT
  230   WAIT:SYS "OS_Byte",113,bank%
  240   a+=0.05:b+=0.031:frames%+=1
  250 UNTIL INKEY(0)<>-1 OR frames%=300
  260 *FX 112,1
  270 *FX 113,1
  280 ON:PRINT TAB(0,30);frames%;" frames in ";(TIME-T%)/100;" s"
  290 END
