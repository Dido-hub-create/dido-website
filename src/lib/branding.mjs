import { existsSync, lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSiteSettings } from "./site-settings.mjs";
import { normalizeImage } from "./content-utils.mjs";

export const DEFAULT_LOGO = "/branding/logo-dido-runner-b.svg";

/** Resolve the bundled mark or the existing CMS override without changing data. */
export function brandPresentation(settings, root = process.cwd()) {
  const config = normalizeSiteSettings(settings);
  let src;
  if (config.useImageLogo) {
    const candidate = config.logoImage.trim();
    const image = candidate ? normalizeImage(candidate) : DEFAULT_LOGO;
    if (image?.startsWith("https://")) src = image;
    else if (image) {
      try {
        const file = resolve(root, "public", decodeURIComponent(image.slice(1)));
        if (existsSync(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file) src = image;
      } catch { /* Missing/invalid local images use the text wordmark. */ }
    }
  }
  return {
    src,
    name: config.siteName,
    alt: config.headerLogoAlt.trim() || config.siteName,
    desktopWidth: config.headerLogoWidthDesktop,
    mobileWidth: config.headerLogoWidthMobile,
  };
}
