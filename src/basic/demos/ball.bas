   10 REM > Ball
   20 REM A bouncing ball drawn with GCOL 3 (exclusive-OR):
   30 REM plotting the ball twice in the same place removes it
   40 REM and leaves the background untouched. WAIT keeps it
   50 REM in step with the screen. Press any key to stop.
   60 ON ERROR PROCerror:END
   70 MODE 12:OFF
   80 GCOL 0,4:RECTANGLE FILL 0,0,1279,1023
   90 COLOUR 3:COLOUR 132:PRINT "Bouncing ball - press any key to stop"
  100 x=200:y=700:dx=14:dy=0:r=48
  110 GCOL 3,6
  120 CIRCLE FILL x,y,r
  130 REPEAT
  140   ox=x:oy=y
  150   dy-=1.5:x+=dx:y+=dy
  160   IF x<r OR x>1279-r THEN dx=-dx:x+=dx
  170   IF y<r THEN dy=-dy*0.92:y=r
  180   WAIT
  190   CIRCLE FILL ox,oy,r:CIRCLE FILL x,y,r
  200 UNTIL INKEY(0)<>-1 OR ABS(dy)<1 AND y<=r+1
  210 ON:PRINT TAB(0,30);"Done."
  220 END
  230 :
  240 DEF PROCerror
  250 ON ERROR OFF
  260 ON
  270 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  280 ENDPROC
