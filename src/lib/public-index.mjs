import { prepareSearchIndex } from './search.mjs';

// One public catalog/request per document, shared by search and favorites on demand.
/** @type {Promise<ReturnType<typeof prepareSearchIndex>>|undefined} */
let pending;
export function loadPublicIndex() {
  if (!pending) pending = Promise.resolve().then(async () => {
      const response = await fetch('/search-index.json',{cache:'no-cache',signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('Unavailable public index');
      return prepareSearchIndex(await response.json());
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}
