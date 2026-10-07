// Test-only helpers for the !Word list editing tests (FormatList,
// ParaInd, EditList): Documents with a numbering definition.
import {mk} from './edit-docs.mjs';
import {addStyle} from '../../tools/moreapps/!Word/Styles';

/**
 * Level ilvl: decimal, lvlText '%1.' / '%1.%2.' / ..., indent left
 * 720 per level (720, 1440, 2160), hanging 360.
 */
export const lv = (ilvl, o = {}) => ({ilvl, numFmt: 'decimal',
  lvlText: Array.from({length: ilvl + 1}, (_, j) => `%${j + 1}.`)
    .join(''), start: 1,
  pPr: {ind: {left: 720 * (ilvl + 1), hanging: 360}}, ...o});
export const N = (levels, abstractNumId = 1) => ({abstractNumId,
  levels, overrides: new Map()});
/** numId 1: three levels (0..2) defined. */
export const NUMS = () => new Map([[1, N([lv(0), lv(1), lv(2)])]]);

/**
 * A Document (edit-docs mk) with numbering `nums` and a paragraph
 * style 'ListHead' whose pPr gives numId 1 (style numbering).
 */
export function listDoc(blocks, nums = NUMS()) {
  const d = mk(blocks);
  d.doc.numbering = {raw: null, nums};
  addStyle(d.doc.styles, {id: 'ListHead', type: 'paragraph',
    name: 'List Head', pPr: {numPr: {numId: 1}, extra: []}});
  addStyle(d.doc.styles, {id: 'Indented', type: 'paragraph',
    name: 'Indented', pPr: {ind: {left: 2880}, extra: []}});
  return d;
}

/** A list paragraph of numId 1 at ilvl k (mk's [text, opts]). */
export const li = (text, k = 0, o = {}) => [text, {...o,
  pPr: {...(o.pPr || {}), numPr: {numId: 1, ilvl: k}}}];
