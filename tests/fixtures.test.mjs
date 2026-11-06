import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

test(
  "a fresh build handles empty fields, missing images, dated articles and drafts without changing real content",
  { timeout: 60000 },
  () => {
    const root = resolve(".");
    const fixtureRoot = mkdtempSync(join(tmpdir(), "dido-content-"));
    try {
      for (const entry of [
        "src",
        "public",
        "package.json",
        "tsconfig.json",
        "astro.config.mjs",
      ])
        cpSync(join(root, entry), join(fixtureRoot, entry), {
          recursive: true,
        });
      symlinkSync(
        join(root, "node_modules"),
        join(fixtureRoot, "node_modules"),
        "dir",
      );
      const fixture = (name, value) =>
        writeFileSync(
          join(fixtureRoot, "src/content/posts", `${name}.md`),
          value,
        );
      fixture(
        "qa-empty",
        "---\ntitle: Празни полета\ncover:\ngallery:\ncategory:\ndescription:\ndate:\nstatus:\n---\nТекст без допълнителни данни.",
      );
      fixture(
        "qa-missing",
        "---\ntitle: Липсващи снимки\ncover: /images/missing.jpg\ngallery:\n  - /images/missing.jpg\n---\nСъдържание.",
      );
      fixture(
        "qa-dated",
        "---\ntitle: Ново състезание\ncategory: Бягане\ntopic: Състезания\ndate: 2026-11-06\nstatus: published\ncover: public/images/IMG-4a64148048c44ebcb450fa03afe7d8c7-V-1.jpg\n---\n**Форматиран** български текст.",
      );
      fixture(
        "qa-draft",
        "---\ntitle: Скрито съдържание\nstatus: draft\n---\nТова не трябва да се публикува.",
      );
      fixture(
        "qa-old-draft",
        "---\ntitle: Стара чернова\ndraft: true\n---\nСкрита публикация.",
      );
      execFileSync(
        process.execPath,
        [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
        {
          cwd: fixtureRoot,
          env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
          stdio: "pipe",
        },
      );
      const page = (name) =>
        readFileSync(join(fixtureRoot, "dist", name), "utf8");
      assert.match(
        page("posts/qa-empty/index.html"),
        /Текст без допълнителни данни/,
      );
      assert.doesNotMatch(
        page("posts/qa-empty/index.html"),
        /undefined|null|Invalid Date|<time /,
      );
      assert.doesNotMatch(
        page("posts/qa-missing/index.html"),
        /src="\/images\/missing.jpg"|article-gallery/,
      );
      assert.match(
        page("posts/qa-dated/index.html"),
        /<strong>Форматиран<\/strong>/,
      );
      assert.match(
        page("posts/qa-dated/index.html"),
        /datetime="2026-11-06T00:00:00.000Z"/,
      );
      assert.match(
        page("posts/qa-dated/index.html"),
        /src="\/images\/IMG-4a64148048c44ebcb450fa03afe7d8c7-V-1.jpg"/,
      );
      assert.match(page("byagane/index.html"), /Ново състезание/);
      assert.ok(!existsSync(join(fixtureRoot, "dist/posts/qa-draft")));
      assert.ok(!existsSync(join(fixtureRoot, "dist/posts/qa-old-draft")));
      assert.doesNotMatch(
        page("index.html"),
        /Скрито съдържание|Стара чернова/,
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  },
);
