import { normalizeImage } from "./content-utils.mjs";

/** Plain numeric focal points, not a face detector or an image editor. */
export function normalizeFrame(value, defaults = {}) {
  const input = value && typeof value === "object" ? value : {};
  const percent = (number, fallback) =>
    typeof number === "number" && Number.isFinite(number)
      ? Math.max(0, Math.min(100, number))
      : fallback;
  const fit =
    input.fit === "cover" || input.fit === "contain"
      ? input.fit
      : defaults.fit === "cover"
        ? "cover"
        : "contain";
  const x = percent(input.x, percent(defaults.x, 50)),
    y = percent(input.y, percent(defaults.y, 35));
  return {
    fit,
    x,
    y,
    mobileFit:
      input.mobileFit === "cover" || input.mobileFit === "contain"
        ? input.mobileFit
        : fit,
    mobileX: percent(input.mobileX, x),
    mobileY: percent(input.mobileY, y),
  };
}
export function frameStyle(value, defaults) {
  const frame = normalizeFrame(value, defaults);
  return `--image-fit:${frame.fit};--image-x:${frame.x}%;--image-y:${frame.y}%;--image-mobile-fit:${frame.mobileFit};--image-mobile-x:${frame.mobileX}%;--image-mobile-y:${frame.mobileY}%;`;
}
export function frameForImage(image, overrides, fallback) {
  const key = (value) => {
    if (typeof value !== "string") return undefined;
    const normalized = normalizeImage(value) ?? value;
    try {
      return decodeURI(normalized);
    } catch {
      return normalized;
    }
  };
  const imageKey = key(image);
  return imageKey && Array.isArray(overrides)
    ? (overrides.find((item) => key(item?.image) === imageKey)?.frame ??
        fallback)
    : fallback;
}
