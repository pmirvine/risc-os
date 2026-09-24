   10 REM > Circles
   20 REM Concentric circles in the 16 colour MODE 12,
   30 REM with spokes, EOR-plotted ellipses (GCOL 3,c) and
   40 REM text at the graphics cursor (VDU 5).
   50 MODE 12:OFF
   60 ORIGIN 640,512
   70 FOR r%=500 TO 20 STEP -20
   80   GCOL (r% DIV 20) MOD 15+1
   90   CIRCLE FILL 0,0,r%
  100 NEXT
  110 FOR a=0 TO 2*PI STEP PI/12
  120   GCOL 7:LINE 0,0,520*COS(a),520*SIN(a)
  130 NEXT
  140 GCOL 3,15:ELLIPSE 0,0,600,200:ELLIPSE 0,0,200,480
  150 VDU 5:MOVE -140,-450:GCOL 0,7:PRINT "RISC OS 3.71":VDU 4:OFF
  160 ON
  170 END
