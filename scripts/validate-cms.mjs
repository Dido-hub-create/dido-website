import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { pathToFileURL } from "node:url";

/** Checks the documented configuration shape; does not claim a live CMS upload. */
export function validateCms(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error("Невалиден YAML в .pages.yml.");
  const config = document.toJS(),
    media = new Set(),
    collections = new Set();
  if (!Array.isArray(config?.media) || !Array.isArray(config?.content))
    throw new Error("Липсва media/content конфигурация.");
  for (const entry of config.media) {
    if (!entry.name || media.has(entry.name) || !entry.input || !entry.output)
      throw new Error("Невалиден или дублиран media източник.");
    media.add(entry.name);
  }
  for (const entry of config.content) {
    if (
      !entry.name ||
      collections.has(entry.name) ||
      !entry.path ||
      !["file", "collection"].includes(entry.type)
    )
      throw new Error("Невалиден или дублиран CMS раздел.");
    collections.add(entry.name);
  }
  const types = [
    "string",
    "text",
    "rich-text",
    "image",
    "file",
    "object",
    "select",
    "date",
    "number",
    "boolean",
    "reference",
  ];
  function fields(items, ancestors = []) {
    const names = new Set();
    for (const entry of items ?? []) {
      if (!entry.name || names.has(entry.name))
        throw new Error("Дублирано или липсващо поле.");
      names.add(entry.name);
      let field = entry;
      if (entry.component) {
        if (
          ancestors.includes(entry.component) ||
          !config.components?.[entry.component]
        )
          throw new Error("Невалиден или цикличен component.");
        field = { ...config.components[entry.component], ...entry };
      }
      if (!types.includes(field.type)) throw new Error("Неподдържан тип поле.");
      if (field.options?.media && !media.has(field.options.media))
        throw new Error("Непознат media източник.");
      if (
        field.type === "reference" &&
        !collections.has(field.options?.collection)
      )
        throw new Error("Невалидна връзка към CMS колекция.");
      if (field.type === "object")
        fields(field.fields, [
          ...ancestors,
          ...(entry.component ? [entry.component] : []),
        ]);
    }
  }
  config.content.forEach((entry) => fields(entry.fields));
  for (const name of ["posts", "routes", "races", "videos", "albums"]) {
    const collection = config.content.find((entry) => entry.name === name);
    const extension = name === "posts" ? "md" : "json";
    if (collection?.filename?.field !== false ||
        collection.filename.template !== `{year}-{month}-{day}-{hour}{minute}{second}-{primary}.${extension}` ||
        collection.view?.primary !== "title" || collection.subfolders !== false)
      throw new Error("CMS трябва да генерира безопасни имена от заглавието и датата, без ръчно поле за име.");
  }
  const site = config.content.find((entry) => entry.name === "site");
  for (const name of ["siteName", "siteSubtitle", "logoImage", "navigation", "home", "publicSiteUrl", "youtubeChannel", "socialImage"])
    if (!site?.fields.some((field) => field.name === name))
      throw new Error("Липсва настройка за идентичността/навигацията на сайта.");
  const home = site.fields.find((entry) => entry.name === "home");
  for (const name of ["title", "intro", "heroImage", "race", "raceCaption", "featuredPost", "selectedPosts"])
    if (!home.fields?.some((entry) => entry.name === name)) throw new Error("Липсва CMS поле за началната страница.");
  const gpx = config.media.find((entry) => entry.name === "gpx");
  const route = config.content.find((entry) => entry.name === "routes");
  const field = route?.fields.find((entry) => entry.name === "gpx");
  for (const [name, type, value] of [["lapCount", "number", 1], ["allowElevationAnalysis", "boolean", false], ["elevationTrusted", "boolean", false], ["includeInComparison", "boolean", true], ["includeInCalculator", "boolean", true]]) {
    const setting = route?.fields.find((entry) => entry.name === name);
    if (setting?.type !== type || setting.default !== value || setting.required)
      throw new Error("Липсва безопасна незадължителна настройка за GPX анализ: " + name);
  }
  if (
    gpx?.input !== "src/data/gpx" ||
    gpx?.output !== "/gpx-source" ||
    !gpx.extensions?.includes("gpx") ||
    field?.type !== "file" ||
    field.options?.media !== "gpx" ||
    !field.options?.extensions?.includes("gpx")
  )
    throw new Error(
      "GPX качването трябва да използва file поле и отделна непублична за сайта папка.",
    );
  return config;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  validateCms(readFileSync(".pages.yml", "utf8"));
  console.log(
    "Pages CMS: валиден YAML, полета, компоненти, медийни източници и връзки. Реален запис/качване в CMS не е извършван.",
  );
}
