// The Wimp 16-colour palette (RISC OS 3.71 default, from Wimp/s/!Palette).
export const WIMP_COLOURS = [
  '#ffffff', '#dddddd', '#bbbbbb', '#999999', '#777777', '#555555', '#333333', '#000000',
  '#004499', '#eeee00', '#00cc00', '#dd0000', '#eeeebb', '#558800', '#ffbb00', '#00bbff',
];
export const WIMP_NAMES = ['white', 'grey 1', 'grey 2', 'grey 3', 'grey 4', 'grey 5', 'grey 6', 'black',
  'dark blue', 'yellow', 'light green', 'red', 'cream', 'dark green', 'orange', 'light blue'];

/** CSS colour for a Wimp colour number (0-15); 255/undefined -> 'transparent'. */
export function wimpColour(n) {
  if (n == null || n === 255 || n < 0) return 'transparent';
  return WIMP_COLOURS[n & 15];
}
