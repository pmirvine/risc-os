   10 REM > Ball
   20 REM Bouncing ball using EOR plotting and WAIT
   30 MODE 12:OFF
   40 GCOL 0,4:RECTANGLE FILL 0,0,1279,1023
   50 COLOUR 3:PRINT "Bouncing ball - press any key to stop"
   60 x=200:y=700:dx=14:dy=0:r=48
   70 GCOL 3,6
   80 CIRCLE FILL x,y,r
   90 REPEAT
  100   ox=x:oy=y
  110   dy-=1.5:x+=dx:y+=dy
  120   IF x<r OR x>1279-r THEN dx=-dx:x+=dx
  130   IF y<r THEN dy=-dy*0.92:y=r
  140   WAIT
  150   CIRCLE FILL ox,oy,r:CIRCLE FILL x,y,r
  160 UNTIL INKEY(0)<>-1 OR ABS(dy)<1 AND y<=r+1
  170 ON:PRINT TAB(0,30);"Done."
  180 END
