const books = require("./books");
const { LIST_LIMIT, COMMAND_LIMIT, normalize, bookKey, stars, memberName, mentionedIds, stripMentions, embed, getSources, hasBooksRole } = books;
const { safe, linkedSources, finishedKeys } = require("./booksData");
const { handleGoal, activeGoal } = require("./booksGoals");
const { handleRecommend } = require("./booksRecommend");
const { buildRecap, previousMonth, monthlyRecapTick, MONTH_NAMES } = require("./booksRecap");
const { loadState } = require("./booksState");

const MEDALS = ["🥇", "🥈", "🥉"];
const MIN_YEAR = 1900;
const BOOKS_HELP = [
  ["!books currently [@member|all]", "what you, the member you mention, or everyone with all, are reading or listening to right now, from every linked book service"],
  ["!books who BOOK", "who here has read or is reading a book, from every linked book service"],
  ["!books leaderboard [YEAR]", "rank members by books finished this year, or in the year you give, across every linked book service"],
  ["!books compare @member [@member]", "books two members have both finished"],
  ["!books goal [NUMBER|clear|@member]", "set a yearly reading goal, or see your progress or a member's"],
  ["!books recommend", "books other members rated 4 or 5 stars that you haven't read yet"],
  ["!books recap [this]", "last month's reading recap, or the current month so far with this"],
  ["!books link", "how to link a book service, like !gr link or !ab link"]
];

function helpEmbed(sources) {
  const services = sources.map((source) => "**" + source.name + "** - type `" + source.helpCommand + "` for its commands" +
    (source.about ? " (" + source.about + ")" : ""));
  const commands = BOOKS_HELP.map((entry) => "`" + entry[0] + "`\n" + entry[1]);
  const text = "**Book services here**\n" + services.join("\n") + "\n\n**Commands that work across all of them**\n\n" + commands.join("\n\n");
  return embed("Books commands", text).setFooter({ text: "Link a service first, then these commands include your books." });
}

function guildIds(message) {
  return message.guild.members.cache.map((member) => member.id).slice(0, 1000);
}

const SOURCE_WEIGHTS = { audiobookshelf: 3, hardcover: 2, goodreads: 1 };

function weightOf(source) {
  return SOURCE_WEIGHTS[String(source.name || "").toLowerCase()] || 0;
}

async function gatherCurrently(id, active, perSource) {
  const merged = new Map();
  const ranked = active.slice().sort((a, b) => weightOf(b) - weightOf(a));
  for (const source of ranked) {
    const items = await safe(source.currently(id));
    items.slice(0, perSource).forEach((item) => {
      const key = bookKey(item.title);
      const found = merged.get(key);
      if (!found) {
        merged.set(key, { item: item, source: source.name, percent: item.percent || 0, image: item.image || null });
        return;
      }
      if (!found.percent && item.percent) found.percent = item.percent;
      if (!found.image && item.image) found.image = item.image;
    });
  }
  return Array.from(merged.values())
    .map((entry, index) => ({ entry: entry, index: index }))
    .sort((a, b) => (b.entry.percent - a.entry.percent) || (a.index - b.index))
    .map((row) => row.entry);
}

function percentText(entry) {
  return entry.percent ? " (" + entry.percent + "%)" : "";
}

async function handleCurrentlyAll(message, sources) {
  const sections = [];
  for (const id of guildIds(message)) {
    const active = linkedSources(sources, id);
    if (active.length === 0) continue;
    const entries = await gatherCurrently(id, active, 3);
    if (entries.length === 0) continue;
    const lines = entries.map((entry) => "- " + entry.item.title + (entry.item.author ? " by " + entry.item.author : "") + percentText(entry) + " (" + entry.source + ")");
    sections.push("**" + memberName(message.guild, id) + "**\n" + lines.join("\n"));
  }
  if (sections.length === 0) {
    await message.reply("Nobody is reading anything right now.");
    return;
  }
  let text = "";
  let shown = 0;
  for (const section of sections) {
    if ((text + "\n\n" + section).length > 3800) break;
    text = text ? text + "\n\n" + section : section;
    shown += 1;
  }
  if (shown < sections.length) text += "\n\n...and " + (sections.length - shown) + " more.";
  await message.reply({ embeds: [embed("Currently reading", text)], allowedMentions: { parse: [] } });
}

