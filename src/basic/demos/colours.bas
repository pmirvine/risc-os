   10 REM > Colours
   20 REM The 256 colour palette: GCOL gives 64 colours and
   30 REM TINT adds four shades of each.
   40 MODE 28:OFF
   50 FOR c%=0 TO 63
   60   FOR t%=0 TO 3
   70     GCOL c% TINT t%*64
   80     RECTANGLE FILL (c% MOD 16)*80,(c% DIV 16)*240+t%*60,78,58
   90   NEXT
  100 NEXT
  110 ON
  120 END
