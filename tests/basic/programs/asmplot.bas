   10 REM > AsmPlot
   20 REM ARM assembler: a moire pattern drawn by OS_Plot from machine
   30 REM code, then a stripe block written straight into screen memory
   40 MODE 13:OFF
   50 DIM code% 1024
   60 FOR pass%=0 TO 2 STEP 2
   70   P%=code%
   80   [OPT pass%
   90   .moire                 ; R0 = step, R1 = colour count
  100   STMFD R13!,{R4-R7,R14}
  110   MOV R4,R0:MOV R5,R1:MOV R6,#0
  120   .mloop
  130   AND R0,R6,#63:ORR R0,R0,#0      ; colour = n AND 63
  140   MOV R7,R6
  150   SWI "OS_WriteI"+18:SWI "OS_WriteI"+0:SWI "OS_WriteC"
  160   MOV R0,#4:MOV R1,#640:MOV R2,#512:SWI "OS_Plot"
  170   MOV R0,#5:MOV R1,R7,LSL #1:MOV R2,#0:SWI "OS_Plot"
  180   MOV R0,#4:MOV R1,#640:MOV R2,#512:SWI "OS_Plot"
  190   MOV R0,#5:MOV R1,R7,LSL #1:MOV R2,#1023:SWI "OS_Plot"
  200   ADD R6,R6,R4
  210   CMP R6,#640
  220   BLT mloop
  230   LDMFD R13!,{R4-R7,PC}
  240   .stripes               ; R0 = screen address, R1 = rows, R2 = bytes/row
  250   MOV R3,#0
  260   .srow
  270   MOV R4,#0
  280   .scol
  290   ADD R5,R3,R4,LSR #3:AND R5,R5,#63
  300   STRB R5,[R0,R4]
  310   ADD R4,R4,#1:CMP R4,#160:BLT scol
  320   ADD R0,R0,R2:ADD R3,R3,#1:CMP R3,R1:BLT srow
  330   MOV PC,R14
  340   ]
  350 NEXT
  360 A%=4:B%=64:CALL moire
  370 DIM v% 12:v%!0=149:v%!4=6:v%!8=-1:SYS "OS_ReadVduVariables",v%,v%
  380 A%=v%!0+v%!4*20+80:B%=40:C%=v%!4:CALL stripes
  390 COLOUR 63:PRINT TAB(0,30);"Code: ";P%-code%;" bytes at &";~code%
  400 END