async function handleCurrently(message, args, sources) {
  if (normalize(args) === "all") {
    await handleCurrentlyAll(message, sources);
    return;
  }
  const ids = mentionedIds(args);
  const id = ids.length > 0 ? ids[0] : message.author.id;
  const name = memberName(message.guild, id);
  const active = linkedSources(sources, id);
  if (active.length === 0) {
    await message.reply(name + " hasn't linked a book service yet. Use !gr link or !ab link.");
    return;
  }
  const entries = await gatherCurrently(id, active, 5);
  if (entries.length === 0) {
    await message.reply(name + " isn't reading anything right now.");
    return;
  }
  const lines = entries.map((entry) => "**" + entry.item.title + "**" + (entry.item.author ? " by " + entry.item.author : "") + percentText(entry) + " (" + entry.source + ")");
  const image = entries.map((entry) => entry.image).find(Boolean);
  const card = embed(name + " is reading", lines.join("\n"));
  if (image) card.setThumbnail(image);
  await message.reply({ embeds: [card] });
}

async function handleWho(message, args, sources) {
  const query = normalize(args);
  if (!query) {
    await message.reply("Usage: !books who BOOK");
    return;
  }
  const rows = new Map();
  let title = "";
  let count = 0;
  for (const id of guildIds(message)) {
    const active = linkedSources(sources, id);
    if (active.length === 0) continue;
    if (++count > COMMAND_LIMIT) break;
    for (const source of active) {
      const hits = await safe(source.find(id, args));
      for (const hit of hits) {
        if (!title) title = hit.title;
        const label = hit.status === "reading" ? "reading now" : (hit.detail || "finished");
        const key = id + "|" + bookKey(hit.title);
        const existing = rows.get(key);
        if (!existing || (existing.status === "reading" && hit.status === "finished")) {
          rows.set(key, { id: id, status: hit.status, label: label });
        }
      }
    }
  }
  if (rows.size === 0) {
    await message.reply("Nobody here has read or started \"" + args + "\".");
    return;
  }
  const lines = Array.from(rows.values()).map((row) => memberName(message.guild, row.id) + " - " + row.label);
  await message.reply({ embeds: [embed("Who has read " + title, lines.join("\n"))] });
}

async function handleLeaderboard(message, args, sources) {
  const thisYear = new Date(Date.now()).getFullYear();
  let year = thisYear;
  if (args) {
    year = /^\d{4}$/.test(args.trim()) ? parseInt(args.trim(), 10) : NaN;
    if (!(year >= MIN_YEAR && year <= thisYear)) {
      await message.reply("Usage: !books leaderboard [YEAR], like !books leaderboard " + thisYear);
      return;
    }
  }
  const state = loadState();
  const rows = [];
  let count = 0;
  for (const id of guildIds(message)) {
    if (linkedSources(sources, id).length === 0) continue;
    if (++count > COMMAND_LIMIT) break;
    const keys = await finishedKeys(id, sources, year);
    if (keys.size === 0) continue;
    const goal = activeGoal(state, id, year);
    rows.push({ name: memberName(message.guild, id), books: keys.size, goal: goal ? goal.target : 0 });
  }
  if (rows.length === 0) {
    await message.reply("Nobody has finished a book in " + year + " yet.");
    return;
  }
  rows.sort((a, b) => (b.books - a.books) || a.name.localeCompare(b.name));
  const lines = rows.slice(0, LIST_LIMIT).map((row, index) => {
    const place = index < MEDALS.length ? MEDALS[index] : (index + 1) + ".";
    return place + " **" + row.name + "** - " + row.books + " book" + (row.books === 1 ? "" : "s") + (row.goal ? " (goal " + row.goal + ")" : "");
  });
  await message.reply({ embeds: [embed("Reading leaderboard " + year, lines.join("\n"))] });
}

