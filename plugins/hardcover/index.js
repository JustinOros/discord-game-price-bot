const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { EmbedBuilder } = require("discord.js");
const hc = require("./hc");
const books = require("../../core/books");
const { EMBED_COLOR, LIST_LIMIT, normalize, stars, memberName, mentionedIds, stripMentions, embed } = books;

const ROOT = path.join(__dirname, "..", "..");
const LINKS_PATH = path.join(ROOT, "hardcover.json");
const CONFIG_PATH = path.join(__dirname, "config.yaml");
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_POLL_MINUTES = 30;
const MAX_ANNOUNCE_PER_USER = 3;
const MAX_SEEN_PER_USER = 500;
const SHELVES = { read: hc.STATUS.read, reading: hc.STATUS.reading, "currently-reading": hc.STATUS.reading, "want-to-read": hc.STATUS.wantToRead, "to-read": hc.STATUS.wantToRead };
const SHELF_NAMES = { 1: "want to read", 2: "currently reading", 3: "read" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HARDCOVER_HELP = [
  ["!hardcover link USERNAME", "link your Hardcover account with your username (or paste your profile link); your profile needs to be public"],
  ["!hardcover unlink", "remove your Hardcover link"],
  ["!hardcover currently [@member]", "show what you, or the member you mention, are reading right now"],
  ["!hardcover shelf [@member] [read|reading|want-to-read]", "show a shelf, the read shelf by default"]
];

let ctx = null;
let checking = false;
const shelfCache = new Map();

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
  return books.hasBooksRole(message, config);
}

