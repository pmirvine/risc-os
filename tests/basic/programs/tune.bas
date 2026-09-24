   10 REM > Tune
   20 REM SOUND on RISC OS: a SOUND replaces what its channel is playing,
   30 REM so a tune is scheduled on the beat counter with SOUND ...,beat
   40 MODE 12:OFF:COLOUR 11
   50 PRINT "SOUND channel,amplitude,pitch,duration,beat":PRINT
   60 VOICES 2:VOICE 2,"StringLib-Steel":STEREO 1,-64:STEREO 2,64
   70 BEATS 30000:TEMPO &1000:REM one beat per centisecond
   80 RESTORE 200:n%=0:t%=BEAT+20
   90 READ p%,d%
  100 WHILE p%>=0
  110   SOUND 1,-13,p%,d%,t%:SOUND 2,-8,p%-48,d%,t%
  120   n%+=1:COLOUR 1+n% MOD 7:PRINT TAB((n%-1) MOD 8*10,4+(n%-1) DIV 8);"p=";p%;" d=";d%
  130   GCOL 1+n% MOD 7:RECTANGLE FILL 40+n%*36,200,28,(p%-40)*6
  140   t%+=d%*5:READ p%,d%
  150 ENDWHILE
  160 COLOUR 7:PRINT TAB(0,28);"Done - ";n%;" notes"
  170 END
  200 DATA 53,4,61,4,69,4,73,4,81,4,89,4,97,4,101,8
  210 DATA 89,3,89,3,97,6,89,6,109,6,105,12
  220 DATA 89,3,89,3,97,6,89,6,117,6,109,12,-1,0
