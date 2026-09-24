   10 REM > Snake
   20 REM Steer the snake with the cursor keys (or Z X ' /)
   30 REM to eat the apples. Each apple makes you longer and
   40 REM faster. Don't hit the walls or your own tail!
   50 REM SPACE starts a game, Escape or Q quits.
   60 ON ERROR PROCerror:END
   70 MODE 28:OFF
   80 *FX 4,1
   90 VOICES 2:VOICE 1,"WaveSynth-Beep":VOICE 2,"Percussion-Noise"
  100 W%=40:H%=28:C%=32:M%=W%*H%
  110 DIM grid% M%,bx%(M%),by%(M%)
  120 hi%=0
  130 REPEAT
  140   PROCtitle
  150   REPEAT k%=GET OR 32:UNTIL k%=32 OR k%=ASC"q"
  160   IF k%=32 THEN PROCgame
  170 UNTIL k%=ASC"q"
  180 PROCtidy
  190 END
  200 :
  210 DEF PROCtitle
  220 LOCAL i%
  230 CLS
  240 GCOL 0,0,60,0:RECTANGLE FILL 0,0,1279,959
  250 FOR i%=0 TO 38
  260   GCOL 0,40+i%*5,170,40:RECTANGLE FILL 32+i%*32,800+80*SIN(i%/3),28,28
  270 NEXT
  280 GCOL 0,230,20,20:CIRCLE FILL 1264,800+80*SIN(13),14
  290 VDU 5
  300 VDU 23,17,7,6,24;24;0;0;
  310 GCOL 0,255,255,120:PROCcentre(660,"SNAKE",48)
  320 VDU 23,17,7,6,8;8;0;0;
  330 GCOL 0,255,255,255
  340 PROCcentre(520,"Cursor keys or Z X ' / to steer",16)
  350 PROCcentre(470,"Eat the apples, avoid the walls",16)
  360 PROCcentre(340,"SPACE to play, Q to quit",16)
  370 IF hi% THEN GCOL 0,255,255,0:PROCcentre(240,"High score "+STR$hi%,16)
  380 VDU 4
  390 ENDPROC
  400 :
  410 DEF PROCcentre(y%,t$,w%)
  420 MOVE 640-LEN(t$)*w%/2,y%:PRINT t$;
  430 ENDPROC
  440 :
  450 DEF PROCgame
  460 LOCAL x%,y%,dx%,dy%,head%,tail%,len%,grow%,score%,delay%,dead%,i%,t%
  470 CLS
  480 GCOL 0,0,0,0:RECTANGLE FILL 0,0,1279,959
  490 GCOL 0,90,90,160:RECTANGLE FILL 0,0,1279,C%-1
  500 RECTANGLE FILL 0,H%*C%-C%,1279,C%
  510 RECTANGLE FILL 0,0,C%-1,H%*C%-1:RECTANGLE FILL 1279-C%+1,0,C%,H%*C%-1
  520 FOR i%=0 TO M%-1:grid%?i%=0:NEXT
  530 FOR i%=0 TO W%-1:grid%?i%=1:grid%?(i%+(H%-1)*W%)=1:NEXT
  540 FOR i%=0 TO H%-1:grid%?(i%*W%)=1:grid%?(i%*W%+W%-1)=1:NEXT
  550 x%=W% DIV 2:y%=H% DIV 2:dx%=1:dy%=0
  560 head%=0:tail%=0:len%=1:grow%=4:score%=0:delay%=12:dead%=FALSE
  570 bx%(0)=x%:by%(0)=y%:grid%?(y%*W%+x%)=1:PROCsq(x%,y%,2)
  580 PROCapple:PROCscore(score%)
  590 REPEAT
  600   t%=TIME+delay%
  610   REPEAT
  620     k%=INKEY(1)
  630     CASE k% OF
  640       WHEN 136,ASC"z",ASC"Z": IF dx%=0 THEN dx%=-1:dy%=0
  650       WHEN 137,ASC"x",ASC"X": IF dx%=0 THEN dx%=1:dy%=0
  660       WHEN 139,ASC"'": IF dy%=0 THEN dx%=0:dy%=1
  670       WHEN 138,ASC"/": IF dy%=0 THEN dx%=0:dy%=-1
  680       WHEN ASC"q",ASC"Q": dead%=TRUE
  690     ENDCASE
  700   UNTIL TIME>=t% OR (k%>=136 AND k%<=139)
  710   x%+=dx%:y%+=dy%
  720   IF grid%?(y%*W%+x%)=2 THEN
  730     PROCeat
  740   ELSE
  750     IF grid%?(y%*W%+x%) THEN dead%=TRUE
  760   ENDIF
  770   IF NOT dead% THEN
  780     PROCsq(bx%(head%),by%(head%),1)
  790     head%=(head%+1) MOD M%:bx%(head%)=x%:by%(head%)=y%
  800     grid%?(y%*W%+x%)=1:PROCsq(x%,y%,2)
  810     IF grow% THEN
  820       grow%-=1:len%+=1
  830     ELSE
  840       grid%?(by%(tail%)*W%+bx%(tail%))=0:PROCsq(bx%(tail%),by%(tail%),0)
  850       tail%=(tail%+1) MOD M%
  860     ENDIF
  870   ENDIF
  880 UNTIL dead%
  890 SOUND 2,-15,1,20
  900 FOR i%=1 TO 6
  910   GCOL 0,255,0,0:PROCsq(x%-dx%,y%-dy%,-1):WAIT:WAIT:WAIT
  920   PROCsq(x%-dx%,y%-dy%,2):WAIT:WAIT:WAIT
  930 NEXT
  940 IF score%>hi% THEN hi%=score%
  950 GCOL 0,255,255,0:VDU 5:PROCcentre(520,"GAME OVER",16):VDU 4
  960 SOUND 1,-12,53,8:t%=TIME+80:REPEAT UNTIL TIME>t%
  970 *FX 15,1
  980 ENDPROC
  990 :
 1000 DEF PROCeat
 1010 score%+=10:grow%+=3
 1020 IF delay%>4 AND score% MOD 50=0 THEN delay%-=1
 1030 SOUND 1,-15,137,2
 1040 PROCscore(score%)
 1050 PROCapple
 1060 ENDPROC
 1070 :
 1080 DEF PROCapple
 1090 LOCAL ax%,ay%
 1100 REPEAT ax%=RND(W%-2):ay%=RND(H%-2):UNTIL grid%?(ay%*W%+ax%)=0
 1110 grid%?(ay%*W%+ax%)=2
 1120 GCOL 0,230,20,20:CIRCLE FILL ax%*C%+C%/2,ay%*C%+C%/2-2,C%/2-4
 1130 GCOL 0,40,200,40:RECTANGLE FILL ax%*C%+C%/2,ay%*C%+C%-10,6,8
 1140 ENDPROC
 1150 :
 1160 DEF PROCsq(x%,y%,c%)
 1170 CASE c% OF
 1180   WHEN 0:GCOL 0,0,0,0:RECTANGLE FILL x%*C%,y%*C%,C%-1,C%-1:ENDPROC
 1190   WHEN 1:GCOL 0,40,170,40
 1200   WHEN 2:GCOL 0,150,255,90
 1210 ENDCASE
 1220 RECTANGLE FILL x%*C%+2,y%*C%+2,C%-5,C%-5
 1230 ENDPROC
 1240 :
 1250 DEF PROCscore(s%)
 1260 GCOL 0,90,90,160:RECTANGLE FILL 0,H%*C%,1279,959-H%*C%
 1270 GCOL 0,255,255,255:VDU 5
 1280 MOVE 16,944:PRINT "SNAKE    Score ";s%;"    High ";hi%
 1290 VDU 4
 1300 ENDPROC
 1310 :
 1320 DEF PROCtidy
 1330 *FX 4,0
 1340 *FX 15,1
 1350 VDU 4:ON
 1360 ENDPROC
 1370 :
 1380 DEF PROCerror
 1390 ON ERROR OFF
 1400 PROCtidy
 1410 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
 1420 ENDPROC
