const transliteration = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

export function gpxFilename(title) {
  const source = (typeof title === "string" ? title : "").toLowerCase()
    // Conventional race labels: 21,1 км / 21.1 km -> 21km, as in the CMS example.
    .replace(/(\d+)(?:[,.]\d+)?\s*(?:км|km)(?=$|[^\p{L}\p{N}])/gu, "$1km")
    .replace(/[а-я]/g, (letter) => transliteration[letter] ?? "")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .replace(/(?:-gpx)+$/g, "");
  let slug = source.slice(0, 100).replace(/-+$/g, "") || "marshrut";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)) slug = `marshrut-${slug}`;
  return `${slug}.gpx`;
}

export function xmlText(value) {
  // XML 1.0 excludes lone surrogates, most control characters, FFFE and FFFF.
  return String(value).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
