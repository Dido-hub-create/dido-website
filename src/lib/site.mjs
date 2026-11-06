import rawSite from "../data/site.json" with { type: "json" };
import { normalizeImage } from "./content-utils.mjs";
import { normalizeSiteSettings } from "./site-settings.mjs";

export const site = normalizeSiteSettings(rawSite);

const label = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;
export function siteIdentity(settings = site) {
  return {
    name: label(settings.siteName, "DIDO"),
    subtitle: label(settings.siteSubtitle, "Личен сайт"),
    logo: normalizeImage(typeof settings.logoImage === "string" ? settings.logoImage : ""),
    navigation: [
      ["/", label(settings.navigation?.home, "Начало")],
      ["/byagane/", label(settings.navigation?.running, "Бягане")],
      ["/tehnologii/", label(settings.navigation?.technology, "Технологии")],
      ["/polezno/", label(settings.navigation?.useful, "Полезно")],
      ["/za-men/", label(settings.navigation?.about, "За мен")],
      ["/finansi/", label(settings.navigation?.finance, "Финанси")],
      ["/galeria/", label(settings.navigation?.gallery, "Галерия")],
    ],
  };
}
