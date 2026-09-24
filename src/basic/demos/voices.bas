   10 REM > Voices
   20 REM Plays each of the nine voices in the RISC OS 3.71
   30 REM ROM in turn: the WaveSynth beep, four StringLib
   40 REM plucked strings and four Percussion sounds.
   50 REM VOICE attaches a voice to a channel by name, and
   60 REM SOUND plays a note on it (53 is middle C, and
   70 REM there are 4 steps to a semitone).
   80 REM Press any key to stop.
   90 ON ERROR PROCerror:END
  100 MODE 27:OFF
  110 DIM v$(9),note%(7),white%(13)
  120 FOR i%=1 TO 9:READ v$(i%):NEXT
  130 DATA WaveSynth-Beep,StringLib-Soft,StringLib-Pluck,StringLib-Steel,StringLib-Hard
  140 DATA Percussion-Soft,Percussion-Medium,Percussion-Snare,Percussion-Noise
  150 FOR i%=0 TO 7:READ note%(i%):NEXT
  160 DATA 0,4,7,12,16,12,7,0
  170 FOR i%=0 TO 13:READ white%(i%):NEXT
  180 DATA 0,2,4,5,7,9,11,12,14,16,17,19,21,23
  190 VOICES 1:STEREO 1,0
  200 PROCscreen
  210 quit%=FALSE:v%=1
  220 REPEAT
  230   PROClist(v%)
  240   VOICE 1,v$(v%)
  250   IF v%<6 THEN PROCtune ELSE PROCdrum
  260   PROClist(0)
  270   v%+=1:IF v%>9 THEN v%=1:IF INKEY(100)<>-1 THEN quit%=TRUE
  280 UNTIL quit%
  290 PROCtidy
  300 END
  310 :
  320 DEF PROCscreen
  330 LOCAL i%
  340 COLOUR 128+4:CLS
  350 GCOL 0,4:RECTANGLE FILL 0,0,1279,959
  360 VDU 5
  370 VDU 23,17,7,6,16;16;0;0;
  380 GCOL 0,3:MOVE 480,930:PRINT "ROM VOICES";
  390 VDU 23,17,7,6,8;8;0;0;
  400 GCOL 0,7:MOVE 440,870:PRINT "RISC OS 3.71 sound system";
  410 VDU 4
  420 PROCkeyboard(-1)
  430 ENDPROC
  440 :
  450 DEF PROClist(n%)
  460 LOCAL i%,y%
  470 VDU 5
  480 FOR i%=1 TO 9
  490   y%=870-i%*50
  500   IF i%=n% THEN GCOL 0,1 ELSE GCOL 0,4
  510   RECTANGLE FILL 380,y%-36,520,40
  520   IF i%=n% THEN GCOL 0,3 ELSE GCOL 0,7
  530   MOVE 400,y%:PRINT ;i%;"  ";v$(i%);
  540 NEXT
  550 GCOL 0,4:RECTANGLE FILL 0,334,1279,36
  560 IF n% THEN GCOL 0,6:MOVE 640-(LEN(v$(n%))+10)*8,366:PRINT "VOICE 1,""";v$(n%);"""";
  570 VDU 4
  580 ENDPROC
  590 :
  600 DEF PROCtune
  610 LOCAL i%,k%
  620 FOR i%=0 TO 7
  630   k%=note%(i%)
  640   SOUND 1,-15,53+k%*4,4
  650   PROCkeyboard(k%)
  660   IF INKEY(18)<>-1 THEN quit%=TRUE:i%=7
  670 NEXT
  680 PROCkeyboard(-1)
  690 IF INKEY(40)<>-1 THEN quit%=TRUE
  700 ENDPROC
  710 :
  720 DEF PROCdrum
  730 LOCAL i%
  740 FOR i%=0 TO 7
  750   SOUND 1,-15+(i% AND 1)*4,100,2
  760   GCOL 0,3:CIRCLE FILL 1170,190,50-(i% AND 1)*16
  770   IF INKEY(12)<>-1 THEN quit%=TRUE:i%=7
  780   GCOL 0,4:CIRCLE FILL 1170,190,52
  790 NEXT
  800 IF INKEY(40)<>-1 THEN quit%=TRUE
  810 ENDPROC
  820 :
  830 DEF PROCkeyboard(k%)
  840 LOCAL i%,x%,w%
  850 w%=64:x%=640-7*w%
  860 FOR i%=0 TO 13
  870   IF white%(i%)=k% THEN GCOL 0,3 ELSE GCOL 0,7
  880   RECTANGLE FILL x%+i%*w%,60,w%-6,260
  890 NEXT
  900 GCOL 0,0
  910 FOR i%=0 TO 12
  920   IF i% MOD 7<>2 AND i% MOD 7<>6 THEN RECTANGLE FILL x%+i%*w%+40,170,40,150
  930 NEXT
  940 ENDPROC
  950 :
  960 DEF PROCtidy
  970 VOICES 1:VOICE 1,"WaveSynth-Beep"
  980 VDU 4:ON
  990 ENDPROC
 1000 :
 1010 DEF PROCerror
 1020 ON ERROR OFF
 1030 PROCtidy
 1040 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
 1050 ENDPROC
