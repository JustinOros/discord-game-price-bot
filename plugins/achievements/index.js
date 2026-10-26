const { EmbedBuilder } = require("discord.js");

const CACHE_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;
const TOP_N = 10;
const MEDALS = ["🥇", "🥈", "🥉"];
const MIN_LOOSE_MATCH = 4;

const libraryCache = new Map();
const achievementCache = new Map();

function isFresh(entry) {
  return !!entry && Date.now() - entry.at < CACHE_MS;
}

function simplify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  const lanes = Math.min(CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

async function loadLibrary(steamId, ctx) {
  const cached = libraryCache.get(steamId);
  if (isFresh(cached)) return cached.games;
  try {
    const games = await ctx.fetchOwnedGames(steamId);
    libraryCache.set(steamId, { at: Date.now(), games: games });
    return games;
  } catch (err) {
    console.error("Achievements: owned games failed for " + steamId + ":", err.message);
    return null;
  }
}

function titleMatches(gameName, roleTitle) {
  const game = simplify(gameName);
  const role = simplify(roleTitle);
  if (!game || !role) return 0;
  if (game === role) return 2;
  if (game.length >= MIN_LOOSE_MATCH && role.length >= MIN_LOOSE_MATCH && (game.includes(role) || role.includes(game))) return 1;
  return 0;
}

function resolveAppId(roleTitle, libraries) {
  const tallies = new Map();
  for (const library of libraries) {
    if (!library) continue;
    for (const game of library) {
      const score = titleMatches(game.name, roleTitle);
      if (score === 0) continue;
      const current = tallies.get(game.appid) || { appid: game.appid, name: game.name, exact: 0, loose: 0 };
      if (score === 2) current.exact += 1;
      else current.loose += 1;
      tallies.set(game.appid, current);
    }
  }
  const candidates = Array.from(tallies.values());
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.exact - a.exact) || (b.loose - a.loose) || (a.name.length - b.name.length) || (a.appid - b.appid));
  return candidates[0].appid;
}

async function fetchAchievements(steamId, appid, ctx) {
  const key = steamId + ":" + appid;
  const cached = achievementCache.get(key);
  if (isFresh(cached)) return cached.result;

  const url = "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?key=" +
    ctx.STEAM_API_KEY + "&steamid=" + steamId + "&appid=" + appid;
  let result;
  try {
    const res = await fetch(url);
    if (res.status === 403) {
      result = { state: "private" };
    } else if (res.status === 400) {
      result = { state: "none" };
    } else if (!res.ok) {
      return { state: "error" };
    } else {
      const data = await res.json();
      const stats = data && data.playerstats;
      const list = stats && Array.isArray(stats.achievements) ? stats.achievements : [];
      if (!stats || stats.success === false) {
        result = { state: /not public/i.test(String(stats && stats.error)) ? "private" : "none" };
      } else if (list.length === 0) {
        result = { state: "none" };
      } else {
        result = { state: "ok", unlocked: list.filter((item) => item.achieved === 1).length, total: list.length };
      }
    }
  } catch (err) {
    console.error("Achievements: lookup failed for " + key + ":", err.message);
    return { state: "error" };
  }
  achievementCache.set(key, { at: Date.now(), result: result });
  return result;
}

function roleMemberIds(guild, entry) {
  const role = guild.roles.cache.get(entry.roleId);
  if (!role) return [];
  return Array.from(role.members.values()).map((member) => member.id);
}

async function buildBoards(guild, entries, ctx) {
  const links = ctx.loadSteamLinks();
  const roster = entries
    .map((entry) => ({ entry: entry, ids: roleMemberIds(guild, entry).filter((id) => links[id]) }))
    .filter((item) => item.ids.length > 0);

  const steamIds = Array.from(new Set(roster.reduce((all, item) => all.concat(item.ids.map((id) => links[id])), [])));
  const libraries = new Map();
  await pool(steamIds, async (steamId) => {
    libraries.set(steamId, await loadLibrary(steamId, ctx));
  });

  const boards = roster.map((item) => ({
    title: item.entry.title,
    emoji: item.entry.emoji,
    appid: resolveAppId(item.entry.title, item.ids.map((id) => libraries.get(links[id]))),
    linked: item.ids.length,
    ids: item.ids,
    rows: [],
    hidden: 0
  }));

  const tasks = [];
  boards.forEach((board) => {
    if (!board.appid) return;
    board.ids.forEach((id) => tasks.push({ board: board, id: id, steamId: links[id] }));
  });

  await pool(tasks, async (task) => {
    const result = await fetchAchievements(task.steamId, task.board.appid, ctx);
    if (result.state === "ok") task.board.rows.push({ id: task.id, unlocked: result.unlocked, total: result.total });
    else if (result.state === "private") task.board.hidden += 1;
  });

  boards.forEach((board) => board.rows.sort(compareRows));
  return { boards: boards, linkedRoleMembers: roster.length };
}

function percent(unlocked, total) {
  return total > 0 ? Math.round((unlocked / total) * 100) : 0;
}

function compareRows(a, b) {
  return (b.unlocked - a.unlocked) || (percent(b.unlocked, b.total) - percent(a.unlocked, a.total)) || String(a.id).localeCompare(String(b.id));
}

