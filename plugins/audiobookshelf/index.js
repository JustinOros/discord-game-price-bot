const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { EmbedBuilder } = require("discord.js");
const abs = require("./abs");
const books = require("../../core/books");
const { EMBED_COLOR, LIST_LIMIT, COMMAND_LIMIT, normalize, memberName, mentionedIds, stripMentions, embed } = books;

const ROOT = path.join(__dirname, "..", "..");
const DATA_PATH = path.join(ROOT, "audiobookshelf.json");
const CONFIG_PATH = path.join(__dirname, "config.yaml");
const DEFAULT_POLL_MINUTES = 30;
const MAX_ANNOUNCE_PER_USER = 3;
const MAX_SEEN_PER_USER = 1000;
const NEW_BOOK_LIMIT = 5;
const NEW_BOOK_PAGE_SIZE = 100;
const NEW_BOOK_MAX_PAGES = 5;
const MAX_NEW_BOOK_CARDS = 3;
const SEARCH_LIMIT = 5;
const MEDALS = ["🥇", "🥈", "🥉"];
const PERIOD_DAYS = { week: 7, month: 30, year: 365 };
const ABS_HELP = [
  ["!audiobookshelf link USERNAME", "link your Audiobookshelf username so I can post when you finish a book"],
  ["!audiobookshelf unlink", "remove your Audiobookshelf link"],
  ["!audiobookshelf nowplaying [@member]", "what you, or the member you mention, are listening to"],
  ["!audiobookshelf finished [@member]", "recently finished audiobooks"],
  ["!audiobookshelf stats [@member]", "books finished and hours listened"],
  ["!audiobookshelf leaderboard [week|month|year]", "rank members by hours listened"],
  ["!audiobookshelf who BOOK", "who here has listened to a book"],
  ["!audiobookshelf search BOOK", "look a book up in the library"],
  ["!audiobookshelf new", "the newest books added to the library"],
  ["!audiobookshelf compare @member [@member]", "audiobooks two members have both finished"]
];

let ctx = null;
let checking = false;

function loadConfig() {
  try {
    const data = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8"));
    return (data && typeof data === "object") ? data : {};
  } catch (err) {
    return {};
  }
}

function pollMinutes(config) {
  const value = Number(config.pollMinutes);
  return value >= 1 && value <= 59 ? Math.floor(value) : DEFAULT_POLL_MINUTES;
}

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    if (data && typeof data === "object") {
      return { links: data.links && typeof data.links === "object" ? data.links : {}, newestAddedAt: Number(data.newestAddedAt) || 0 };
    }
  } catch (err) {
    return { links: {}, newestAddedAt: 0 };
  }
  return { links: {}, newestAddedAt: 0 };
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
}

function yearOf(ms) {
  return ms ? new Date(ms).getFullYear() : null;
}

function monthOf(ms) {
  return ms ? new Date(ms).getMonth() : null;
}

function finishedEntries(entries) {
  return entries.filter((entry) => entry.finished).sort((a, b) => b.finishedAt - a.finishedAt);
}

function percent(entry) {
  return Math.round(entry.progress * 100);
}

async function describe(entry) {
  const item = await abs.getItem(entry.itemId);
  return item ? { item: item, entry: entry } : null;
}

function bookLine(item) {
  return "**" + item.title + "**" + (item.author ? " by " + item.author : "");
}

function resolveTarget(message, args, data) {
  const ids = mentionedIds(args);
  const id = ids.length > 0 ? ids[0] : message.author.id;
  return { id: id, link: data.links[id], name: memberName(message.guild, id), rest: stripMentions(args) };
}

function helpEmbed(config) {
  const channel = String(config.announceChannel || "books");
  const lines = ABS_HELP.map((entry) => "`" + entry[0] + "`\n" + entry[1]);
  return embed("Audiobookshelf commands", lines.join("\n\n"))
    .setFooter({ text: "!ab works as a shortcut for !audiobookshelf. Finished books and new arrivals are posted in #" + channel + "." });
}

