   10 REM > Sieve
   20 REM The Sieve of Eratosthenes benchmark, as printed in
   30 REM BYTE magazine in 1981: counts the 1899 primes below
   40 REM 16384, ten times over, and reports the time taken.
   50 MODE 12
   60 PRINT "Sieve of Eratosthenes - 10 iterations"
   70 size%=8190
   80 DIM flags%(size%)
   90 T%=TIME
  100 FOR iter%=1 TO 10
  110   count%=0
  120   flags%()=1
  130   FOR i%=0 TO size%
  140     IF flags%(i%) THEN prime%=i%+i%+3:k%=i%+prime%:WHILE k%<=size%:flags%(k%)=0:k%+=prime%:ENDWHILE:count%+=1
  150   NEXT
  160 NEXT
  170 PRINT count%;" primes"
  180 PRINT "Time: ";(TIME-T%)/100;" seconds"
  190 END
