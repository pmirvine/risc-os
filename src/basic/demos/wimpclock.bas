   10 REM > WimpClock
   20 REM A clock for the desktop, written as a Wimp task.
   30 REM Wimp_Initialise makes it a task: it puts an icon on
   40 REM the icon bar and opens a window, then sleeps in
   50 REM Wimp_PollIdle and redraws the hands every second.
   60 REM SELECT on the icon opens the window, MENU gives
   70 REM Info and Quit.
   80 ON ERROR ON ERROR OFF:PROCerror(REPORT$+" at line "+STR$ERL):END
   90 DIM b% 1024,win% 256,menu% 128,t% 12
  100 quit%=FALSE:last$=""
  110 SYS "Wimp_Initialise",200,&4B534154,"WimpClock" TO ver%,task%
  120 PROCiconbar
  130 PROCwindow
  140 PROCmenu
  150 PROCopen
  160 ON ERROR PROCerror(REPORT$+" at line "+STR$ERL)
  170 REPEAT
  180   PROCpoll
  190 UNTIL quit%
  200 SYS "Wimp_CloseDown",task%,&4B534154
  210 END
  220 :
  230 DEF PROCpoll
  240 LOCAL now%,reason%
  250 SYS "OS_ReadMonotonicTime" TO now%
  260 SYS "Wimp_PollIdle",0,b%,now%+25 TO reason%
  270 CASE reason% OF
  280   WHEN 0:PROCtick
  290   WHEN 1:PROCredraw(!b%)
  300   WHEN 2:SYS "Wimp_OpenWindow",,b%
  310   WHEN 3:SYS "Wimp_CloseWindow",,b%
  320   WHEN 6:PROCclick(b%!8,b%!12)
  330   WHEN 9:PROCselect(!b%)
  340   WHEN 17,18:IF b%!16=0 THEN quit%=TRUE
  350 ENDCASE
  360 ENDPROC
  370 :
  380 DEF PROCiconbar
  390 !b%=-1:b%!4=0:b%!8=0:b%!12=68:b%!16=68
  400 b%!20=&3002:$(b%+24)="!alarm"
  410 SYS "Wimp_CreateIcon",0,b% TO ibar%
  420 ENDPROC
  430 :
  440 DEF PROCwindow
  450 win%!0=600:win%!4=300:win%!8=1000:win%!12=760
  460 win%!16=0:win%!20=0:win%!24=-1
  470 win%!28=&87000002
  480 win%?32=7:win%?33=2:win%?34=7:win%?35=1
  490 win%?36=3:win%?37=1:win%?38=12:win%?39=0
  500 win%!40=0:win%!44=-460:win%!48=400:win%!52=0
  510 win%!56=&19:win%!60=0
  520 win%!64=1:win%!68=0
  530 $(win%+72)="Clock"+CHR$0
  540 win%!84=0
  550 SYS "Wimp_CreateWindow",,win% TO whandle%
  560 ENDPROC
  570 :
  580 DEF PROCmenu
  590 $menu%="Clock":menu%?12=7:menu%?13=2:menu%?14=7:menu%?15=0
  600 menu%!16=120:menu%!20=44:menu%!24=0
  610 menu%!28=0:menu%!32=-1:menu%!36=&07000021:$(menu%+40)="Info"
  620 menu%!52=&80:menu%!56=-1:menu%!60=&07000021:$(menu%+64)="Quit"
  630 ENDPROC
  640 :
  650 DEF PROCopen
  660 !b%=whandle%:SYS "Wimp_GetWindowState",,b%
  670 b%!28=-1:SYS "Wimp_OpenWindow",,b%
  680 ENDPROC
  690 :
  700 DEF PROCclick(but%,w%)
  710 IF w%<>-2 THEN ENDPROC
  720 IF but%=2 THEN SYS "Wimp_CreateMenu",,menu%,!b%-60,96+44*2 ELSE PROCopen
  730 ENDPROC
  740 :
  750 DEF PROCselect(i%)
  760 IF i%=0 THEN
  770   !t%=0:$(t%+4)="WimpClock 1.00 - a BBC BASIC Wimp task"+CHR$0
  780   SYS "Wimp_ReportError",t%,1,"WimpClock"
  790 ENDIF
  800 IF i%=1 THEN quit%=TRUE
  810 ENDPROC
  820 :
  830 DEF PROCtick
  840 IF TIME$=last$ THEN ENDPROC
  850 last$=TIME$
  860 SYS "Wimp_ForceRedraw",whandle%,0,-460,400,0
  870 ENDPROC
  880 :
  890 DEF PROCredraw(h%)
  900 LOCAL more%,ox%,oy%
  910 !b%=h%
  920 SYS "Wimp_RedrawWindow",,b% TO more%
  930 ox%=b%!4-b%!20:oy%=b%!16-b%!24
  940 WHILE more%
  950   PROCface(ox%+200,oy%-200)
  960   SYS "Wimp_GetRectangle",,b% TO more%
  970 ENDWHILE
  980 ENDPROC
  990 :
 1000 DEF PROCface(x%,y%)
 1010 LOCAL t$,h,m,s,i%,a,r%
 1020 t$=TIME$
 1030 h=VAL(MID$(t$,17,2)):m=VAL(MID$(t$,20,2)):s=VAL(MID$(t$,23,2))
 1040 SYS "Wimp_SetColour",7:CIRCLE FILL x%,y%,184
 1050 SYS "Wimp_SetColour",12:CIRCLE FILL x%,y%,172
 1060 SYS "Wimp_SetColour",0:CIRCLE FILL x%,y%,150
 1070 SYS "Wimp_SetColour",7
 1080 FOR i%=0 TO 59
 1090   a=i%*PI/30:IF i% MOD 5=0 THEN r%=124 ELSE r%=140
 1100   LINE x%+r%*SIN(a),y%+r%*COS(a),x%+146*SIN(a),y%+146*COS(a)
 1110   IF i% MOD 15=0 THEN PROChand(x%,y%,a,146,6,-124)
 1120 NEXT
 1130 SYS "Wimp_SetColour",8
 1140 PROChand(x%,y%,(h MOD 12+m/60)*PI/6,86,10,-16)
 1150 PROChand(x%,y%,(m+s/60)*PI/30,128,7,-16)
 1160 SYS "Wimp_SetColour",11
 1170 PROChand(x%,y%,s*PI/30,136,2,-30)
 1180 CIRCLE FILL x%,y%,8
 1190 SYS "Wimp_SetColour",7
 1200 MOVE x%-64,y%-212:PRINT RIGHT$(t$,8)
 1210 ENDPROC
 1220 :
 1230 DEF PROChand(x%,y%,a,l%,w%,t%)
 1240 LOCAL sx,sy
 1250 sx=SIN(a):sy=COS(a)
 1260 MOVE x%+t%*sx-w%*sy,y%+t%*sy+w%*sx
 1270 MOVE x%+t%*sx+w%*sy,y%+t%*sy-w%*sx
 1280 PLOT 85,x%+l%*sx-w%*sy,y%+l%*sy+w%*sx
 1290 PLOT 85,x%+l%*sx+w%*sy,y%+l%*sy-w%*sx
 1300 ENDPROC
 1310 :
 1320 DEF PROCerror(e$)
 1330 !t%=ERR:$(t%+4)=e$+CHR$0
 1340 SYS "Wimp_ReportError",t%,1,"WimpClock"
 1350 ENDPROC
