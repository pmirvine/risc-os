   10 REM > Tune
   20 REM SOUND and ENVELOPE: plays a scale and a tune, shows the notes
   30 MODE 12:OFF:COLOUR 11
   40 PRINT "SOUND channel,amplitude,pitch,duration":PRINT
   50 ENVELOPE 1,2,0,0,0,0,0,0,126,-4,0,-2,126,80
   60 VOICES 2
   70 RESTORE 200:n%=0
   80 READ p%,d%
   90 WHILE p%>=0
  100   SOUND 1,1,p%,d%:SOUND 2,-6,p%-48,d%
  110   n%+=1:COLOUR 1+n% MOD 7:PRINT TAB((n%-1) MOD 8*10,4+(n%-1) DIV 8);"p=";p%;" d=";d%
  120   GCOL 1+n% MOD 7:RECTANGLE FILL 40+n%*36,200,28,(p%-40)*6
  130   READ p%,d%
  140 ENDWHILE
  150 COLOUR 7:PRINT TAB(0,28);"Noise:":SOUND 0,-10,4,10
  160 PRINT "Done - ";n%;" notes"
  170 END
  200 DATA 53,4,61,4,69,4,73,4,81,4,89,4,97,4,101,8
  210 DATA 89,3,89,3,97,6,89,6,109,6,105,12
  220 DATA 89,3,89,3,97,6,89,6,117,6,109,12,-1,0
