   10 REM > Tree
   20 REM A fractal tree drawn by a recursive procedure:
   30 REM each branch draws itself, then two smaller branches
   40 REM at slightly random angles. LOCAL keeps each call's
   50 REM own variables; GCOL r,g,b picks colours by value.
   60 MODE 28:OFF
   70 GCOL 0,0,40:RECTANGLE FILL 0,0,1279,959
   80 FOR y%=0 TO 200 STEP 4:GCOL 0,20+y% DIV 4,120-y% DIV 3:RECTANGLE FILL 0,y%,1279,4:NEXT
   90 PROCbranch(640,200,PI/2,220,11)
  100 GCOL 255,255,255:VDU 5:MOVE 20,940:PRINT "PROCbranch(x,y,angle,length,depth)":VDU 4
  110 ON
  120 END
  130 :
  140 DEF PROCbranch(x,y,a,l,d)
  150 LOCAL x2,y2
  160 IF d=0 THEN GCOL 255,120+RND(100),160+RND(90):CIRCLE FILL x,y,6:ENDPROC
  170 x2=x+l*COS(a):y2=y+l*SIN(a)
  180 GCOL 90+d*10,60+d*8,20
  190 FOR w%=-d DIV 3 TO d DIV 3:LINE x+w%*2,y,x2+w%*2,y2:NEXT
  200 PROCbranch(x2,y2,a+0.35+RND(1)/5,l*0.74,d-1)
  210 PROCbranch(x2,y2,a-0.35-RND(1)/5,l*0.72,d-1)
  220 ENDPROC
