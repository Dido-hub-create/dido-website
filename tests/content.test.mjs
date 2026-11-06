import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryFor,
  isPublished,
  normalizeImage,
  excerpt,
} from "../src/lib/content-utils.mjs";

test("legacy posts without metadata stay published and belong to Полезно", () => {
  assert.equal(isPublished({}), true);
  assert.equal(categoryFor(undefined).label, "Полезно");
  assert.equal(categoryFor("Бягане").slug, "byagane");
  assert.equal(categoryFor("finansi").label, "Финанси");
  assert.equal(categoryFor("Непознат раздел").slug, "polezno");
});
test("drafts are excluded regardless of the legacy or CMS status field", () => {
  assert.equal(isPublished({ draft: true }), false);
  assert.equal(isPublished({ status: "draft" }), false);
  assert.equal(isPublished({ status: "Чернова" }), false);
  assert.equal(isPublished({ status: "published" }), true);
});
test("CMS image paths are normalized; invalid schemes and traversal are rejected", () => {
  assert.equal(normalizeImage("/images/снимка.jpg"), "/images/снимка.jpg");
  assert.equal(normalizeImage("public/images/photo.jpg"), "/images/photo.jpg");
  assert.equal(normalizeImage("/public/images/photo.jpg"), "/images/photo.jpg");
  assert.equal(normalizeImage("images/photo.jpg"), "/images/photo.jpg");
  assert.equal(
    normalizeImage("https://example.org/photo.jpg"),
    "https://example.org/photo.jpg",
  );
  for (const value of [
    null,
    "",
    " ",
    "javascript:alert(1)",
    "/images/../secret",
    "//example.org/photo.jpg",
  ])
    assert.equal(normalizeImage(value), undefined);
});
test("card excerpts keep Bulgarian text and remove Markdown images and formatting", () => {
  assert.equal(
    excerpt(
      "# Заглавие\n\nТекст със **смисъл** и [връзка](/polezno/).\n![](/images/a.jpg)",
    ),
    "Заглавие Текст със смисъл и връзка.",
  );
  assert.equal(excerpt("![](/images/a.jpg)"), "");
  assert.equal(excerpt("д".repeat(200)).length, 168);
});
