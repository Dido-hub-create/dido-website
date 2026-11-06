import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { youtubeVideoId, youtubeChannelUrl, loadVideos, postVideo } from "../src/lib/videos.mjs";
import { homeContent } from "../src/lib/home.mjs";
import { publicOrigin, absolutePublicUrl, socialImage, clearSocialImages } from "../src/lib/social.mjs";
import { validateCms } from "../scripts/validate-cms.mjs";

const id = "A1b2C3d4E5_";
test("YouTube parser accepts standard HTTPS links and rejects arbitrary embeds, injection and ambiguous IDs", () => {
  for (const url of [`https://youtube.com/watch?v=${id}`, `https://www.youtube.com/watch?v=${id}&t=30`, `https://m.youtube.com/watch?v=${id}`, `https://youtu.be/${id}?si=test`, `https://www.youtube.com/shorts/${id}`]) assert.equal(youtubeVideoId(url), id, url);
  for (const url of [undefined, "", id, `http://youtu.be/${id}`, `javascript:alert(1)`, `https://youtube.com.evil.test/watch?v=${id}`, `https://youtube.com@evil.test/watch?v=${id}`, `https://evil@youtube.com/watch?v=${id}`, `https://youtube.com:8443/watch?v=${id}`, `https://youtube-nocookie.com/embed/${id}`, `https://youtube.com/embed/${id}`, `https://youtube.com/watch?v=${id}&v=${id}`, `https://youtu.be/${id}/extra`, `https://youtu.be/${id}%22`, "https://youtu.be/too-short", '<iframe src="https://youtube.com"></iframe>']) assert.equal(youtubeVideoId(url), undefined, url);
  assert.equal(youtubeChannelUrl("https://www.youtube.com/@synthetic-fixture/videos?si=test"), "https://www.youtube.com/@synthetic-fixture/videos");
  for (const url of ["https://youtu.be/" + id, "https://youtube.com/watch?v=" + id, "https://evil.test/@channel", "javascript:alert(1)", "https://youtube.com/@safe/../../redirect"]) assert.equal(youtubeChannelUrl(url), undefined);
});

