   10 REM > Colours
   20 REM The 256 colour palette: 64 GCOL colours x 4 tints
   30 MODE 28:OFF
   40 FOR c%=0 TO 63
   50   FOR t%=0 TO 3
   60     GCOL c% TINT t%*64
   70     RECTANGLE FILL (c% MOD 16)*80,(c% DIV 16)*240+t%*60,78,58
   80   NEXT
   90 NEXT
  100 END