async function handleLink(message, args, data) {
  const username = args.trim();
  if (!username) {
    await message.reply("Usage: !audiobookshelf link USERNAME");
    return;
  }
  const listed = await abs.listUsers();
  if (!listed.ok) {
    await message.reply("I couldn't reach Audiobookshelf right now.");
    return;
  }
  const user = listed.users.find((entry) => String(entry.username).toLowerCase() === username.toLowerCase());
  if (!user) {
    await message.reply("There's no Audiobookshelf user with that name.");
    return;
  }
  const owner = Object.keys(data.links).find((id) => data.links[id].userId === user.id && id !== message.author.id);
  if (owner) {
    await message.reply("That Audiobookshelf user is already linked to " + memberName(message.guild, owner) + ".");
    return;
  }
  const progress = await abs.getProgress(user.id);
  if (!progress.ok) {
    await message.reply("I couldn't read that user's progress right now.");
    return;
  }
  const seen = finishedEntries(progress.entries).map((entry) => entry.itemId).slice(0, MAX_SEEN_PER_USER);
  data.links[message.author.id] = { userId: user.id, username: user.username, seen: seen };
  saveData(data);
  await message.reply(
    "Linked " + memberName(message.guild, message.author.id) + " to Audiobookshelf user " + user.username + ". I'll post when you finish a book (" +
    seen.length + " already finished, so I won't announce those)."
  );
}

async function handleUnlink(message, args, data) {
  const link = data.links[message.author.id];
  if (!link) {
    await message.reply("You don't have an Audiobookshelf account linked.");
    return;
  }
  if (args && args.trim().toLowerCase() !== String(link.username).toLowerCase()) {
    await message.reply("That username doesn't match the Audiobookshelf account you linked.");
    return;
  }
  delete data.links[message.author.id];
  saveData(data);
  await message.reply("Unlinked your Audiobookshelf account.");
}

async function withLink(message, args, data) {
  const target = resolveTarget(message, args, data);
  if (!target.link) {
    await message.reply(target.name + " hasn't linked an Audiobookshelf account yet.");
    return null;
  }
  const progress = await abs.getProgress(target.link.userId);
  if (!progress.ok) {
    await message.reply("I couldn't read " + target.name + "'s Audiobookshelf progress right now.");
    return null;
  }
  target.entries = progress.entries;
  return target;
}

async function handleNowPlaying(message, args, data) {
  const target = await withLink(message, args, data);
  if (!target) return;
  const active = target.entries.filter((entry) => !entry.finished && entry.progress > 0).sort((a, b) => b.lastUpdate - a.lastUpdate).slice(0, 3);
  const described = (await Promise.all(active.map(describe))).filter(Boolean);
  if (described.length === 0) {
    await message.reply(target.name + " isn't listening to anything right now.");
    return;
  }
  const lines = described.map((row) => bookLine(row.item) + " - " + percent(row.entry) + "%" +
    (row.item.duration ? ", " + abs.formatDuration(row.item.duration * (1 - row.entry.progress)) + " left" : ""));
  const card = embed(target.name + " is listening to", lines.join("\n"));
  const cover = await abs.coverFile(described[0].item.id);
  const payload = { embeds: [card] };
  if (cover) {
    card.setThumbnail("attachment://" + cover.name);
    payload.files = [cover];
  }
  await message.reply(payload);
}

async function handleFinished(message, args, data) {
  const target = await withLink(message, args, data);
  if (!target) return;
  const done = finishedEntries(target.entries).slice(0, LIST_LIMIT);
  const described = (await Promise.all(done.map(describe))).filter(Boolean);
  if (described.length === 0) {
    await message.reply(target.name + " hasn't finished an audiobook yet.");
    return;
  }
  const lines = described.map((row) => bookLine(row.item) + (row.entry.finishedAt ? " - " + new Date(row.entry.finishedAt).toISOString().slice(0, 10) : ""));
  await message.reply({ embeds: [embed(target.name + " finished", lines.join("\n"))] });
}

function hoursIn(days, count) {
  const cutoff = Date.now() - count * 24 * 60 * 60 * 1000;
  let seconds = 0;
  Object.keys(days).forEach((day) => {
    const time = Date.parse(day);
    if (!Number.isNaN(time) && time >= cutoff - 24 * 60 * 60 * 1000) seconds += Number(days[day]) || 0;
  });
  return seconds / 3600;
}

