import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { normalizeSiteSettings } from "../src/lib/site-settings.mjs";

test("omitted/null optional settings and nested groups have safe defaults without invented records or URLs", () => {
  for (const value of [{}, null, { records: null, navigation: null, home: null }, { records: [], home: [] }]) {
    const site = normalizeSiteSettings(value);
    assert.equal(site.siteName, "DIDO");
    assert.equal(site.siteSubtitle, "Личен сайт");
    assert.deepEqual(site.records, { oneKm: "", fiveKm: "", tenKm: "", halfMarathon: "" });
    for (const key of ["publicSiteUrl", "youtubeChannel", "biography", "email", "contactUrl", "portrait", "logoImage", "socialImage"])
      assert.equal(site[key], "", key);
    assert.deepEqual(site.home.selectedPosts, []);
    assert.equal(site.home.heroFrame, undefined);
    assert.equal(site.navigation.home, "Начало");
  }
});

test("normalization preserves supplied CMS content and does not mutate the source", () => {
  const input = JSON.parse(readFileSync("src/data/site.json", "utf8"));
  const before = structuredClone(input), site = normalizeSiteSettings(input);
  assert.equal(site.youtubeChannel, input.youtubeChannel ?? "");
  assert.equal(site.records.halfMarathon, input.records?.halfMarathon ?? "");
  assert.equal(site.recordsImage, input.recordsImage ?? "");
  assert.equal(site.home.intro, input.home?.intro ?? "");
  assert.equal(site.home.heroImage, input.home?.heroImage ?? "");
  if (input.home?.heroFrame?.mobileX !== undefined)
    assert.equal(site.home.heroFrame.mobileX, input.home.heroFrame.mobileX);
  assert.deepEqual(input, before);
  const malformed = normalizeSiteSettings({ email: 42, publicSiteUrl: false, records: { fiveKm: null }, home: { selectedPosts: [null, "existing-post", 7] } });
  assert.equal(malformed.email, "");
  assert.equal(malformed.publicSiteUrl, "");
  assert.equal(malformed.records.fiveKm, "");
  assert.deepEqual(malformed.home.selectedPosts, ["existing-post"]);
});

test("a realistic CMS save omitting optional fields passes Astro/TypeScript AND builds without rewriting content", { timeout: 60000 }, () => {
  const root = resolve("."), fixture = mkdtempSync(join(tmpdir(), "dido-cms-settings-"));
  try {
    for (const name of ["src", "public", "package.json", "tsconfig.json", "astro.config.mjs"])
      cpSync(join(root, name), join(fixture, name), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
    const current = JSON.parse(readFileSync(join(root, "src/data/site.json"), "utf8"));
    // Deliberately omit even optional fields that the owner might fill later.
    // Astro must not infer its application type from this sparse JSON shape.
    const saved = JSON.stringify({
      siteName: current.siteName,
      youtubeChannel: current.youtubeChannel,
      records: { halfMarathon: current.records.halfMarathon },
      recordsImage: current.recordsImage,
      home: { title: current.home.title, intro: current.home.intro, heroImage: current.home.heroImage },
    });
    const settingsPath = join(fixture, "src/data/site.json");
    writeFileSync(settingsPath, saved);
    const run = (command) => execFileSync(process.execPath, [join(root, "node_modules/astro/bin/astro.mjs"), command], {
      cwd: fixture, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", PUBLIC_SITE_URL: "" }, stdio: "pipe",
    }).toString();
    assert.match(run("check"), /0 errors/);
    run("build");
    const page = (path) => readFileSync(join(fixture, "dist", path), "utf8");
    const home = page("index.html"), about = page("za-men/index.html"), running = page("byagane/index.html");
    assert.ok(home.includes(current.records.halfMarathon));
    assert.equal((home.match(/<small>Предстои<\/small>/g) ?? []).length, 3);
    if (current.recordsImage) assert.ok(home.includes(current.recordsImage));
    else assert.doesNotMatch(home, /src="undefined"/);
    assert.ok(running.includes(current.youtubeChannel));
    assert.match(about, /Портретът предстои|Данни за връзка ще бъдат добавени/);
    assert.doesNotMatch(about, /mailto:undefined|href="undefined"|src="undefined"/);
    assert.doesNotMatch(home, /property="og:url"|data-share-url=/);
    assert.match(page("byagane/sastezaniya/kaylakamarathon2026/index.html"), /Маратон Кайлъка 2026/);
    assert.match(page("byagane/marshruti/kaylaka-21km-2026/trace.gpx"), /<name>Маратон Кайлъка 2026 – 21,1 км<\/name>/);
    assert.equal(readFileSync(settingsPath, "utf8"), saved);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
