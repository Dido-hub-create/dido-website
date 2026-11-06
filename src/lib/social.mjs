import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { normalizeImage } from "./content-utils.mjs";
import { xmlText } from "./download-name.mjs";

export function publicOrigin(value) {
  try {
    const url = new URL(typeof value === "string" ? value.trim() : "");
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.pathname !== "/" || url.search || url.hash || !host.includes(".") ||
        /^[\d.]+$/.test(host) || host.includes(":") ||
        /(?:^|\.)(?:localhost|local|test|invalid|example|github\.dev|githubpreview\.dev|gitpod\.io)$/.test(host) ||
        /^(?:www\.)?example\.(?:com|org|net)$/.test(host)) return undefined;
    return url.origin;
  } catch { return undefined; }
}

export function absolutePublicUrl(path, origin) {
  if (!origin || typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return undefined;
  const url = new URL(path, origin);
  return url.origin === origin ? url.href : undefined;
}

// No remote fetches, automatic cropping or reading outside public/images.
// Generated assets live only in dist; source photographs are never modified.
const pending = new Map();
export const clearSocialImages = () => pending.clear();
export async function socialImage(image, settings, root = process.cwd()) {
  let buffer;
  for (const candidate of [image, settings.socialImage]) {
    const source = normalizeImage(typeof candidate === "string" ? candidate : "");
    if (!source?.startsWith("/images/") || !/\.(?:jpe?g|png|webp|avif)$/i.test(source)) continue;
    try {
      const file = resolve(root, "public", decodeURIComponent(source.slice(1)));
      if (existsSync(file) && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 25 * 1024 * 1024) {
        const candidateBuffer = readFileSync(file);
        const info = await sharp(candidateBuffer, { limitInputPixels: 40_000_000 }).metadata();
        if (["jpeg", "png", "webp", "avif", "heif"].includes(info.format)) { buffer = candidateBuffer; break; }
      }
    } catch { /* Use a generated site card for missing/invalid local images. */ }
  }
  if (!buffer) {
    const name = xmlText((settings.siteName || "DIDO").slice(0, 40));
    const subtitle = xmlText((settings.siteSubtitle || "Личен сайт").slice(0, 70));
    buffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#101827"/><path d="M80 440Q530 370 1120 430" stroke="#f58a36" stroke-width="14" fill="none"/><text x="80" y="300" font-family="sans-serif" font-size="${name.length > 18 ? 42 : 84}" font-weight="700" fill="#f4f6fa">${name}</text><text x="80" y="385" font-family="sans-serif" font-size="32" fill="#e0e5ec">${subtitle}</text></svg>`);
  }
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
  const path = `/social/${hash}.jpg`, output = resolve(root, "dist", path.slice(1));
  if (!pending.has(output)) {
    const promise = (async () => {
      mkdirSync(resolve(root, "dist/social"), { recursive: true });
      try {
        await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate()
          .resize(1200, 630, { fit: "contain", background: "#101827" }).flatten({ background: "#101827" })
          .jpeg({ quality: 86 }).toFile(output);
      } catch {
        throw new Error("Резервното изображение за споделяне не може да се създаде.");
      }
      return { path, width: 1200, height: 630 };
    })();
    pending.set(output, promise);
  }
  return pending.get(output);
}
