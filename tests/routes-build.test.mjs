import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseGpx, publicMapData } from "../src/lib/gpx.mjs";
import {
  assertNoPublicGpx,
  resolveGpxSource,
  loadRoutes,
  referenceId,
  analysisPayload,
  analysisSummary,
  assertGeneratedAnalysis,
} from "../src/lib/running.mjs";

const points = Array.from({ length: 9 }, (_, index) => ({
  lat: 0,
  lon: Number(((index + 1) * 0.001111).toFixed(6)),
  ele: 100 + index * 5,
}));
const source = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>SOURCE_PRIVATE_MARKER</name></metadata><wpt lat="0.99999" lon="0.99999"/><trk><trkseg>${points.map((point) => `<trkpt lat="${point.lat}" lon="${point.lon}"><ele>${point.ele}</ele><time>2099-01-01T00:00:00Z</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
const walk = (directory) =>
  readdirSync(directory).flatMap((name) =>
    statSync(join(directory, name)).isDirectory()
      ? walk(join(directory, name))
      : [join(directory, name)],
  );

test("source path traversal, symlinks and public GPX files are rejected", () => {
  assert.equal(
    referenceId("src/content/posts/folder/article.md", "posts"),
    "folder/article",
  );
  assert.equal(
    referenceId("src/content/posts/../secret.md", "posts"),
    undefined,
  );
  const root = mkdtempSync(join(tmpdir(), "dido-path-"));
  try {
    mkdirSync(join(root, "src/data/gpx"), { recursive: true });
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(join(root, "src/data/gpx/valid.gpx"), source);
    assert.ok(
      resolveGpxSource(root, "/gpx-source/valid.gpx").endsWith("valid.gpx"),
    );
    mkdirSync(join(root, "src/data/gpx/folder"));
    writeFileSync(join(root, "src/data/gpx/folder/nested.gpx"), source);
    assert.ok(
      resolveGpxSource(root, "/gpx-source/folder/nested.gpx").endsWith(
        "nested.gpx",
      ),
    );
    for (const path of [
      "/images/valid.gpx",
      "/gpx-source/../valid.gpx",
      "/gpx-source/%2e%2e%2fvalid.gpx",
      "https://example.org/track.gpx",
      "/gpx-source/file.txt",
      "/gpx-source/%00.gpx",
    ])
      assert.throws(() => resolveGpxSource(root, path));
    symlinkSync(
      join(root, "src/data/gpx/valid.gpx"),
      join(root, "src/data/gpx/link.gpx"),
    );
    assert.throws(() => resolveGpxSource(root, "/gpx-source/link.gpx"));
    writeFileSync(join(root, "public/accidental.GPX"), source);
    assert.throws(() => assertNoPublicGpx(root));
    rmSync(join(root, "public/accidental.GPX"));
    writeFileSync(join(root, "public/disguised.txt"), source);
    assert.throws(() => assertNoPublicGpx(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test(
  "production builds expose only approved processed routes, keep map/GPX identical, and revoke old files",
  { timeout: 60000 },
  () => {
    const root = resolve("."),
      fixture = mkdtempSync(join(tmpdir(), "dido-route-build-"));
    try {
      for (const entry of [
        "src",
        "public",
        "package.json",
        "tsconfig.json",
        "astro.config.mjs",
      ])
        cpSync(join(root, entry), join(fixture, entry), { recursive: true });
      symlinkSync(
        join(root, "node_modules"),
        join(fixture, "node_modules"),
        "dir",
      );
      const writeRoute = (id, values = {}) =>
        writeFileSync(
          join(fixture, "src/content/routes", `${id}.json`),
          JSON.stringify({
            title: `Синтетичен тест ${id}`,
            status: "published",
            publicApproved: true,
            gpx: "/gpx-source/original.gpx",
            trimStartM: 130,
            trimEndM: 130,
            ...values,
          }),
        );
      writeFileSync(join(fixture, "src/data/gpx/original.gpx"), source);
      writeFileSync(join(fixture, "src/data/gpx/broken.gpx"), "<gpx>");
      writeRoute("allowed", {
        title: "Маратон Кайлъка 2026 – 21,1 км",
        publishMap: true,
        allowDownload: true,
        elevationTrusted: true,
        allowElevationAnalysis: true,
        lapCount: 2,
      });
      writeRoute("map-only", { publishMap: true, allowDownload: false });
      writeRoute("download-only", { publishMap: false, allowDownload: true });
      writeRoute("details-only", { publishMap: false, allowDownload: false });
      writeRoute("unapproved", {
        publicApproved: false,
        publishMap: true,
        allowDownload: true,
      });
      writeRoute("draft", {
        status: "draft",
        publishMap: true,
        allowDownload: true,
      });
      writeRoute("invalid", {
        gpx: "/gpx-source/broken.gpx",
        publishMap: true,
        allowDownload: true,
      });
      writeRoute("missing", {
        gpx: "/gpx-source/missing.gpx",
        publishMap: true,
        allowDownload: true,
      });
      writeRoute("trim-all", {
        trimStartM: 999999,
        publishMap: true,
        allowDownload: true,
      });
      writeRoute("MarathonKaylaka21km.gpx", { publishMap: true, allowDownload: true });
      writeRoute("retired", { publishMap: true, allowDownload: true });
      writeFileSync(join(fixture, "src/data/gpx/no-height.gpx"), source.replace(/<ele>[^<]+<\/ele>/g, ""));
      writeFileSync(join(fixture, "src/data/gpx/gap.gpx"), source.replace('lon="0.009999"', 'lon="0.099999"').replace(/lon="([^"]+)"/g, (_, lon) => `lon="${Number(lon) + 1}"`));
      writeRoute("no-height", { publishMap: true, allowElevationAnalysis: true, elevationTrusted: true, gpx: "/gpx-source/no-height.gpx" });
      writeRoute("gap", { publishMap: true, allowElevationAnalysis: true, elevationTrusted: true, trimStartM: 0, trimEndM: 0, gpx: "/gpx-source/gap.gpx" });
      writeRoute("untrusted", { publishMap: true, allowElevationAnalysis: true });
      writeRoute("no-map-analysis", { publishMap: false, allowElevationAnalysis: true, elevationTrusted: true });
      writeRoute("bad-laps", { publishMap: true, allowElevationAnalysis: true, elevationTrusted: true, lapCount: 1.5 });
      writeFileSync(join(fixture, "src/content/routes/bad-json.json"), "{PRIVATE_JSON");
      writeFileSync(join(fixture, "src/content/races/Invalid.gpx.json"), "{PRIVATE_RACE");
      const image = "/images/IMG-4a64148048c44ebcb450fa03afe7d8c7-V-1.jpg";
      writeFileSync(
        join(fixture, "src/content/races/future.json"),
        JSON.stringify({
          title: "Синтетично бъдещо състезание",
          publicationStatus: "published",
          status: "confirmed",
          date: "2098-11-07",
          startTime: "09:00",
          route: "src/content/routes/allowed.json",
          cover: image,
          coverFrame: { fit: "contain", x: 35, y: 10 },
          result: "",
          placing: "",
        }),
      );
      writeFileSync(
        join(fixture, "src/content/races/old.json"),
        JSON.stringify({
          title: "Синтетично завършено състезание",
          publicationStatus: "published",
          status: "completed",
          date: "2000-01-01",
          result: "Тестов резултат",
          placing: "Тестово класиране",
          gallery: [image],
        }),
      );
      writeFileSync(
        join(fixture, "src/content/races/draft.json"),
        JSON.stringify({
          title: "НЕПУБЛИКУВАНО СЪСТЕЗАНИЕ",
          publicationStatus: "draft",
        }),
      );
      writeFileSync(
        join(fixture, "src/content/posts/crop-test.md"),
        `---\ntitle: Тест на кадриране\ncover: ${image}\ncoverFrame:\n  fit: cover\n  x: 25\n  y: 10\n  mobileFit: contain\ngallery:\n  - ${image}\ngalleryFrame:\n  fit: contain\n---\nТестов текст.`,
      );
      const build = () => {
        const result = spawnSync(
          process.execPath,
          [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
          {
            cwd: fixture,
            env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
            stdio: "pipe",
          },
        );
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(result.stderr.toString());
        return Buffer.concat([result.stdout, result.stderr]);
      };
      const logs = build().toString();
      assert.match(logs, /Пропуснат запис routes\/"MarathonKaylaka21km.gpx.json"/);
      assert.match(logs, /Пропуснат запис races\/"Invalid.gpx.json"/);
      const output = join(fixture, "dist"),
        path = (id, name) => join(output, "byagane/marshruti", id, name),
        read = (id, name) => readFileSync(path(id, name), "utf8");
      assert.ok(existsSync(path("allowed", "index.html")));
      const map = JSON.parse(read("allowed", "map.json")),
        download = read("allowed", "trace.gpx");
      assert.deepEqual(publicMapData(parseGpx(download)), map);
      const profile = JSON.parse(read("allowed", "analysis.json"));
      assert.deepEqual(profile, { segments: parseGpx(download), lapCount: 2 });
      const policy = new Map(loadRoutes(fixture).map((r) => [r.id, r]));
      assert.equal(policy.get("allowed").analysisStatus, "ready");
      assert.equal(policy.get("map-only").analysisStatus, "disabled");
      assert.equal(policy.get("map-only").lapCount, 1);
      assert.equal(policy.get("no-height").analysisStatus, "missing");
      assert.equal(policy.get("gap").analysisStatus, "gaps");
      assert.equal(policy.get("untrusted").analysisStatus, "untrusted");
      assert.equal(policy.get("bad-laps").analysisStatus, "unavailable");
      for (const id of ["map-only", "download-only", "no-map-analysis", "details-only", "invalid", "missing", "trim-all", "no-height", "gap", "untrusted", "bad-laps"]) {
        assert.ok(!existsSync(path(id, "analysis.json")), id);
        assert.throws(() => analysisPayload(policy.get(id)));
        assert.ok(!JSON.stringify(analysisSummary(policy.get(id))).includes('"segments"'));
      }
      assertGeneratedAnalysis(fixture);
      writeFileSync(path("map-only", "analysis.json"), JSON.stringify(profile));
      assert.throws(() => assertGeneratedAnalysis(fixture));
      rmSync(path("map-only", "analysis.json"));
      assert.match(download, /<name>Маратон Кайлъка 2026 – 21,1 км<\/name>/);
      assert.match(read("allowed", "index.html"), /download="maraton-kaylaka-2026-21km.gpx"/);
      const headers = readFileSync(join(output, "_headers"), "utf8");
      assert.match(headers, /\/allowed\/trace.gpx\n[^\n]*\n  Content-Disposition: attachment; filename="maraton-kaylaka-2026-21km.gpx"/);
      assert.doesNotMatch(headers, /map-only|unapproved|MarathonKaylaka21km/);
      assert.ok(!existsSync(path("MarathonKaylaka21km.gpx", "trace.gpx")));
      assert.match(read("allowed", "index.html"), /Изтегли GPX/);
      assert.match(
        read("allowed", "index.html"),
        /Началният и\/или крайният участък са премахнати/,
      );
      assert.ok(existsSync(path("map-only", "map.json")));
      assert.ok(!existsSync(path("map-only", "trace.gpx")));
      assert.match(read("map-only", "index.html"), /технически достъпни/);
      assert.ok(!existsSync(path("download-only", "map.json")));
      assert.ok(existsSync(path("download-only", "trace.gpx")));
      for (const id of ["details-only", "invalid", "missing", "trim-all"]) {
        assert.ok(existsSync(path(id, "index.html")));
        assert.ok(!existsSync(path(id, "map.json")));
        assert.ok(!existsSync(path(id, "trace.gpx")));
      }
      for (const id of ["draft", "unapproved"])
        assert.ok(!existsSync(join(output, "byagane/marshruti", id)));
      for (const file of walk(output)) {
        const content = readFileSync(file, "utf8");
        for (const forbidden of [
          "SOURCE_PRIVATE_MARKER",
          "0.001111",
          "0.002222",
          "0.008888",
          "0.009999",
          "0.99999",
          "2099-01-01T00:00:00Z",
          "/gpx-source/",
          "original.gpx",
          "НЕПУБЛИКУВАНО СЪСТЕЗАНИЕ",
        ])
          assert.ok(
            !content.includes(forbidden),
            `${file}: leaked ${forbidden}`,
          );
        if (!file.endsWith(".html")) continue;
        const base = new URL(
          "/" + file.slice(output.length + 1).replace(/index\.html$/, ""),
          "https://test.invalid",
        );
        for (const match of content.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const url = new URL(match[1].replaceAll("&amp;", "&"), base);
          if (url.origin !== base.origin) continue;
          let target = join(output, decodeURIComponent(url.pathname));
          if (existsSync(target) && statSync(target).isDirectory())
            target = join(target, "index.html");
          assert.ok(existsSync(target), `${file}: broken ${match[1]}`);
          if (url.hash && target.endsWith(".html"))
            assert.ok(
              readFileSync(target, "utf8").includes(
                `id="${decodeURIComponent(url.hash.slice(1))}"`,
              ),
            );
        }
      }
      const racePage = readFileSync(
        join(output, "byagane/sastezaniya/index.html"),
        "utf8",
      );
      assert.match(racePage, /Синтетично бъдещо състезание/);
      assert.match(racePage, /Тестов резултат/);
      assert.match(racePage, /Тестово класиране/);
      const cropPage = readFileSync(
        join(output, "posts/crop-test/index.html"),
        "utf8",
      );
      assert.match(
        cropPage,
        /--image-fit:cover;--image-x:25%;--image-y:10%;--image-mobile-fit:contain/,
      );
      assert.match(cropPage, /--image-fit:contain/);
      const loaded = loadRoutes(fixture).find(
        (route) => route.id === "allowed",
      );
      assert.ok(loaded.distanceM > 0);
      assert.equal(loaded.ascentM, 20);
      writeRoute("allowed", { publishMap: false, allowDownload: false });
      renameSync(join(fixture, "src/content/routes/retired.json"), join(fixture, "src/content/routes/retired.gpx.json"));
      build();
      assert.ok(!existsSync(path("retired", "index.html")));
      assert.ok(!existsSync(path("retired", "trace.gpx")));
      assert.ok(!existsSync(path("allowed", "trace.gpx")));
      assert.ok(!existsSync(path("allowed", "map.json")));
      assert.ok(!existsSync(path("allowed", "analysis.json")));
      assert.ok(!read("allowed", "index.html").includes("trace.gpx"));
      assert.doesNotMatch(readFileSync(join(output, "_headers"), "utf8"), /\/allowed\//);
      // A bad public upload must fail the build and remove any previously built output.
      writeFileSync(join(fixture, "public/unsafe.gpx"), source);
      assert.throws(build);
      assert.ok(!existsSync(path("download-only", "trace.gpx")));
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  },
);
