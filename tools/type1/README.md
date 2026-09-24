# Sample Type 1 font for !T1ToFont

`cmr10.pfb` and `cmr10.afm` are Computer Modern Roman 10pt from the AMS Type 1 versions of the Computer Modern
fonts (CTAN `fonts/amsfonts/pfb/cmr10.pfb` and `fonts/amsfonts/afm/cmr10.afm`), unmodified.
Copyright (c) 1997, 2009 American Mathematical Society (<http://www.ams.org>), with Reserved Font Name CMR10.
They are licensed under the SIL Open Font License 1.1: see `OFL.txt` (CTAN `fonts/amsfonts/doc/OFL.txt`).

`node tools/disc-type1.mjs` copies them to the seed disc as `$.Utilities.Type1Fonts` (`cmr10/pfb`, `cmr10/afm`,
`OFL`, `ReadMe`) so there is something to convert with `$.Utilities.!T1ToFont`. A converted copy is a Modified
Version under the OFL: if you redistribute one, give it a name other than the Reserved Font Name "CMR10".
