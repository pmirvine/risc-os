   10 REM > Plasma
   20 REM 256 colour plasma with palette cycling
   30 REM (c) Acorn User type-in style, 1996
   40 REM In 256 colour modes VDU 19 sets sixteen entries at
   50 REM once: the low four bits of each pixel pick the
   60 REM entry, the top four bits add fixed red, green and
   70 REM blue. So we draw the plasma once, straight into
   80 REM screen memory, then just cycle the 16 colours.
   90 ON ERROR PROCend:END
  100 MODE 13:OFF
  110 DIM s%(511),v% 12
  120 FOR i%=0 TO 511:s%(i%)=64+63*SIN(i%*PI/128):NEXT
  130 v%!0=148:v%!4=6:v%!8=-1:SYS "OS_ReadVduVariables",v%,v%
  140 scr%=v%!0:row%=v%!4
  150 PROCpalette(0)
  160 FOR y%=0 TO 255
  170   a%=s%(y%*2)+s%(y%+100):p%=scr%+y%*row%
  180   FOR x%=0 TO 319
  190     p%?x%=a%+s%(x%*3 AND 511)+s%((x%+y%)*2 AND 511) AND 255
  200   NEXT
  210 NEXT
  220 COLOUR 15:PRINT TAB(1,1);"PLASMA";TAB(1,30);"Press a key"
  230 ph%=0
  240 REPEAT
  250   ph%+=1:WAIT:PROCpalette(ph%)
  260 UNTIL INKEY(0)<>-1
  270 PROCend
  280 END
  290 :
  300 DEF PROCpalette(p%)
  310 LOCAL i%,r%,g%,b%
  320 FOR i%=0 TO 15
  330   r%=s%((i%+p%)*32 AND 511) DIV 18:g%=s%((i%*32+p%*5) AND 511) DIV 40:b%=s%((i%*32-p%*3+170) AND 511) DIV 18
  340   COLOUR i%,r%*17,g%*17,b%*17
  350 NEXT
  360 ENDPROC
  370 :
  380 DEF PROCend
  390 ON ERROR OFF
  400 VDU 20:ON
  410 ENDPROC
