   10 REM > Canon
   20 REM A four-bar ground bass in the style of Pachelbel,
   30 REM played on six channels by the sound scheduler.
   40 REM BEATS sets the length of the bar and TEMPO its speed;
   50 REM at each bar line the program queues every note of
   60 REM the next bar with SOUND c,a,p,d,beat, so the music
   70 REM keeps perfect time whatever BASIC is doing.
   80 REM Pitches are &4000 (middle C) + &1000 per octave.
   90 REM Press any key to stop.
  100 ON ERROR PROCerror:END
  110 MODE 27:OFF
  120 DIM ao%(7),rt%(7),mn%(7),mel%(7),v$(6),amp%(6),st%(6),pat%(1,6,15),name$(6)
  130 FOR i%=0 TO 7:READ rt%(i%),mn%(i%),mel%(i%):NEXT
  140 DATA 2,0,18,9,0,16,11,1,14,6,1,13,7,0,11,2,0,9,7,0,11,9,0,13
  150 FOR i%=0 TO 7:READ ao%(i%):NEXT
  160 DATA 0,4,7,12,7,4,0,4
  170 FOR i%=1 TO 6:READ name$(i%),v$(i%),amp%(i%),st%(i%):NEXT
  180 DATA Melody,StringLib-Steel,-14,-30,Bass,StringLib-Hard,-13,0
  190 DATA Arpeggio,StringLib-Pluck,-9,60,Kick,Percussion-Medium,-15,0
  200 DATA Snare,Percussion-Snare,-12,-40,Hi-hat,Percussion-Noise,-7,80
  210 VOICES 8
  220 FOR c%=1 TO 6:VOICE c%,v$(c%):STEREO c%,st%(c%):NEXT
  230 SP%=12:O%=16:X%=-999
  240 TEMPO &1000:SYS "Sound_QBeat",-2:BEATS SP%*16
  250 PROCscreen
  260 bar%=0:PROCbar(bar%,O%):playing%=0:PROCgrid(0,0)
  270 last%=BEAT:old%=-1
  280 REPEAT
  290   b%=BEAT
  300   IF b%<last% THEN
  310     bar%+=1:PROCbar(bar%,SP%*16+O%)
  320     PROCgrid(bar%-1,(bar%-1) AND 1)
  330   ENDIF
  340   last%=b%
  350   s%=((b%-O%+SP%*16) DIV SP%) MOD 16
  360   IF s%<>old% THEN PROChead(s%):old%=s%
  370   WAIT
  380 UNTIL INKEY(0)<>-1
  390 PROCtidy
  400 END
  410 :
  420 DEF PROCbar(k%,t%)
  430 LOCAL h%,s%,c%,r%,p%,ph%,d%,n%,b%
  440 b%=k% AND 1
  450 FOR c%=1 TO 6:FOR s%=0 TO 15:pat%(b%,c%,s%)=X%:NEXT:NEXT
  460 ph%=(k% DIV 4) MOD 4:IF k%>=16 AND ph%=0 THEN ph%=1
  470 FOR h%=0 TO 1
  480   n%=(k% MOD 4)*2+h%
  490   r%=rt%(n%)
  500   pat%(b%,2,h%*8)=r%-24:pat%(b%,2,h%*8+6)=r%-12
  510   FOR s%=0 TO 7:pat%(b%,3,h%*8+s%)=r%+FNt(ao%(s%),n%):NEXT
  520   CASE ph% OF
  530     WHEN 1:pat%(b%,1,h%*8)=mel%(n%)
  540     WHEN 2:pat%(b%,1,h%*8)=r%+FNt(16,n%):pat%(b%,1,h%*8+4)=r%+19
  550     WHEN 3:FOR s%=0 TO 3:pat%(b%,1,h%*8+s%*2)=r%+FNt(ao%(s%)+12,n%):NEXT
  560   ENDCASE
  570 NEXT
  580 FOR s%=0 TO 15
  590   IF s%=0 OR s%=8 OR s%=10 AND ph%>1 THEN pat%(b%,4,s%)=0
  600   IF s%=4 OR s%=12 THEN pat%(b%,5,s%)=0
  610   IF (s% AND 1)=0 AND ph%>0 THEN pat%(b%,6,s%)=0
  620 NEXT
  630 FOR s%=0 TO 15
  640   FOR c%=1 TO 6
  650     p%=pat%(b%,c%,s%)
  660     IF p%<>X% THEN
  670       CASE c% OF
  680         WHEN 1:d%=10:IF ph%=1 THEN d%=19
  690         WHEN 2:d%=8
  700         WHEN 3:d%=3
  710         OTHERWISE:d%=2
  720       ENDCASE
  730       SOUND c%,amp%(c%),&4000+p%*4096 DIV 12,d%,t%+s%*SP%
  740     ENDIF
  750   NEXT
  760 NEXT
  770 ENDPROC
  780 :
  790 DEF PROCscreen
  800 LOCAL c%
  810 GCOL 0,4:RECTANGLE FILL 0,0,1279,959
  820 VDU 5:GCOL 0,3
  830 VDU 23,17,7,6,16;16;0;0;
  840 MOVE 560,930:PRINT "CANON";
  850 VDU 23,17,7,6,8;8;0;0;
  860 GCOL 0,7:MOVE 300,860:PRINT "BEATS ";SP%*16;":TEMPO &1000  (16 steps of ";SP%;" beats)";
  870 FOR c%=1 TO 6
  880   GCOL 0,7:MOVE 24,780-c%*90:PRINT name$(c%);
  890   GCOL 0,6:MOVE 24,750-c%*90:PRINT v$(c%);
  900 NEXT
  910 VDU 4:OFF
  920 ENDPROC
  930 :
  940 DEF PROCgrid(k%,b%)
  950 LOCAL c%,s%
  960 VDU 5
  970 FOR c%=1 TO 6
  980   FOR s%=0 TO 15
  990     IF pat%(b%,c%,s%)=X% THEN GCOL 0,0 ELSE GCOL 0,2+(c%>3)
 1000     RECTANGLE FILL 320+s%*58,720-c%*90,50,70
 1010   NEXT
 1020 NEXT
 1030 GCOL 0,4:RECTANGLE FILL 0,40,1279,50
 1040 GCOL 0,7:MOVE 320,80:PRINT "Bar ";k%+1;"   chords ";FNchord(k%*2);" ";FNchord(k%*2+1);
 1050 VDU 4:OFF
 1060 ENDPROC
 1070 :
 1080 DEF FNchord(n%)
 1090 LOCAL c$
 1100 n%=n% MOD 8
 1110 c$=MID$("C C#D D#E F F#G G#A A#B ",(rt%(n%) MOD 12)*2+1,2)
 1120 IF RIGHT$(c$)=" " THEN c$=LEFT$(c$)
 1130 =c$+LEFT$("m",mn%(n%))
 1140 :
 1150 DEF FNt(o%,n%)
 1160 IF o% MOD 12=4 THEN o%-=mn%(n%)
 1170 =o%
 1180 :
 1190 DEF PROChead(s%)
 1200 GCOL 0,4:RECTANGLE FILL 310,100,960,40
 1210 GCOL 0,1:RECTANGLE FILL 320+s%*58,110,50,20
 1220 ENDPROC
 1230 :
 1240 DEF PROCtidy
 1250 SOUND OFF:SOUND ON
 1260 VOICES 1:VOICE 1,"WaveSynth-Beep"
 1270 VDU 4:ON
 1280 ENDPROC
 1290 :
 1300 DEF PROCerror
 1310 ON ERROR OFF
 1320 PROCtidy
 1330 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
 1340 ENDPROC