async function handleStats(message, args, data) {
  const target = await withLink(message, args, data);
  if (!target) return;
  const listening = await abs.getListeningDays(target.link.userId);
  const thisYear = new Date(Date.now()).getFullYear();
  const finished = finishedEntries(target.entries);
  const lines = [
    "Finished this year: " + finished.filter((entry) => yearOf(entry.finishedAt) === thisYear).length,
    "Finished in total: " + finished.length
  ];
  if (listening.ok) {
    lines.push("Listened in the last 7 days: " + hoursIn(listening.days, 7).toFixed(1) + " hours");
    lines.push("Listened in the last 30 days: " + hoursIn(listening.days, 30).toFixed(1) + " hours");
    lines.push("Listened in total: " + (listening.totalTime / 3600).toFixed(1) + " hours");
  }
  await message.reply({ embeds: [embed(target.name + "'s listening stats", lines.join("\n"))] });
}

function guildLinks(message, data) {
  return Object.keys(data.links).filter((id) => message.guild.members.cache.has(id)).slice(0, COMMAND_LIMIT);
}

async function handleLeaderboard(message, args, data) {
  const period = args.trim().toLowerCase() || "week";
  if (!PERIOD_DAYS[period]) {
    await message.reply("Usage: !audiobookshelf leaderboard [week|month|year]");
    return;
  }
  const rows = [];
  for (const id of guildLinks(message, data)) {
    const listening = await abs.getListeningDays(data.links[id].userId);
    if (!listening.ok) continue;
    const hours = hoursIn(listening.days, PERIOD_DAYS[period]);
    if (hours > 0) rows.push({ name: memberName(message.guild, id), hours: hours });
  }
  if (rows.length === 0) {
    await message.reply("Nobody has listened to anything this " + period + " yet.");
    return;
  }
  rows.sort((a, b) => (b.hours - a.hours) || a.name.localeCompare(b.name));
  const lines = rows.slice(0, LIST_LIMIT).map((row, index) => {
    const place = index < MEDALS.length ? MEDALS[index] : (index + 1) + ".";
    return place + " **" + row.name + "** - " + row.hours.toFixed(1) + " hours";
  });
  await message.reply({ embeds: [embed("Listening leaderboard, this " + period, lines.join("\n"))] });
}

async function libraryHits(query, limit) {
  const libraries = await abs.bookLibraries();
  const found = [];
  for (const library of libraries) {
    const hits = await abs.searchLibrary(library.id, query, limit);
    hits.forEach((hit) => {
      if (!found.some((item) => item.id === hit.id)) found.push(hit);
    });
  }
  return found;
}

async function handleWho(message, args, data) {
  if (!args.trim()) {
    await message.reply("Usage: !audiobookshelf who BOOK");
    return;
  }
  const hits = await libraryHits(args, SEARCH_LIMIT);
  if (hits.length === 0) {
    await message.reply("I couldn't find \"" + args + "\" in the library.");
    return;
  }
  const ids = new Set(hits.map((hit) => hit.id));
  const lines = [];
  for (const id of guildLinks(message, data)) {
    const progress = await abs.getProgress(data.links[id].userId);
    if (!progress.ok) continue;
    const entry = progress.entries.find((item) => ids.has(item.itemId) && (item.finished || item.progress > 0));
    if (entry) lines.push(memberName(message.guild, id) + " - " + (entry.finished ? "finished" : percent(entry) + "%"));
  }
  if (lines.length === 0) {
    await message.reply("Nobody here has started \"" + hits[0].title + "\".");
    return;
  }
  await message.reply({ embeds: [embed("Who has listened to " + hits[0].title, lines.join("\n"))] });
}

async function handleSearch(message, args) {
  if (!args.trim()) {
    await message.reply("Usage: !audiobookshelf search BOOK");
    return;
  }
  const hits = (await libraryHits(args, SEARCH_LIMIT)).slice(0, SEARCH_LIMIT);
  if (hits.length === 0) {
    await message.reply("Nothing in the library matches \"" + args + "\".");
    return;
  }
  const lines = hits.map((hit) => bookLine(hit) + (hit.duration ? " - " + abs.formatDuration(hit.duration) : ""));
  await message.reply({ embeds: [embed("Library results", lines.join("\n"))] });
}

