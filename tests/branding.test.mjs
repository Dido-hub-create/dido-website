import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { SyntaxValidator } from "fast-xml-validator";
import { normalizeSiteSettings } from "../src/lib/site-settings.mjs";
import { brandPresentation, DEFAULT_LOGO } from "../src/lib/branding.mjs";
import { siteIdentity } from "../src/lib/site.mjs";
import { validateCms } from "../scripts/validate-cms.mjs";

test("branding defaults and CMS widths remain safe when optional settings are omitted or invalid", () => {
  const defaults = normalizeSiteSettings({});
  assert.equal(defaults.useImageLogo, true);
  assert.equal(defaults.headerLogoWidthDesktop, 128);
  assert.equal(defaults.headerLogoWidthMobile, 108);
  const bounded = normalizeSiteSettings({ useImageLogo: false, headerLogoWidthDesktop: -500, headerLogoWidthMobile: 10000 });
  assert.equal(bounded.useImageLogo, false);
  assert.equal(bounded.headerLogoWidthDesktop, 96);
  assert.equal(bounded.headerLogoWidthMobile, 128);
  for (const value of [null, Infinity, NaN, "120;display:none"]) {
    const normalized = normalizeSiteSettings({ headerLogoWidthDesktop: value, headerLogoWidthMobile: value });
    assert.equal(normalized.headerLogoWidthDesktop, 128);
    assert.equal(normalized.headerLogoWidthMobile, 108);
  }
  assert.equal(normalizeSiteSettings({ siteName: "Existing", siteTitle: " New title " }).siteName, "New title");
  assert.equal(normalizeSiteSettings({ siteName: "Existing", siteTitle: " " }).siteName, "Existing");
  assert.equal(siteIdentity({ siteName: "Existing", siteTitle: "New title" }).name, "New title");
});

test("missing or disabled logos use text; uploaded logos and existing site names remain supported", () => {
  const root = mkdtempSync(join(tmpdir(), "dido-brand-"));
  try {
    mkdirSync(join(root, "public/branding"), { recursive: true });
    mkdirSync(join(root, "public/images"), { recursive: true });
    const bundled = join(root, "public", DEFAULT_LOGO);
    writeFileSync(bundled, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeFileSync(join(root, "public/images/custom.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    assert.equal(brandPresentation({}, root).src, DEFAULT_LOGO);
    assert.equal(brandPresentation({ useImageLogo: false }, root).src, undefined);
    assert.equal(brandPresentation({ logoImage: "/images/custom.svg" }, root).src, "/images/custom.svg");
    for (const logoImage of ["/images/missing.svg", "/images/../secret.svg", "javascript:alert(1)"])
      assert.equal(brandPresentation({ logoImage }, root).src, undefined);
    symlinkSync(bundled, join(root, "public/images/link.svg"));
    assert.equal(brandPresentation({ logoImage: "/images/link.svg" }, root).src, undefined);
    const custom = brandPresentation({ siteName: "Existing", headerLogoAlt: " Runner logo " }, root);
    assert.equal(custom.alt, "Runner logo");
    assert.equal(custom.name, "Existing");
    rmSync(bundled);
    assert.equal(brandPresentation({}, root).src, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the logo and favicon are standalone vectors with matching PNG fallbacks", async () => {
  for (const path of ["public/branding/logo-dido-runner.svg", "public/favicon.svg"]) {
    const svg = readFileSync(path, "utf8");
    SyntaxValidator.validate(svg);
    assert.match(svg, /<path/);
    assert.match(svg, /#ff8510/);
    assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bon(?:load|error)=|\bhref=|<text\b/);
  }
  assert.match(readFileSync("public/branding/logo-dido-runner.svg", "utf8"), /viewBox="0 0 2030 620"/);
  for (const [path, size] of [["public/branding/favicon-32.png", 32], ["public/branding/apple-touch-icon.png", 180]]) {
    const meta = await sharp(path).metadata();
    assert.equal(meta.width, size); assert.equal(meta.height, size);
  }
});

test("CMS offers the five simple branding controls without requiring them in JSON", () => {
  const config = validateCms(readFileSync(".pages.yml", "utf8"));
  const fields = config.content.find((item) => item.name === "site").fields;
  for (const name of ["siteTitle", "headerLogoAlt", "useImageLogo", "headerLogoWidthDesktop", "headerLogoWidthMobile"]) {
    const field = fields.find((item) => item.name === name);
    assert.ok(field, name);
    assert.notEqual(field.required, true);
  }
  assert.equal(fields.find((field) => field.name === "useImageLogo").default, true);
  assert.equal(fields.find((field) => field.name === "headerLogoWidthMobile").options.max, 128);
});

test("runner alternatives preserve the exact Dido outlines and canvas without selecting a default", () => {
  const original = readFileSync("public/branding/logo-dido-runner.svg", "utf8");
  const whitePaths = (svg) => svg.match(/<g fill="#f5f7fa">[\s\S]*?<\/g>/)?.[0];
  assert.ok(whitePaths(original));
  for (const [variant, scale] of [["a", "1.38"], ["b", "1.75"]]) {
    const svg = readFileSync(`public/branding/logo-dido-runner-${variant}.svg`, "utf8");
    SyntaxValidator.validate(svg);
    assert.equal(whitePaths(svg), whitePaths(original), "letter shapes and their size are identical");
    assert.match(svg, /viewBox="0 0 2030 620" width="2030" height="620"/);
    assert.ok(svg.includes(`data-runner-scale="${scale}"`));
    assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bon(?:load|error)=|\bhref=/);
  }
  assert.equal(brandPresentation({}).src, DEFAULT_LOGO);
});
