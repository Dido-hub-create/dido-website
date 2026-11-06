import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
const output = resolve("dist");
const read = (path) => readFileSync(join(output, path), "utf8");
const oldPost = "posts/2026-11-06-moyata-purva-probna-publikaciya/index.html";

test("all requested pages are generated as Bulgarian static HTML", () => {
  for (const page of [
    "index.html",
    "byagane/index.html",
    "tehnologii/index.html",
    "polezno/index.html",
    "za-men/index.html",
    "finansi/index.html",
    "404.html",
    oldPost,
  ]) {
    const html = read(page);
    assert.match(html, /<html lang="bg"/);
    assert.match(html, /<title>[^<]*DIDO[^<]*<\/title>/);
  }
});
test("existing article retains its text, cover, inline photo and gallery", () => {
  const html = read(oldPost);
  assert.match(html, /Моята първа пробна публикация/);
  assert.match(html, /Това е първата публикация/);
  for (const name of [
    "IMG-4a64148048c44ebcb450fa03afe7d8c7-V-1.jpg",
    "IMG-39abdac7b2b4087b8449eee5b19e537e-V.jpg",
    "IMG-76dcf8302e6b897299ac8f9aafe90daf-V.jpg",
  ])
    assert.ok(html.includes(`/images/${name}`), name);
  assert.match(html, /data-gallery-image/);
  assert.doesNotMatch(
    html,
    /<time /,
    "the date is not invented for an old article without a date field",
  );
  assert.match(read("index.html"), /Моята първа пробна публикация/);
  assert.match(read("polezno/index.html"), /Моята първа пробна публикация/);
});
test("every generated local link, image, stylesheet, script and fragment has a target", () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) =>
      statSync(join(dir, name)).isDirectory()
        ? walk(join(dir, name))
        : [join(dir, name)],
    );
  for (const file of walk(output).filter((file) => file.endsWith(".html"))) {
    const html = readFileSync(file, "utf8");
    const base = new URL(
      file.slice(output.length) === "/index.html"
        ? "/"
        : file.slice(output.length).replace(/index\.html$/, ""),
      "https://dido.invalid",
    );
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(match[1].replaceAll("&amp;", "&"), base);
      if (url.origin !== base.origin) continue;
      let target = join(output, decodeURIComponent(url.pathname));
      if (existsSync(target) && statSync(target).isDirectory())
        target = join(target, "index.html");
      assert.ok(existsSync(target), `${file}: missing ${match[1]}`);
      if (url.hash && target.endsWith(".html")) {
        const fragment = decodeURIComponent(url.hash.slice(1));
        assert.ok(
          readFileSync(target, "utf8").includes(`id="${fragment}"`),
          `missing #${fragment} in ${target}`,
        );
      }
    }
  }
});
test("only the confirmed running result is shown and apps have no pretend launch links", () => {
  const html = read("index.html");
  assert.match(html, /2:07:14/);
  assert.equal((html.match(/<small>Предстои<\/small>/g) ?? []).length, 3);
  assert.equal((html.match(/Планирано<\/span>/g) ?? []).length, 4);
  assert.doesNotMatch(html, /href="#"/);
});
