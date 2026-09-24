   10 REM > Tune
   20 REM On RISC OS a SOUND replaces whatever its channel is
   30 REM playing, so a tune is queued on the beat counter
   40 REM with SOUND channel,amplitude,pitch,duration,beat.
   50 REM Two channels: a StringLib-Steel melody on the left
   60 REM and a WaveSynth line an octave below on the right.
   70 ON ERROR PROCerror:END
   80 MODE 12:OFF:COLOUR 11
   90 PRINT "SOUND channel,amplitude,pitch,duration,beat":PRINT
  100 VOICES 2:VOICE 2,"StringLib-Steel":STEREO 1,-64:STEREO 2,64
  110 BEATS 30000:TEMPO &1000:REM one beat per centisecond
  120 RESTORE:n%=0:t%=BEAT+20
  130 READ p%,d%
  140 WHILE p%>=0
  150   SOUND 1,-13,p%,d%,t%:SOUND 2,-8,p%-48,d%,t%
  160   n%+=1:COLOUR 1+n% MOD 7:PRINT TAB((n%-1) MOD 8*10,4+(n%-1) DIV 8);"p=";p%;" d=";d%
  170   GCOL 1+n% MOD 7:RECTANGLE FILL 40+n%*36,200,28,(p%-40)*6
  180   t%+=d%*5:READ p%,d%
  190 ENDWHILE
  200 COLOUR 7:PRINT TAB(0,28);"Done - ";n%;" notes"
  210 REPEAT UNTIL BEAT>=t% OR INKEY(10)<>-1
  220 ON
  230 END
  240 DATA 53,4,61,4,69,4,73,4,81,4,89,4,97,4,101,8
  250 DATA 89,3,89,3,97,6,89,6,109,6,105,12
  260 DATA 89,3,89,3,97,6,89,6,117,6,109,12,-1,0
  270 :
  280 DEF PROCerror
  290 ON ERROR OFF
  300 SOUND OFF:SOUND ON
  310 ON
  320 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  330 ENDPROC
