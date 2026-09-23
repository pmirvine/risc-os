// Desktop font handling. RISC OS 3.71 default desktop font is Homerton.Medium 12pt
// (converted to assets/fonts/Homerton-Medium.otf). At 1 px = 2 OS units, 12pt = 30 OS = 15 px.
// The alternative is the 8x8 system font (Wimp icons then use 16x32 OS unit characters = 8x16 px).

export const fonts = {
  family: '"Homerton", Helvetica, Arial, sans-serif',
  size: 15,
  system: false,          // true => use the system font
  weight: '', style: '',  // desktop font weight/style ('700', 'italic') when not Homerton.Medium
  get css() {
    return this.system ? `16px "RISCOS System Fixed", "RISCOS System", monospace` : `${this.style ? this.style + ' ' : ''}${this.weight ? this.weight + ' ' : ''}${this.size}px ${this.family}`;
  },
  /** CSS font for a RISC OS font name + point size (e.g. 'Homerton.Medium', 24). */
  cssFor(name = 'Homerton.Medium', pt = 12) {
    const [fam, ...rest] = String(name).split('.');
    const style = rest.join('.').toLowerCase();
    const weight = /bold/.test(style) ? 700 : 400;
    const italic = /italic|oblique/.test(style) ? 'italic ' : '';
    const px = (pt * 180 / 72) / 2;
    const map = { homerton: 'Homerton', trinity: 'Trinity', corpus: 'Corpus', newhall: 'NewHall', sassoon: 'Sassoon', selwyn: 'Selwyn', sidney: 'Sidney', system: 'RISCOS System' };
    const f = map[fam.toLowerCase()] ?? fam;
    const fb = /trinity|newhall/i.test(f) ? 'Times, serif' : /corpus/i.test(f) ? 'Courier, monospace' : 'Helvetica, Arial, sans-serif';
    return `${italic}${weight} ${px}px "${f}", ${fb}`;
  },
};

let ctx;
/** Width in CSS px of a string in the desktop font (or a given CSS font). */
export function textWidth(str, font = fonts.css) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  return ctx.measureText(str).width;
}

/** Wait for the desktop font files to be ready (best effort). */
export async function loadDesktopFonts() {
  try {
    await Promise.all([
      document.fonts.load(`${fonts.size}px "Homerton"`),
      document.fonts.load(`700 ${fonts.size}px "Homerton"`),
      document.fonts.load(`16px "RISCOS System"`),
    ]);
  } catch { /* ignore */ }
}
