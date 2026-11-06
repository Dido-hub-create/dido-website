import { referenceId } from "./running.mjs";
const text = (value, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;

/**
 * @template {{ id: string }} T
 * @param {any} site
 * @param {T[]} posts Published posts only.
 * @param {any[]} races Published races only.
 */
export function homeContent(site, posts, races) {
  const home = site.home ?? {};
  const byReference = (value) => posts.find((post) => post.id === referenceId(value, "posts"));
  const featured = text(home.featuredPost) ? byReference(home.featuredPost) ?? posts[0] : undefined;
  /** @type {T[]} */
  const selected = [];
  const seen = new Set(featured ? [featured.id] : []);
  for (const value of Array.isArray(home.selectedPosts) ? home.selectedPosts : []) {
    const post = byReference(value);
    if (post && !seen.has(post.id)) { seen.add(post.id); selected.push(post); }
    if (selected.length === 3) break;
  }
  return {
    title: text(home.title, "Добре дошли"),
    intro: text(home.intro, site.homeIntro),
    heroImage: text(home.heroImage, site.heroImage),
    heroFrame: home.heroFrame ?? site.heroFrame,
    race: races.find((race) => race.id === referenceId(home.race, "races")),
    raceCaption: text(home.raceCaption),
    featured, selected,
    remainingPosts: posts.filter((post) => !seen.has(post.id)),
    runningDescription: text(home.runningDescription, "Тук ще споделям състезания, тренировки и полезно за бегачи."),
    technologyDescription: text(home.technologyDescription, "Приложения, изкуствен интелект и технологични открития — скоро тук."),
    financeDescription: text(home.financeDescription, "Лични размисли, наблюдения и интерес към Bitcoin — тема, която следя и проучвам."),
    aboutDescription: text(home.aboutDescription, site.aboutIntro),
  };
}
