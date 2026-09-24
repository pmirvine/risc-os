   10 REM > AsmPlot
   20 REM The inline ARM assembler: a moire pattern drawn by
   30 REM OS_Plot calls from machine code, then a block of
   40 REM stripes written straight into screen memory at the
   50 REM address given by OS_ReadVduVariables 148.
   60 MODE 13:OFF
   70 DIM code% 1024
   80 FOR pass%=0 TO 2 STEP 2
   90   P%=code%
  100   [OPT pass%
  110   .moire                 ; R0 = step, R1 = colour count
  120   STMFD R13!,{R4-R7,R14}
  130   MOV R4,R0:MOV R5,R1:MOV R6,#0
  140   .mloop
  150   AND R0,R6,#63             ; colour = n AND 63
  160   MOV R7,R6
  170   SWI &100+18:SWI &100+0:SWI "OS_WriteC"
  180   MOV R0,#4:MOV R1,#640:MOV R2,#512:SWI "OS_Plot"
  190   MOV R0,#5:MOV R1,R7,LSL #1:MOV R2,#0:SWI "OS_Plot"
  200   MOV R0,#4:MOV R1,#640:MOV R2,#512:SWI "OS_Plot"
  210   MOV R0,#5:MOV R1,R7,LSL #1:MOV R2,#1020:SWI "OS_Plot"
  220   ADD R6,R6,R4
  230   CMP R6,#640
  240   BLT mloop
  250   LDMFD R13!,{R4-R7,PC}
  260   .stripes               ; R0 = screen address, R1 = rows, R2 = bytes/row
  270   MOV R3,#0
  280   .srow
  290   MOV R4,#0
  300   .scol
  310   ADD R5,R3,R4,LSR #3:AND R5,R5,#63
  320   STRB R5,[R0,R4]
  330   ADD R4,R4,#1:CMP R4,#160:BLT scol
  340   ADD R0,R0,R2:ADD R3,R3,#1:CMP R3,R1:BLT srow
  350   MOV PC,R14
  360   ]
  370 NEXT
  380 A%=4:B%=64:CALL moire
  390 DIM v% 12:v%!0=149:v%!4=6:v%!8=-1:SYS "OS_ReadVduVariables",v%,v%
  400 A%=v%!0+v%!4*20+80:B%=40:C%=v%!4:CALL stripes
  410 COLOUR 63:PRINT TAB(0,30);"Code: ";P%-code%;" bytes at &";~code%
  420 END
