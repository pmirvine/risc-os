   10 REM > Teletext
   20 REM MODE 7, the BBC Micro's teletext mode: control
   30 REM codes 129-135 change the text colour, 145-151 the
   40 REM graphics colour, 141 gives double height, 136
   50 REM flashing, 157 a new background and 154 separated
   60 REM graphics.
   70 MODE 7
   80 PRINT CHR$141;CHR$131;"  RISC OS 3.71  BBC BASIC V"
   90 PRINT CHR$141;CHR$131;"  RISC OS 3.71  BBC BASIC V"
  100 PRINT
  110 FOR c%=1 TO 7
  120   PRINT CHR$(128+c%);"Alphanumeric colour ";c%;CHR$(144+c%);STRING$(8,CHR$255)
  130 NEXT
  140 PRINT
  150 PRINT CHR$132;CHR$157;CHR$135;" White on blue background     ";CHR$156
  160 PRINT CHR$129;CHR$136;"Flashing red text";CHR$137;CHR$130;" steady green"
  170 PRINT
  180 FOR r%=0 TO 3
  190   PRINT CHR$(145+r%);
  200   FOR i%=0 TO 31:PRINT CHR$(160+((i%*3+r%*7) MOD 32));:NEXT
  210   PRINT
  220 NEXT
  230 PRINT CHR$134;"Separated:";CHR$154;CHR$146;STRING$(10,CHR$255)
  240 END
