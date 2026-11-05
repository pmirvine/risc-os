// ThemeWrite: set a theme's fonts and colour scheme, keep the rest.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setFonts, setColors}
  from '../../tools/moreapps/!Letters/ThemeWrite';
import {parse} from '../../tools/moreapps/!Letters/ThemeRead';
import {themeBytes, THEME_XML}
  from '../../tools/moreapps/!Letters/ThemeDefault';
import {COLOR_SCHEMES, FONT_PAIRS}
  from '../../tools/moreapps/!Letters/ThemePresets';
import {readDocx} from '../../tools/moreapps/!Letters/DocxRead';

const text = (b) => new TextDecoder().decode(b);
const enc = (s) => new TextEncoder().encode(s);
const obj = Object.fromEntries;
const refused = (r) => r && !(r instanceof Uint8Array) &&
  typeof r.refused === 'string';
const slice = (s, tag) => {
  const i = s.indexOf('<a:' + tag);
  return s.slice(i, s.indexOf('</a:' + tag + '>') + tag.length + 5);
};

describe('ThemeWrite', () => {
  it('sets every colour scheme', () => {
    for (const p of COLOR_SCHEMES) {
      const out = setColors(themeBytes(), p);
      assert.ok(out instanceof Uint8Array, p.name);
      assert.deepEqual(obj(parse(out).colors), p.slots, p.name);
      assert.match(text(out), new RegExp('<a:clrScheme name="' +
        p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    }
  });
  it('sets every font pair', () => {
    for (const f of FONT_PAIRS) {
      const t = parse(setFonts(themeBytes(),
        {major: f.major, minor: f.minor}));
      assert.equal(t.major, f.major);
      assert.equal(t.minor, f.minor);
    }
  });
  it('keeps everything else byte for byte', () => {
    const extra = '<a:extLst><a:ext uri="x"><q:z xmlns:q="urn:q"/>' +
      '</a:ext></a:extLst>';
    const src = enc(THEME_XML.replace('</a:themeElements>',
      extra + '</a:themeElements>'));
    const out = text(setFonts(setColors(src, COLOR_SCHEMES[3]),
      {major: 'Arial', minor: 'Verdana'}));
    for (const tag of ['fmtScheme', 'extLst']) {
      assert.equal(slice(out, tag), slice(text(src), tag));
    }
    for (const bit of ['<a:ea typeface=""/>', '<a:cs typeface=""/>',
      '<a:font script="Thai" typeface="Angsana New"/>']) {
      assert.ok(out.includes(bit), bit);
    }
    assert.ok(!out.includes('panose='));
    assert.match(out, /<a:latin typeface="Arial"\/>/);
  });
  it('writes sysClr for dk1/lt1 only when the scheme says so', () => {
    const office = COLOR_SCHEMES.find((c) => c.sys.length);
    const o = text(setColors(themeBytes(), office));
    assert.match(o, /<a:dk1><a:sysClr val="windowText" lastClr="[0-9A-F]{6}"\/><\/a:dk1>/);
    assert.match(o, /<a:lt1><a:sysClr val="window" lastClr="[0-9A-F]{6}"\/><\/a:lt1>/);
    const part = COLOR_SCHEMES.find((c) => c.name === 'Marquee');
    const q = text(setColors(themeBytes(), part));
    assert.match(q, /<a:dk1><a:srgbClr val="[0-9A-F]{6}"\/><\/a:dk1>/);
    assert.match(q, /<a:lt1><a:sysClr val="window"/);
    const none = text(setColors(themeBytes(), {...part, sys: []}));
    assert.ok(!none.includes('sysClr'));
  });
  it('is idempotent', () => {
    const p = COLOR_SCHEMES[5], f = FONT_PAIRS[7];
    const a = setColors(themeBytes(), p);
    assert.deepEqual(setColors(a, p), a);
    const b = setFonts(a, f);
    assert.deepEqual(setFonts(b, f), b);
  });
  it('refuses bad input without throwing', () => {
    const p = COLOR_SCHEMES[0], ok = {major: 'A', minor: 'B'};
    const cases = [null, new Uint8Array(0), enc('not xml <'),
      enc('<a:x xmlns:a="u"/>'),
      enc('<a:theme xmlns:a="u"/>'),
      enc('<a:theme xmlns:a="u"><a:themeElements/></a:theme>'),
      enc(THEME_XML.replace(/<a:clrScheme.*<\/a:clrScheme>/s, '')),
      enc(THEME_XML.replace(/<a:fontScheme.*<\/a:fontScheme>/s, '')),
      enc(THEME_XML.replace('</a:clrScheme>', '</a:clrScheme>' +
        '<a:clrScheme name="2"/>')),
      enc('<!DOCTYPE a [<!ENTITY e "x">]>' + THEME_XML),
      new Uint8Array((1 << 20) + 1).fill(32)];
    for (const c of cases) {
      assert.ok(c === cases[6] || c === cases[8] ||
        refused(setFonts(c, ok)), 'fonts');
      assert.ok(c === cases[7] || refused(setColors(c, p)), 'colors');
    }
    assert.ok(refused(setFonts(cases[7], ok)));
    assert.ok(refused(setColors(cases[6], p)));
    assert.ok(refused(setColors(cases[8], p)));
    for (const bad of ['', 'a<b', 'x'.repeat(65), 5, undefined]) {
      assert.ok(refused(setFonts(themeBytes(),
        {major: bad, minor: 'B'})), String(bad));
      assert.ok(refused(setFonts(themeBytes(),
        {major: 'A', minor: bad})));
    }
    assert.ok(refused(setFonts(themeBytes(), null)));
    for (const v of ['12345', 'GGGGGG', '#123456', '', null]) {
      const slots = {...p.slots, accent3: v};
      assert.ok(refused(setColors(themeBytes(), {...p, slots})));
    }
    assert.ok(refused(setColors(themeBytes(), {...p, name: 'a<b'})));
  });
  it('round-trips a Word-made theme, changing only the target', async (t) => {
    const f = new URL('./corpus/handoff/st-6-themefont.docx',
      import.meta.url);
    if (!fs.existsSync(f)) return t.skip('no corpus');
    const doc = await readDocx(new Uint8Array(fs.readFileSync(f)));
    const part = doc.parts.get('word/theme/theme1.xml');
    if (!part) return t.skip('no theme in corpus file');
    const src = text(part).replace(/^﻿/, '');
    const same = text(setColors(part, {name: 'Same',
      slots: obj(parse(part).colors), sys: ['dk1', 'lt1']}));
    const strip = (s) => s.replace(/<a:clrScheme.*?<\/a:clrScheme>/s, '')
      .replace(/^<\?xml[^>]*\?>\s*/, '');
    assert.equal(strip(same), strip(src));
    const fnt = text(setFonts(part, {major: 'Arial', minor: 'Arial'}));
    const flat = (x) => strip(x).replace(/<a:latin[^>]*>/g, '');
    assert.equal(flat(fnt), flat(src));
  });
});
