   10 REM > Sieve
   20 REM Sieve of Eratosthenes benchmark
   30 size%=8190
   40 DIM flags%(size%)
   50 T%=TIME
   60 FOR iter%=1 TO 10
   70   count%=0
   80   flags%()=1
   90   FOR i%=0 TO size%
  100     IF flags%(i%) THEN prime%=i%+i%+3:k%=i%+prime%:WHILE k%<=size%:flags%(k%)=0:k%+=prime%:ENDWHILE:count%+=1
  110   NEXT
  120 NEXT
  130 PRINT count%;" primes"
  140 PRINT "Time: ";(TIME-T%)/100;" seconds"
  150 END
