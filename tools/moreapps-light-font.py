# Builds the Letters Light faces for !Letters (run by
# tools/moreapps-light-font.mjs, which makes a venv with fontTools; run it
# with python -I). Each face is Lato Light (or Light Italic) with every
# glyph of the character set below given Calibri Light's advance for the
# same character (taken from Word's calibril.ttf / calibrili.ttf; only
# widths are used, never outlines). Most glyphs are scaled horizontally
# about their origin by Calibri / Lato advance. A glyph that would be
# stretched by more than WIDEN keeps its shape and is centred in the new
# advance; a non-letter that would be squeezed below SHRINK is scaled down
# in both directions about its ink centre (letters stay width-scaled so
# the colour of text stays even). Kerning (GPOS kern, kern table), the
# ligature features (liga, dlig, calt: fi and fl would get widths Word
# does not use) and TrueType hinting are dropped rather than scaled; the
# vertical metrics are Carlito Regular's,
# scaled to Lato's units-per-em, so lines are as tall as Calibri's. The
# family is renamed "Letters Light" (Lato is an OFL Reserved Font Name).
# Glyphs outside the set are kept unscaled.
#   Usage: python -I moreapps-light-font.py LATO_LIGHT LATO_LIGHT_ITALIC
#            CALIBRIL CALIBRILI CARLITO_REGULAR OUT_DIR WIDTHS_JSON
import json
import sys
import unicodedata

from fontTools.misc.timeTools import timestampFromString
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

# The character set: ASCII, Latin-1, Latin Extended-A, the rest of
# Windows-1252 and the minus sign (hex, ranges inclusive; one line, which
# tests/moreapps/lightfont.test.mjs reads). A character either font lacks
# is left out, listed in the output and in the JSON's "missing".
SET = '0020-007E 00A0-017F 0192 02C6 02DC 2013 2014 2018-201A 201C-201E 2020-2022 2026 2030 2039 203A 20AC 2122 2212'
CHARS = [c for r in SET.split() for a, _, b in [r.partition('-')]
         for c in range(int(a, 16), int(b or a, 16) + 1)]
STAMP = timestampFromString('Fri Nov  6 00:00:00 2026')
NOTE = 'Modified by the !Letters project: glyph widths changed; renamed.'
WIDEN, SHRINK = 1.3, 0.8
DROP = {'kern', 'liga', 'dlig', 'calt'}


def calibri_advances(path):
    f = TTFont(path, lazy=True)
    cmap, hmtx, upem = f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
    return {c: hmtx[cmap[c]][0] / upem for c in CHARS if c in cmap}


def strip(font):
    # Drop hinting, kerning and ligatures; keep every glyph and the rest.
    o = Options()
    o.hinting = False
    o.legacy_kern = False
    o.glyph_names = True
    o.notdef_outline = True
    o.name_IDs = ['*']
    o.name_languages = ['*']
    o.prune_unicode_ranges = False
    o.layout_features = sorted(
        {r.FeatureTag for t in ('GSUB', 'GPOS') if t in font
         for r in font[t].table.FeatureList.FeatureRecord} - DROP)
    s = Subsetter(o)
    s.populate(glyphs=font.getGlyphOrder())
    s.subset(font)


