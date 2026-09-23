   10 REM > Guess
   20 REM Guess the number
   30 n%=RND(100):tries%=0
   40 PRINT "I'm thinking of a number between 1 and 100."
   50 REPEAT
   60   INPUT "Your guess",g%
   70   tries%+=1
   80   IF g%<n% PRINT "Too low!"
   90   IF g%>n% PRINT "Too high!"
  100 UNTIL g%=n%
  110 PRINT "Correct! You took ";tries%;" tries."
  120 END