function readYear(readAt) {
  const match = String(readAt || "").match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function readMonth(readAt) {
  const match = String(readAt || "").match(/\b\d{1,2}\s+([A-Za-z]{3})/);
  if (!match) return null;
  const index = MONTHS.findIndex((name) => name.toLowerCase() === match[1].toLowerCase());
  return index >= 0 ? index : null;
}

function monthYear(readAt) {
  const month = readMonth(readAt);
  const year = readYear(readAt);
  return month === null || year === null ? "" : MONTHS[month] + " " + year;
}

async function shelfFor(link, status, fresh, firstPageOnly) {
  const key = link.userId + "|" + status + (firstPageOnly ? "|first" : "");
  const cached = shelfCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;
  const result = await hc.fetchShelf(link.userId, status, { firstPageOnly: !!firstPageOnly });
  if (result.ok) shelfCache.set(key, { at: Date.now(), result: result });
  return result;
}

function helpEmbed(config) {
  const channel = String(config.announceChannel || "books");
  const lines = HARDCOVER_HELP.map((entry) => "`" + entry[0] + "`\n" + entry[1]);
  return embed("Hardcover commands", lines.join("\n\n"))
    .setFooter({ text: "!hc works as a shortcut for !hardcover. New finished books are posted in #" + channel + "." });
}

async function handleLink(message, args, links) {
  if (!hc.loadSettings().ready) {
    await message.reply("Hardcover isn't set up yet. Put HARDCOVER_TOKEN in plugins/hardcover/.env to enable it.");
    return;
  }
  const username = hc.parseUsername(args);
  if (!username) {
    await message.reply("Usage: !hardcover link USERNAME (your Hardcover username, or the link to your profile)");
    return;
  }
  const found = await hc.findUser(username);
  if (!found.ok) {
    await message.reply("I couldn't reach Hardcover right now, try again in a moment.");
    return;
  }
  if (!found.user) {
    await message.reply("I couldn't find a Hardcover user called \"" + username + "\".");
    return;
  }
  const taken = Object.keys(links).find((id) => id !== message.author.id && links[id].userId === found.user.id);
  if (taken) {
    await message.reply("That Hardcover account is already linked to someone else.");
    return;
  }
  const result = await shelfFor({ userId: found.user.id }, hc.STATUS.read, true);
  if (!result.ok) {
    await message.reply("I couldn't read that Hardcover library. Make sure your profile and library are set to public.");
    return;
  }
  links[message.author.id] = {
    userId: found.user.id,
    username: found.user.username,
    seen: result.items.map((item) => item.bookId).filter(Boolean).slice(0, MAX_SEEN_PER_USER)
  };
  saveLinks(links);
  await message.reply(
    "Linked " + memberName(message.guild, message.author.id) + " to Hardcover user " + found.user.username + ". I'll post when you finish a book" +
    (result.items.length > 0 ? " (" + result.items.length + " already on your read shelf, so I won't announce those)." : ".")
  );
}

async function handleUnlink(message, links) {
  if (!links[message.author.id]) {
    await message.reply("You don't have a Hardcover account linked.");
    return;
  }
  delete links[message.author.id];
  saveLinks(links);
  await message.reply("Unlinked your Hardcover account.");
}

function resolveTarget(message, args, links) {
  const ids = mentionedIds(args);
  const id = ids.length > 0 ? ids[0] : message.author.id;
  return { id: id, link: links[id], name: memberName(message.guild, id), rest: stripMentions(args) };
}

async function handleCurrently(message, args, links) {
  const target = resolveTarget(message, args, links);
  if (!target.link) {
    await message.reply(target.name + " hasn't linked a Hardcover account yet.");
    return;
  }
  const result = await shelfFor(target.link, hc.STATUS.reading);
  if (!result.ok) {
    await message.reply("I couldn't read " + target.name + "'s Hardcover library right now.");
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
  const wanted = target.rest.toLowerCase();
  const status = wanted ? SHELVES[wanted] : hc.STATUS.read;
  if (!status) {
    await message.reply("Shelf must be read, reading or want-to-read.");
    return;
  }
  if (!target.link) {
    await message.reply(target.name + " hasn't linked a Hardcover account yet.");
    return;
  }
  const result = await shelfFor(target.link, status);
  if (!result.ok) {
    await message.reply("I couldn't read " + target.name + "'s Hardcover library right now.");
    return;
  }
  if (result.items.length === 0) {
    await message.reply("Nothing on " + target.name + "'s " + SHELF_NAMES[status] + " shelf yet.");
    return;
  }
  const lines = result.items.slice(0, LIST_LIMIT).map((item) => {
    const detail = [];
    if (status === hc.STATUS.read) {
      detail.push(stars(item.rating));
      const when = monthYear(item.readAt);
      if (when) detail.push(when);
    }
    return "**" + item.title + "**" + (item.author ? " by " + item.author : "") + (detail.length ? " - " + detail.join(", ") : "");
  });
  const more = result.items.length > LIST_LIMIT ? "\n...and " + (result.items.length - LIST_LIMIT) + " more" : "";
  const card = embed(target.name + "'s " + SHELF_NAMES[status] + " shelf", lines.join("\n") + more);
  const cover = result.items.find((item) => item.image);
  if (cover) card.setThumbnail(cover.image);
  await message.reply({ embeds: [card] });
}

async function handleHardcover(message, args) {
  const config = loadConfig();
  if (!hasBooksRole(message, config)) {
    await message.reply("You need the books role to use !hardcover.");
    return;
  }

  const trimmed = args.trim();
  const space = trimmed.indexOf(" ");
  const sub = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
  const rest = space === -1 ? "" : trimmed.slice(space + 1).trim();
  const links = loadLinks();

  if (sub === "link") await handleLink(message, rest, links);
  else if (sub === "unlink") await handleUnlink(message, links);
  else if (sub === "currently") await handleCurrently(message, rest, links);
  else if (sub === "shelf") await handleShelf(message, rest, links);
  else await message.reply({ embeds: [helpEmbed(config)] });
}

function findAnnounceChannel(guild, config) {
  const name = String(config.announceChannel || "books").toLowerCase();
  return guild.channels.cache.find(
    (channel) => String(channel.name).toLowerCase() === name && channel.isTextBased && channel.isTextBased()
  );
}

async function announceFinished(userId, item) {
  if (!books.claimAnnouncement(userId, item.title)) return;
  const config = loadConfig();
  for (const guild of Array.from(ctx.client.guilds.cache.values())) {
    const member = guild.members.cache.get(userId);
    if (!member) continue;
    const channel = findAnnounceChannel(guild, config);
    if (!channel) continue;

    const lines = [];
    const detail = [];
    if (item.rating > 0) detail.push(stars(item.rating));
    if (item.pages) detail.push(item.pages + " pages");
    if (detail.length > 0) lines.push(detail.join(" - "));
    const card = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(memberName(guild, userId) + " finished " + item.title)
      .setDescription(((item.author ? "by " + item.author + "\n" : "") + lines.join("\n")).trim().slice(0, 4000) || "Finished a book");
    if (item.link) card.setURL(item.link);
    if (item.image) card.setThumbnail(item.image);
    try {
      await channel.send({ embeds: [card] });
    } catch (err) {
      console.error("Hardcover announcement failed:", err.message);
    }
  }
}

async function checkLibraries() {
  if (checking || !ctx || !hc.loadSettings().ready) return;
  checking = true;
  try {
    const links = loadLinks();
    let changed = false;
    for (const userId of Object.keys(links)) {
      const link = links[userId];
      const result = await shelfFor(link, hc.STATUS.read, true, true);
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
    console.error("Hardcover check failed:", err.message);
  } finally {
    checking = false;
  }
}

const bookSource = {
  name: "Hardcover",
  config: loadConfig,
  helpCommand: "!hc help",
  about: "read books and shelves",
  isLinked(discordId) {
    return !!loadLinks()[discordId];
  },
  async currently(discordId) {
    const link = loadLinks()[discordId];
    if (!link) return [];
    const result = await shelfFor(link, hc.STATUS.reading);
    if (!result.ok) return [];
    return result.items.map((item) => ({
      title: item.title,
      author: item.author,
      image: item.image,
      verb: "reading",
      percent: item.pages > 0 && item.progressPages > 0 ? Math.min(100, Math.round((item.progressPages / item.pages) * 100)) : 0
    }));
  },
  async finished(discordId, options) {
    const link = loadLinks()[discordId];
    if (!link) return [];
    const result = await shelfFor(link, hc.STATUS.read);
    if (!result.ok) return [];
    const year = options && options.year;
    return result.items.filter((item) => !year || readYear(item.readAt) === year).map((item) => ({
      title: item.title,
      author: item.author,
      year: readYear(item.readAt),
      month: readMonth(item.readAt),
      rating: item.rating,
      pages: item.pages
    }));
  },
  async rating(discordId, title) {
    const link = loadLinks()[discordId];
    if (!link) return 0;
    const result = await shelfFor(link, hc.STATUS.read, true, true);
    if (!result.ok) return 0;
    const wanted = books.bookKey(title);
    const hit = result.items.find((item) => item.rating > 0 && books.bookKey(item.title) === wanted);
    return hit ? hit.rating : 0;
  },
  async find(discordId, query) {
    const link = loadLinks()[discordId];
    if (!link) return [];
    const wanted = normalize(query);
    const found = [];
    const read = await shelfFor(link, hc.STATUS.read);
    if (read.ok) {
      read.items.filter((item) => normalize(item.title).includes(wanted)).forEach((item) => {
        found.push({ title: item.title, status: "finished", detail: stars(item.rating) });
      });
    }
    const current = await shelfFor(link, hc.STATUS.reading);
    if (current.ok) {
      current.items.filter((item) => normalize(item.title).includes(wanted)).forEach((item) => {
        found.push({ title: item.title, status: "reading", detail: "" });
      });
    }
    return found;
  }
};

const visible = async (message) => hasBooksRole(message, loadConfig());

module.exports = {
  name: "hardcover",
  register(context) {
    ctx = context;
    books.registerSource(context, bookSource);
  },
  onReady(context) {
    ctx = context;
    context.cron.schedule("*/" + pollMinutes(loadConfig()) + " * * * *", () => checkLibraries());
  },
  commands: [
    { name: "hardcover", run: (message, args) => handleHardcover(message, args) },
    { name: "hc", run: (message, args) => handleHardcover(message, args) }
  ],
  help: [
    { order: 259, text: "!hardcover link USERNAME - link your Hardcover account (profile must be public) so I post when you finish a book; !hardcover help lists every Hardcover command and !hc works too (books role)", visible: visible }
  ]
};
