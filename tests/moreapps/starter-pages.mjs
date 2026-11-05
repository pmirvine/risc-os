// The page count range [min, max] of every starter, one table for the
// starters tests and the hand-off README (tests/moreapps/handoff-
// starters.mjs), so they cannot drift.
export const PAGES = {
  'business-letter': [1, 1], 'personal-letter': [1, 1],
  'cover-letter': [1, 1], memo: [1, 1], 'fax-cover': [1, 1],
  'cv-simple': [1, 1], 'cv-two-column': [1, 1],
  report: [4, 5], essay: [2, 3], proposal: [2, 3],
  invoice: [1, 1], agenda: [1, 1], minutes: [1, 2],
  'press-release': [1, 1], newsletter: [1, 2], flyer: [1, 1],
};
export const rangeText = ([a, b]) => a === b ? `${a} page` +
  (a === 1 ? '' : 's') : `${a}-${b} pages`;
