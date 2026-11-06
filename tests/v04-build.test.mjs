import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

test("static builds integrate videos, home references, race pages and explicit social origins without leaking drafts", { timeout: 90000 }, async () => {
  const source = resolve("."), fixture = mkdtempSync(join(tmpdir(), "dido-v04-build-"));
  const image = "/images/IMG-4a64148048c44ebcb450fa03afe7d8c7-V-1.jpg";
  const origin = "https://dido-v04-fixture.pages.dev";
  const title = "Синтетична дълга история за проверка на пренасянето — " + "бягане и любопитство ".repeat(5);
  try {
    for (const entry of ["src", "public", "package.json", "tsconfig.json", "astro.config.mjs"]) cpSync(join(source, entry), join(fixture, entry), { recursive: true });
    symlinkSync(join(source, "node_modules"), join(fixture, "node_modules"), "dir");
    const write = (path, value) => writeFileSync(join(fixture, path), typeof value === "string" ? value : JSON.stringify(value));
    const settingsPath = "src/data/site.json", settings = JSON.parse(readFileSync(join(fixture, settingsPath), "utf8"));
    const writePost = (id, extra) => write(`src/content/posts/${id}.md`, `---\ntitle: ${id === "v04-featured" ? title : id}\nstatus: published\ncover: ${image}\ncategory: Бягане\n${extra}\n---\n**Синтетичен тест**, без промени по оригиналните статии.`);
    writePost("v04-featured", "description: Синтетично описание за Open Graph\nvideo: src/content/videos/lead.json");
    writePost("v04-direct", "youtubeUrl: https://www.youtube.com/shorts/B1b2C3d4E5_");
    writePost("v04-hidden-video", "video: src/content/videos/draft.json\nyoutubeUrl: https://youtu.be/B1b2C3d4E5_");
    mkdirSync(join(fixture, "src/content/videos"), { recursive: true });
    const writeVideo = (id, values = {}) => write(`src/content/videos/${id}.json`, { title: "Синтетично видео " + id + " — " + "дълго заглавие ".repeat(5), url: "https://youtu.be/A1b2C3d4E5_", description: "Описание за изолиран тест.", status: "published", cover: image, ...values });
    writeVideo("lead", { featured: true, order: 100 });
    for (const [index, id] of ["first", "second", "third", "overflow"].entries()) writeVideo(id, { order: index });
    writeVideo("draft", { status: "draft", featured: true, order: -1, title: "HIDDEN_VIDEO_MARKER" });
    writeVideo("invalid", { url: "https://evil.test/embed/123", title: "INVALID_VIDEO_MARKER" });
    Object.assign(settings, { publicSiteUrl: origin, youtubeChannel: "https://www.youtube.com/@synthetic-fixture", home: {
      ...settings.home, title: "Начало — " + "дълго заглавие ".repeat(8),
      featuredPost: "src/content/posts/v04-featured.md", selectedPosts: ["v04-featured", "v04-direct", "v04-direct", "deleted"],
      race: "src/content/races/kaylakamarathon2026.json", raceCaption: "Синтетичен акцент за проверка.",
    } });
    write(settingsPath, settings);
    const build = (publicUrl = "") => execFileSync(process.execPath, [join(source, "node_modules/astro/bin/astro.mjs"), "build"], {
      cwd: fixture, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", PUBLIC_SITE_URL: publicUrl, CF_PAGES_URL: "https://transient-preview.pages.dev" }, stdio: "pipe",
    });
    build();
    if (process.env.DIDO_BROWSER_FIXTURE) {
      rmSync(process.env.DIDO_BROWSER_FIXTURE, { recursive: true, force: true });
      cpSync(fixture, process.env.DIDO_BROWSER_FIXTURE, { recursive: true });
    }
    const page = (path) => readFileSync(join(fixture, "dist", path), "utf8");
    const meta = (html, name) => html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`))?.[1];
    const home = page("index.html"), running = page("byagane/index.html"), post = page("posts/v04-featured/index.html");
    assert.ok(home.includes(title.trim()));
    assert.equal((home.match(/<h3><a href="\/posts\/v04-featured\/"/g) ?? []).length, 1);
    assert.equal((home.match(/<h3><a href="\/posts\/v04-direct\/"/g) ?? []).length, 1);
    assert.match(home, /Синтетичен акцент за проверка/);
    assert.match(home, /href="\/byagane\/sastezaniya\/kaylakamarathon2026\/"/);
    assert.equal((running.match(/<article[^>]*data-video-card/g) ?? []).length, 4);
    assert.ok(running.indexOf("Синтетично видео lead") < running.indexOf("Синтетично видео first"));
    assert.ok(running.indexOf('id="predstoyashti-sastezaniya"') < running.indexOf('id="moite-videa"'));
    assert.ok(running.indexOf('id="moite-videa"') < running.indexOf('id="moite-marshruti"'));
    assert.doesNotMatch(running, /<iframe|HIDDEN_VIDEO_MARKER|INVALID_VIDEO_MARKER|Синтетично видео overflow/);
    assert.match(running, /Виж всички видеа в YouTube/);
    assert.match(post, /data-video-id="A1b2C3d4E5_"/);
    assert.match(page("posts/v04-direct/index.html"), /data-video-id="B1b2C3d4E5_"/);
    assert.doesNotMatch(page("posts/v04-hidden-video/index.html"), /<article[^>]*data-video-card/);
    assert.equal(meta(post, "og:description"), "Синтетично описание за Open Graph");
    assert.equal(meta(post, "og:type"), "article");
    for (const path of ["index.html", "byagane/index.html", "posts/v04-featured/index.html", "byagane/sastezaniya/kaylakamarathon2026/index.html", "byagane/marshruti/kaylaka-21km-2026/index.html"]) {
      const html = page(path);
      assert.ok(meta(html, "og:title")); assert.ok(meta(html, "og:description"));
      assert.ok(meta(html, "og:url").startsWith(origin + "/"));
      const shareImage = meta(html, "og:image");
      assert.ok(shareImage.startsWith(origin + "/social/"));
      const metadata = await sharp(join(fixture, "dist", new URL(shareImage).pathname)).metadata();
      assert.equal(metadata.width, 1200); assert.equal(metadata.height, 630);
      assert.equal(meta(html, "twitter:card"), "summary_large_image");
      assert.match(html, /data-copy-link/);
      assert.doesNotMatch(html, /transient-preview\.pages\.dev|github\.dev/);
    }
    const gpx = page("byagane/marshruti/kaylaka-21km-2026/trace.gpx");
    assert.match(gpx, /<name>Маратон Кайлъка 2026 – 21,1 км<\/name>/);
    assert.match(page("_headers"), /maraton-kaylaka-2026-21km.gpx/);
    assert.match(page("posts/2026-11-06-moyata-purva-probna-publikaciya/index.html"), /Това е първата публикация/);
    // A stale featured reference falls back to a published post; an unpublished
    // video/race must disappear even when saved references still exist.
    write("src/content/posts/v04-featured.md", "---\ntitle: PRIVATE_DRAFT_POST\nstatus: draft\n---\nPRIVATE_DRAFT_BODY");
    writeVideo("lead", { status: "draft" });
    const racePath = "src/content/races/kaylakamarathon2026.json";
    write(racePath, { ...JSON.parse(readFileSync(join(fixture, racePath), "utf8")), publicationStatus: "draft" });
    build("https://dido-deploy-fixture.pages.dev");
    const secondHome = page("index.html");
    assert.doesNotMatch(secondHome, /PRIVATE_DRAFT|v04-featured|Синтетичен акцент за проверка/);
    assert.match(secondHome, /Избрани истории/);
    assert.equal(meta(secondHome, "og:url"), "https://dido-deploy-fixture.pages.dev/");
    assert.ok(!existsSync(join(fixture, "dist/posts/v04-featured")));
    assert.ok(!existsSync(join(fixture, "dist/byagane/sastezaniya/kaylakamarathon2026")));
    assert.doesNotMatch(page("byagane/index.html"), /Синтетично видео lead/);
    settings.publicSiteUrl = ""; write(settingsPath, settings);
    build();
    assert.equal(meta(page("index.html"), "og:url"), undefined);
    assert.equal(meta(page("index.html"), "og:image"), undefined);
    assert.doesNotMatch(page("index.html"), /data-share-tools|rel="canonical"|transient-preview/);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
