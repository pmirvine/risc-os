   10 REM > Spiral
   20 REM String art in 256 colours: 180 straight lines join
   30 REM a point going round a circle once to a point going
   40 REM round it three times, and the curves appear.
   50 MODE 28:OFF
   60 ORIGIN 640,480
   70 FOR i%=0 TO 359 STEP 2
   80   a=RAD(i%):b=RAD(i%*3)
   90   GCOL (i% DIV 6) MOD 64 TINT (i% MOD 4)*64
  100   LINE 440*SIN(a),440*COS(a),440*SIN(b+PI/2),440*COS(b)
  110 NEXT
  120 ON
  130 END
