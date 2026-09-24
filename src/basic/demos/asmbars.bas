   10 REM > AsmBars
   20 REM Raster bars from ARM code. BASIC works out a colour
   30 REM for each of the 256 rows of the screen; a short
   40 REM machine code routine, called with CALL, then fills
   50 REM every row of screen memory with its colour, 32
   60 REM bytes at a time with STMIA. The screen address comes
   70 REM from OS_ReadVduVariables, and the two screen banks
   80 REM are swapped each frame. Press any key to stop.
   90 ON ERROR PROCerror:END
  100 MODE 13:OFF
  110 DIM code% 256,tab% 256,bg% 256,ramp%(5,23),v% 12
  120 FOR pass%=0 TO 2 STEP 2
  130   P%=code%
  140   [OPT pass%
  150   .bars                  ; R0=screen, R1=table, R2=rows
  160   STMFD R13!,{R4-R11,R14}
  170   .row
  180   LDRB R3,[R1],#1        ; colour for this row
  190   ORR R3,R3,R3,LSL #8
  200   ORR R3,R3,R3,LSL #16   ; four pixels in a word
  210   MOV R4,R3:MOV R5,R3:MOV R6,R3:MOV R7,R3
  220   MOV R8,R3:MOV R9,R3:MOV R10,R3
  230   MOV R11,#10            ; 10 x 32 bytes = 320 pixels
  240   .blk
  250   STMIA R0!,{R3-R10}
  260   SUBS R11,R11,#1
  270   BNE blk
  280   SUBS R2,R2,#1
  290   BNE row
  300   LDMFD R13!,{R4-R11,PC}
  310   ]
  320 NEXT
  330 FOR y%=0 TO 255
  340   bg%?y%=FNcol(0,y% DIV 8,40+y% DIV 3)
  350 NEXT
  360 FOR b%=0 TO 5
  370   READ r%,g%,b2%
  380   FOR i%=0 TO 23
  390     l=SIN(i%/23*PI)
  400     ramp%(b%,i%)=FNcol(r%*l+80*l^8,g%*l+80*l^8,b2%*l+80*l^8)
  410   NEXT
  420 NEXT
  430 DATA 255,40,40,255,160,0,255,255,0,40,255,40,40,160,255,200,60,255
  440 bank%=1:ph=0:frames%=0:T%=TIME
  450 m$="     BBC BASIC V + ARM code on RISC OS 3.71 ... CALL bars with A%=screen, B%=table, C%=rows ...     "
  460 REPEAT
  470   bank%=3-bank%:SYS "OS_Byte",112,bank%
  480   FOR i%=0 TO 252 STEP 4:tab%!i%=bg%!i%:NEXT
  490   FOR b%=0 TO 5
  500     y%=116+100*SIN(ph+b%*0.5)*COS(ph*0.37+b%*0.2)
  510     FOR i%=0 TO 23:tab%?(y%+i%)=ramp%(b%,i%):NEXT
  520   NEXT
  530   v%!0=148:v%!4=-1:SYS "OS_ReadVduVariables",v%,v%
  540   A%=v%!0:B%=tab%:C%=256:CALL bars
  550   PROCscroll
  560   WAIT:SYS "OS_Byte",113,bank%
  570   ph+=0.04:frames%+=1
  580 UNTIL INKEY(0)<>-1
  590 PROCtidy
  600 PRINT "Code: ";P%-code%;" bytes.  ";frames%;" frames in ";(TIME-T%)/100;" seconds"
  610 END
  620 :
  630 DEF FNcol(r%,g%,b%)
  640 LOCAL c%
  650 IF r%>255 THEN r%=255
  660 IF g%>255 THEN g%=255
  670 IF b%>255 THEN b%=255
  680 SYS "ColourTrans_ReturnColourNumber",b%<<24 OR g%<<16 OR r%<<8 TO c%
  690 =c%
  700 :
  710 DEF PROCscroll
  720 LOCAL i%,o%,x%
  730 o%=frames% DIV 4 MOD LEN(m$)
  740 GCOL 0,63:VDU 5
  750 FOR i%=0 TO 40
  760   x%=i%*32-(frames% MOD 4)*8
  770   MOVE x%,880+40*SIN(ph*3+i%*0.3):PRINT MID$(m$+m$,o%+i%+1,1);
  780 NEXT
  790 VDU 4:OFF
  800 ENDPROC
  810 :
  820 DEF PROCtidy
  830 *FX 112,1
  840 *FX 113,1
  850 VDU 4:ON
  860 ENDPROC
  870 :
  880 DEF PROCerror
  890 ON ERROR OFF
  900 PROCtidy
  910 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  920 ENDPROC
