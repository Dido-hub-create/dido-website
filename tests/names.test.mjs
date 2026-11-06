import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { gpxFilename } from "../src/lib/download-name.mjs";
import { serializeGpx, parseGpx } from "../src/lib/gpx.mjs";
import { readEntries, entryFiles, validEntryId } from "../src/lib/entry-files.mjs";
import { siteIdentity } from "../src/lib/site.mjs";

test("GPX filenames transliterate Bulgarian, normalize race distances and block path/header injection", () => {
  assert.equal(gpxFilename("Маратон Кайлъка 2026 – 21,1 км"), "maraton-kaylaka-2026-21km.gpx");
  assert.equal(gpxFilename("Маратон Кайлъка 2026 – 21.1 km"), "maraton-kaylaka-2026-21km.gpx");
  assert.equal(gpxFilename("Жълт път – Щъркел, Юг и Язовир"), "zhalt-pat-shtarkel-yug-i-yazovir.gpx");
  assert.equal(gpxFilename("Café.gpx"), "cafe.gpx");
  for (const reserved of ["CON", "prn.gpx", "AUX", "NUL", "COM1", "LPT9"])
    assert.match(gpxFilename(reserved), /^marshrut-/);
  for (const value of ["", null, "😀", "../", 'A/\\B:<>"|?*\r\nSet-Cookie: x', "д".repeat(500)]) {
    const filename = gpxFilename(value);
    assert.match(filename, /^[a-z0-9][a-z0-9-]*\.gpx$/);
    assert.ok(filename.length <= 104);
  }
});

test("GPX title is XML text, invalid XML codepoints are removed and all geometry is identical", () => {
  const segments = [[{ lat: 0, lon: 0, ele: 12 }, { lat: 0, lon: 0.01, ele: 15 }],
    [{ lat: 1, lon: 1 }, { lat: 1.01, lon: 1 }]];
  const title = 'Кайлъка & <trkpt> "2026" \'21\' 😀';
  const xml = serializeGpx(segments, title + "\u0000\u0001\ud800\ufffe");
  SyntaxValidator.validate(xml);
  assert.equal(new XMLParser().parse(xml).gpx.trk.name, title);
  assert.deepEqual(parseGpx(xml), segments);
  assert.doesNotMatch(xml, /Маршрут DIDO|<!DOCTYPE|<metadata|<time/);
});

test("bad filenames/JSON, symlinks and ambiguous names are isolated with safe actionable diagnostics", () => {
  const root = mkdtempSync(join(tmpdir(), "dido-names-")), diagnostics = [];
  const report = (message) => diagnostics.push(message);
  try {
    const dir = join(root, "src/content/routes");
    mkdirSync(dir, { recursive: true });
    for (const [name, data] of Object.entries({
      "valid-route.json": '{"title":"kept"}',
      "MarathonKaylaka21km.gpx.json": '{"title":"PRIVATE_MARKER"}',
      "broken.json": '{"title":"PRIVATE_MARKER"',
      "array.json": "[]",
      "null.json": "null",
      "a\nlog.json": "{}",
      "Duplicate.json": "{}", "duplicate.json": "{}",
      ".gitkeep": "",
    })) writeFileSync(join(dir, name), data);
    symlinkSync(join(dir, "valid-route.json"), join(dir, "link.json"));
    assert.deepEqual(readEntries(root, "routes", { report }), [{ id: "valid-route", data: { title: "kept" } }]);
    assert.equal(diagnostics.length, 8);
    assert.ok(diagnostics.some((line) => line.includes("MarathonKaylaka21km.gpx.json")));
    assert.ok(diagnostics.every((line) => line.includes("Pages CMS") && !line.includes("PRIVATE_MARKER") && !line.includes("\n")));
    const posts = join(root, "src/content/posts");
    mkdirSync(join(posts, "folder"), { recursive: true });
    writeFileSync(join(posts, "folder/валидно.md"), "ok");
    writeFileSync(join(posts, "bad.gpx.md"), "bad");
    assert.deepEqual(entryFiles(root, "posts", ".md", { nested: true, report }), ["folder/валидно.md"]);
    for (const id of ["../escape", "bad.gpx", "bad%2Fname", "bad\\name", "bad?name", "bad name", ""]) assert.equal(validEntryId(id), false);
    assert.equal(validEntryId("folder/валидно", true), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("site identity keeps default labels and fixed destinations for custom CMS navigation", () => {
  const defaults = siteIdentity({});
  assert.equal(defaults.name, "DIDO");
  assert.equal(defaults.subtitle, "Личен сайт");
  const custom = siteIdentity({ siteName: "Личен дневник", siteSubtitle: "Моят свят", logoImage: "javascript:alert(1)", navigation: { home: "Старт", running: " ", finance: "/evil" } });
  assert.equal(custom.name, "Личен дневник");
  assert.equal(custom.logo, undefined);
  assert.deepEqual(custom.navigation.map(([href]) => href), defaults.navigation.map(([href]) => href));
  assert.equal(custom.navigation[0][1], "Старт");
  assert.equal(custom.navigation[1][1], "Бягане");
});
