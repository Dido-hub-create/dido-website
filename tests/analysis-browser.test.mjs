import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { distanceOf } from "../src/lib/geo.mjs";
const enabled = process.env.DIDO_BROWSER_MODULE && process.env.DIDO_BROWSER_URL;

test("analysis UI: real permissions, synthetic profiles, comparison, smoothing, map cursor and pace at four widths", { skip: !enabled, timeout: 90000 }, async () => {
  const { chromium } = createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);
  const browser = await chromium.launch({ executablePath: process.env.DIDO_CHROMIUM || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext(), page = await context.newPage();
  const origin = process.env.DIDO_BROWSER_URL, errors = [], external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => { const url = new URL(route.request().url()); if (url.origin === origin || url.protocol === "data:") return route.continue(); external.push(url.href); return route.abort(); });
  const screenshotDir = process.env.DIDO_ANALYSIS_SCREENSHOTS || "work/analysis-visuals";
  mkdirSync(screenshotDir, { recursive: true });
  const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const waitPlan = () => page.locator("[data-pace-result]").waitFor({ state: "visible" });
  try {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(origin + "/byagane/analiz/"); await waitPlan();
      assert.equal(await page.locator('[data-profile="primary"] [data-profile-details]').isVisible(), true);
      assert.ok(Number(await page.locator("[data-profile-chart]").first().getAttribute("data-y-min")) > 0);
      assert.equal(await page.locator("[data-smoothing] option").evaluateAll((options) => options.map((o) => o.value).join(",")), "25,50,100,200");
      assert.equal(await page.locator('option[value="effort"]').evaluate((el) => el.disabled), false);
      assert.match(await page.locator("[data-pace-rows] tr").last().textContent(), /02:00:00/);
      await overflow();
      await page.locator("[data-smoothing]").selectOption("25"); await waitPlan();
      assert.match(await page.locator("[data-profile-notice]").first().textContent(), /GPS шум/);
      await page.locator("[data-smoothing]").selectOption("100"); await waitPlan();
      if ([390, 1440].includes(width)) await page.locator('[data-profile="primary"]').screenshot({ path: `${screenshotDir}/kaylaka-${width}.png` });
      await page.goto(origin + "/byagane/marshruti/kaylaka-21km-2026/");
      await page.locator("[data-profile-notice]").waitFor();
      await page.waitForFunction(() => document.querySelector("[data-profile-notice]").textContent.includes("Изглаждане 100"));
      assert.equal(await page.locator("[data-route-map]").count(), 1);
      assert.equal(await page.locator('a:has-text("Изчисли стратегия")').count(), 1);
      await overflow();
    }
    assert.deepEqual(external, [], "No external map tiles before clicking the map button");
    // Controlled UI fixtures only: intercept the generated page and whitelisted profile
    // endpoints. No synthetic route is added to content or the deployable build.
    const R = 6371008.8 * Math.PI / 180;
    const segmentsA = [Array.from({ length: 121 }, (_, i) => ({ lat: 43, lon: 24 + i * 20 / R, ele: 150 + 35 * Math.sin(i / 15) }))];
    const segmentsB = [Array.from({ length: 71 }, (_, i) => ({ lat: 42, lon: 23 + i * 20 / R, ele: 550 + i * .8 })), Array.from({ length: 41 }, (_, i) => ({ lat: 42.02, lon: 23.02 + i * 20 / R, ele: 600 - i * 1.5 }))];
    const segmentsC = [Array.from({ length: 101 }, (_, i) => ({ lat: 44, lon: 25 + i * 20 / R, ele: 1450 + 12 * Math.sin(i / 20) }))];
    const catalog = [segmentsA, segmentsB, segmentsC].map((segments, i) => ({ id: `synthetic-${i}`, title: `СИНТЕТИЧЕН ТЕСТ ${i + 1}${i === 0 ? " — 2 обиколки" : i === 1 ? " — 2 сегмента" : " — малък релеф"}`, href: "/byagane/analiz/", mapHref: `/test-analysis/${i}/map.json`, profileHref: `/test-analysis/${i}/analysis.json`, baseDistanceM: distanceOf(segments), distanceM: distanceOf(segments) * (i ? 1 : 2), lapCount: i ? 1 : 2, status: "ready", comparison: true, calculator: true }));
    catalog.push({ ...catalog[2], id: "untrusted", title: "СИНТЕТИЧЕН ТЕСТ — непотвърдени височини", status: "untrusted", profileHref: undefined });
    const built = readFileSync("dist/byagane/analiz/index.html", "utf8");
    const fixture = built.replace(/(<script[^>]*data-analysis-catalog[^>]*>)[\s\S]*?<\/script>/, (_, open) => `${open}${JSON.stringify(catalog)}</script>`)
      .replace(/(<select[^>]*data-route-select="primary"[^>]*>)[\s\S]*?<\/select>/, (_, open) => `${open}${catalog.map((r) => `<option value="${r.id}">${r.title}</option>`).join("")}</select>`)
      .replace(/(<select[^>]*data-route-select="secondary"[^>]*>)[\s\S]*?<\/select>/, (_, open) => `${open}<option value="">Без второ трасе</option>${catalog.map((r) => `<option value="${r.id}">${r.title}</option>`).join("")}</select>`);
    const threeRoutes = fixture.replace(/(<select[^>]*data-route-select="tertiary"[^>]*>)[\s\S]*?<\/select>/, (_, open) => `${open}<option value="">Без трето трасе</option>${catalog.map((r) => `<option value="${r.id}">${r.title}</option>`).join("")}</select>`);
    await page.route("**/byagane/analiz/**", (route) => route.fulfill({ body: threeRoutes, contentType: "text/html" }));
    await page.route("**/test-analysis/**", (route) => {
      const url = new URL(route.request().url()), i = Number(url.pathname.split("/")[2]), segments = [segmentsA, segmentsB, segmentsC][i];
      return route.fulfill({ json: url.pathname.endsWith("map.json") ? { segments: segments.map((s) => s.map((p) => [p.lat, p.lon])) } : { segments, lapCount: catalog[i].lapCount } });
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(origin + "/byagane/analiz/?route=synthetic-0&compare=synthetic-1&compare3=synthetic-2"); await waitPlan();
      assert.equal(await page.locator("[data-profile-details]:visible").count(), 3);
      assert.equal(await page.locator("[data-profile-chart]").first().locator("polyline").count() >= 2, true);
      assert.equal(await page.locator("[data-pace-checkpoints] li").count(), 2);
      const labelsA = await page.locator('[data-profile="primary"] [data-km-tick]').allTextContents();
      const labelsB = await page.locator('[data-profile="secondary"] [data-km-tick]').allTextContents();
      assert.deepEqual(labelsA, labelsB); // last kilometre tick: same horizontal domain
      const chartBoxes = await page.locator('[data-profile-chart]:visible').evaluateAll((charts) => charts.map((c) => ({x:c.getBoundingClientRect().x,width:c.getBoundingClientRect().width})));
      assert.ok(chartBoxes.every((box) => Math.abs(box.x - chartBoxes[0].x) < 1 && Math.abs(box.width-chartBoxes[0].width)<1));
      await page.locator('[data-overlay-mode]').selectOption('relative'); await waitPlan();
      assert.equal(await page.locator('[data-overlay-legend] li').count(), 3);
      assert.equal(new Set(await page.locator('[data-overlay-route]').evaluateAll((curves) => curves.map((c) => c.dataset.overlayRoute))).size, 3);
      const overlay = page.locator('[data-overlay-chart]');
      const relativeRange = await overlay.evaluate((c) => Number(c.dataset.yMax) - Number(c.dataset.yMin));
      assert.ok(relativeRange < 200);
      const starts = await overlay.locator('polyline').evaluateAll((curves) => {
        const first = new Map(); for (const c of curves) if (!first.has(c.dataset.overlayRoute)) first.set(c.dataset.overlayRoute, Number(c.getAttribute('points').split(' ')[0].split(',')[1]));
        return [...first.values()];
      });
      assert.equal(starts.length, 3); assert.ok(Math.max(...starts) - Math.min(...starts) < .02);
      assert.equal(await page.locator('[data-overlay-mode] option[value="absolute"]').count(), 0, "never flatten different cities onto one absolute vertical scale");
      if ([390,1440].includes(width)) await page.locator('[data-overlay]').screenshot({path:`${screenshotDir}/relative-overlay-${width}.png`});
      const before = await page.locator('[data-profile="primary"] [data-profile-stats]').textContent();
      await page.locator("[data-smoothing]").selectOption("200"); await waitPlan();
      assert.notEqual(await page.locator('[data-profile="primary"] [data-profile-stats]').textContent(), before);
      await page.locator('[name="strategy"]').selectOption("effort");
      await page.locator('[name="target"]').fill("01:43:27"); await page.locator("[data-pace-form] button").click(); await waitPlan();
      assert.match(await page.locator("[data-pace-rows] tr").last().textContent(), /01:43:27/);
      const times = await page.locator("[data-pace-rows] tr").evaluateAll((rows) => rows.map((r) => r.cells[2].textContent));
      assert.equal(times.reduce((sum, s) => sum + s.split(":").reduce((n, v) => n * 60 + Number(v), 0), 0), 6207);
      await page.locator('[name="target"]').fill("00:00:00"); await page.locator("[data-pace-form] button").click();
      assert.equal(await page.locator("[data-pace-result]").isVisible(), false);
      assert.match(await page.locator("[data-pace-status]").textContent(), /валидно време/);
      await page.locator('[name="target"]').fill("01:43:27"); await page.locator("[data-pace-form] button").click(); await waitPlan();
      const slot = page.locator('[data-analysis-slot="primary"]');
      await slot.locator("summary").click(); await slot.locator("[data-load-map]").click();
      await slot.locator(".leaflet-container").waitFor({ state: "visible" });
      const marker = slot.locator(".leaflet-overlay-pane path").last();
      const oldPath = await marker.getAttribute("d");
      await page.locator('[data-profile="primary"] [data-profile-position]').evaluate((input) => { input.value = "500"; input.dispatchEvent(new Event("input", { bubbles: true })); });
      assert.notEqual(await marker.getAttribute("d"), oldPath);
      assert.match(await page.locator('[data-profile="primary"] [data-profile-readout]').textContent(), /0,50 км/);
      const slider = page.locator('[data-profile="primary"] [data-profile-position]'); await slider.focus(); await page.keyboard.press("End");
      assert.match(await page.locator('[data-profile="primary"] [data-profile-readout]').textContent(), /обиколка 2/);
      await overflow();
      if ([390, 1440].includes(width)) { await page.evaluate(() => scrollTo(0, 0)); await page.locator(".analysis-grid").screenshot({ path: `${screenshotDir}/synthetic-comparison-${width}.png` }); }
    }
    await page.locator('[data-route-select="primary"]').selectOption("synthetic-1"); await waitPlan();
    assert.equal(await page.locator('[data-route-select="secondary"]').inputValue(), "");
    assert.equal(await page.locator('[data-analysis-slot="primary"] [data-map-canvas]').isVisible(), false);
    assert.equal(await page.locator('[data-analysis-slot="primary"] .leaflet-pane').count(), 0);
    assert.equal(await page.locator('[data-analysis-slot="secondary"]').isVisible(), false);
    await page.locator('[data-analysis-slot="primary"] [data-load-map]').click();
    await page.locator('[data-analysis-slot="primary"] .leaflet-container').waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-pace-checkpoints] li').count(), 1);
    await page.locator('[data-route-select="primary"]').selectOption("untrusted"); await waitPlan();
    assert.equal(await page.locator('option[value="effort"]').evaluate((el) => el.disabled), true);
    assert.match(await page.locator('[data-profile="primary"] [data-profile-notice]').textContent(), /не е потвърдена/);
    assert.deepEqual(errors, []);
    assert.ok(external.every((url) => url.includes("tile.openstreetmap.org")), `Unexpected external requests: ${external}`);
  } finally { await browser.close(); }
});
