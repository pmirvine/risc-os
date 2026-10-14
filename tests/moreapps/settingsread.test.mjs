// !Letters SettingsRead (Batch D P1.2, ruling R7): the settings flags
// evenAndOddHeaders, gutterAtTop, mirrorMargins and updateFields
// (present and not w:val false / 0 / off) and the view (w:view w:val)
// of doc.rawSettings, cached per root object; SettingsEdit.withOnOff
// puts a flag in, in schema order, or takes it out, and gives back
// the same root when nothing changes.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import * as SR from '../../tools/moreapps/!Letters/SettingsRead';
import {withOnOff, ORDER, BEFORE}
  from '../../tools/moreapps/!Letters/SettingsEdit';
import {existsSync, readFileSync} from 'node:fs';
import {index, flatten, DEFAULT_XSD}
  from '../../tools/moreapps-xsdorder.mjs';
import {parseXml} from '../../tools/moreapps/!WimpLib/Xml';
import {W} from '../../tools/moreapps/!Letters/Ns';

const root = (inner, open = `<w:settings xmlns:w="${W}">`) =>
  parseXml(open + inner + '</' + open.slice(1, open.indexOf(' ')) +
    '>').root;
const doc = (inner) => ({rawSettings: root(inner)});
const names = (r) => r.children.filter((c) => typeof c === 'object')
  .map((c) => c.name);

describe('SettingsRead.onOffOf', () => {
  for (const name of SR.FLAGS) {
    it(name, () => {
      assert.equal(SR.onOffOf(doc(`<w:${name}/>`), name), true);
      assert.equal(SR.onOffOf(doc(`<w:${name} w:val="1"/>`), name), true);
      assert.equal(SR.onOffOf(doc(`<w:${name} w:val="true"/>`), name),
        true);
      for (const v of ['0', 'false', 'off']) {
        assert.equal(SR.onOffOf(doc(`<w:${name} w:val="${v}"/>`), name),
          false, v);
      }
      assert.equal(SR.onOffOf(doc('<w:zoom w:percent="100"/>'), name),
        false);
    });
  }

  it('no settings, another namespace, a name not a flag', () => {
    assert.equal(SR.onOffOf({rawSettings: null}, 'mirrorMargins'), false);
    assert.equal(SR.onOffOf(null, 'mirrorMargins'), false);
    assert.equal(SR.onOffOf({rawSettings: root('<x:mirrorMargins/>',
      `<w:settings xmlns:w="${W}" xmlns:x="urn:x">`)}, 'mirrorMargins'),
    false);
    assert.throws(() => SR.onOffOf(doc('<w:zoom/>'), 'zoom'), RangeError);
    assert.throws(() => SR.onOffOf(doc(''), '__proto__'), RangeError);
  });

  it('the first of two copies counts', () => {
    assert.equal(SR.onOffOf(doc('<w:gutterAtTop w:val="0"/>' +
      '<w:gutterAtTop/>'), 'gutterAtTop'), false);
  });
});

describe('SettingsRead.viewOf', () => {
  const view = (v) => SR.viewOf(doc(`<w:view w:val="${v}"/>`));
  it('each value', () => {
    assert.equal(view('print'), 'print');
    assert.equal(view('web'), 'web');
    assert.equal(view('outline'), 'outline');
    assert.equal(view('masterPages'), 'outline');
    assert.equal(view('normal'), 'draft');
    assert.equal(view('none'), null);
    assert.equal(view('reading'), null);
    assert.equal(view('__proto__'), null);
    assert.equal(SR.viewOf(doc('<w:zoom/>')), null);
    assert.equal(SR.viewOf(doc('<w:view/>')), null);
    assert.equal(SR.viewOf({rawSettings: null}), null);
  });
});

describe('SettingsRead cache', () => {
  it('one record per root object', () => {
    const r = root('<w:view w:val="web"/><w:mirrorMargins/>');
    const a = SR.settingsOf({rawSettings: r});
    assert.equal(SR.settingsOf({rawSettings: r}), a);
    assert.ok(Object.isFrozen(a));
    assert.equal(a.view, 'web');
    assert.equal(a.mirrorMargins, true);
    const b = SR.settingsOf({rawSettings: {...r}});
    assert.notEqual(b, a);
    assert.deepEqual(b, a);
    assert.equal(SR.settingsOf({rawSettings: null}),
      SR.settingsOf(null));
  });
});