function nameOf(guild, id) {
  const member = guild.members.cache.get(id);
  if (!member) return "Unknown member";
  return member.displayName || (member.user && (member.user.globalName || member.user.username)) || "Unknown member";
}

function marker(index) {
  return index < MEDALS.length ? MEDALS[index] : (index + 1) + ".";
}

function gameCard(guild, board) {
  const lines = board.rows.slice(0, TOP_N).map((row, index) =>
    marker(index) + " **" + nameOf(guild, row.id) + "** - " + row.unlocked + "/" + row.total + " (" + percent(row.unlocked, row.total) + "%)"
  );
  if (board.rows.length > TOP_N) {
    const extra = board.rows.length - TOP_N;
    lines.push("...and " + extra + " more member" + (extra === 1 ? "" : "s") + ".");
  }
  if (board.hidden > 0) {
    lines.push("*" + board.hidden + " member" + (board.hidden === 1 ? " has" : "s have") + " a private Steam profile.*");
  }
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle((board.emoji ? board.emoji + " " : "") + board.title + " achievements")
    .setDescription(lines.join("\n"));
}

function overviewCard(guild, boards, hidden) {
  const totals = new Map();
  boards.forEach((board) => {
    board.rows.forEach((row) => {
      const current = totals.get(row.id) || { id: row.id, unlocked: 0, total: 0, games: 0 };
      current.unlocked += row.unlocked;
      current.total += row.total;
      current.games += 1;
      totals.set(row.id, current);
    });
  });

  const ranked = Array.from(totals.values()).sort(compareRows);
  const lines = ranked.slice(0, TOP_N).map((row, index) =>
    marker(index) + " **" + nameOf(guild, row.id) + "** - " + row.unlocked + "/" + row.total + " (" + percent(row.unlocked, row.total) + "%) across " + row.games + " game" + (row.games === 1 ? "" : "s")
  );
  if (ranked.length > TOP_N) {
    const extra = ranked.length - TOP_N;
    lines.push("...and " + extra + " more member" + (extra === 1 ? "" : "s") + ".");
  }

  const leaders = boards
    .filter((board) => board.rows.length > 0)
    .map((board) => (board.emoji ? board.emoji + " " : "") + "**" + board.title + "**: " + nameOf(guild, board.rows[0].id) + " " + board.rows[0].unlocked + "/" + board.rows[0].total);
  if (leaders.length > 0) {
    lines.push("");
    lines.push("Top player per game:");
    leaders.forEach((line) => lines.push(line));
  }

  if (hidden > 0) lines.push("*" + hidden + " private Steam profile" + (hidden === 1 ? "" : "s") + " skipped.*");

  return new EmbedBuilder().setColor(0x5865f2).setTitle("Achievement leaderboard").setDescription(lines.join("\n"));
}

function pickEntry(entries, query) {
  const needle = simplify(query);
  const exact = entries.find((entry) => simplify(entry.title) === needle);
  if (exact) return exact;
  return entries.find((entry) => simplify(entry.title).includes(needle)) || null;
}

async function handleLeaderboard(message, query, ctx) {
  if (!message.guild) {
    await message.reply("The leaderboard only works inside a server, not in DMs.");
    return;
  }
  if (!ctx.STEAM_API_KEY) {
    await message.reply("The achievement leaderboard needs STEAM_API_KEY set in .env.");
    return;
  }

  let entries = ctx.sortedRoleEntries();
  if (entries.length === 0) {
    await message.reply("No game roles yet. Use !own GAME or !role GAME to create one.");
    return;
  }

  if (query) {
    const entry = pickEntry(entries, query);
    if (!entry) {
      await message.reply("No game role matches \"" + query + "\". Use !roles to see them.");
      return;
    }
    entries = [entry];
  }

  try {
    await message.guild.members.fetch();
  } catch (err) {
    console.error("Could not refresh member cache:", err.message);
  }

  try {
    await message.channel.sendTyping();
  } catch (err) {
    console.error("Could not show typing:", err.message);
  }

  let built;
  try {
    built = await buildBoards(message.guild, entries, ctx);
  } catch (err) {
    console.error("Achievement leaderboard failed:", err.message);
    await message.reply("Couldn't reach Steam right now, try again in a moment.");
    return;
  }

  if (built.linkedRoleMembers === 0) {
    await message.reply("Nobody with " + (query ? "that role" : "a game role") + " has linked a Steam profile yet. Use !my-steam-profile LINK to link yours.");
    return;
  }

  const withData = built.boards.filter((board) => board.rows.length > 0);
  const hidden = built.boards.reduce((sum, board) => sum + board.hidden, 0);
  if (withData.length === 0) {
    const reason = hidden > 0
      ? "Every linked profile is private. Set Steam game details to public to show up."
      : "No achievement data found. The game may not have Steam achievements, or no linked member owns it.";
    await message.reply(reason);
    return;
  }

  const card = query ? gameCard(message.guild, withData[0]) : overviewCard(message.guild, withData, hidden);
  await message.reply({ embeds: [card], allowedMentions: { parse: [] } });
}

module.exports = {
  name: "achievements",
  commands: [{ name: "leaderboard", run: (message, args, ctx) => handleLeaderboard(message, args, ctx) }],
  help: [
    { order: 135, text: "!leaderboard [GAME] - rank members by Steam achievements unlocked, across every game role or for one game" }
  ]
};
