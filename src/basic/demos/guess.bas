   10 REM > Guess
   20 REM Guess the number: the classic first program.
   30 REM Type a number and press Return; Escape gives up.
   40 MODE 12
   50 ON ERROR IF ERR=17 THEN PRINT '"It was ";n%;".":END ELSE REPORT:PRINT " at line ";ERL:END
   60 n%=RND(100):tries%=0
   70 PRINT "I'm thinking of a number between 1 and 100."
   80 REPEAT
   90   INPUT "Your guess",g%
  100   tries%+=1
  110   IF g%<n% PRINT "Too low!"
  120   IF g%>n% PRINT "Too high!"
  130 UNTIL g%=n%
  140 PRINT "Correct! You took ";tries%;" tries."
  150 END
