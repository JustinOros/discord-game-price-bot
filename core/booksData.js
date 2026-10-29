const { bookKey } = require("./books");

async function safe(promise) {
  try {
    return (await promise) || [];
  } catch (err) {
    return [];
  }
}

function keyed(items) {
  const counts = new Map();
  const out = [];
  items.forEach((item) => {
    const base = bookKey(item.title);
    if (!base) return;
    const seen = counts.get(base) || 0;
    counts.set(base, seen + 1);
    out.push({ key: seen === 0 ? base : base + "#" + seen, item: item });
  });
  return out;
}

function linkedSources(sources, discordId) {
  return sources.filter((source) => source.isLinked(discordId));
}

async function finishedKeys(id, sources, year) {
  const keys = new Map();
  for (const source of linkedSources(sources, id)) {
    const items = await safe(source.finished(id, { year: year }));
    keyed(items).forEach((entry) => {
      if (year && entry.item.year && entry.item.year !== year) return;
      if (!keys.has(entry.key)) keys.set(entry.key, entry.item);
    });
  }
  return keys;
}

function mergeInto(map, key, item) {
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
    keyed(items).forEach((entry) => mergeInto(merged, entry.key, entry.item));
  }
  return merged;
}

async function finishedInMonth(id, sources, year, month) {
  const merged = new Map();
  for (const source of linkedSources(sources, id)) {
    const items = await safe(source.finished(id, { year: year }));
    keyed(items).forEach((entry) => {
      if (entry.item.year === year && entry.item.month === month) mergeInto(merged, entry.key, entry.item);
    });
  }
  return merged;
}

module.exports = { safe, linkedSources, finishedKeys, mergedFinished, finishedInMonth };
