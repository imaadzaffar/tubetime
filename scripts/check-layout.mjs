// Layout validator for the octolinear (Beck-style) Tube Time Atlas map.
// Asserts: (a) every consecutive polyline pair is horizontal / vertical / 45°
//          (angle ≡ 0 mod 45, ±0.5°), including THAMES;
//          (b) min station-pair distance ≥ 45;
//          (c) all coords within margins and on the 5-unit grid;
//          (d) every station id referenced in a segment exists.
// Exits non-zero with a list of violations.
import { STATIONS, LINES, THAMES } from '../src/tube-data.js';

const MARGIN = { xMin: 80, xMax: 2370, yMin: 60, yMax: 1500 };
const GRID = 5;
const MIN_DIST = 45;
const ANGLE_TOL = 0.5; // degrees

const violations = [];
const v = (msg) => violations.push(msg);

// (c) coords within margins and on grid
for (const [id, st] of Object.entries(STATIONS)) {
  if (typeof st.x !== 'number' || typeof st.y !== 'number') {
    v(`station ${id}: missing numeric x/y`);
    continue;
  }
  if (st.x % GRID !== 0 || st.y % GRID !== 0)
    v(`station ${id}: not on ${GRID}-grid (${st.x},${st.y})`);
  if (st.x < MARGIN.xMin || st.x > MARGIN.xMax || st.y < MARGIN.yMin || st.y > MARGIN.yMax)
    v(`station ${id}: outside margins (${st.x},${st.y})`);
}

// (d) referenced station ids exist + grid check on raw waypoints
for (const line of LINES) {
  for (let si = 0; si < line.segs.length; si++) {
    const sg = line.segs[si];
    for (const p of sg.pts) {
      if (Array.isArray(p)) {
        if (p[0] % GRID !== 0 || p[1] % GRID !== 0)
          v(`${line.id} seg${si}: waypoint not on grid (${p[0]},${p[1]})`);
      } else if (!STATIONS[p]) {
        v(`${line.id} seg${si}: unknown station id "${p}"`);
      }
    }
  }
}

// (a) octolinearity of every consecutive polyline pair
function resolve(p) {
  if (Array.isArray(p)) return p;
  const st = STATIONS[p];
  return st ? [st.x, st.y] : null;
}
function checkPolyline(label, rawPts) {
  const pts = rawPts.map(resolve).filter(Boolean);
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) continue; // coincident points: ignore
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mod = ((ang % 45) + 45) % 45;
    const dev = Math.min(mod, 45 - mod);
    if (dev > ANGLE_TOL) {
      const a = Array.isArray(rawPts[i - 1]) ? `[${x1},${y1}]` : rawPts[i - 1];
      const b = Array.isArray(rawPts[i]) ? `[${x2},${y2}]` : rawPts[i];
      v(`${label}: non-octolinear ${a}→${b}  angle=${ang.toFixed(2)}° (dx=${dx},dy=${dy})`);
    }
  }
}
for (const line of LINES)
  for (let si = 0; si < line.segs.length; si++)
    checkPolyline(`${line.id} seg${si}`, line.segs[si].pts);
if (Array.isArray(THAMES)) checkPolyline('THAMES', THAMES);
else v('THAMES: missing or not an array');

// (e) no station within 25 units of a segment polyline it isn't part of
const NEAR_SEG = 25;
// Express pass-throughs: the line deliberately rides a corridor through these
// stations without stopping (rendered as a shared-corridor underlay).
const EXPRESS_PASS = new Set([
  'elizabeth:oxford-circus', // Bond St -> TCR skips Oxford Circus
  'met:st-johns-wood',       // Met runs express over the Stanmore-corridor locals
  'met:swiss-cottage',
]);
function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
for (const line of LINES) {
  for (let si = 0; si < line.segs.length; si++) {
    const sg = line.segs[si];
    const member = new Set(sg.pts.filter((p) => !Array.isArray(p)));
    const pts = sg.pts.map(resolve).filter(Boolean);
    for (const [id, st] of Object.entries(STATIONS)) {
      if (member.has(id) || EXPRESS_PASS.has(`${line.id}:${id}`)) continue;
      for (let i = 1; i < pts.length; i++) {
        const d = pointSegDist(st.x, st.y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
        if (d < NEAR_SEG) {
          v(`${line.id} seg${si}: passes within ${d.toFixed(1)} of non-member station ${id} (${st.x},${st.y})`);
          break;
        }
      }
    }
  }
}

// (b) min station-pair distance
const ids = Object.keys(STATIONS);
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = STATIONS[ids[i]];
    const b = STATIONS[ids[j]];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < MIN_DIST)
      v(`stations too close: ${ids[i]} (${a.x},${a.y}) ↔ ${ids[j]} (${b.x},${b.y})  d=${d.toFixed(1)}`);
  }
}

if (violations.length) {
  console.error(`\n✗ layout check FAILED — ${violations.length} violation(s):\n`);
  for (const m of violations) console.error('  • ' + m);
  console.error('');
  process.exit(1);
} else {
  console.log('✓ layout check passed — octolinear, spaced, in-bounds.');
}
