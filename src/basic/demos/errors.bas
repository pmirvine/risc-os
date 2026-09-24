   10 REM > Errors
   20 REM Error handling in BBC BASIC V: ON ERROR, LOCAL ERROR,
   30 REM ON ERROR LOCAL, RESTORE ERROR, ERROR, ERR, ERL and
   40 REM REPORT$. Each procedure traps its own errors and
   50 REM the outer handler reports anything left over.
   60 MODE 12
   70 ON ERROR PRINT "Top-level handler: ";REPORT$;" (";ERR;") at line ";ERL:END
   80 PRINT "Safe division:"
   90 FOR i%=-2 TO 2:PRINT "  10/";i%;" = ";FNsafe_div(10,i%):NEXT
  100 PRINT "Square roots:"
  110 FOR v=4 TO -4 STEP -4:PROCroot(v):NEXT
  120 PRINT "Nested handlers:":PROCouter
  130 PRINT "User error:":ERROR 99,"Something went wrong"
  140 PRINT "not reached"
  150 END
  160 :
  170 DEF FNsafe_div(a,b)
  180 LOCAL ERROR
  190 ON ERROR LOCAL RESTORE ERROR:="undefined ("+REPORT$+")"
  200 =STR$(a/b)
  210 :
  220 DEF PROCroot(x)
  230 LOCAL ERROR
  240 ON ERROR LOCAL PRINT "  SQR(";x;") failed: ";REPORT$:ENDPROC
  250 PRINT "  SQR(";x;") = ";SQR(x)
  260 ENDPROC
  270 :
  280 DEF PROCouter
  290 LOCAL ERROR
  300 ON ERROR LOCAL PRINT "  outer caught: ";REPORT$;" from line ";ERL:ENDPROC
  310 PROCinner
  320 ENDPROC
  330 :
  340 DEF PROCinner
  350 LOCAL ERROR
  360 ON ERROR LOCAL RESTORE ERROR:PRINT "  inner saw ";ERR;", passing it on":ERROR ERR,REPORT$
  370 DIM a(3):a(7)=1
  380 ENDPROC