async function handleCompare(message, args, sources) {
  const ids = mentionedIds(args);
  if (ids.length === 0) {
    await message.reply("Usage: !books compare @member [@member]");
    return;
  }
  const firstId = ids.length > 1 ? ids[0] : message.author.id;
  const secondId = ids.length > 1 ? ids[1] : ids[0];
  if (firstId === secondId) {
    await message.reply("Pick two different members to compare.");
    return;
  }
  const missing = [firstId, secondId].find((id) => linkedSources(sources, id).length === 0);
  if (missing) {
    await message.reply(memberName(message.guild, missing) + " hasn't linked a book service yet.");
    return;
  }
  const first = await finishedKeys(firstId, sources, null);
  const second = await finishedKeys(secondId, sources, null);
  const nameA = memberName(message.guild, firstId);
  const nameB = memberName(message.guild, secondId);
  const shared = Array.from(first.keys()).filter((key) => second.has(key));
  if (shared.length === 0) {
    await message.reply(nameA + " and " + nameB + " haven't finished any of the same books yet.");
    return;
  }
  const lines = shared.slice(0, LIST_LIMIT).map((key) => {
    const a = first.get(key);
    const b = second.get(key);
    const rated = a.rating > 0 || b.rating > 0;
    return "**" + a.title + "**" + (rated ? " - " + nameA + " " + stars(a.rating) + ", " + nameB + " " + stars(b.rating) : "");
  });
  const summary = nameA + " and " + nameB + " have finished " + shared.length + " book" + (shared.length === 1 ? "" : "s") + " in common.";
  await message.reply({ embeds: [embed("Reading overlap", summary + "\n\n" + lines.join("\n"))] });
}

async function handleRecap(message, args, sources) {
  const now = new Date(Date.now());
  const wantsCurrent = args.trim().toLowerCase() === "this";
  const target = wantsCurrent ? { year: now.getFullYear(), month: now.getMonth() } : previousMonth(now);
  const card = await buildRecap(message.guild, sources, target.year, target.month);
  if (!card) {
    await message.reply("Nothing to recap for " + MONTH_NAMES[target.month] + " " + target.year + " yet.");
    return;
  }
  await message.reply({ embeds: [card] });
}

function allowed(message, sources) {
  return sources.some((source) => hasBooksRole(message, source.config()));
}

function createBooksPlugin() {
  return {
    name: "books",
    onReady(context) {
      context.cron.schedule("0 * * * *", () => monthlyRecapTick(context));
    },
    commands: [{
    name: "books",
    async run(message, args, context) {
      const sources = getSources(context);
      if (!allowed(message, sources)) {
        await message.reply("You need the books role to use !books.");
        return;
      }
      const trimmed = args.trim();
      const space = trimmed.indexOf(" ");
      const sub = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
      const rest = space === -1 ? "" : trimmed.slice(space + 1).trim();

      if (sub === "currently") await handleCurrently(message, rest, sources);
      else if (sub === "who") await handleWho(message, rest, sources);
      else if (sub === "leaderboard") await handleLeaderboard(message, rest, sources);
      else if (sub === "compare") await handleCompare(message, rest, sources);
      else if (sub === "goal") await handleGoal(message, rest, sources);
      else if (sub === "recommend") await handleRecommend(message, sources);
      else if (sub === "recap") await handleRecap(message, rest, sources);
      else if (sub === "link" || sub === "unlink") {
        await message.reply("Link with the book service's own command: " + sources.map((source) => source.name === "Goodreads" ? "!gr " + sub : source.name === "Audiobookshelf" ? "!ab " + sub : null).filter(Boolean).join(" or ") + ".");
      } else await message.reply({ embeds: [helpEmbed(sources)] });
    }
    }],
    help: [{
      order: 258,
      text: "!books currently, who, leaderboard, compare, goal, recommend or recap - book commands across every linked book service; !books help lists them (books role)",
      visible: async (message) => allowed(message, getSources(booksContext))
    }]
  };
}

let booksContext = null;

function attachBooks(plugins, context) {
  if (getSources(context).length === 0) return;
  booksContext = context;
  plugins.push(createBooksPlugin());
}

module.exports = { attachBooks };
