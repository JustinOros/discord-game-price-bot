require("dotenv").config();
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ITAD_API_KEY = process.env.ITAD_API_KEY;
const DISCORD_API = "https://discord.com/api/v10";
const ITAD_BASE = "https://api.isthereanydeal.com";
const OWNED_PATH = path.join(__dirname, "owned.json");
const ROLES_PATH = path.join(__dirname, "roles.yaml");

if (!DISCORD_BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set in .env. Run bash install.sh first to set it up.");
  process.exit(1);
}

if (!ITAD_API_KEY) {
  console.error("ITAD_API_KEY is not set in .env. Run bash install.sh first to set it up.");
  process.exit(1);
}

const ROLE_EMOJI_POOL = [
  "🎮", "🕹️", "🎲", "🎯", "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅",
  "⚔️", "🛡️", "🏹", "🗡️", "🔪", "🪓", "💣", "🧨", "🔫", "🔱",
  "🧙", "🧝", "🧛", "🧟", "🐉", "🐲", "👑", "💎", "🔮", "🗝️",
  "🔑", "🚀", "🛸", "🤖", "👾", "💀", "☠️", "🔥", "❄️", "⚡",
  "🌊", "🌪️", "🌋", "🌟", "⭐", "✨", "🌙", "☀️", "🍀", "🌵",
  "🌲", "🍄", "🦅", "🐺", "🦊", "🦁", "🐯", "🐻", "🐸", "🐍",
  "🕷️", "🦂", "🦇", "🦄", "🐴", "🐙", "🦑", "🦖", "🦕", "🐊",
  "🦈", "🐳", "🎃", "🥷", "🧭", "🏰", "🛶", "⛵", "🚁", "🚂",
  "🎸", "🎺", "🥁", "🎻", "🍕", "🍔", "🌮", "🍩", "☕", "🍺"
];

function normalizeTitle(str) {
  return str.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}

function cleanTitle(str) {
  return str.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}

function loadOwned() {
  if (!fs.existsSync(OWNED_PATH)) return {};
  return JSON.parse(fs.readFileSync(OWNED_PATH, "utf8"));
}

function saveOwned(owned) {
  fs.writeFileSync(OWNED_PATH, JSON.stringify(owned, null, 2) + "\n");
}

function loadRoles() {
  try {
    const data = yaml.load(fs.readFileSync(ROLES_PATH, "utf8"));
    return (data && typeof data === "object") ? data : {};
  } catch (err) {
    return {};
  }
}

function saveRoles(roles) {
  fs.writeFileSync(ROLES_PATH, yaml.dump(roles));
}

function pickRoleEmoji(roles) {
  const used = new Set(Object.values(roles).map((r) => r.emoji));
  const available = ROLE_EMOJI_POOL.filter((e) => !used.has(e));
  const pool = available.length > 0 ? available : ROLE_EMOJI_POOL;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchGame(title) {
  const url = ITAD_BASE + "/games/search/v1?key=" + ITAD_API_KEY +
    "&title=" + encodeURIComponent(title) + "&results=5";
  const res = await fetch(url);
  if (!res.ok) throw new Error("search failed: " + res.status);
  return res.json();
}

function pickSearchMatch(query, results) {
  if (!results || results.length === 0) return null;

  const needle = normalizeTitle(query);
  const exact = results.find((r) => normalizeTitle(r.title) === needle);
  if (exact) return exact;

  const containing = results.filter((r) => normalizeTitle(r.title).includes(needle));
  if (containing.length > 0) {
    containing.sort((a, b) => a.title.length - b.title.length);
    return containing[0];
  }

  return results[0];
}

async function fetchBotGuilds() {
  const res = await fetch(DISCORD_API + "/users/@me/guilds", {
    headers: { Authorization: "Bot " + DISCORD_BOT_TOKEN }
  });
  if (!res.ok) throw new Error("Discord guild list failed: " + res.status);
  return res.json();
}

async function fetchGuildMembers(guildId) {
  const res = await fetch(DISCORD_API + "/guilds/" + guildId + "/members?limit=1000", {
    headers: { Authorization: "Bot " + DISCORD_BOT_TOKEN }
  });
  if (!res.ok) throw new Error("Discord member list failed: " + res.status);
  return res.json();
}

async function fetchGuildRoles(guildId) {
  const res = await fetch(DISCORD_API + "/guilds/" + guildId + "/roles", {
    headers: { Authorization: "Bot " + DISCORD_BOT_TOKEN }
  });
  if (!res.ok) throw new Error("Discord role list failed: " + res.status);
  return res.json();
}

async function createRole(guildId, title, emoji) {
  let res = await fetch(DISCORD_API + "/guilds/" + guildId + "/roles", {
    method: "POST",
    headers: {
      Authorization: "Bot " + DISCORD_BOT_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: title, unicode_emoji: emoji, mentionable: true })
  });
  if (res.ok) return { role: await res.json(), iconMode: "native" };

  res = await fetch(DISCORD_API + "/guilds/" + guildId + "/roles", {
    method: "POST",
    headers: {
      Authorization: "Bot " + DISCORD_BOT_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: emoji + " " + title, mentionable: true })
  });
  if (!res.ok) throw new Error("role create failed: " + res.status + " " + (await res.text()));
  return { role: await res.json(), iconMode: "name" };
}

