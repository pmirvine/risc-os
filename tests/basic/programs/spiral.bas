   10 REM > Spiral
   20 REM String art in 256 colours
   30 MODE 28:OFF
   40 ORIGIN 640,480
   50 FOR i%=0 TO 359 STEP 2
   60   a=RAD(i%):b=RAD(i%*3)
   70   GCOL (i% DIV 6) MOD 64 TINT (i% MOD 4)*64
   80   LINE 440*SIN(a),440*COS(a),440*SIN(b+PI/2),440*COS(b)
   90 NEXT
  100 END
