   10 REM > Mandelbrot
   20 REM The Mandelbrot set in 256 colours.
   30 REM For each point c of the plane, z=z*z+c is repeated
   40 REM until z escapes (|z|>2) or maxit% steps have passed;
   50 REM the number of steps picks the colour.
   60 REM Press Escape to stop early.
   70 ON ERROR PROCerror:END
   80 MODE 28:OFF
   90 maxit%=48
  100 FOR py%=0 TO 239
  110   y0=1.2-py%*2.4/240
  120   FOR px%=0 TO 319
  130     x0=px%*3.2/320-2.2
  140     x=0:y=0:i%=0
  150     REPEAT
  160       xt=x*x-y*y+x0:y=2*x*y+y0:x=xt:i%+=1
  170     UNTIL x*x+y*y>4 OR i%=maxit%
  180     IF i%=maxit% THEN GCOL 0 TINT 0 ELSE GCOL (i%*5) MOD 64 TINT (i% AND 3)<<6
  190     RECTANGLE FILL px%*4,956-py%*4,3,3
  200   NEXT
  210 NEXT
  220 COLOUR 63:PRINT TAB(0,0)"Mandelbrot set - ";maxit%;" iterations"
  230 ON
  240 END
  250 :
  260 DEF PROCerror
  270 ON ERROR OFF
  280 ON
  290 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  300 ENDPROC
