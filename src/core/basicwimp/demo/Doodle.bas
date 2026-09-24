REM >!RunImage
REM !Doodle - a small Wimp application in BBC BASIC V
REM (seed disc example for the BASIC Wimp bridge: docs/BASIC_WIMP.md)
REM SELECT in the window drops a blob, ADJUST changes the colour,
REM MENU gives Info / Clear / Quit, "C" clears.
ON ERROR ON ERROR OFF: PROCerror(REPORT$+" (line "+STR$ERL+")"): END
DIM b% 1024, win% 512, menu% 256, ind% 128
maxblobs%=200: DIM bx%(maxblobs%), by%(maxblobs%), bc%(maxblobs%), br%(maxblobs%)
nblobs%=0: colour%=11: quit%=FALSE: mx%=0: my%=0
SYS "Wimp_Initialise",200,&4B534154,"Doodle" TO ver%,task%
ON ERROR PROCerror(REPORT$+" (line "+STR$ERL+")")
PROCiconbar
PROCcreate_window
PROCcreate_menu
REPEAT
  SYS "Wimp_Poll",1,b% TO reason%
  CASE reason% OF
    WHEN 1: PROCredraw(!b%)
    WHEN 2: SYS "Wimp_OpenWindow",,b%
    WHEN 3: SYS "Wimp_CloseWindow",,b%
    WHEN 6: PROCclick(!b%,b%!4,b%!8,b%!12,b%!16)
    WHEN 8: PROCkey(b%!24)
    WHEN 9: PROCmenu_select(!b%)
    WHEN 17,18: IF b%!16=0 THEN quit%=TRUE
  ENDCASE
UNTIL quit%
SYS "Wimp_CloseDown",task%,&4B534154
END
:
DEF PROCiconbar
!b%=-1: b%!4=0: b%!8=0: b%!12=68: b%!16=68
b%!20=&3002: $(b%+24)="!doodle"
SYS "Wimp_CreateIcon",0,b% TO ibar%
ENDPROC
:
DEF PROCcreate_window
win%!0=240: win%!4=420: win%!8=1100: win%!12=1000
win%!16=0: win%!20=0: win%!24=-1
win%!28=&FF000002
win%?32=7: win%?33=2: win%?34=7: win%?35=0: win%?36=3: win%?37=1: win%?38=12: win%?39=0
win%!40=0: win%!44=-1200: win%!48=1600: win%!52=0
win%!56=&119
win%!60=10<<12
win%!64=1: win%!68=0
win%!72=ind%: win%!76=-1: win%!80=64
win%!84=0
PROCtitle
SYS "Wimp_CreateWindow",,win% TO whandle%
ENDPROC
:
DEF PROCtitle
$ind%="Doodle - colour "+STR$colour%
ENDPROC
:
DEF PROCcreate_menu
$menu%="Doodle": menu%?12=7: menu%?13=2: menu%?14=7: menu%?15=0
menu%!16=160: menu%!20=44: menu%!24=0
PROCitem(0,0,"Info"): PROCitem(1,0,"Clear"): PROCitem(2,&80,"Quit")
ENDPROC
:
DEF PROCitem(n%,f%,t$)
LOCAL p%: p%=menu%+28+n%*24
!p%=f%: p%!4=-1: p%!8=&07000021: $(p%+12)=t$
ENDPROC
:
DEF PROCshow_menu(x%,y%)
mx%=x%: my%=y%
SYS "Wimp_CreateMenu",,menu%,x%,y%
ENDPROC
:
DEF PROCopen_window
!b%=whandle%: SYS "Wimp_GetWindowState",,b%
b%!28=-1: SYS "Wimp_OpenWindow",,b%
SYS "Wimp_SetCaretPosition",whandle%,-1,0,0,1<<25,-1
ENDPROC
:
DEF PROCredraw(h%)
LOCAL more%,ox%,oy%
!b%=h%
SYS "Wimp_RedrawWindow",,b% TO more%
ox%=b%!4-b%!20: oy%=b%!16-b%!24
WHILE more%
  PROCdraw(ox%,oy%)
  SYS "Wimp_GetRectangle",,b% TO more%
