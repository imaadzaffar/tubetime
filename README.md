# Tube Time Atlas

An interactive atlas of the London Underground network through time (1900–2026),
built with Vite + React. Scrub the timeline to watch lines open, stations appear,
rename, and close; the map, legend, operator, and captions all update to match the
selected year. Click any station for its history, etymology, and the lines that have
served it over the decades.

This is a faithful port of the design component in `design/tube-time-atlas.dc.html`,
driven by the historical dataset in `src/tube-data.js`.

## Features

- **Timeline scrubbing** — drag or click the timeline to pick any year 1900–2026
  (persisted to `localStorage`).
- **Playback** — press play to animate the network's growth over time.
- **Era-aware rendering** — line names, colours, station names, operator, and the
  event caption all resolve to the values in effect for the current year.
- **Ghost stations** — closed stations linger as dashed markers.
- **Pan & zoom** — drag to pan; use the +/− buttons, the mouse wheel (zooms toward
  the cursor), or "fit" to reset.
- **Station detail panel** — click a station for opening/closing dates, rename
  history, name origin, notes, and the lines that have served it.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start the Vite dev server
npm run build        # production build
npm run preview      # preview the production build
npm run test:e2e     # run the Playwright end-to-end tests
```

The Playwright config boots the dev server automatically, so `npm run test:e2e`
(or `npx playwright test`) works standalone. If the browser isn't installed yet,
run `npx playwright install chromium` first.
