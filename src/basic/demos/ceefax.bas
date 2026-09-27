   10 REM > Ceefax
   20 REM A teletext news page in MODE 7, in the style of the
   30 REM BBC's Ceefax: a ticking clock in the header, double
   40 REM height titles, a flashing headline, a moving wave of
   50 REM graphics characters and a news ticker. Q or Escape
   60 REM quits. Try it in !GraphTask: drag it to GraphTask's
   70 REM icon bar icon (or type *GraphTask Ceefax) and it runs
   80 REM in a window, still moving while you use the desktop.
   90 ON ERROR PROCend:END
  100 MODE 7:OFF
  110 tick$="  ACORN SHIPS RISC OS 3.71 ... BBC BASIC V RUNS IN A WINDOW ... WEATHER: SUNNY SPELLS, SHOWERS LATER ... "
  120 f%=0:t%=0
  130 PROCpage
  140 REPEAT
  150   PROCheader
  160   PROCwave(f%)
  170   IF f% MOD 4=0 THEN PROCticker(t%):t%+=1
  180   f%+=1
  190   WAIT:WAIT
  200   k%=INKEY(0)
  210 UNTIL k%=ASC"q" OR k%=ASC"Q"
  220 PROCend
  230 END
  240 :
  250 DEF PROCpage
  260 LOCAL i%
  270 REM the title: yellow double height on blue
  280 FOR i%=2 TO 3
  290   PRINT TAB(0,i%);CHR$132;CHR$157;CHR$131;CHR$141;"  CEEFAX  NEWS    ";CHR$135;"Page 100  ";CHR$156
  300 NEXT
  310 REM the flashing headline
  320 PRINT TAB(0,8);CHR$129;CHR$136;"NEWSFLASH";CHR$137;CHR$135;"BASIC goes multitasking"
  330 PRINT TAB(0,9);CHR$134;"  Graphics windows reach the desktop"
  340 PRINT TAB(0,11);CHR$131;"Acorn A5000 now at 33MHz ........ ";CHR$135;"102"
  350 PRINT TAB(0,12);CHR$131;"Teletext pages in a window ...... ";CHR$135;"103"
  360 PRINT TAB(0,13);CHR$131;"New !Paint sprites for spring ... ";CHR$135;"104"
  370 PRINT TAB(0,14);CHR$131;"Archimedes clubs meet in Leeds .. ";CHR$135;"105"
  380 PRINT TAB(0,15);CHR$131;"Floppy discs: 800K or 1.6MB? .... ";CHR$135;"106"
  390 PRINT TAB(0,17);CHR$130;"SPORT";CHR$135;"Frogs win at Hopper cup ... ";CHR$130;"300"
  400 PRINT TAB(0,18);CHR$133;"TV";CHR$135;"   Micro Live repeated at 7 .. ";CHR$133;"600"
  410 REM the fastext keys
  420 PRINT TAB(0,24);CHR$129;"Headlines";CHR$130;"Sport";CHR$131;"Weather";CHR$134;"TV guide";
  430 ENDPROC
  440 :
  450 DEF PROCheader
  460 LOCAL t$
  470 t$=TIME$
  480 PRINT TAB(0,0);" P100 ";CHR$131;"CEEFAX 1 100";CHR$135;LEFT$(t$,3);" ";MID$(t$,5,6);CHR$131;RIGHT$(t$,8);
  490 ENDPROC
  500 :
  510 REM two rows of graphics characters (2 x 3 blocks each)
  520 REM filled up to a sine wave that moves to the left
  530 DEF PROCwave(f%)
  540 LOCAL r%,c%,k%,b%,x%,y%,h,s$
  550 FOR r%=0 TO 1
  560   s$=CHR$(145+(f% DIV 60) MOD 7)
  570   FOR c%=0 TO 37
  580     b%=0
  590     FOR k%=0 TO 1
  600       x%=c%*2+k%
  610       h=3+2.6*SIN((x%+f%)*0.22)+0.8*SIN((x%-f%)*0.11)
  620       FOR y%=0 TO 2
  630         IF 5-(r%*3+y%)<h THEN b%+=2^(y%*2+k%)
  640       NEXT
  650     NEXT
  660     IF b%>=32 THEN b%+=32
  670     s$+=CHR$(160+b%)
  680   NEXT
  690   PRINT TAB(0,5+r%);s$;
  700 NEXT
  710 ENDPROC
  720 :
  730 DEF PROCticker(t%)
  740 LOCAL p%
  750 p%=t% MOD LEN(tick$)
  760 PRINT TAB(0,21);CHR$129;CHR$157;CHR$135;LEFT$(MID$(tick$+tick$,p%+1),36);CHR$156;
  770 ENDPROC
  780 :
  790 DEF PROCend
  800 ON ERROR OFF
  810 ON:PRINT TAB(0,23);
  820 IF ERR<>17 AND ERR<>0 THEN REPORT:PRINT " at line ";ERL
  830 ENDPROC