ENDWHILE
ENDPROC
:
DEF PROCdraw(ox%,oy%)
LOCAL i%,c%
SYS "Wimp_SetColour",7
MOVE ox%+32,oy%-24: PRINT "BBC BASIC V in the desktop"
SYS "Wimp_SetColour",4
MOVE ox%+32,oy%-60: PRINT "SELECT: blob  ADJUST: colour  MENU: menu"
FOR c%=0 TO 15
  SYS "Wimp_SetColour",c%
  RECTANGLE FILL ox%+32+c%*44,oy%-140,40,40
  SYS "Wimp_SetColour",7
  RECTANGLE ox%+32+c%*44,oy%-140,40,40
NEXT
SYS "Wimp_SetColour",colour%
RECTANGLE FILL ox%+32+colour%*44+8,oy%-160,24,12
FOR i%=1 TO nblobs%
  SYS "Wimp_SetColour",bc%(i%)
  CIRCLE FILL ox%+bx%(i%),oy%+by%(i%),br%(i%)
  SYS "Wimp_SetColour",7
  CIRCLE ox%+bx%(i%),oy%+by%(i%),br%(i%)
NEXT
ENDPROC
:
DEF PROCclick(x%,y%,but%,w%,i%)
IF w%=-2 THEN
  IF but%=2 THEN PROCshow_menu(x%-64,96+44*3) ELSE PROCopen_window
  ENDPROC
ENDIF
IF w%<>whandle% THEN ENDPROC
IF but%=2 THEN PROCshow_menu(x%-64,y%): ENDPROC
IF but%=&400 OR but%=4 THEN PROCadd_blob(x%,y%)
IF but%=&100 OR but%=1 THEN PROCset_colour((colour%+1) MOD 16)
ENDPROC
:
DEF PROCset_colour(c%)
colour%=c%: PROCtitle
SYS "Wimp_ForceRedraw",whandle%,0,-170,1600,-120
ENDPROC
:
DEF PROCadd_blob(x%,y%)
LOCAL n%
IF nblobs%>=maxblobs% THEN VDU 7: ENDPROC
!b%=whandle%: SYS "Wimp_GetWindowState",,b%
nblobs%+=1: n%=nblobs%
bx%(n%)=x%-(b%!4-b%!20): by%(n%)=y%-(b%!16-b%!24)
bc%(n%)=colour%: br%(n%)=16+RND(40)
SYS "Wimp_ForceRedraw",whandle%,bx%(n%)-64,by%(n%)-64,bx%(n%)+64,by%(n%)+64
ENDPROC
:
DEF PROCclear
nblobs%=0
SYS "Wimp_ForceRedraw",whandle%,0,-1200,1600,0
ENDPROC
:
DEF PROCkey(k%)
IF k%=ASC"c" OR k%=ASC"C" THEN PROCclear: ENDPROC
SYS "Wimp_ProcessKey",k%
ENDPROC
:
DEF PROCmenu_select(sel%)
CASE sel% OF
  WHEN 0: PROCinfo
  WHEN 1: PROCclear
  WHEN 2: quit%=TRUE
ENDCASE
SYS "Wimp_GetPointerInfo",,b%
IF b%!8=1 AND NOT quit% THEN SYS "Wimp_CreateMenu",,menu%,mx%,my%
ENDPROC
:
DEF PROCinfo
!b%=0: $(b%+4)="Doodle 1.00 - a Wimp application written in BBC BASIC V"+CHR$0
SYS "Wimp_ReportError",b%,1,"Doodle"
ENDPROC
:
DEF PROCerror(e$)
!b%=ERR: $(b%+4)=e$+CHR$0
SYS "Wimp_ReportError",b%,1,"Doodle"
ENDPROC
