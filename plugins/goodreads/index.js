const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { EmbedBuilder } = require("discord.js");
const { fetchShelf, parseLinkInput } = require("./feed");

const ROOT = path.join(__dirname, "..", "..");
const LINKS_PATH = path.join(ROOT, "goodreads.json");
const CONFIG_PATH = path.join(__dirname, "config.yaml");
const EMBED_COLOR = 0xb7a58a;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_POLL_MINUTES = 30;
const MAX_ANNOUNCE_PER_USER = 3;
const MAX_SEEN_PER_USER = 500;
const LIST_LIMIT = 10;
const COMMAND_LIMIT = 25;
const REVIEW_PREVIEW_CHARS = 300;
const SHELVES = ["read", "to-read", "currently-reading"];
const MEDALS = ["🥇", "🥈", "🥉"];
const MIN_LEADERBOARD_YEAR = 1900;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const USAGE = "Usage: !goodreads link USERID, unlink, currently [@member], shelf [@member] [read|to-read|currently-reading], " +
  "who BOOK, overlap, leaderboard [YEAR], or compare @member [@member]";

let ctx = null;
let checking = false;
const feedCache = new Map();

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

function loadLinks() {
  try {
    const data = JSON.parse(fs.readFileSync(LINKS_PATH, "utf8"));
    return (data && typeof data === "object") ? data : {};
  } catch (err) {
    return {};
  }
}

function saveLinks(links) {
  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2) + "\n");
}

