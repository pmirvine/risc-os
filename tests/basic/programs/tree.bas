   10 REM > Tree
   20 REM Recursive fractal tree: PROC recursion, LOCAL variables, GCOL r,g,b
   30 MODE 28:OFF
   40 GCOL 0,0,40:RECTANGLE FILL 0,0,1279,959
   50 FOR y%=0 TO 200 STEP 4:GCOL 0,20+y% DIV 4,120-y% DIV 3:RECTANGLE FILL 0,y%,1279,4:NEXT
   60 PROCbranch(640,200,PI/2,220,11)
   70 GCOL 255,255,255:VDU 5:MOVE 20,940:PRINT "PROCbranch(x,y,angle,length,depth)":VDU 4
   80 END
   90 DEF PROCbranch(x,y,a,l,d)
  100 LOCAL x2,y2
  110 IF d=0 THEN GCOL 255,120+RND(100),160+RND(90):CIRCLE FILL x,y,6:ENDPROC
  120 x2=x+l*COS(a):y2=y+l*SIN(a)
  130 GCOL 90+d*10,60+d*8,20
  140 FOR w%=-d DIV 3 TO d DIV 3:LINE x+w%*2,y,x2+w%*2,y2:NEXT
  150 PROCbranch(x2,y2,a+0.35+RND(1)/5,l*0.74,d-1)
  160 PROCbranch(x2,y2,a-0.35-RND(1)/5,l*0.72,d-1)
  170 ENDPROC
