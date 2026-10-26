const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ENV_PATH = path.join(__dirname, ".env");
const FETCH_TIMEOUT_MS = 12000;
const ITEM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const itemCache = new Map();

function loadSettings() {
  try {
    const values = dotenv.parse(fs.readFileSync(ENV_PATH, "utf8"));
    const url = String(values.ABS_URL || "").trim().replace(/\/+$/, "");
    const token = String(values.ABS_TOKEN || "").trim();
    return { url: url, token: token, ready: !!(url && token) };
  } catch (err) {
    return { url: "", token: "", ready: false };
  }
}

async function request(apiPath, options) {
  const settings = loadSettings();
  if (!settings.ready) return { ok: false, status: 0, notConfigured: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(settings.url + apiPath, {
      headers: { "Authorization": "Bearer " + settings.token },
      signal: controller.signal
    });
    if (!res.ok) return { ok: false, status: res.status };
    if (options && options.binary) {
      const buffer = Buffer.from(await res.arrayBuffer());
      return { ok: true, status: res.status, buffer: buffer };
    }
    return { ok: true, status: res.status, data: await res.json() };
  } catch (err) {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function names(list, key) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => (typeof entry === "string" ? entry : entry && entry[key]))
    .filter(Boolean)
    .join(", ");
}

function normalizeItem(raw) {
  const item = raw && raw.libraryItem ? raw.libraryItem : raw;
  if (!item || !item.id) return null;
  const media = item.media || {};
  const meta = media.metadata || {};
  const fileSeconds = (Array.isArray(media.audioFiles) ? media.audioFiles : []).reduce((sum, file) => sum + (Number(file.duration) || 0), 0);
  return {
    id: item.id,
    title: meta.title || "Untitled",
    author: meta.authorName || names(meta.authors, "name"),
    narrator: meta.narratorName || names(meta.narrators, "name"),
    series: meta.seriesName || names(meta.series, "name"),
    duration: Number(media.duration) || fileSeconds,
    addedAt: Number(item.addedAt) || 0
  };
}

async function listUsers() {
  const res = await request("/api/users");
  if (!res.ok) return res;
  const users = Array.isArray(res.data) ? res.data : (res.data && res.data.users) || [];
  return { ok: true, users: users.map((user) => ({ id: user.id, username: user.username })) };
}

async function getProgress(userId) {
  const res = await request("/api/users/" + encodeURIComponent(userId));
  if (!res.ok) return res;
  const list = Array.isArray(res.data && res.data.mediaProgress) ? res.data.mediaProgress : [];
  const entries = list
    .filter((entry) => entry && entry.libraryItemId && !entry.episodeId)
    .map((entry) => ({
      itemId: entry.libraryItemId,
      progress: Number(entry.progress) || 0,
      currentTime: Number(entry.currentTime) || 0,
      duration: Number(entry.duration) || 0,
      finished: !!entry.isFinished,
      finishedAt: Number(entry.finishedAt) || 0,
      lastUpdate: Number(entry.lastUpdate) || 0
    }));
  return { ok: true, entries: entries };
}

async function getListeningDays(userId) {
  const res = await request("/api/users/" + encodeURIComponent(userId) + "/listening-stats");
  if (!res.ok) return res;
  const days = (res.data && res.data.days) || {};
  return { ok: true, days: days, totalTime: Number(res.data && res.data.totalTime) || 0 };
}

async function getItem(itemId) {
  const cached = itemCache.get(itemId);
  if (cached && Date.now() - cached.at < ITEM_CACHE_TTL_MS) return cached.item;
  const res = await request("/api/items/" + encodeURIComponent(itemId));
  if (!res.ok) return null;
  const item = normalizeItem(res.data);
  if (item) itemCache.set(itemId, { at: Date.now(), item: item });
  return item;
}

async function bookLibraries() {
  const res = await request("/api/libraries");
  if (!res.ok) return [];
  const list = Array.isArray(res.data) ? res.data : (res.data && res.data.libraries) || [];
  return list.filter((library) => library.mediaType === "book").map((library) => ({ id: library.id, name: library.name }));
}

async function recentItems(libraryId, limit, page) {
  const res = await request("/api/libraries/" + encodeURIComponent(libraryId) + "/items?sort=addedAt&desc=1&limit=" + limit + "&page=" + (page || 0));
  if (!res.ok) return null;
  return ((res.data && res.data.results) || []).map(normalizeItem).filter(Boolean);
}

async function searchLibrary(libraryId, query, limit) {
  const res = await request("/api/libraries/" + encodeURIComponent(libraryId) + "/search?limit=" + limit + "&q=" + encodeURIComponent(query));
  if (!res.ok) return [];
  return ((res.data && res.data.book) || []).map(normalizeItem).filter(Boolean);
}

async function coverFile(itemId) {
  const res = await request("/api/items/" + encodeURIComponent(itemId) + "/cover", { binary: true });
  if (!res.ok || !res.buffer || res.buffer.length === 0) return null;
  return { attachment: res.buffer, name: "cover.jpg" };
}

function itemUrl(itemId) {
  const settings = loadSettings();
  return settings.url ? settings.url + "/item/" + encodeURIComponent(itemId) : "";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return minutes + "m";
  return hours + "h " + (minutes < 10 ? "0" : "") + minutes + "m";
}

module.exports = {
  loadSettings,
  listUsers,
  getProgress,
  getListeningDays,
  getItem,
  bookLibraries,
  recentItems,
  searchLibrary,
  coverFile,
  itemUrl,
  formatDuration
};
