   10 REM > Mandelbrot
   20 REM Classic Mandelbrot set in a 256 colour mode
   30 MODE 28:OFF
   40 maxit%=48
   50 FOR py%=0 TO 239
   60   y0=1.2-py%*2.4/240
   70   FOR px%=0 TO 319
   80     x0=px%*3.2/320-2.2
   90     x=0:y=0:i%=0
  100     REPEAT
  110       xt=x*x-y*y+x0:y=2*x*y+y0:x=xt:i%+=1
  120     UNTIL x*x+y*y>4 OR i%=maxit%
  130     IF i%=maxit% THEN GCOL 0 TINT 0 ELSE GCOL (i%*5) MOD 64 TINT (i% AND 3)<<6
  140     RECTANGLE FILL px%*4,956-py%*4,3,3
  150   NEXT
  160 NEXT
  170 COLOUR 63:PRINT TAB(0,0)"Mandelbrot set - ";maxit%;" iterations"
  180 END
