import { categories, isPublished } from './content-utils.mjs';
import { applicationCategories } from './applications.mjs';
import { loadRaces, loadRoutes } from './running.mjs';
import { formatRaceDate } from './races.mjs';
import { loadAlbums } from './albums.mjs';
import { loadVideos } from './videos.mjs';
import { site } from './site.mjs';
import { searchUrl } from './search.mjs';

// Index visible prose, never Markdown destinations, attributes, embedded scripts or app files.
export function searchText(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/gi,' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[entity]))
    .replace(/[#*_>`~]/g,'').replace(/\s+/g,' ').trim();
}

/** Public loaders are the publication boundary. Explicit fields prevent GPS/settings leaks.
 * @param {{posts?: import('./posts').Post[], root?: string}} [options]
 */
export async function buildSearchIndex({ posts=[], root=process.cwd() }={}) {
  const documents=new Map();
  function add(url,title,type,description='',body='') {
    const safe=searchUrl(url);title=searchText(title);
    if(!safe || !title || documents.has(safe))return;
    documents.set(safe,{url:safe,title,type:searchText(type),description:searchText(description),body:searchText(body)});
  }
  add('/','Начало','Страница',site.home.intro || 'DIDO — бягане, технологии, полезни идеи и лични проекти.',[site.siteName,site.home.title,site.home.runningDescription,site.home.technologyDescription,site.home.financeDescription,site.home.aboutDescription].join(' '));
  add('/za-men/','За мен','Страница',site.aboutIntro,site.biography);
  add('/prilozheniya/','Моите приложения','Приложения','Публикувани приложения и категории: дигитални дъски, финансови инструменти, лични органайзери, дигитални кабинети и фитнес тракери.');
  add('/galeria/','Галерия','Страница','Снимки и албуми от бягания, състезания и пътувания.');
  add('/byagane/sastezaniya/','Състезания и архив','Бягане','Календар, предстоящи стартове, резултати и класирания от състезания.');
  add('/byagane/marshruti/','Моите маршрути','Бягане','Публични GPX маршрути, карти и височинни профили.');
  add('/byagane/analiz/','GPX анализатор и калкулатор за темпо','Инструмент','Сравнение на две или три трасета по километри. Височини, изкачвания, спускания и калкулатор за темпо.');
  for(const category of categories) {
    const records=category.slug==='byagane' ? [
      `Лични рекорди: 1 км ${site.records.oneKm}, 5 км ${site.records.fiveKm}, 10 км ${site.records.tenKm}, полумаратон ${site.records.halfMarathon}.`
    ] : [];
    add(`/${category.slug}/`,category.label,'Раздел',category.description,[...category.topics,...records].join(' '));
  }
  for(const category of applicationCategories(root)) {
    add(category.href,category.title,'Категория приложения',category.description,category.apps.length?'Публикувани приложения.':'Предстои. Все още няма публикувани приложения в тази категория.');
    for(const app of category.apps) add(app.online || `${category.href}#application-${app.id}`,app.title,'Приложение',app.description);
  }
  for(const post of posts) {
    if(!post.data || !isPublished(post.data))continue;
    add(post.href,post.data.title,`Статия · ${post.category?.label ?? 'Публикации'}`,post.data.description,`${post.data.topic ?? ''} ${post.body ?? ''}`);
  }
  for(const race of loadRaces(root)) add(race.href,race.title,'Състезание',[race.location,race.distance,formatRaceDate(race)].filter(Boolean).join(' · '),[race.notes,race.result,...race.rankings.map(item=>`${item.label}: ${item.place} от ${item.total}`)].filter(Boolean).join(' '));
  for(const route of loadRoutes(root)) add(route.href,route.title,'Маршрут',route.description,[route.location,route.surface,route.analysisStatus==='ready'?'GPX карта и височинен анализ: изкачване, спускане, наклон.':''].filter(Boolean).join(' '));
  for(const album of await loadAlbums(root)) add(album.href,album.title,'Албум',album.description);
  // Only videos actually rendered on the public running page have searchable anchors.
  for(const video of loadVideos(root).slice(0,4)) add(`/byagane/#video-${video.id}`,video.title,'Видео',video.description);
  return {version:1,documents:[...documents.values()]};
}
