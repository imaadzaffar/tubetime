// Shared station-label geometry — used by the renderer (App.jsx) and the
// layout checker (scripts/check-layout.mjs) so collision checks match what
// is actually drawn. Labels live in MAP units (TfL Go style): one fixed
// size, fixed position, scaling with the map as the user zooms. Because
// everything scales together, a layout proven collision-free here is
// collision-free at every zoom level.

export const LABEL_FS = 13; // font size, map units
export const LABEL_LH = 15; // line height, map units
export const LABEL_GAP = 13; // gap between station centre and label edge
// Hammersmith One measured at 0.504 em/char average, 0.584 worst-case
// (single weight; bold/italic are synthesized with identical advances).
export const CHAR_W = 0.6; // safe per-char width factor, em

const MAX_LINE = 13; // wrap target, characters per line

export function wrapName(name) {
  if (name.length <= MAX_LINE) return [name];
  const words = name.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > MAX_LINE) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Returns render + collision geometry for a station label.
// lpDir: 'n' | 's' | 'e' | 'w'   (x, y): station centre.
export function labelLayout(name, lpDir, x, y) {
  const lines = wrapName(name);
  const n = lines.length;
  const w = Math.max(...lines.map((l) => l.length)) * LABEL_FS * CHAR_W;
  let anchor, lx, baselines;
  if (lpDir === 'e' || lpDir === 'w') {
    anchor = lpDir === 'e' ? 'start' : 'end';
    lx = lpDir === 'e' ? x + LABEL_GAP : x - LABEL_GAP;
    const first = y + 4.5 - ((n - 1) * LABEL_LH) / 2;
    baselines = lines.map((_, i) => first + i * LABEL_LH);
  } else if (lpDir === 's') {
    anchor = 'middle';
    lx = x;
    baselines = lines.map((_, i) => y + 23 + i * LABEL_LH);
  } else {
    anchor = 'middle';
    lx = x;
    baselines = lines.map((_, i) => y - 12 - (n - 1 - i) * LABEL_LH);
  }
  const x1 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
  return {
    lines,
    anchor,
    lx,
    baselines,
    box: {
      x1,
      x2: x1 + w,
      y1: baselines[0] - 0.8 * LABEL_FS,
      y2: baselines[n - 1] + 0.25 * LABEL_FS,
    },
  };
}

export function boxesOverlap(a, b, pad = 0) {
  return a.x1 < b.x2 + pad && b.x1 < a.x2 + pad && a.y1 < b.y2 + pad && b.y1 < a.y2 + pad;
}
