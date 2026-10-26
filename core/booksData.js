const { bookKey } = require("./books");

async function safe(promise) {
  try {
    return (await promise) || [];
  } catch (err) {
    return [];
  }
}

function linkedSources(sources, discordId) {
  return sources.filter((source) => source.isLinked(discordId));
}

async function finishedKeys(id, sources, year) {
  const keys = new Map();
  for (const source of linkedSources(sources, id)) {
    const items = await safe(source.finished(id, { year: year }));
    items.forEach((item) => {
      if (year && item.year && item.year !== year) return;
      const key = bookKey(item.title);
      if (key && !keys.has(key)) keys.set(key, item);
    });
  }
  return keys;
}

function mergeInto(map, item) {
  const key = bookKey(item.title);
  if (!key) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, Object.assign({}, item));
    return;
  }
  if (!(existing.rating > 0) && item.rating > 0) existing.rating = item.rating;
  if (!existing.year && item.year) {
    existing.year = item.year;
    existing.month = item.month;
  }
  if (!existing.pages && item.pages) existing.pages = item.pages;
}

async function mergedFinished(id, sources) {
  const merged = new Map();
  for (const source of linkedSources(sources, id)) {
    const items = await safe(source.finished(id, {}));
    items.forEach((item) => mergeInto(merged, item));
  }
  return merged;
}

async function finishedInMonth(id, sources, year, month) {
  const merged = new Map();
  for (const source of linkedSources(sources, id)) {
    const items = await safe(source.finished(id, { year: year }));
    items.forEach((item) => {
      if (item.year === year && item.month === month) mergeInto(merged, item);
    });
  }
  return merged;
}

module.exports = { safe, linkedSources, finishedKeys, mergedFinished, finishedInMonth };
