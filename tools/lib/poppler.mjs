// Where poppler's command line tools are, for tools/pdf-check.mjs
// and the PDF export tests (one rule, so the two agree on whether
// the tools are there).
//
//   popplerDir(env = process.env) -> the directory holding both
//       pdfinfo and pdftotext, or null: PDF_CHECK_BIN when set
//       (only it is looked in), else the first of /opt/homebrew/bin,
//       /usr/local/bin and /usr/bin that has both
//   popplerTool(name, env) -> that directory's tool (pdftotext,
//       pdfinfo, pdftohtml...) when it is there, else null
import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];

export function popplerDir(env = process.env) {
  const dirs = env.PDF_CHECK_BIN ? [env.PDF_CHECK_BIN] : DIRS;
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, 'pdfinfo')) &&
      fs.existsSync(path.join(d, 'pdftotext'))) return d;
  }
  return null;
}

export function popplerTool(name, env = process.env) {
  const d = popplerDir(env);
  const f = d && path.join(d, name);
  return f && fs.existsSync(f) ? f : null;
}
