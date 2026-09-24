   10 REM > Errors
   20 REM Error handling: ON ERROR, LOCAL ERROR, RESTORE ERROR, ERROR, ERL, REPORT$
   30 MODE 12
   40 ON ERROR PRINT "Top-level handler: ";REPORT$;" (";ERR;") at line ";ERL:END
   50 PRINT "Safe division:"
   60 FOR i%=-2 TO 2:PRINT "  10/";i%;" = ";FNsafe_div(10,i%):NEXT
   70 PRINT "Square roots:"
   80 FOR v=4 TO -4 STEP -4:PROCroot(v):NEXT
   90 PRINT "Nested handlers:":PROCouter
  100 PRINT "User error:":ERROR 99,"Something went wrong"
  110 PRINT "not reached"
  120 END
  130 DEF FNsafe_div(a,b)
  140 LOCAL ERROR
  150 ON ERROR LOCAL RESTORE ERROR:="undefined ("+REPORT$+")"
  160 =STR$(a/b)
  170 DEF PROCroot(x)
  180 LOCAL ERROR
  190 ON ERROR LOCAL PRINT "  SQR(";x;") failed: ";REPORT$:ENDPROC
  200 PRINT "  SQR(";x;") = ";SQR(x)
  210 ENDPROC
  220 DEF PROCouter
  230 LOCAL ERROR
  240 ON ERROR LOCAL PRINT "  outer caught: ";REPORT$;" from line ";ERL:ENDPROC
  250 PROCinner
  260 ENDPROC
  270 DEF PROCinner
  280 LOCAL ERROR
  290 ON ERROR LOCAL RESTORE ERROR:PRINT "  inner saw ";ERR;", passing it on":ERROR ERR,REPORT$
  300 DIM a(3):a(7)=1
  310 ENDPROC
