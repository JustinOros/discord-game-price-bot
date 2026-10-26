const { COMMAND_LIMIT, stars, memberName, embed, getSources } = require("./books");
const { safe, linkedSources, finishedInMonth } = require("./booksData");
const { loadState, saveState, loadBooksConfig } = require("./booksState");

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MIN_STREAK_DAYS = 2;
const MAX_TIED_NAMES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function monthPrefix(year, month) {
  return year + "-" + pad(month + 1) + "-";
}

function longestStreak(days, year, month) {
  const prefix = monthPrefix(year, month);
  const times = Object.keys(days)
    .filter((day) => day.startsWith(prefix) && Number(days[day]) > 0)
    .map((day) => Date.parse(day))
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = null;
  times.forEach((time) => {
    run = previous !== null && time - previous === DAY_MS ? run + 1 : 1;
    previous = time;
    if (run > best) best = run;
  });
  return best;
}

function secondsIn(days, year, month) {
  const prefix = monthPrefix(year, month);
  return Object.keys(days)
    .filter((day) => day.startsWith(prefix))
    .reduce((sum, day) => sum + (Number(days[day]) || 0), 0);
}

function joinNames(names) {
  return names.length <= MAX_TIED_NAMES ? names.join(", ") : names.slice(0, MAX_TIED_NAMES).join(", ") + " and others";
}

async function listeningDays(id, sources) {
  const merged = {};
  for (const source of linkedSources(sources, id)) {
    if (typeof source.listening !== "function") continue;
    let result = null;
    try {
      result = await source.listening(id);
    } catch (err) {
      result = null;
    }
    if (result && result.days) Object.keys(result.days).forEach((day) => {
      merged[day] = (merged[day] || 0) + (Number(result.days[day]) || 0);
    });
  }
  return merged;
}

async function buildRecap(guild, sources, year, month) {
  const ids = guild.members.cache.map((member) => member.id).filter((id) => linkedSources(sources, id).length > 0).slice(0, COMMAND_LIMIT);
  const readers = [];
  const listeners = [];
  const ratings = new Map();
  for (const id of ids) {
    const name = memberName(guild, id);
    const finished = await finishedInMonth(id, sources, year, month);
    if (finished.size > 0) readers.push({ name: name, books: finished.size });
    finished.forEach((item, key) => {
      if (!(item.rating > 0)) return;
      const entry = ratings.get(key) || { title: item.title, total: 0, count: 0 };
      entry.total += item.rating;
      entry.count += 1;
      ratings.set(key, entry);
    });
    const days = await listeningDays(id, sources);
    const seconds = secondsIn(days, year, month);
    if (seconds > 0) listeners.push({ name: name, hours: seconds / 3600, streak: longestStreak(days, year, month) });
  }

  const lines = [];
  const totalBooks = readers.reduce((sum, row) => sum + row.books, 0);
  if (totalBooks > 0) {
    lines.push("📚 **" + totalBooks + " book" + (totalBooks === 1 ? "" : "s") + " finished** by " + readers.length + " reader" + (readers.length === 1 ? "" : "s"));
    const most = Math.max.apply(null, readers.map((row) => row.books));
    const top = readers.filter((row) => row.books === most).map((row) => row.name).sort();
    lines.push("🏆 **Most books:** " + joinNames(top) + " (" + most + (top.length > 1 ? " each" : "") + ")");
  }

  const rated = Array.from(ratings.values()).sort((a, b) => ((b.total / b.count) - (a.total / a.count)) || (b.count - a.count) || a.title.localeCompare(b.title));
  if (rated.length > 0) {
    const best = rated[0];
    const average = best.total / best.count;
    const detail = best.count === 1 ? stars(Math.round(average)) : (Math.round(average * 10) / 10) + " average from " + best.count + " ratings";
    lines.push("⭐ **Top rated:** " + best.title + " (" + detail + ")");
  }

  const totalHours = listeners.reduce((sum, row) => sum + row.hours, 0);
  if (totalHours > 0) {
    const sorted = listeners.slice().sort((a, b) => (b.hours - a.hours) || a.name.localeCompare(b.name));
    lines.push("🎧 **" + totalHours.toFixed(1) + " hours listened**, top listener " + sorted[0].name + " (" + sorted[0].hours.toFixed(1) + " hours)");
    const streaks = listeners.filter((row) => row.streak >= MIN_STREAK_DAYS).sort((a, b) => (b.streak - a.streak) || a.name.localeCompare(b.name));
    if (streaks.length > 0) lines.push("🔥 **Longest streak:** " + streaks[0].name + " listened " + streaks[0].streak + " days in a row");
  }

  if (lines.length === 0) return null;
  return embed("Reading recap: " + MONTH_NAMES[month] + " " + year, lines.join("\n"));
}

function previousMonth(now) {
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function findChannel(guild, sources) {
  const configured = sources.map((source) => source.config()).find((config) => config && config.announceChannel);
  const name = String(configured ? configured.announceChannel : "books").toLowerCase();
  return guild.channels.cache.find((channel) => String(channel.name).toLowerCase() === name && channel.isTextBased && channel.isTextBased());
}

async function monthlyRecapTick(context) {
  const config = loadBooksConfig();
  if (!config.monthlyRecap) return;
  const now = new Date(Date.now());
  if (now.getHours() < config.recapHour) return;
  const previous = previousMonth(now);
  const key = previous.year + "-" + pad(previous.month + 1);
  const state = loadState();
  if (!state.lastRecap) {
    state.lastRecap = key;
    saveState(state);
    return;
  }
  if (state.lastRecap === key) return;
  state.lastRecap = key;
  saveState(state);

  const sources = getSources(context);
  for (const guild of Array.from(context.client.guilds.cache.values())) {
    const channel = findChannel(guild, sources);
    if (!channel) continue;
    try {
      const card = await buildRecap(guild, sources, previous.year, previous.month);
      if (card) await channel.send({ embeds: [card] });
    } catch (err) {
      console.error("Monthly book recap failed:", err.message);
    }
  }
}

module.exports = { buildRecap, previousMonth, monthlyRecapTick, MONTH_NAMES };
