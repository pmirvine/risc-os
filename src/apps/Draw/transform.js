// Object transformations for Draw (translate, scale, rotate, make rotatable), following
// c.DrawTrans: scaling keeps each object's top-left fixed (its own origin), rotation is about
// each object's bbox centre; groups transform their members about the group's origin/centre.

import { PATH, OBJ, spriteOSSize, boundObject } from './drawfile.js';

const pts = (e) => (e.t === PATH.CURVE ? [['x1', 'y1'], ['x2', 'y2'], ['x', 'y']] : (e.t === PATH.MOVE || e.t === PATH.LINE) ? [['x', 'y']] : []);

// ------------------------------------------------------------------------------ translate
export function translateObject(o, dx, dy) {
  dx = Math.round(dx); dy = Math.round(dy);
  const tb = (b) => { if (b) { b.x0 += dx; b.x1 += dx; b.y0 += dy; b.y1 += dy; } };
  tb(o.bbox);
  switch (o.type) {
    case 'path': for (const e of o.elements) for (const [a, b] of pts(e)) { e[a] += dx; e[b] += dy; } break;
    case 'text': case 'trfmtext': o.x += dx; o.y += dy; break;
    case 'trfmsprite': case 'jpeg': o.matrix[4] += dx; o.matrix[5] += dy; break;
    case 'group': for (const c of o.objects) translateObject(c, dx, dy); break;
    case 'tagged': if (o.object) translateObject(o.object, dx, dy); break;
    case 'textarea': for (const c of o.columns) tb(c.bbox); break;
    default: break;
  }
}

// ------------------------------------------------------------------------------ scale
/** Scale an object by (sx, sy) about org {x,y} (default: its own top-left). flags: {body=true, lines=false} */
export function scaleObject(o, sx, sy, org, flags = {}, fonts) {
  const body = flags.body !== false, lines = !!flags.lines;
  org ??= { x: o.bbox.x0, y: o.bbox.y1 };
  const S = (x, ox, s) => Math.round(ox + (x - ox) * s);
  const sp = (p) => [S(p[0], org.x, sx), S(p[1], org.y, sy)];
  switch (o.type) {
    case 'path':
      if (body) for (const e of o.elements) for (const [a, b] of pts(e)) { e[a] = S(e[a], org.x, sx); e[b] = S(e[b], org.y, sy); }
      if (lines) {
        const f = body ? Math.max(Math.abs(sx), Math.abs(sy)) : Math.abs(sx);
        o.width = Math.round(o.width * f);
        if (o.dash && body) { o.dash.elements = o.dash.elements.map((d) => Math.max(1, Math.round(d * f))); o.dash.offset = Math.round(o.dash.offset * f); }
      }
      break;
    case 'text':
      if (!body) break;
      if (sx < 0) o.x -= o.bbox.x1 + o.bbox.x0 - 2 * org.x;
      if (sy < 0) o.y -= o.bbox.y1 + o.bbox.y0 - 2 * org.y;
      o.xsize = Math.max(1, Math.round(o.xsize * Math.abs(sx)));
      o.ysize = Math.max(1, Math.round(o.ysize * Math.abs(sy)));
      o.x = S(o.x, org.x, Math.abs(sx)); o.y = S(o.y, org.y, Math.abs(sy));
      break;
    case 'trfmtext': {
      if (!body) break;
      [o.x, o.y] = sp([o.x, o.y]);
      const m = o.matrix;
      m[0] = Math.round(m[0] * sx); m[2] = Math.round(m[2] * sx);
      m[1] = Math.round(m[1] * sy); m[3] = Math.round(m[3] * sy);
      break;
    }
    case 'sprite': {
      if (!body) break;
      const [x0, y0] = sp([o.bbox.x0, o.bbox.y0]), [x1, y1] = sp([o.bbox.x1, o.bbox.y1]);
      if (sx < 0 || sy < 0) {
        // mirror: become a transformed sprite
        makeRotatable(o);
        return scaleObject(o, sx, sy, org, flags, fonts);
      }
      o.bbox = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
      if (o.bbox.x1 === o.bbox.x0) o.bbox.x1 += 256;
      if (o.bbox.y1 === o.bbox.y0) o.bbox.y1 += 256;
      return o.bbox;
    }
    case 'trfmsprite': case 'jpeg': {
      if (!body) break;
      const m = o.matrix;
      m[0] = Math.round(m[0] * sx); m[2] = Math.round(m[2] * sx); m[4] = S(m[4], org.x, sx);
      m[1] = Math.round(m[1] * sy); m[3] = Math.round(m[3] * sy); m[5] = S(m[5], org.y, sy);
      break;
    }
    case 'textarea':
      if (!body) break;
      for (const c of o.columns) {
        const [x0, y0] = sp([c.bbox.x0, c.bbox.y0]), [x1, y1] = sp([c.bbox.x1, c.bbox.y1]);
        c.bbox = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
      }
      break;
    case 'group': for (const c of o.objects) scaleObject(c, sx, sy, org, flags, fonts); break;
    case 'tagged': if (o.object) scaleObject(o.object, sx, sy, org, flags, fonts); break;
    default: break;
  }
  return boundObject(o, fonts);
}