async function handleNew(message) {
  const libraries = await abs.bookLibraries();
  let items = [];
  for (const library of libraries) {
    const recent = await abs.recentItems(library.id, NEW_BOOK_LIMIT);
    if (recent) items = items.concat(recent);
  }
  items.sort((a, b) => b.addedAt - a.addedAt);
  items = items.slice(0, NEW_BOOK_LIMIT);
  if (items.length === 0) {
    await message.reply("I couldn't find any books in the library.");
    return;
  }
  await message.reply({ embeds: [embed("Newest in the library", items.map((item) => bookLine(item)).join("\n"))] });
}

async function handleCompare(message, args, data) {
  const ids = mentionedIds(args);
  if (ids.length === 0) {
    await message.reply("Usage: !audiobookshelf compare @member [@member]");
    return;
  }
  const firstId = ids.length > 1 ? ids[0] : message.author.id;
  const secondId = ids.length > 1 ? ids[1] : ids[0];
  if (firstId === secondId) {
    await message.reply("Pick two different members to compare.");
    return;
  }
  const missing = [firstId, secondId].find((id) => !data.links[id]);
  if (missing) {
    await message.reply(memberName(message.guild, missing) + " hasn't linked an Audiobookshelf account yet.");
    return;
  }
  const first = await abs.getProgress(data.links[firstId].userId);
  const second = await abs.getProgress(data.links[secondId].userId);
  if (!first.ok || !second.ok) {
    await message.reply("I couldn't read both Audiobookshelf accounts right now.");
    return;
  }
  const secondDone = new Set(finishedEntries(second.entries).map((entry) => entry.itemId));
  const shared = finishedEntries(first.entries).filter((entry) => secondDone.has(entry.itemId));
  const nameA = memberName(message.guild, firstId);
  const nameB = memberName(message.guild, secondId);
  const described = (await Promise.all(shared.slice(0, LIST_LIMIT).map(describe))).filter(Boolean);
  if (described.length === 0) {
    await message.reply(nameA + " and " + nameB + " haven't finished any of the same audiobooks yet.");
    return;
  }
  const summary = nameA + " and " + nameB + " have finished " + shared.length + " audiobook" + (shared.length === 1 ? "" : "s") + " in common.";
  await message.reply({ embeds: [embed("Listening overlap", summary + "\n\n" + described.map((row) => bookLine(row.item)).join("\n"))] });
}

async function handleAudiobookshelf(message, args) {
  const config = loadConfig();
  if (!books.hasBooksRole(message, config)) {
    await message.reply("You need the books role to use !audiobookshelf.");
    return;
  }
  const trimmed = args.trim();
  const space = trimmed.indexOf(" ");
  const sub = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
  const rest = space === -1 ? "" : trimmed.slice(space + 1).trim();

  if (sub === "" || sub === "help") {
    await message.reply({ embeds: [helpEmbed(config)] });
    return;
  }
  if (!abs.loadSettings().ready) {
    await message.reply("Audiobookshelf isn't set up yet. An admin needs to fill in ABS_URL and ABS_TOKEN in plugins/audiobookshelf/.env.");
    return;
  }

  const data = loadData();
  if (sub === "link") await handleLink(message, rest, data);
  else if (sub === "unlink") await handleUnlink(message, rest, data);
  else if (sub === "nowplaying") await handleNowPlaying(message, rest, data);
  else if (sub === "finished") await handleFinished(message, rest, data);
  else if (sub === "stats") await handleStats(message, rest, data);
  else if (sub === "leaderboard") await handleLeaderboard(message, rest, data);
  else if (sub === "who") await handleWho(message, rest, data);
  else if (sub === "search") await handleSearch(message, rest);
  else if (sub === "new") await handleNew(message);
  else if (sub === "compare") await handleCompare(message, rest, data);
  else await message.reply({ embeds: [helpEmbed(config)] });
}

function findAnnounceChannel(guild, config) {
  const name = String(config.announceChannel || "books").toLowerCase();
  return guild.channels.cache.find(
    (channel) => String(channel.name).toLowerCase() === name && channel.isTextBased && channel.isTextBased()
  );
}

async function announce(guild, config, card, cover) {
  const channel = findAnnounceChannel(guild, config);
  if (!channel) return;
  const payload = { embeds: [card] };
  if (cover) {
    card.setThumbnail("attachment://" + cover.name);
    payload.files = [cover];
  }
  try {
    await channel.send(payload);
  } catch (err) {
    console.error("Audiobookshelf announcement failed:", err.message);
  }
}

