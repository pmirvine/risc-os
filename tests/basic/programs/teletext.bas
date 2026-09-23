   10 REM > Teletext
   20 REM MODE 7 colour codes, double height and graphics
   30 MODE 7
   40 PRINT CHR$141;CHR$131;"  RISC OS 3.71  BBC BASIC V"
   50 PRINT CHR$141;CHR$131;"  RISC OS 3.71  BBC BASIC V"
   60 PRINT
   70 FOR c%=1 TO 7
   80   PRINT CHR$(128+c%);"Alphanumeric colour ";c%;CHR$(144+c%);STRING$(8,CHR$255)
   90 NEXT
  100 PRINT
  110 PRINT CHR$132;CHR$157;CHR$135;" White on blue background     ";CHR$156
  120 PRINT CHR$129;CHR$136;"Flashing red text";CHR$137;CHR$130;" steady green"
  130 PRINT
  140 FOR r%=0 TO 3
  150   PRINT CHR$(145+r%);
  160   FOR i%=0 TO 31:PRINT CHR$(160+((i%*3+r%*7) MOD 32));:NEXT
  170   PRINT
  180 NEXT
  190 PRINT CHR$134;"Separated:";CHR$154;CHR$146;STRING$(10,CHR$255)
  200 END