// ------------------------------------------------------------------------------ rotate
export function isRotatable(o, fonts) {
  switch (o.type) {
    case 'path': case 'sprite': case 'trfmtext': case 'trfmsprite': case 'jpeg': return true;
    case 'text': return (o.style & 0xFF) !== 0;
    case 'group': return o.objects.some((c) => isRotatable(c, fonts));
    case 'tagged': return !!o.object && isRotatable(o.object, fonts);
    default: return false;
  }
}

/** Convert text lines (outline fonts) and sprites to their transformed forms (Make_Rotatable). */
export function makeRotatable(o) {
  if (o.type === 'text' && (o.style & 0xFF)) {
    o.type = 'trfmtext'; o.tag = OBJ.TRFMTEXT;
    o.matrix = [65536, 0, 0, 65536, 0, 0]; o.flags = 0;
  } else if (o.type === 'sprite') {
    const s = spriteOSSize(o.data);
    const b = o.bbox;
    o.type = 'trfmsprite'; o.tag = OBJ.TRFMSPRITE;
    o.matrix = [Math.round((b.x1 - b.x0) / (256 * (s.w || 1)) * 65536), 0, 0, Math.round((b.y1 - b.y0) / (256 * (s.h || 1)) * 65536), b.x0, b.y0];
  } else if (o.type === 'group') o.objects.forEach(makeRotatable);
  else if (o.type === 'tagged' && o.object) makeRotatable(o.object);
  return o;
}

const mul = (r, m) => {
  // r = [cos, sin] rotation; m = matrix (16.16 a,b,c,d); returns R*M
  const [c, s] = r;
  const a = m[0], b = m[1], cc = m[2], d = m[3];
  return [Math.round(c * a - s * b), Math.round(s * a + c * b), Math.round(c * cc - s * d), Math.round(s * cc + c * d)];
};

/** Rotate an object by angle (sin, cos) about centre (default: its bbox centre). */
export function rotateObject(o, sin, cos, centre, fonts) {
  if (!centre) centre = { x: (o.bbox.x0 + o.bbox.x1) / 2, y: (o.bbox.y0 + o.bbox.y1) / 2 };
  const R = (x, y) => [Math.round(centre.x + (x - centre.x) * cos - (y - centre.y) * sin), Math.round(centre.y + (x - centre.x) * sin + (y - centre.y) * cos)];
  if (o.type === 'text' || o.type === 'sprite') makeRotatable(o);
  switch (o.type) {
    case 'path': for (const e of o.elements) for (const [a, b] of pts(e)) { [e[a], e[b]] = R(e[a], e[b]); } break;
    case 'text': {  // system font text: just move it so its centre rotates
      const cx = (o.bbox.x0 + o.bbox.x1) / 2, cy = (o.bbox.y0 + o.bbox.y1) / 2;
      const [nx, ny] = R(cx, cy);
      o.x += nx - cx; o.y += ny - cy;
      break;
    }
    case 'trfmtext': {
      [o.x, o.y] = R(o.x, o.y);
      const m = o.matrix; [m[0], m[1], m[2], m[3]] = mul([cos, sin], m);
      m[4] = m[5] = 0;
      break;
    }
    case 'trfmsprite': case 'jpeg': {
      const m = o.matrix; [m[0], m[1], m[2], m[3]] = mul([cos, sin], m);
      [m[4], m[5]] = R(m[4], m[5]);
      break;
    }
    case 'textarea': {
      const cx = (o.bbox.x0 + o.bbox.x1) / 2, cy = (o.bbox.y0 + o.bbox.y1) / 2;
      const [nx, ny] = R(cx, cy);
      translateObject(o, nx - cx, ny - cy);
      break;
    }
    case 'group': for (const c of o.objects) rotateObject(c, sin, cos, centre, fonts); break;
    case 'tagged': if (o.object) rotateObject(o.object, sin, cos, centre, fonts); break;
    default: break;
  }
  return boundObject(o, fonts);
}
