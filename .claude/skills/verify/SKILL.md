---
name: verify
description: Build, launch, and drive Tube Time Atlas (Vite + React SVG map app) to verify changes end-to-end in a real browser.
---

# Verify Tube Time Atlas

## Launch
```bash
npm run dev -- --port 5199   # pick a free port; app at http://localhost:5199
```
No backend, no env vars. `npm run build` for a production sanity check.

## Drive (browser)
Surface is a single-page SVG map. Flows worth driving after any change:

- **Initial load**: header "LONDON'S UNDERGROUND RAILWAYS", year 1900 (clear
  localStorage key `tube-atlas-year` first — year persists across reloads).
- **Timeline**: click/drag the track at the bottom → year + legend + caption +
  operator all change. Play button (bottom-left) animates 4 yrs/s and stops at 2026.
- **Stations**: every visible station/ghost `<g>` carries `data-station-id="<id>"`
  (ids from src/tube-data.js). Get its screen position via
  `getBoundingClientRect()` and click the center → detail panel opens.
- **Zoom/pan**: +/−/fit buttons top-right change the svg `viewBox`; drag on the
  map pans it. Read `document.querySelector('svg').getAttribute('viewBox')`
  to assert. Fit = `0 0 2450 1560`.

## Gotchas
- **Claude-in-Chrome coordinate space**: the computer tool takes SCREENSHOT
  coordinates and maps them to CSS itself (screenshot is ~0.97× of the
  viewport). Do NOT pre-scale coordinates from `getBoundingClientRect()` —
  convert CSS→screenshot once: `css * screenshotWidth / window.innerWidth`.
- The extension's `scroll` action does not reach the app's non-passive wheel
  listener; test wheel-zoom by dispatching a `WheelEvent` on the svg instead.
- The timeline track has dead zones near the "1900"/"2026" labels — start
  drags well inside the track.

## Tests
`npx playwright test` (chromium, auto-starts dev server). E2E specs in
tests/atlas.spec.js.

## Layout invariants
The map is a Beck-style octolinear schematic. After ANY coordinate/waypoint
change in src/tube-data.js run `npm run check:layout` — it asserts every
polyline run is 0/45/90°, stations ≥45 units apart, nothing rides through a
foreign station (<25 units), coords on the 5-grid and in-bounds. Express
pass-throughs (Elizabeth over Oxford Circus, Met over St John's Wood /
Swiss Cottage) are allowlisted in scripts/check-layout.mjs.
