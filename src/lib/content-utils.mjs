export const categories = [
  {
    slug: "byagane",
    label: "Бягане",
    icon: "run",
    eyebrow: "Крачка по крачка",
    description:
      "Личен дневник на бягането. Състезания, тренировки и всичко полезно по пътя към следващия старт.",
    topics: [
      "Състезания",
      "Тренировки",
      "Лични рекорди",
      "Полезно за бегачи",
      "Екипировка",
    ],
  },
  {
    slug: "tehnologii",
    label: "Технологии",
    icon: "code",
    eyebrow: "От идея до приложение",
    description:
      "Място за собствените ми приложения, експериментите с изкуствен интелект и технологиите в ежедневието.",
    topics: [
      "Моите приложения",
      "Изкуствен интелект",
      "Технологични впечатления",
      "Практически ръководства",
    ],
  },
  {
    slug: "polezno",
    label: "Полезно",
    icon: "book",
    eyebrow: "Знание за всеки ден",
    description:
      "Статии, инструкции и ресурси, към които си струва да се връщаме.",
    topics: ["Статии", "Инструкции", "Образователни материали", "Ресурси"],
  },
  {
    slug: "finansi",
    label: "Финанси",
    icon: "bitcoin",
    eyebrow: "С поглед напред",
    description:
      "Лично пространство за Bitcoin, финансови теми и идеи, които искам да разбера по-добре.",
    topics: ["Bitcoin", "Финансови публикации"],
  },
];

export const projects = [
  {
    title: "Дигитални дъски",
    icon: "grid",
    text: "Пространство за идеи, бележки и визуално подреждане на мислите.",
  },
  {
    title: "Финансов калкулатор",
    icon: "calculator",
    text: "Практични изчисления за по-ясна представа за личните финанси.",
  },
  {
    title: "Личен органайзер",
    icon: "calendar",
    text: "Задачи, планове и малките стъпки към по-подреден ден.",
  },
  {
    title: "Дигитален кабинет",
    icon: "folder",
    text: "Едно място за документи, полезни материали и ежедневна работа.",
  },
];

/** @param {string | undefined | null} value */
export function categoryFor(value) {
  return (
    categories.find(
      (category) => category.slug === value || category.label === value,
    ) ?? categories[2]
  );
}

/** @param {{ draft?: boolean, status?: string }} data */
export function isPublished(data) {
  return (
    data.draft !== true &&
    !["draft", "чернова"].includes((data.status ?? "").toLowerCase())
  );
}

/** @param {string | undefined | null} value */
export function normalizeImage(value) {
  if (!value?.trim()) return undefined;
  const source = value.trim().replaceAll("\\", "/");
  if (/^https:\/\//i.test(source)) return source;
  const path = source
    .replace(/^\.?\/?public\//, "/")
    .replace(/^images\//, "/images/");
  if (!path.startsWith("/images/") || path.includes("..")) return undefined;
  return path;
}

/** @param {string} body */
export function excerpt(body) {
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 170 ? `${text.slice(0, 167).trimEnd()}…` : text;
}
