   10 REM > Lissajous
   20 REM Lissajous figures: x=SIN(a*t+phase), y=SIN(b*t)
   30 REM The phase drifts so the figure turns in space; each
   40 REM frame is drawn on the hidden screen bank and then
   50 REM shown, so there is no flicker. A new ratio a:b
   60 REM appears every few seconds. Press any key to stop.
   70 ON ERROR PROCerror:END
   80 MODE 28:OFF
   90 DIM a%(7),b%(7)
  100 FOR i%=0 TO 7:READ a%(i%),b%(i%):NEXT
  110 DATA 1,2,3,2,3,4,5,4,1,3,5,6,2,5,7,6
  120 bank%=1:ph=0:f%=0:n%=0
  130 REPEAT
  140   bank%=3-bank%:SYS "OS_Byte",112,bank%
  150   CLG
  160   A%=a%(n%):B%=b%(n%)
  170   FOR g%=3 TO 0 STEP -1
  180     GCOL 0,255-g%*60,120+g%*30,40+g%*50
  190     PROCcurve(A%,B%,ph-g%*0.06)
  200   NEXT
  210   GCOL 0,200,200,255:VDU 5
  220   MOVE 24,940:PRINT "LISSAJOUS FIGURES"
  230   MOVE 24,40:PRINT "x = SIN(";A%;"*t + p)   y = SIN(";B%;"*t)   p = ";FNf(ph)
  240   VDU 4
  250   WAIT:SYS "OS_Byte",113,bank%
  260   ph+=0.02:f%+=1
  270   IF f% MOD 400=0 THEN n%=(n%+1) MOD 8
  280 UNTIL INKEY(0)<>-1
  290 PROCtidy
  300 END
  310 :
  320 DEF PROCcurve(a%,b%,p)
  330 LOCAL t,s,i%
  340 s=2*PI/360
  350 MOVE 640+460*SIN(p),480
  360 FOR i%=1 TO 360
  370   t=i%*s
  380   DRAW 640+460*SIN(a%*t+p),480+400*SIN(b%*t)
  390 NEXT
  400 ENDPROC
  410 :
  420 DEF FNf(x)
  430 x=x MOD 7:=STR$(INT(x*100)/100)
  440 :
  450 DEF PROCtidy
  460 *FX 112,1
  470 *FX 113,1
  480 VDU 4:ON
  490 ENDPROC
  500 :
  510 DEF PROCerror
  520 ON ERROR OFF
  530 PROCtidy
  540 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  550 ENDPROC
