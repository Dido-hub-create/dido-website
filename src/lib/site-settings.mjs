import { normalizeFrame } from "./images.mjs";

/** @param {unknown} value @returns {Record<string, unknown>} */
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  ? /** @type {Record<string, unknown>} */ (value) : {};
/** @param {unknown} value @param {string} fallback */
const text = (value, fallback = "") => typeof value === "string" ? value : fallback;
/** @param {unknown} value */
const frame = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  ? normalizeFrame(value) : undefined;
/** @param {unknown} value @param {number} fallback @param {number} min @param {number} max */
const logoWidth = (value, fallback, min, max) => typeof value === "number" && Number.isFinite(value)
  ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

/**
 * Pages CMS omits empty optional fields, including nested ones. Keep a stable
 * application shape independent of the keys present in the latest JSON save.
 * This is read-only: never insert defaults into the owner's content file.
 * @param {unknown} value
 */
export function normalizeSiteSettings(value) {
  const input = object(value), records = object(input.records);
  const navigation = object(input.navigation), home = object(input.home);
  return {
    siteName: text(input.siteTitle).trim() || text(input.siteName).trim() || "DIDO",
    siteTitle: text(input.siteTitle),
    siteSubtitle: text(input.siteSubtitle).trim() || "Личен сайт",
    logoImage: text(input.logoImage),
    headerLogoAlt: text(input.headerLogoAlt),
    useImageLogo: typeof input.useImageLogo === "boolean" ? input.useImageLogo : true,
    headerLogoWidthDesktop: logoWidth(input.headerLogoWidthDesktop, 128, 96, 160),
    headerLogoWidthMobile: logoWidth(input.headerLogoWidthMobile, 108, 88, 128),
    navigation: {
      home: text(navigation.home, "Начало"),
      running: text(navigation.running, "Бягане"),
      technology: text(navigation.technology, "Технологии"),
      useful: text(navigation.useful, "Полезно"),
      about: text(navigation.about, "За мен"),
      finance: text(navigation.finance, "Финанси"),
      gallery: text(navigation.gallery, "Галерия"),
    },
    homeIntro: text(input.homeIntro),
    heroImage: text(input.heroImage),
    heroFrame: frame(input.heroFrame),
    aboutIntro: text(input.aboutIntro),
    biography: text(input.biography),
    portrait: text(input.portrait),
    email: text(input.email),
    contactUrl: text(input.contactUrl),
    records: {
      oneKm: text(records.oneKm),
      fiveKm: text(records.fiveKm),
      tenKm: text(records.tenKm),
      halfMarathon: text(records.halfMarathon),
    },
    recordsImage: text(input.recordsImage),
    financeImage: text(input.financeImage),
    aboutImage: text(input.aboutImage),
    recordsFrame: frame(input.recordsFrame),
    financeFrame: frame(input.financeFrame),
    aboutFrame: frame(input.aboutFrame),
    portraitFrame: frame(input.portraitFrame),
    youtubeChannel: text(input.youtubeChannel),
    publicSiteUrl: text(input.publicSiteUrl),
    socialImage: text(input.socialImage),
    home: {
      runnerImage: text(home.runnerImage),
      runnerFrame: frame(home.runnerFrame),
      runnerSize: typeof home.runnerSize === "number" && Number.isFinite(home.runnerSize) ? Math.max(30, Math.min(100, home.runnerSize)) : 100,
      title: text(home.title),
      intro: text(home.intro),
      heroImage: text(home.heroImage),
      heroFrame: frame(home.heroFrame),
      race: text(home.race),
      raceCaption: text(home.raceCaption),
      featuredPost: text(home.featuredPost),
      selectedPosts: Array.isArray(home.selectedPosts)
        ? home.selectedPosts.filter((item) => typeof item === "string") : [],
      runningDescription: text(home.runningDescription),
      technologyDescription: text(home.technologyDescription),
      financeDescription: text(home.financeDescription),
      aboutDescription: text(home.aboutDescription),
    },
  };
}