describe('SettingsEdit.withOnOff', () => {
  const r = root('<w:zoom w:percent="100"/><w:mirrorMargins/>' +
    '<w:proofState w:spelling="clean"/><w:defaultTabStop w:val="720"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    '<w:compat/>');

  it('puts evenAndOddHeaders in schema order (after defaultTabStop)',
    () => {
      const s = withOnOff(r, 'evenAndOddHeaders', true);
      assert.notEqual(s, r);
      assert.deepEqual(names(s), ['w:zoom', 'w:mirrorMargins',
        'w:proofState', 'w:defaultTabStop', 'w:evenAndOddHeaders',
        'w:characterSpacingControl', 'w:compat']);
      const e = s.children.find((c) => c.name === 'w:evenAndOddHeaders');
      assert.deepEqual(e.attrs, []);
      assert.equal(SR.onOffOf({rawSettings: s}, 'evenAndOddHeaders'),
        true);
      // the other children are the very same objects
      for (const c of r.children) assert.ok(s.children.includes(c));
    });

  it('gutterAtTop after mirrorMargins; updateFields before compat',
    () => {
      assert.deepEqual(names(withOnOff(r, 'gutterAtTop', true)),
        ['w:zoom', 'w:mirrorMargins', 'w:gutterAtTop', 'w:proofState',
          'w:defaultTabStop', 'w:characterSpacingControl', 'w:compat']);
      assert.deepEqual(names(withOnOff(r, 'updateFields', true)),
        ['w:zoom', 'w:mirrorMargins', 'w:proofState',
          'w:defaultTabStop', 'w:characterSpacingControl',
          'w:updateFields', 'w:compat']);
      // nothing before it: first
      assert.deepEqual(names(withOnOff(root('<w:compat/>'),
        'mirrorMargins', true)), ['w:mirrorMargins', 'w:compat']);
    });

  it('takes it out; the same root when nothing changes', () => {
    const s = withOnOff(r, 'mirrorMargins', false);
    assert.deepEqual(names(s), ['w:zoom', 'w:proofState',
      'w:defaultTabStop', 'w:characterSpacingControl', 'w:compat']);
    assert.equal(withOnOff(r, 'mirrorMargins', true), r);
    assert.equal(withOnOff(r, 'evenAndOddHeaders', false), r);
    const t = withOnOff(withOnOff(r, 'evenAndOddHeaders', true),
      'evenAndOddHeaders', false);
    assert.deepEqual(t, r);
  });

  it('a flag written off is turned on in place, other attributes kept',
    () => {
      const x = root('<w:zoom/><w:mirrorMargins w:val="0" w:foo="1"/>' +
        '<w:compat/>');
      const s = withOnOff(x, 'mirrorMargins', true);
      assert.deepEqual(names(s), names(x));
      assert.deepEqual(s.children[1].attrs, [['w:foo', '1']]);
      assert.equal(SR.onOffOf({rawSettings: s}, 'mirrorMargins'), true);
      // off takes every copy out
      const y = root('<w:mirrorMargins/><w:mirrorMargins/>');
      assert.deepEqual(names(withOnOff(y, 'mirrorMargins', false)), []);
    });

  it('another prefix for WordprocessingML; refusals', () => {
    const x = root('<v:zoom/>', `<v:settings xmlns:v="${W}">`);
    assert.deepEqual(names(withOnOff(x, 'mirrorMargins', true)),
      ['v:zoom', 'v:mirrorMargins']);
    assert.throws(() => withOnOff(r, 'zoom', true), RangeError);
    assert.throws(() => withOnOff(r, '__proto__', true), RangeError);
    assert.throws(() => withOnOff(null, 'mirrorMargins', true),
      RangeError);
    assert.throws(() => withOnOff(r, 'mirrorMargins', 1), RangeError);
  });

  it('ORDER is the CT_Settings sequence up to updateFields (wml.xsd)',
    {skip: existsSync(DEFAULT_XSD) ? false : 'wml.xsd not cached'},
    () => {
      const defs = index(readFileSync(DEFAULT_XSD, 'utf8'));
      const seq = flatten(defs, defs.get('complexType:CT_Settings'));
      assert.deepEqual([...ORDER], seq.slice(0,
        seq.indexOf('updateFields') + 1));
      assert.deepEqual([...BEFORE], seq.slice(0,
        seq.indexOf('defaultTabStop')));
    });
});
