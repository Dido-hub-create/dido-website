import { existsSync, lstatSync, readdirSync, realpathSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const safePart = /^[\p{L}\p{N}_-]+$/u;
export function validEntryId(id, nested = false) {
  return typeof id === "string" && id.length > 0 &&
    (nested ? id.split("/") : [id]).every((part) => safePart.test(part));
}

// Diagnostics contain only the escaped relative filename, never record contents/GPS.
export function entryDiagnostic(collection, file, reason, report = console.warn) {
  report(`[DIDO content] Пропуснат запис ${collection}/${JSON.stringify(file)}: ${reason} Записът не се публикува. Поправете го в Pages CMS; не създавайте копие.`);
}

export function entryFiles(root, collection, extension, { nested = false, report = console.warn } = {}) {
  const directory = resolve(root, "src/content", collection);
  if (!existsSync(directory)) return [];
  if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) {
    entryDiagnostic(collection, "", "Папката е символна връзка.", report);
    return [];
  }
  const files = [];
  function walk(folder, prefix = "") {
    for (const name of readdirSync(folder).sort()) {
      const file = prefix + name;
      if (name === ".gitkeep") continue;
      const path = join(folder, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        entryDiagnostic(collection, file, "Символните връзки са забранени.", report);
        continue;
      }
      if (nested && stat.isDirectory() && safePart.test(name)) {
        walk(path, file + "/");
        continue;
      }
      if (!stat.isFile() || !file.endsWith(extension) ||
          !validEntryId(file.slice(0, -extension.length), nested)) {
        entryDiagnostic(collection, file, "Невалидно име. Използвайте букви, цифри, тире или долна черта и едно разширение " + extension + ".", report);
        continue;
      }
      if (stat.size > 5 * 1024 * 1024) {
        entryDiagnostic(collection, file, "Файлът надвишава 5 MB.", report);
        continue;
      }
      files.push(file);
    }
  }
  walk(directory);
  // Do not pick an arbitrary winner for names differing only in case/Unicode form.
  const keys = files.map((file) => file.normalize("NFC").toLowerCase());
  const counts = new Map();
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  return files.filter((file, index) => {
    if (counts.get(keys[index]) === 1) return true;
    entryDiagnostic(collection, file, "Конфликт с друго име (главни/малки букви или Unicode).", report);
    return false;
  });
}

export function readEntries(root, collection, { report = console.warn } = {}) {
  return entryFiles(root, collection, ".json", { report }).flatMap((file) => {
    try {
      const data = JSON.parse(readFileSync(resolve(root, "src/content", collection, file), "utf8"));
      if (!data || Array.isArray(data) || typeof data !== "object") throw new Error();
      return [{ id: file.slice(0, -5), data }];
    } catch {
      entryDiagnostic(collection, file, "Невалиден JSON запис; очаква се обект.", report);
      return [];
    }
  });
}