def build(src, calibri, carlito, style, out):
    font = TTFont(src, recalcTimestamp=False)
    strip(font)
    upem = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    glyf, hmtx = font['glyf'], font['hmtx']
    gs = font.getGlyphSet()
    missing = [c for c in CHARS if c not in calibri or c not in cmap]

    # Target advance per glyph; a glyph two characters share with different
    # Calibri widths is copied so each character gets its own.
    order = font.getGlyphOrder()
    target, char = {}, {}
    for c in CHARS:
        if c in missing:
            continue
        g, adv = cmap[c], round(calibri[c] * upem)
        if g in target and target[g] != adv:
            g2 = '%s.u%04X' % (g, c)
            if g2 not in target:
                order.append(g2)
                glyf.glyphs[g2] = glyf[cmap[c]]
                hmtx.metrics[g2] = hmtx.metrics[cmap[c]]
            for t in font['cmap'].tables:
                if t.isUnicode() and c in t.cmap:
                    t.cmap[c] = g2
            g = g2
        target[g] = adv
        char.setdefault(g, c)
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    gs = font.getGlyphSet()

    def uses(name):
        gl = glyf[name]
        if not gl.isComposite():
            return set()
        out = set()
        for comp in gl.components:
            out |= {comp.glyphName} | uses(comp.glyphName)
        return out

    # Composites outside the set that use a changed glyph are decomposed
    # (unscaled) so they keep their shape.
    # Composites outside the set that use a changed glyph are decomposed;
    # one built on a width-scaled letter is scaled with it (so a rarer
    # accented letter is as wide as its base), others keep their shape.
    redo = {}
    for g, adv in target.items():
        redo[g] = adv / hmtx[g][0] if hmtx[g][0] else 1.0

    def base(name):
        while glyf[name].isComposite():
            name = glyf[name].components[0].glyphName
            if name in target:
                return name
        return None

    def kept(g):   # a set glyph drawn width-scaled
        sx = redo[g]
        letter = unicodedata.category(chr(char[g])).startswith('L')
        return sx <= WIDEN and (sx >= SHRINK or letter)

    extra = {}
    for g in order:
        if g not in target and target.keys() & uses(g):
            b = base(g)
            redo[g] = redo[b] if b and kept(b) else 1.0
            extra[g] = round(hmtx[g][0] * redo[g])
    pens = {}
    for g in redo:
        rec = DecomposingRecordingPen(gs)
        gs[g].draw(rec)
        pens[g] = rec
    report = []
    for g, sx in sorted(redo.items()):
        bp = BoundsPen(None)
        pens[g].replay(bp)
        how, m = 'width', (sx, 0, 0, 1, 0, 0)
        if bp.bounds and g in target:
            x0, y0, x1, y1 = bp.bounds
            letter = unicodedata.category(chr(char[g])).startswith('L')
            if sx > WIDEN:
                how = 'centred'
                m = (1, 0, 0, 1, (target[g] - (x1 - x0)) / 2 - x0, 0)
            elif sx < SHRINK and not letter:
                how = 'shrunk'
                m = (sx, 0, 0, sx, 0, (y0 + y1) / 2 * (1 - sx))
        if g in target and (how != 'width' or not 0.85 <= sx <= 1.15):
            report.append((char[g], sx, how))
        pen = TTGlyphPen(None)
        pens[g].replay(TransformPen(pen, m))
        new = pen.glyph()
        new.recalcBounds(glyf)
        glyf[g] = new
        adv = target[g] if g in target else extra[g]
        hmtx[g] = (adv, new.xMin if new.numberOfContours else 0)

    # Vertical metrics: Carlito Regular's, scaled to this em.
    k = upem / carlito['head'].unitsPerEm
    hh, os2, ch, co = font['hhea'], font['OS/2'], carlito['hhea'], carlito['OS/2']
    hh.ascent, hh.descent, hh.lineGap = (round(ch.ascent * k),
        round(ch.descent * k), round(ch.lineGap * k))
    os2.sTypoAscender = round(co.sTypoAscender * k)
    os2.sTypoDescender = round(co.sTypoDescender * k)
    os2.sTypoLineGap = round(co.sTypoLineGap * k)
    os2.usWinAscent = round(co.usWinAscent * k)
    os2.usWinDescent = round(co.usWinDescent * k)
    italic = style == 'Italic'
    # bit 0 italic, bit 6 regular, bit 7 (use typo metrics) as in Carlito
    os2.fsSelection = ((os2.fsSelection & ~0xE1) | (co.fsSelection & 0x80) |
                       (0x01 if italic else 0x40))
    font['head'].macStyle = 0x02 if italic else 0
    os2.recalcAvgCharWidth(font)
    font['head'].created = font['head'].modified = STAMP

    # Names: no Lato family, version or trademark strings left.
    nt = font['name']
    copyright = nt.getDebugName(0).strip()
    version = nt.getDebugName(5).split(';')[0].strip()
    licurl = nt.getDebugName(14)
    nt.names = []
    for i, s in ((0, copyright + ' ' + NOTE), (1, 'Letters Light'),
                 (2, style), (4, 'Letters Light' +
                             (' Italic' if italic else '')),
                 (5, version), (6, 'LettersLight-' + style),
                 (13, copyright + ' ' + NOTE),
                 (14, licurl)):
        nt.setName(s, i, 3, 1, 0x409)
    font.save(out, reorderTables=True)

    done = TTFont(out)
    dc, dh, du = done.getBestCmap(), done['hmtx'], done['head'].unitsPerEm
    widths = {}
    for c in CHARS:
        if c in missing:
            continue
        a = dh[dc[c]][0]
        if abs(a / du - calibri[c]) > 0.5 / du:
            raise SystemExit('U+%04X: advance %d is not Calibri Light %r'
                             % (c, a, calibri[c]))
        widths[str(c)] = a * 1000 / du
    print('LettersLight-%s: %d other composites follow their base' % (
        style, sum(1 for g in extra if redo[g] != 1.0)))
    return widths, missing, sorted(report)


def main(a):
    a = [x for x in a if x != '--report']
    lato_r, lato_i, cal_r, cal_i, carlito, out, wjson = a
    carlito = TTFont(carlito, lazy=True)
    result, gaps = {}, {}
    for key, style, src, cal in (('regular', 'Regular', lato_r, cal_r),
                                 ('italic', 'Italic', lato_i, cal_i)):
        w, missing, report = build(src, calibri_advances(cal), carlito, style,
                           '%s/LettersLight-%s' % (out, style))
        result[key] = w
        gaps[key] = missing
        if missing:
            print('%s: not in both Calibri Light and Lato, left out of the '
                  'set: %s' % (
                style, ' '.join('U+%04X' % c for c in missing)))
        print('LettersLight-%s: %d characters given Calibri Light widths'
              % (style, len(w)))
        for how, what in (('centred', 'centred, shape kept'),
                          ('shrunk', 'shrunk evenly')):
            print('  %s: %s' % (what, ' '.join(
                'U+%04X' % c for c, _, h in report if h == how) or 'none'))
        if '--report' in sys.argv:
            for c, sx, how in report:
                print('  | U+%04X | %s | %.3f | %s |' % (
                    c, chr(c) if c > 0x20 and c != 0xA0 and c != 0xAD
                    else '', sx, how))
    result['missing'] = gaps
    with open(wjson, 'w', encoding='ascii', newline='\n') as f:
        json.dump(result, f, indent=1, sort_keys=False)
        f.write('\n')


if __name__ == '__main__':
    main(sys.argv[1:])