async function findRating(userId, title) {
  for (const source of books.getSources(ctx)) {
    if (typeof source.rating !== "function") continue;
    try {
      const value = await source.rating(userId, title);
      if (value > 0) return value;
    } catch (err) {
      console.error("Could not look up a rating:", err.message);
    }
  }
  return 0;
}

async function announceFinished(userId, item, config) {
  if (!books.claimAnnouncement(userId, item.title)) return;
  const rating = await findRating(userId, item.title);
  for (const guild of Array.from(ctx.client.guilds.cache.values())) {
    if (!guild.members.cache.has(userId)) continue;
    const lines = [];
    if (item.author) lines.push("by " + item.author);
    if (item.duration) lines.push(abs.formatDuration(item.duration) + " listened");
    if (rating) lines.push(books.stars(rating));
    const card = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(memberName(guild, userId) + " finished " + item.title)
      .setDescription(lines.join("\n") || "Finished an audiobook");
    const url = abs.itemUrl(item.id);
    if (url) card.setURL(url);
    await announce(guild, config, card, await abs.coverFile(item.id));
  }
}

async function newSince(libraryId, since) {
  const found = [];
  for (let page = 0; page < NEW_BOOK_MAX_PAGES; page++) {
    const items = await abs.recentItems(libraryId, NEW_BOOK_PAGE_SIZE, page);
    if (!items) return null;
    const fresh = items.filter((item) => item.addedAt > since);
    fresh.forEach((item) => found.push(item));
    if (items.length < NEW_BOOK_PAGE_SIZE || fresh.length < items.length) break;
  }
  return found;
}

async function announceNewBooks(data, config) {
  if (config.announceNewBooks === false) return false;
  const libraries = await abs.bookLibraries();
  let items = [];
  for (const library of libraries) {
    const found = await newSince(library.id, data.newestAddedAt);
    if (found) items = items.concat(found);
  }
  if (items.length === 0) return false;
  const newest = Math.max.apply(null, items.map((item) => item.addedAt));
  if (!data.newestAddedAt) {
    data.newestAddedAt = newest;
    return true;
  }
  items.sort((a, b) => a.addedAt - b.addedAt);
  const shown = items.slice(0, MAX_NEW_BOOK_CARDS);
  const hidden = items.length - shown.length;
  for (const item of shown) {
    for (const guild of Array.from(ctx.client.guilds.cache.values())) {
      const card = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle("New in the library: " + item.title)
        .setDescription(((item.author ? "by " + item.author + "\n" : "") + (item.duration ? abs.formatDuration(item.duration) : "")).trim() || "A new book was added");
      const url = abs.itemUrl(item.id);
      if (url) card.setURL(url);
      await announce(guild, config, card, await abs.coverFile(item.id));
    }
  }
  if (hidden > 0) {
    for (const guild of Array.from(ctx.client.guilds.cache.values())) {
      const channel = findAnnounceChannel(guild, config);
      if (!channel) continue;
      try {
        await channel.send("...and " + hidden + " more book" + (hidden === 1 ? "" : "s") + " added to Audiobookshelf!");
      } catch (err) {
        console.error("Audiobookshelf announcement failed:", err.message);
      }
    }
  }
  data.newestAddedAt = newest;
  return true;
}

async function checkProgress() {
  if (checking || !ctx || !abs.loadSettings().ready) return;
  checking = true;
  try {
    const config = loadConfig();
    const data = loadData();
    let changed = false;
    for (const userId of Object.keys(data.links)) {
      const link = data.links[userId];
      const progress = await abs.getProgress(link.userId);
      if (!progress.ok) continue;
      const seen = new Set(link.seen || []);
      const fresh = finishedEntries(progress.entries).filter((entry) => !seen.has(entry.itemId));
      if (fresh.length === 0) continue;
      for (const entry of fresh.slice(0, MAX_ANNOUNCE_PER_USER).reverse()) {
        const item = await abs.getItem(entry.itemId);
        if (item) await announceFinished(userId, item, config);
      }
      fresh.forEach((entry) => seen.add(entry.itemId));
      link.seen = Array.from(seen).slice(-MAX_SEEN_PER_USER);
      changed = true;
    }
    if (await announceNewBooks(data, config)) changed = true;
    if (changed) saveData(data);
  } catch (err) {
    console.error("Audiobookshelf check failed:", err.message);
  } finally {
    checking = false;
  }
}

