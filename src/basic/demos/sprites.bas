   10 REM > Sprites
   20 REM Bouncing sprites. Four shaded balls are built pixel
   30 REM by pixel in a sprite area in memory (with masks, so
   40 REM the corners are transparent) and then plotted with
   50 REM OS_SpriteOp 34 on a double-buffered screen.
   60 REM If OS_SpriteOp isn't available the balls are drawn
   70 REM with CIRCLE FILL instead.  Press any key to stop.
   80 ON ERROR PROCerror:END
   90 MODE 28:OFF
  100 N%=8:S%=48:size%=S%*S%:sp%=44+size%*2
  110 DIM area% 16+4*sp%,x(N%),y(N%),dx(N%),dy(N%),c%(N%),rgb%(3)
  120 rgb%(0)=&FF3020:rgb%(1)=&30E040:rgb%(2)=&4070FF:rgb%(3)=&FFD020
  130 COLOUR 63:PRINT TAB(28,14);"Making sprites..."
  140 PROCmake_sprites
  150 SYS "XOS_SpriteOp",&100+8,area% TO ;f%
  160 sprites%=(f% AND 1)=0
  170 FOR i%=1 TO N%
  180   x(i%)=RND(1100)+40:y(i%)=RND(500)+300
  190   dx(i%)=RND(1)*16-8:dy(i%)=0:c%(i%)=(i%-1) MOD 4
  200 NEXT
  210 bank%=1:frames%=0
  220 REPEAT
  230   bank%=3-bank%:SYS "OS_Byte",112,bank%
  240   PROCbackground
  250   FOR i%=1 TO N%
  260     dy(i%)-=1.2:x(i%)+=dx(i%):y(i%)+=dy(i%)
  270     IF x(i%)<0 THEN x(i%)=0:dx(i%)=-dx(i%)
  280     IF x(i%)>1280-S%*2 THEN x(i%)=1280-S%*2:dx(i%)=-dx(i%)
  290     IF y(i%)<64 THEN y(i%)=64:dy(i%)=-dy(i%)*0.96:IF dy(i%)<12 THEN dy(i%)=20+RND(10)
  300     PROCball(c%(i%),x(i%),y(i%))
  310   NEXT
  320   GCOL 0,255,255,255:VDU 5:MOVE 24,940
  330   IF sprites% THEN PRINT "OS_SpriteOp 34: ";N%;" sprites with masks" ELSE PRINT "No OS_SpriteOp: drawn with CIRCLE FILL"
  340   VDU 4:OFF
  350   WAIT:SYS "OS_Byte",113,bank%
  360   frames%+=1
  370 UNTIL INKEY(0)<>-1
  380 PROCtidy
  390 END
  400 :
  410 DEF PROCmake_sprites
  420 LOCAL n%,s%,i%,j%,dx,dy,d,z,l,h,r%,g%,b%,c%
  430 area%!0=16+4*sp%:area%!4=4:area%!8=16:area%!12=16+4*sp%
  440 FOR n%=0 TO 3
  450   s%=area%+16+n%*sp%
  460   s%!0=sp%:$(s%+4)=STRING$(12,CHR$0):$(s%+4)="ball"+STR$n%
  470   s%!16=S% DIV 4-1:s%!20=S%-1:s%!24=0:s%!28=31
  480   s%!32=44:s%!36=44+size%:s%!40=28
  490   FOR j%=0 TO S%-1
  500     FOR i%=0 TO S%-1
  510       dx=(i%-S%/2+0.5)/(S%/2):dy=(S%/2-0.5-j%)/(S%/2):d=dx*dx+dy*dy
  520       IF d>=1 THEN
  530         s%?(44+j%*S%+i%)=0:s%?(44+size%+j%*S%+i%)=0
  540       ELSE
  550         z=SQR(1-d):l=(-dx*0.5+dy*0.6+z*0.62)*0.8+0.25:IF l<0.2 THEN l=0.2
  560         h=(-dx*0.5+dy*0.6+z*0.62)^24
  570         r%=FNc(rgb%(n%)>>16,l,h):g%=FNc(rgb%(n%)>>8 AND 255,l,h):b%=FNc(rgb%(n%) AND 255,l,h)
  580         SYS "ColourTrans_ReturnColourNumber",b%<<24 OR g%<<16 OR r%<<8 TO c%
  590         s%?(44+j%*S%+i%)=c%:s%?(44+size%+j%*S%+i%)=255
  600       ENDIF
  610     NEXT
  620   NEXT
  630 NEXT
  640 ENDPROC
  650 :
  660 DEF FNc(v%,l,h)
  670 v%=v%*l+255*h:IF v%>255 THEN v%=255
  680 =v%
  690 :
  700 DEF PROCball(n%,x%,y%)
  710 IF sprites% THEN SYS "OS_SpriteOp",&100+34,area%,"ball"+STR$n%,x%,y%,8:ENDPROC
  720 LOCAL r%,k%
  730 r%=S%
  740 FOR k%=0 TO 4
  750   GCOL 0,(rgb%(n%)>>16)*(0.5+k%/9),(rgb%(n%)>>8 AND 255)*(0.5+k%/9),(rgb%(n%) AND 255)*(0.5+k%/9)
  760   CIRCLE FILL x%+S%-k%*4,y%+S%+k%*4,r%-k%*5
  770 NEXT
  780 GCOL 0,255,255,255:CIRCLE FILL x%+S%-18,y%+S%+18,5
  790 ENDPROC
  800 :
  810 DEF PROCbackground
  820 LOCAL i%,j%
  830 FOR j%=0 TO 11
  840   FOR i%=0 TO 15
  850     IF (i%+j%) AND 1 THEN GCOL 0,40,40,110 ELSE GCOL 0,60,60,150
  860     RECTANGLE FILL i%*80,j%*80,79,79
  870   NEXT
  880 NEXT
  890 GCOL 0,90,60,40:RECTANGLE FILL 0,0,1279,62
  900 ENDPROC
  910 :
  920 DEF PROCtidy
  930 *FX 112,1
  940 *FX 113,1
  950 VDU 4:ON
  960 ENDPROC
  970 :
  980 DEF PROCerror
  990 ON ERROR OFF
 1000 PROCtidy
 1010 IF ERR<>17 THEN REPORT:PRINT " at line ";ERL
 1020 ENDPROC
