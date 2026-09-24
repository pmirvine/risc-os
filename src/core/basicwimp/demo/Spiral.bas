REM >Spiral
REM A single-tasking BBC BASIC V program: runs full screen in its own
REM screen mode; the desktop comes back when it ends.
MODE 28: OFF
ORIGIN 640,480
FOR A%=0 TO 1800 STEP 2
  GCOL (A% DIV 20) MOD 63 TINT (A%*8) MOD 256
  R=A%/4: X=R*COS(RAD(A%*2.7)): Y=R*SIN(RAD(A%*2.7))
  IF A%=0 THEN MOVE X,Y ELSE DRAW X,Y
NEXT
GCOL 0,63: VDU 5: MOVE -212,-420: PRINT "Single-tasking BBC BASIC V": VDU 4
ON
PRINT TAB(0,0);"MODE 28, ";1+(A%-2) DIV 2;" lines drawn"