test("only valid published videos are selected; featured/order sorting is deterministic and hidden references stay hidden", () => {
  const root = mkdtempSync(join(tmpdir(), "dido-video-unit-"));
  try {
    mkdirSync(join(root, "src/content/videos"), { recursive: true });
    for (const [name, values] of Object.entries({ later: { order: 20 }, first: { order: 1 }, lead: { featured: true, order: 50 }, draft: { status: "draft", featured: true } })) {
      writeFileSync(join(root, "src/content/videos", `${name}.json`), JSON.stringify({ title: "Synthetic video", url: `https://youtu.be/${id}`, status: "published", ...values }));
    }
    const videos = loadVideos(root);
    assert.deepEqual(videos.map((video) => video.id), ["lead", "first", "later"]);
    assert.equal(postVideo({ video: "src/content/videos/lead.json" }, videos).videoId, id);
    assert.equal(postVideo({ video: "src/content/videos/draft.json", youtubeUrl: `https://youtu.be/${id}` }, videos), undefined);
    assert.equal(postVideo({ video: "missing" }, videos), undefined);
    assert.equal(postVideo({ youtubeUrl: `https://youtube.com/shorts/${id}`, title: "Synthetic post" }, videos).title, "Synthetic post");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("home references use published entries, preserve order without duplicates and fall back safely", () => {
  const posts = [{ id: "newest", marker: 1 }, { id: "selected", marker: 2 }, { id: "third", marker: 3 }];
  const home = homeContent({ home: { featuredPost: "src/content/posts/deleted.md", selectedPosts: ["newest", "selected", "selected", "missing", "third"], race: "src/content/races/visible.json", raceCaption: "A real caption" } }, posts, [{ id: "visible" }]);
  assert.equal(home.featured, posts[0]);
  assert.deepEqual(home.selected, posts.slice(1));
  assert.deepEqual(home.remainingPosts, []);
  assert.equal(home.race.id, "visible");
  const defaults = homeContent({ homeIntro: "Existing intro", heroImage: "/images/existing.jpg" }, posts, []);
  assert.equal(defaults.featured, undefined);
  assert.deepEqual(defaults.remainingPosts, posts);
  assert.equal(defaults.intro, "Existing intro");
  assert.equal(homeContent({ home: { featuredPost: "deleted", race: "draft" } }, [], []).featured, undefined);
  assert.equal(homeContent({ home: { race: "draft" } }, posts, []).race, undefined);
});

test("canonical URLs require an explicit public HTTPS origin and never derive a Codespaces host", () => {
  for (const value of ["", undefined, "http://dido.pages.dev", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://demo.app.github.dev", "https://demo.githubpreview.dev", "https://example.org", "https://host.test", "https://user:pass@dido.pages.dev", "https://dido.pages.dev/path", "https://dido.pages.dev?x=1", "https://dido.pages.dev/#fragment"]) assert.equal(publicOrigin(value), undefined, value);
  const origin = publicOrigin("https://dido-v04-fixture.pages.dev/");
  assert.equal(origin, "https://dido-v04-fixture.pages.dev");
  assert.equal(absolutePublicUrl("/posts/article/", origin), origin + "/posts/article/");
  assert.equal(absolutePublicUrl("//evil.test", origin), undefined);
  assert.equal(absolutePublicUrl("/\\evil.test", origin), undefined);
});

test("social derivatives contain the entire photograph at 1200x630 and strip EXIF; unsafe sources use the site card", async () => {
  const root = mkdtempSync(join(tmpdir(), "dido-social-unit-"));
  try {
    mkdirSync(join(root, "public/images"), { recursive: true });
    // Synthetic square with a colored edge: contain must keep the edge visible.
    const original = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).jpeg().toBuffer();
    writeFileSync(join(root, "public/images/photo.jpg"), original);
    symlinkSync(join(root, "public/images/photo.jpg"), join(root, "public/images/link.jpg"));
    const card = await socialImage("/images/photo.jpg", {}, root);
    const file = join(root, "dist", card.path);
    const info = await sharp(file).metadata();
    assert.equal(info.width, 1200); assert.equal(info.height, 630); assert.equal(info.exif, undefined);
    assert.deepEqual(readFileSync(join(root, "public/images/photo.jpg")), original);
    const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x, y) => [...data.subarray((y * 1200 + x) * 3, (y * 1200 + x) * 3 + 3)];
    assert.ok(pixel(290, 315)[0] > 240, "left image edge remains visible");
    assert.ok(pixel(909, 315)[0] > 240, "right image edge remains visible");
    assert.ok(pixel(0, 315)[0] < 40, "padding rather than cropping");
    const fallback = await socialImage(undefined, { siteName: "DIDO" }, root);
    for (const unsafe of ["/images/link.jpg", "/images/../secret.jpg", "https://remote.invalid/image.jpg", "/images/missing.jpg"])
      assert.equal((await socialImage(unsafe, { siteName: "DIDO" }, root)).path, fallback.path);
  } finally { clearSocialImages(); rmSync(root, { recursive: true, force: true }); }
});

test("CMS exposes videos, post links and home selections without requiring code or iframe input", () => {
  const cms = validateCms(readFileSync(".pages.yml", "utf8"));
  const collection = (name) => cms.content.find((item) => item.name === name);
  const video = collection("videos");
  assert.equal(video.fields.find((item) => item.name === "status").default, "draft");
  assert.equal(video.fields.find((item) => item.name === "featured").default, false);
  assert.equal(collection("posts").fields.find((item) => item.name === "video").options.collection, "videos");
  const home = collection("site").fields.find((item) => item.name === "home");
  assert.equal(home.fields.find((item) => item.name === "selectedPosts").list.max, 3);
  assert.equal(home.fields.find((item) => item.name === "race").options.collection, "races");
});