async function assignRole(guildId, userId, roleId) {
  const res = await fetch(
    DISCORD_API + "/guilds/" + guildId + "/members/" + userId + "/roles/" + roleId,
    {
      method: "PUT",
      headers: { Authorization: "Bot " + DISCORD_BOT_TOKEN }
    }
  );
  if (!res.ok) throw new Error("role assign failed: " + res.status + " " + (await res.text()));
}

async function pickFromList(rl, label, items, formatItem) {
  console.log("");
  console.log(label);
  items.forEach((item, i) => {
    console.log("  " + (i + 1) + ". " + formatItem(item));
  });

  while (true) {
    const answer = (await rl.question("Enter a number (or 0 to cancel): ")).trim();
    const n = parseInt(answer, 10);
    if (n === 0) return null;
    if (!isNaN(n) && n >= 1 && n <= items.length) return items[n - 1];
    console.log("Not a valid choice, try again.");
  }
}

async function main() {
  const rl = readline.createInterface({ input, output });

  let query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    query = (await rl.question("Game name to mark everyone as owning: ")).trim();
  }
  if (!query) {
    console.error("No game name given.");
    rl.close();
    process.exit(1);
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    console.error("Search failed:", err.message);
    rl.close();
    process.exit(1);
  }

  const match = pickSearchMatch(query, results);
  if (!match) {
    console.error("Could not find a game called \"" + query + "\".");
    rl.close();
    process.exit(1);
  }

  console.log("Matched \"" + match.title + "\".");

  let guilds;
  try {
    guilds = await fetchBotGuilds();
  } catch (err) {
    console.error("Could not load your Discord server list:", err.message);
    rl.close();
    process.exit(1);
  }

  if (!guilds || guilds.length === 0) {
    console.error("The bot is not in any Discord server yet.");
    rl.close();
    process.exit(1);
  }

  let guild = guilds[0];
  if (guilds.length > 1) {
    guild = await pickFromList(rl, "Which Discord server?", guilds, (g) => g.name);
    if (!guild) {
      rl.close();
      return;
    }
  }

  let members;
  try {
    members = await fetchGuildMembers(guild.id);
  } catch (err) {
    console.error("Could not load server members:", err.message);
    rl.close();
    process.exit(1);
  }
  members = members.filter((m) => !m.user.bot);

  if (members.length === 0) {
    console.error("No members found in that server.");
    rl.close();
    process.exit(1);
  }

  let discordRoles;
  try {
    discordRoles = await fetchGuildRoles(guild.id);
  } catch (err) {
    console.error("Could not load server roles:", err.message);
    rl.close();
    process.exit(1);
  }
  const validRoleIds = new Set(discordRoles.map((r) => r.id));

  const roles = loadRoles();
  const cleanedTitle = cleanTitle(match.title);
  const key = normalizeTitle(match.title);
  let entry = roles[key];

  if (entry && !validRoleIds.has(entry.roleId)) {
    console.log("Role for \"" + entry.title + "\" no longer exists in Discord, recreating.");
    entry = null;
  }

  if (!entry) {
    const emoji = pickRoleEmoji(roles);
    try {
      const created = await createRole(guild.id, cleanedTitle, emoji);
      entry = { title: cleanedTitle, roleId: created.role.id, emoji: emoji, iconMode: created.iconMode };
      roles[key] = entry;
      saveRoles(roles);
      console.log("Created role for \"" + cleanedTitle + "\".");
    } catch (err) {
      console.error("Could not create a role for \"" + cleanedTitle + "\":", err.message);
      rl.close();
      process.exit(1);
    }
  }

  const owned = loadOwned();
  let ownedAdded = 0;
  let assigned = 0;
  let assignmentsFailed = 0;

  for (const member of members) {
    const userId = member.user.id;
    const list = owned[userId] || [];
    if (!list.some((g) => g.id === match.id)) {
      list.push({ id: match.id, title: match.title });
      owned[userId] = list;
      ownedAdded++;
    }

    try {
      await assignRole(guild.id, userId, entry.roleId);
      assigned++;
    } catch (err) {
      assignmentsFailed++;
      console.error("Could not assign the role to " + userId + ":", err.message);
    }
    await sleep(300);
  }

  saveOwned(owned);

  console.log("");
  console.log("Done. \"" + cleanedTitle + "\" marked as owned for " + ownedAdded + " new member(s), role assigned to " +
    assigned + " member(s)" + (assignmentsFailed > 0 ? ", " + assignmentsFailed + " failed" : "") + ".");
  rl.close();
}

main();
