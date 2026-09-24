   10 REM > Roses
   20 REM Rose curves r=COS(k*t) for twelve values of k=n/d.
   30 REM A rose with k=n/d closes after d turns (or 2*d
   40 REM when n*d is even); odd n gives n petals, even n
   50 REM gives 2*n. Press any key to skip the drawing.
   60 ON ERROR PROCerror:END
   70 MODE 28:OFF
   80 GCOL 0,0,0,48:RECTANGLE FILL 0,0,1279,959
   90 GCOL 0,255,255,200:VDU 5
  100 MOVE 420,948:PRINT "ROSE CURVES   r = COS(k*t)"
  110 fast%=FALSE
  120 FOR c%=0 TO 11
  130   READ n%,d%
  140   cx%=160+(c% MOD 4)*320:cy%=760-(c% DIV 4)*300
  150   GCOL 0,0,0,90:RECTANGLE FILL cx%-150,cy%-140,300,280
  160   PROCrose(cx%,cy%,120,n%,d%,c%)
  170   GCOL 0,255,255,255
  180   MOVE cx%-140,cy%-110:PRINT "k=";n%;"/";d%
  190 NEXT
  200 VDU 4:OFF
  210 END
  220 DATA 2,1,3,1,5,1,4,1,1,2,3,2,5,2,7,3,1,3,2,3,5,4,7,4
  230 :
  240 DEF PROCrose(x%,y%,r%,n%,d%,c%)
  250 LOCAL k,t,s,i%,m%,rr
  260 k=n%/d%
  270 IF (n%*d%) MOD 2=1 THEN m%=180*d% ELSE m%=360*d%
  280 s=PI/180
  290 MOVE x%+r%,y%
  300 FOR i%=1 TO m%
  310   t=i%*s:rr=r%*COS(k*t)
  320   GCOL 0,160+95*SIN(t*0.5+c%),128+127*COS(k*t),200+55*SIN(t)
  330   DRAW x%+rr*COS(t),y%+rr*SIN(t)
  340   IF i% MOD 12=0 AND NOT fast% THEN WAIT:IF INKEY(0)<>-1 THEN fast%=TRUE
  350 NEXT
  360 ENDPROC
  370 :
  380 DEF PROCerror
  390 ON ERROR OFF
  400 VDU 4:ON
  410 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
  420 ENDPROC