const bookSource = {
  name: "Audiobookshelf",
  config: loadConfig,
  helpCommand: "!ab help",
  about: "audiobooks",
  isLinked(discordId) {
    return !!loadData().links[discordId];
  },
  async currently(discordId) {
    const link = loadData().links[discordId];
    if (!link) return [];
    const progress = await abs.getProgress(link.userId);
    if (!progress.ok) return [];
    const active = progress.entries.filter((entry) => !entry.finished && entry.progress > 0).sort((a, b) => b.lastUpdate - a.lastUpdate).slice(0, 3);
    const described = (await Promise.all(active.map(describe))).filter(Boolean);
    return described.map((row) => ({ title: row.item.title, author: row.item.author, image: "", verb: "listening", percent: percent(row.entry) }));
  },
  async finished(discordId, options) {
    const link = loadData().links[discordId];
    if (!link) return [];
    const progress = await abs.getProgress(link.userId);
    if (!progress.ok) return [];
    const year = options && options.year;
    const done = finishedEntries(progress.entries).filter((entry) => !year || yearOf(entry.finishedAt) === year);
    const described = (await Promise.all(done.map(describe))).filter(Boolean);
    return described.map((row) => ({ title: row.item.title, author: row.item.author, year: yearOf(row.entry.finishedAt), month: monthOf(row.entry.finishedAt), rating: 0, pages: 0 }));
  },
  async listening(discordId) {
    const link = loadData().links[discordId];
    if (!link) return null;
    const result = await abs.getListeningDays(link.userId);
    return result.ok ? { days: result.days } : null;
  },
  async find(discordId, query) {
    const link = loadData().links[discordId];
    if (!link) return [];
    const hits = await libraryHits(query, SEARCH_LIMIT);
    if (hits.length === 0) return [];
    const progress = await abs.getProgress(link.userId);
    if (!progress.ok) return [];
    const found = [];
    hits.forEach((hit) => {
      const entry = progress.entries.find((item) => item.itemId === hit.id && (item.finished || item.progress > 0));
      if (entry) found.push({ title: hit.title, status: entry.finished ? "finished" : "reading", detail: entry.finished ? "finished" : percent(entry) + "%" });
    });
    return found;
  }
};

const visible = async (message) => books.hasBooksRole(message, loadConfig());

module.exports = {
  name: "audiobookshelf",
  register(context) {
    ctx = context;
    books.registerSource(context, bookSource);
  },
  onReady(context) {
    ctx = context;
    context.cron.schedule("*/" + pollMinutes(loadConfig()) + " * * * *", () => checkProgress());
  },
  commands: [
    { name: "audiobookshelf", run: (message, args) => handleAudiobookshelf(message, args) },
    { name: "ab", run: (message, args) => handleAudiobookshelf(message, args) }
  ],
  help: [
    { order: 260, text: "!audiobookshelf link USERNAME - link your Audiobookshelf account so I post when you finish a book; !audiobookshelf help lists every command and !ab works too (books role)", visible: visible },
    { order: 261, text: "!audiobookshelf unlink - remove your Audiobookshelf link", visible: visible },
    { order: 262, text: "!audiobookshelf nowplaying - show what you or @member are listening to", visible: visible },
    { order: 263, text: "!audiobookshelf finished - recently finished audiobooks for you or @member", visible: visible },
    { order: 264, text: "!audiobookshelf stats - books finished and hours listened for you or @member", visible: visible },
    { order: 265, text: "!audiobookshelf leaderboard - rank members by hours listened, week, month or year", visible: visible },
    { order: 266, text: "!audiobookshelf who BOOK - show who here has listened to a book", visible: visible },
    { order: 267, text: "!audiobookshelf search BOOK - look a book up in the library", visible: visible },
    { order: 268, text: "!audiobookshelf new - the newest books in the library", visible: visible },
    { order: 269, text: "!audiobookshelf compare - audiobooks you and @member have both finished", visible: visible }
  ]
};