function hasBooksRole(message, config) {
  if (!message.guild || !message.member) return false;
  const roles = Array.from(message.member.roles.cache.values());
  if (config.roleId) return roles.some((role) => String(role.id) === String(config.roleId));
  const wanted = String(config.roleName || "books").toLowerCase();
  return roles.some((role) => String(role.name).toLowerCase() === wanted);
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stars(rating) {
  if (!rating) return "not rated";
  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

function monthYear(text) {
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return "";
  return MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear();
}

function memberName(guild, id) {
  const member = guild && guild.members.cache.get(id);
  if (!member) return "<@" + id + ">";
  return member.displayName || (member.user && (member.user.globalName || member.user.username)) || "<@" + id + ">";
}

function mentionedIds(text) {
  const ids = [];
  const pattern = /<@!?(\w+)>/g;
  let match;
  while ((match = pattern.exec(text)) !== null) ids.push(match[1]);
  return ids;
}

function stripMentions(text) {
  return text.replace(/<@!?\w+>/g, " ").replace(/\s+/g, " ").trim();
}

async function shelfFor(link, shelf, fresh) {
  const key = link.userId + "|" + (link.key || "") + "|" + shelf;
  const cached = feedCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;
  const result = await fetchShelf(link, shelf);
  if (result.ok) feedCache.set(key, { at: Date.now(), result: result });
  return result;
}

function embed(title, description) {
  return new EmbedBuilder().setColor(EMBED_COLOR).setTitle(title).setDescription(description.slice(0, 4000));
}

async function handleLink(message, args, links) {
  const parsed = parseLinkInput(args);
  if (!parsed) {
    await message.reply("Usage: !goodreads link USERID (the number in your Goodreads profile link, like goodreads.com/user/show/12345678)");
    return;
  }
  if (parsed.key) {
    try {
      await message.delete();
    } catch (err) {
      console.error("Could not delete a message containing a Goodreads key:", err.message);
    }
  }

  const result = await shelfFor(parsed, "read", true);
  if (!result.ok) {
    await message.channel.send(
      "I couldn't read that Goodreads feed. Make sure the ID is right and your profile and shelves are set to public in your Goodreads privacy settings."
    );
    return;
  }

  links[message.author.id] = {
    userId: parsed.userId,
    key: parsed.key,
    seen: result.items.map((item) => item.bookId).filter(Boolean).slice(0, MAX_SEEN_PER_USER)
  };
  saveLinks(links);
  await message.channel.send(
    "Linked " + memberName(message.guild, message.author.id) + " to Goodreads user " + parsed.userId + ". I'll post when you finish a book " +
    "(" + result.items.length + " already on your read shelf, so I won't announce those)."
  );
}

async function handleUnlink(message, args, links) {
  const link = links[message.author.id];
  if (!link) {
    await message.reply("You don't have a Goodreads account linked.");
    return;
  }
  const given = parseLinkInput(args);
  if (args && (!given || given.userId !== link.userId)) {
    await message.reply("That ID doesn't match the Goodreads account you linked.");
    return;
  }
  delete links[message.author.id];
  saveLinks(links);
  await message.reply("Unlinked your Goodreads account.");
}

function resolveTarget(message, args, links) {
  const ids = mentionedIds(args);
  const id = ids.length > 0 ? ids[0] : message.author.id;
  return { id: id, link: links[id], name: memberName(message.guild, id), rest: stripMentions(args) };
}

async function handleCurrently(message, args, links) {
  const target = resolveTarget(message, args, links);
  if (!target.link) {
    await message.reply(target.name + " hasn't linked a Goodreads account yet.");
    return;
  }
  const result = await shelfFor(target.link, "currently-reading");
  if (!result.ok) {
    await message.reply("I couldn't read " + target.name + "'s Goodreads feed right now.");
    return;
  }
  if (result.items.length === 0) {
    await message.reply(target.name + " isn't reading anything right now.");
    return;
  }
  const lines = result.items.slice(0, 5).map((item) => "**" + item.title + "**" + (item.author ? " by " + item.author : ""));
  const card = embed(target.name + " is reading", lines.join("\n"));
  const cover = result.items.find((item) => item.image);
  if (cover) card.setThumbnail(cover.image);
  await message.reply({ embeds: [card] });
}

async function handleShelf(message, args, links) {
  const target = resolveTarget(message, args, links);
  const shelf = SHELVES.find((name) => name === target.rest.toLowerCase()) || (target.rest ? null : "read");
  if (!shelf) {
    await message.reply("Shelf must be read, to-read or currently-reading.");
    return;
  }
  if (!target.link) {
    await message.reply(target.name + " hasn't linked a Goodreads account yet.");
    return;
  }
  const result = await shelfFor(target.link, shelf);
  if (!result.ok) {
    await message.reply("I couldn't read " + target.name + "'s Goodreads feed right now.");
    return;
  }
  if (result.items.length === 0) {
    await message.reply("Nothing on " + target.name + "'s " + shelf + " shelf yet.");
    return;
  }
  const lines = result.items.slice(0, LIST_LIMIT).map((item) => {
    const detail = [];
    if (shelf === "read") {
      detail.push(stars(item.rating));
      const when = monthYear(item.readAt);
      if (when) detail.push(when);
    }
    return "**" + item.title + "**" + (item.author ? " by " + item.author : "") + (detail.length ? " - " + detail.join(", ") : "");
  });
  const more = result.items.length > LIST_LIMIT ? "\n...and " + (result.items.length - LIST_LIMIT) + " more" : "";
  const card = embed(target.name + "'s " + shelf + " shelf", lines.join("\n") + more);
  const cover = result.items.find((item) => item.image);
  if (cover) card.setThumbnail(cover.image);
  await message.reply({ embeds: [card] });
}

function guildLinks(message, links) {
  return Object.keys(links)
    .filter((id) => message.guild.members.cache.has(id))
    .slice(0, COMMAND_LIMIT);
}

async function handleWho(message, args, links) {
  const query = normalize(args);
  if (!query) {
    await message.reply("Usage: !goodreads who BOOK");
    return;
  }
  const lines = [];
  let title = "";
  for (const id of guildLinks(message, links)) {
    const result = await shelfFor(links[id], "read");
    if (!result.ok) continue;
    const hit = result.items.find((item) => normalize(item.title).includes(query));
    if (!hit) continue;
    if (!title) title = hit.title;
    lines.push(memberName(message.guild, id) + " - " + stars(hit.rating));
  }
  if (lines.length === 0) {
    await message.reply("Nobody here has marked \"" + args + "\" as read.");
    return;
  }
  await message.reply({ embeds: [embed("Who has read " + title, lines.join("\n"))] });
}

async function handleOverlap(message, links) {
  const books = new Map();
  for (const id of guildLinks(message, links)) {
    const result = await shelfFor(links[id], "to-read");
    if (!result.ok) continue;
    result.items.forEach((item) => {
      const key = item.bookId || normalize(item.title);
      if (!books.has(key)) books.set(key, { title: item.title, who: new Set() });
      books.get(key).who.add(memberName(message.guild, id));
    });
  }
  const shared = Array.from(books.values())
    .filter((book) => book.who.size >= 2)
    .sort((a, b) => (b.who.size - a.who.size) || a.title.localeCompare(b.title))
    .slice(0, LIST_LIMIT);
  if (shared.length === 0) {
    await message.reply("No books are on more than one member's to-read shelf yet.");
    return;
  }
  const lines = shared.map((book) => "**" + book.title + "** - " + Array.from(book.who).join(", "));
  await message.reply({ embeds: [embed("On more than one to-read shelf", lines.join("\n"))] });
}

function readYear(readAt) {
  const match = String(readAt || "").match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : null;
}

async function handleLeaderboard(message, args, links) {
  const thisYear = new Date(Date.now()).getFullYear();
  let year = thisYear;
  if (args) {
    year = /^\d{4}$/.test(args.trim()) ? parseInt(args.trim(), 10) : NaN;
    if (!(year >= MIN_LEADERBOARD_YEAR && year <= thisYear)) {
      await message.reply("Usage: !goodreads leaderboard [YEAR], like !goodreads leaderboard " + thisYear);
      return;
    }
  }

  const rows = [];
  for (const id of guildLinks(message, links)) {
    const result = await shelfFor(links[id], "read");
    if (!result.ok) continue;
    const finished = result.items.filter((item) => readYear(item.readAt) === year);
    if (finished.length === 0) continue;
    rows.push({
      name: memberName(message.guild, id),
      books: finished.length,
      pages: finished.reduce((sum, item) => sum + item.pages, 0)
    });
  }
  if (rows.length === 0) {
    await message.reply("Nobody has finished a book in " + year + " yet.");
    return;
  }

  rows.sort((a, b) => (b.books - a.books) || (b.pages - a.pages) || a.name.localeCompare(b.name));
  const lines = rows.slice(0, LIST_LIMIT).map((row, index) => {
    const place = index < MEDALS.length ? MEDALS[index] : (index + 1) + ".";
    const pages = row.pages > 0 ? " (" + row.pages.toLocaleString("en-US") + " pages)" : "";
    return place + " **" + row.name + "** - " + row.books + " book" + (row.books === 1 ? "" : "s") + pages;
  });
  await message.reply({ embeds: [embed("Reading leaderboard " + year, lines.join("\n"))] });
}

async function handleCompare(message, args, links) {
  const ids = mentionedIds(args);
  if (ids.length === 0) {
    await message.reply("Usage: !goodreads compare @member [@member]");
    return;
  }
  const firstId = ids.length > 1 ? ids[0] : message.author.id;
  const secondId = ids.length > 1 ? ids[1] : ids[0];
  if (firstId === secondId) {
    await message.reply("Pick two different members to compare.");
    return;
  }
  const missing = [firstId, secondId].find((id) => !links[id]);
  if (missing) {
    await message.reply(memberName(message.guild, missing) + " hasn't linked a Goodreads account yet.");
    return;
  }
  const first = await shelfFor(links[firstId], "read");
  const second = await shelfFor(links[secondId], "read");
  if (!first.ok || !second.ok) {
    await message.reply("I couldn't read both Goodreads feeds right now.");
    return;
  }

  const byId = new Map(second.items.filter((item) => item.bookId).map((item) => [item.bookId, item]));
  const shared = first.items
    .filter((item) => item.bookId && byId.has(item.bookId))
    .map((item) => ({ title: item.title, a: item.rating, b: byId.get(item.bookId).rating }));
  const nameA = memberName(message.guild, firstId);
  const nameB = memberName(message.guild, secondId);
  if (shared.length === 0) {
    await message.reply(nameA + " and " + nameB + " haven't read any of the same books yet.");
    return;
  }

  const rated = shared.filter((book) => book.a > 0 && book.b > 0);
  let summary = nameA + " and " + nameB + " have read " + shared.length + " book" + (shared.length === 1 ? "" : "s") + " in common.";
  if (rated.length > 0) {
    const gap = rated.reduce((sum, book) => sum + Math.abs(book.a - book.b), 0) / rated.length;
    summary += " Taste match: " + Math.round(100 - gap * 25) + "% across " + rated.length + " book" + (rated.length === 1 ? "" : "s") + " you both rated.";
  }
  const lines = shared.slice(0, LIST_LIMIT).map((book) => "**" + book.title + "** - " + nameA + " " + stars(book.a) + ", " + nameB + " " + stars(book.b));
  await message.reply({ embeds: [embed("Reading overlap", summary + "\n\n" + lines.join("\n"))] });
}

async function handleGoodreads(message, args) {
  const config = loadConfig();
  if (!hasBooksRole(message, config)) {
    await message.reply("You need the books role to use !goodreads.");
    return;
  }

  const trimmed = args.trim();
  const space = trimmed.indexOf(" ");
  const sub = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
  const rest = space === -1 ? "" : trimmed.slice(space + 1).trim();
  const links = loadLinks();

  if (sub === "link") await handleLink(message, rest, links);
  else if (sub === "unlink") await handleUnlink(message, rest, links);
  else if (sub === "currently") await handleCurrently(message, rest, links);
  else if (sub === "shelf") await handleShelf(message, rest, links);
  else if (sub === "who") await handleWho(message, rest, links);
  else if (sub === "overlap") await handleOverlap(message, links);
  else if (sub === "leaderboard") await handleLeaderboard(message, rest, links);
  else if (sub === "compare") await handleCompare(message, rest, links);
  else await message.reply(USAGE);
}

function findAnnounceChannel(guild, config) {
  const name = String(config.announceChannel || "books").toLowerCase();
  return guild.channels.cache.find(
    (channel) => String(channel.name).toLowerCase() === name && channel.isTextBased && channel.isTextBased()
  );
}

async function announceFinished(userId, item) {
  const config = loadConfig();
  for (const guild of Array.from(ctx.client.guilds.cache.values())) {
    const member = guild.members.cache.get(userId);
    if (!member) continue;
    const channel = findAnnounceChannel(guild, config);
    if (!channel) continue;

    const lines = [stars(item.rating) + (item.pages ? " - " + item.pages + " pages" : "")];
    if (item.review) {
      const preview = item.review.length > REVIEW_PREVIEW_CHARS ? item.review.slice(0, REVIEW_PREVIEW_CHARS) + "..." : item.review;
      lines.push("||" + preview.replace(/\|/g, "") + "||");
    }
    const card = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(memberName(guild, userId) + " finished " + item.title)
      .setDescription(((item.author ? "by " + item.author + "\n" : "") + lines.join("\n")).slice(0, 4000));
    if (item.link) card.setURL(item.link);
    if (item.image) card.setThumbnail(item.image);
    try {
      await channel.send({ embeds: [card] });
    } catch (err) {
      console.error("Goodreads announcement failed:", err.message);
    }
  }
}

async function checkFeeds() {
  if (checking || !ctx) return;
  checking = true;
  try {
    const links = loadLinks();
    let changed = false;
    for (const userId of Object.keys(links)) {
      const link = links[userId];
      const result = await shelfFor(link, "read", true);
      if (!result.ok) continue;

      const seen = new Set(link.seen || []);
      const fresh = result.items.filter((item) => item.bookId && !seen.has(item.bookId));
      if (fresh.length === 0) continue;

      for (const item of fresh.slice(0, MAX_ANNOUNCE_PER_USER).reverse()) {
        await announceFinished(userId, item);
      }
      fresh.forEach((item) => seen.add(item.bookId));
      link.seen = Array.from(seen).slice(-MAX_SEEN_PER_USER);
      changed = true;
    }
    if (changed) saveLinks(links);
  } catch (err) {
    console.error("Goodreads check failed:", err.message);
  } finally {
    checking = false;
  }
}

const visible = async (message) => hasBooksRole(message, loadConfig());

module.exports = {
  name: "goodreads",
  register(context) {
    ctx = context;
  },
  onReady(context) {
    ctx = context;
    context.cron.schedule("*/" + pollMinutes(loadConfig()) + " * * * *", () => checkFeeds());
  },
  commands: [
    { name: "goodreads", run: (message, args) => handleGoodreads(message, args) },
    { name: "gr", run: (message, args) => handleGoodreads(message, args) }
  ],
  help: [
    { order: 250, text: "!goodreads link USERID - link your Goodreads account (profile and shelves must be public) so I post when you finish a book; !gr works too (books role)", visible: visible },
    { order: 251, text: "!goodreads unlink - remove your Goodreads link", visible: visible },
    { order: 252, text: "!goodreads currently - show what you or @member are reading right now", visible: visible },
    { order: 253, text: "!goodreads shelf - show your or @member's read, to-read or currently-reading shelf", visible: visible },
    { order: 254, text: "!goodreads who BOOK - show who here has read a book and how they rated it", visible: visible },
    { order: 255, text: "!goodreads overlap - books that are on more than one member's to-read shelf", visible: visible },
    { order: 256, text: "!goodreads compare - compare reading taste with @member (or two members)", visible: visible },
    { order: 257, text: "!goodreads leaderboard - rank members by books finished this year, or !goodreads leaderboard YEAR for another year", visible: visible }
  ]
};
