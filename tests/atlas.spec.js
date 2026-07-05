import { test, expect } from '@playwright/test';

const DEFAULT_VIEWBOX = '0 0 2450 1560';

// Click the timeline track at a horizontal fraction (0 = 1900, 1 = 2026).
async function scrubTo(page, fraction) {
  const track = page.getByTestId('timeline-track');
  const box = await track.boundingBox();
  const x = Math.min(box.width - 2, Math.max(2, box.width * fraction));
  await track.click({ position: { x, y: 22 } });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Ensure a clean, first-visit state.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Wait for the webfont — its metrics change the timeline track's width,
  // and scrubTo measures the track before clicking.
  await page.evaluate(() => document.fonts.ready);
});

test('app loads with the 1900-era network', async ({ page }) => {
  await expect(page.getByText("LONDON’S UNDERGROUND RAILWAYS")).toBeVisible();

  const legend = page.getByTestId('legend');
  await expect(legend.getByText('Metropolitan Railway', { exact: true })).toBeVisible();
  await expect(legend.getByText('Central London Railway', { exact: true })).toBeVisible();

  await expect(page.getByTestId('year')).toHaveText('1900');
});

test('scrubbing the timeline advances the year and updates the network', async ({ page }) => {
  await scrubTo(page, 1);

  await expect(page.getByTestId('year')).toHaveText('2026');

  const legend = page.getByTestId('legend');
  await expect(legend.getByText('Elizabeth line', { exact: true })).toBeVisible();

  await expect(page.getByTestId('caption')).toContainText('Elizabeth line');
});

test('line names are era-aware', async ({ page }) => {
  await scrubTo(page, 1);
  await expect(page.getByTestId('year')).toHaveText('2026');

  const legend = page.getByTestId('legend');
  await expect(legend.getByText('Metropolitan line', { exact: true })).toBeVisible();
  await expect(legend.getByText('Metropolitan Railway', { exact: true })).toHaveCount(0);
});

test('clicking a station opens its detail panel and it can be closed', async ({ page }) => {
  await page.locator('[data-station-id="paddington"]').click();

  const panel = page.getByTestId('station-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('panel-name')).toHaveText('Paddington');
  await expect(panel.getByText('NAME ORIGIN')).toBeVisible();

  await page.getByTestId('panel-close').click();
  await expect(panel).toBeHidden();
});

test('play button animates the year and toggles its glyph', async ({ page }) => {
  const play = page.getByTestId('play');
  await expect(play).toHaveText('▶');
  await expect(page.getByTestId('year')).toHaveText('1900');

  await play.click();
  await expect(play).toHaveText('❚❚');

  // Let it animate for a beat, then confirm the year advanced.
  await expect
    .poll(async () => Number(await page.getByTestId('year').textContent()), { timeout: 5000 })
    .toBeGreaterThan(1900);

  // Clicking again pauses and restores the play glyph.
  await play.click();
  await expect(play).toHaveText('▶');
});

test('zoom controls change the viewBox and fit resets it', async ({ page }) => {
  const svg = page.getByTestId('map-svg');
  await expect(svg).toHaveAttribute('viewBox', DEFAULT_VIEWBOX);

  await page.getByTestId('zoom-in').click();
  await expect(svg).not.toHaveAttribute('viewBox', DEFAULT_VIEWBOX);

  await page.getByTestId('zoom-fit').click();
  await expect(svg).toHaveAttribute('viewBox', DEFAULT_VIEWBOX);
});

test('zoom-aware labels: non-interchange labels hide at fit and reappear when zoomed in', async ({ page }) => {
  await scrubTo(page, 1);
  await expect(page.getByTestId('year')).toHaveText('2026');

  const svg = page.getByTestId('map-svg');
  // At fit (z=1), only interchange stations like Baker Street get labels.
  await expect(svg.getByText('Maida Vale', { exact: true })).toBeHidden();
  await expect(svg.getByText('Baker Street', { exact: true })).toBeVisible();

  // Two zoom-in clicks give z ≈ 1.82, above the 1.6 threshold — all labels show.
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-in').click();
  await expect(svg.getByText('Maida Vale', { exact: true })).toBeVisible();
});

test('station search finds and jumps to a station', async ({ page }) => {
  const search = page.getByTestId('station-search');
  await search.fill('canary');

  const results = page.getByTestId('search-result');
  await expect(results.first()).toBeVisible();

  await search.press('Enter');

  await expect(page.getByTestId('panel-name')).toHaveText('Canary Wharf');
  const svg = page.getByTestId('map-svg');
  await expect(svg).toHaveAttribute('viewBox', /^-?\d+(\.\d+)? -?\d+(\.\d+)? 600 /);
});

test('station search matches historical names', async ({ page }) => {
  // Fresh state at 1900 — Gower Street was Euston Square's original 1863 name.
  const search = page.getByTestId('station-search');
  await search.fill('gower');

  await expect(page.getByTestId('search-result').first()).toBeVisible();
});

test('hovering a line highlights it and dims the others', async ({ page }) => {
  await scrubTo(page, 1);
  await expect(page.getByTestId('year')).toHaveText('2026');

  // Widened hit-area polylines overlap each other at line crossings, so force
  // the hover past Playwright's actionability/interception check.
  const centralHit = page.locator('polyline[data-line-id="central"]').first();
  await centralHit.hover({ force: true });

  const dimmed = page.locator('polyline[opacity="0.15"]');
  await expect(dimmed.first()).toBeVisible();
});
