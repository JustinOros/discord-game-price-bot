const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const cron = require("node-cron");
const yaml = require("js-yaml");
const { Client, GatewayIntentBits, Partials, MessageFlags, EmbedBuilder } = require("discord.js");
const { createRoles } = require("./core/roles");
const { loadPlugins, findCommand, collectHelpEntries, startPlugins, registerPlugins, runChatHooks } = require("./core/plugins");

const rawLog = console.log.bind(console);
const rawError = console.error.bind(console);
console.log = (...args) => rawLog(new Date().toISOString(), ...args);
console.error = (...args) => rawError(new Date().toISOString(), ...args);

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ITAD_API_KEY = process.env.ITAD_API_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const ITAD_COUNTRY = (process.env.ITAD_COUNTRY || "US").toUpperCase();
const AI_ENABLED = process.env.AI_ENABLED !== "false";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const GREETING_CHANNEL_NAME = "general";
const ITAD_BASE = "https://api.isthereanydeal.com";
const OWNED_PATH = path.join(__dirname, "owned.json");
const STEAMLINKS_PATH = path.join(__dirname, "steamlinks.json");
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

if (!DISCORD_BOT_TOKEN || !ITAD_API_KEY) {
  console.error("DISCORD_BOT_TOKEN and ITAD_API_KEY must be set in .env");
  process.exit(1);
}

const DISABLED_PLUGINS = (process.env.DISABLED_PLUGINS || "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name.length > 0);
const plugins = loadPlugins(path.join(__dirname, "plugins"), DISABLED_PLUGINS);



function loadOwned() {
  return JSON.parse(fs.readFileSync(OWNED_PATH, "utf8"));
}

function saveOwned(owned) {
  fs.writeFileSync(OWNED_PATH, JSON.stringify(owned, null, 2) + "\n");
}

const {
  loadRoles,
  saveRoles,
  findGameRole,
  sortedRoleEntries,
  ROLE_PICKER_MAX,
  roleMemberCounts,
  buildRolePickerComponents,
  ensureGameRole,
  isEmoji
} = createRoles({ normalizeTitle, AI_ENABLED, OLLAMA_URL, OLLAMA_MODEL });

function loadSteamLinks() {
  return JSON.parse(fs.readFileSync(STEAMLINKS_PATH, "utf8"));
}

function saveSteamLinks(links) {
  fs.writeFileSync(STEAMLINKS_PATH, JSON.stringify(links, null, 2) + "\n");
}



async function searchGame(title) {
  const url = ITAD_BASE + "/games/search/v1?key=" + ITAD_API_KEY +
    "&title=" + encodeURIComponent(title) + "&results=5";
  const res = await fetch(url);
  if (!res.ok) throw new Error("search failed: " + res.status);
  return res.json();
}

function normalizeTitle(str) {
  return str.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
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

async function fetchPrices(ids) {
  const url = ITAD_BASE + "/games/prices/v3?key=" + ITAD_API_KEY + "&country=" + ITAD_COUNTRY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids)
  });
  if (!res.ok) throw new Error("prices failed: " + res.status);
  return res.json();
}

async function fetchShops() {
  const url = ITAD_BASE + "/service/shops/v1?key=" + ITAD_API_KEY;
  const res = await fetch(url);
  if (!res.ok) throw new Error("shops failed: " + res.status);
  return res.json();
}

function formatReleaseDate(releaseDate) {
  if (!releaseDate) return null;
  const parts = releaseDate.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!year || !month || !day) return null;
  return day + " " + MONTH_NAMES[month - 1].slice(0, 3) + " " + year;
}

function toItadDateTime(date) {
  return date.toISOString().split(".")[0] + "+00:00";
}

async function fetchSteamDetails(appid) {
  const url = "https://store.steampowered.com/api/appdetails?appids=" + appid +
    "&cc=" + ITAD_COUNTRY.toLowerCase() + "&filters=categories,platforms,basic";
  const res = await fetch(url);
  if (!res.ok) throw new Error("steam appdetails failed: " + res.status);
  const data = await res.json();
  const entry = data && data[appid];
  if (!entry || !entry.success || !entry.data) return null;

  const categories = (entry.data.categories || []).map((c) => c.description);

  const flags = entry.data.platforms || {};
  const platforms = [];
  if (flags.windows) platforms.push("Windows");
  if (flags.mac) platforms.push("Mac");
  if (flags.linux) platforms.push("Linux");

  return { categories: categories, platforms: platforms, headerImage: entry.data.header_image || null };
}

async function fetchSteamLiveDeal(appid) {
  const url = "https://store.steampowered.com/api/appdetails?appids=" + appid +
    "&cc=" + ITAD_COUNTRY.toLowerCase() + "&filters=price_overview";
  const res = await fetch(url);
  if (!res.ok) throw new Error("steam price failed: " + res.status);
  const data = await res.json();
  const entry = data && data[appid];
  if (!entry || !entry.success || !entry.data) return null;

  const overview = entry.data.price_overview;
  if (!overview) return null;

  return {
    shop: { name: "Steam" },
    price: { amountInt: overview.final, currency: overview.currency },
    regular: { amountInt: overview.initial, currency: overview.currency },
    cut: overview.discount_percent,
    url: "https://store.steampowered.com/app/" + appid
  };
}

async function mergeLiveSteamDeal(deals, appid) {
  let merged = deals.filter((deal) => deal.shop.name !== "Steam");
  if (!appid) return merged;

  try {
    const steamDeal = await fetchSteamLiveDeal(appid);
    if (steamDeal) merged = merged.concat(steamDeal);
  } catch (err) {
    console.error("Steam live price fetch failed:", err.message);
  }

  return merged;
}

function parseSteamProfileInput(input) {
  const trimmed = input.trim();
  let m = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return { type: "id", value: m[1] };
  m = trimmed.match(/steamcommunity\.com\/id\/([^\/\s]+)/i);
  if (m) return { type: "vanity", value: m[1] };
  if (/^\d{17}$/.test(trimmed)) return { type: "id", value: trimmed };
  return { type: "vanity", value: trimmed };
}

async function resolveSteamId(input) {
  const parsed = parseSteamProfileInput(input);
  if (parsed.type === "id") return parsed.value;

  const url = "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=" +
    STEAM_API_KEY + "&vanityurl=" + encodeURIComponent(parsed.value);
  const res = await fetch(url);
  if (!res.ok) throw new Error("resolve vanity url failed: " + res.status);
  const data = await res.json();
  if (data.response && data.response.success === 1) return data.response.steamid;
  return null;
}

async function fetchOwnedGames(steamId) {
  const url = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=" +
    STEAM_API_KEY + "&steamid=" + steamId + "&format=json&include_played_free_games=true&include_appinfo=true";
  const res = await fetch(url);
  if (!res.ok) throw new Error("owned games failed: " + res.status);
  const data = await res.json();
  const games = (data.response && data.response.games) || [];
  return games.map((g) => ({ appid: g.appid, name: g.name }));
}

async function fetchOwnedAppIds(steamId) {
  const games = await fetchOwnedGames(steamId);
  return games.map((g) => g.appid);
}

async function fetchGameInfo(id) {
  const url = ITAD_BASE + "/games/info/v2?key=" + ITAD_API_KEY + "&id=" + encodeURIComponent(id);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error("info failed: " + res.status + " " + body);
  }
  return res.json();
}

async function fetchHistorySince(id, since) {
  const url = ITAD_BASE + "/games/history/v2?key=" + ITAD_API_KEY +
    "&id=" + encodeURIComponent(id) + "&country=" + ITAD_COUNTRY + "&since=" + encodeURIComponent(since);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error("history failed: " + res.status + " " + body);
  }
  return res.json();
}

async function fetchHistory(id) {
  const since = toItadDateTime(new Date(Date.now() - 366 * 24 * 60 * 60 * 1000));
  return fetchHistorySince(id, since);
}

async function fetchFullHistory(id) {
  const since = toItadDateTime(new Date("2000-01-01T00:00:00Z"));
  return fetchHistorySince(id, since);
}

function pickBestDeal(deals) {
  if (!deals || deals.length === 0) return null;
  return deals.reduce((best, d) => {
    if (!best) return d;
    return d.price.amountInt < best.price.amountInt ? d : best;
  }, null);
}

function formatMoney(cents, currency) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch (err) {
    return "$" + amount.toFixed(2);
  }
}

function formatExpiry(expiryIso) {
  if (!expiryIso) return null;
  const expiryDate = new Date(expiryIso);
  if (isNaN(expiryDate.getTime())) return null;
  const hoursLeft = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft <= 0) return null;
  if (hoursLeft < 24) return "ends within a day";
  const daysLeft = Math.round(hoursLeft / 24);
  if (daysLeft === 1) return "ends tomorrow";
  if (daysLeft <= 21) return "ends in " + daysLeft + " days";
  return "ends " + formatReleaseDate(expiryDate.toISOString().slice(0, 10));
}

function dealNote(deal, label) {
  if (!deal || deal.cut <= 0) return "";
  const expiryText = formatExpiry(deal.expiry);
  return " (" + deal.cut + "% off" + (label ? " " + label : "") + (expiryText ? ", " + expiryText : "") + ")";
}








async function findOwnerIds(gameId, appid) {
  const owned = loadOwned();
  const ownerIds = new Set();

  for (const userId of Object.keys(owned)) {
    if (owned[userId].some((g) => g.id === gameId)) {
      ownerIds.add(userId);
    }
  }

  if (appid && STEAM_API_KEY) {
    const links = loadSteamLinks();
    for (const userId of Object.keys(links)) {
      if (ownerIds.has(userId)) continue;
      try {
        const appIds = await fetchOwnedAppIds(links[userId]);
        if (appIds.includes(appid)) {
          ownerIds.add(userId);
        }
      } catch (err) {
        console.error("Owned games check failed for " + userId + ":", err.message);
      }
    }
  }

  return Array.from(ownerIds);
}















const HELP_LINES = [
];

const HELP_COLOR = 0x5fd4b0;
const HELP_FIELD_MAX = 1000;
const HELP_CATEGORIES = [
  { name: "💰 Prices & Watching", ranges: [[10, 59], [200, 219]] },
  { name: "📊 Game Info", ranges: [[60, 89], [240, 259]] },
  { name: "🕹️ Ownership", ranges: [[90, 139]] },
  { name: "🏷️ Game Roles", ranges: [[140, 160]] },
  { name: "🖥️ Game Servers", ranges: [[161, 169]] },
  { name: "🧠 Memory", ranges: [[170, 199]] },
  { name: "🎲 Trivia", ranges: [[220, 239]] }
];
const HELP_OTHER_CATEGORY = "✨ More";

function helpCategoryFor(order) {
  const match = HELP_CATEGORIES.find((category) => category.ranges.some((range) => order >= range[0] && order <= range[1]));
  return match ? match.name : HELP_OTHER_CATEGORY;
}

function formatHelpEntry(text) {
  const split = text.indexOf(" - ");
  if (split === -1) return "`" + text + "`";
  return "`" + text.slice(0, split) + "`\n" + text.slice(split + 3);
}

function buildHelpFields(entries) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const name = helpCategoryFor(entry.order);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(formatHelpEntry(entry.text));
  });

  const names = HELP_CATEGORIES.map((category) => category.name).concat(HELP_OTHER_CATEGORY);
  const fields = [];
  names.filter((name) => grouped.has(name)).forEach((name) => {
    let current = [];
    let length = 0;
    let part = 0;
    const flush = () => {
      if (current.length === 0) return;
      fields.push({ name: part === 0 ? name : name + " (continued)", value: current.join("\n\n") });
      part++;
      current = [];
      length = 0;
    };
    grouped.get(name).forEach((line) => {
      if (length + line.length > HELP_FIELD_MAX) flush();
      current.push(line);
      length += line.length + 2;
    });
    flush();
  });
  return fields;
}

async function handleHelp(message, note) {
  const entries = HELP_LINES.concat(await collectHelpEntries(plugins, message));
  entries.sort((a, b) => a.order - b.order);

  const botName = (client.user && client.user.username) || "Bot";
  const embed = new EmbedBuilder()
    .setColor(HELP_COLOR)
    .setTitle(botName + " Commands")
    .setDescription("Here is everything I can do. GAME means any game title.")
    .addFields(buildHelpFields(entries).slice(0, 25));

  if (client.user && typeof client.user.displayAvatarURL === "function") {
    embed.setThumbnail(client.user.displayAvatarURL());
  }
  if (note) embed.setFooter({ text: note });
  await message.reply({ embeds: [embed] });
}

const dmGreetedUsers = new Set();


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents
  ],
  partials: [Partials.Channel]
});

const pluginContext = { client, cron, loadRoles, findGameRole, GREETING_CHANNEL_NAME, sortedRoleEntries, roleMemberCounts, buildRolePickerComponents, ROLE_PICKER_MAX, searchGame, normalizeTitle, ensureGameRole, isEmoji, fetchGameInfo, findOwnerIds, pickSearchMatch, STEAM_API_KEY, fetchOwnedGames, loadOwned, saveOwned, loadSteamLinks, saveSteamLinks, resolveSteamId, MONTH_NAMES, fetchHistory, formatMoney, fetchFullHistory, dealNote, fetchPrices, fetchSteamDetails, formatReleaseDate, mergeLiveSteamDeal, pickBestDeal, fetchShops, formatExpiry };

client.once("clientReady", async () => {
  console.log("Logged in as " + client.user.tag);
  startPlugins(plugins, pluginContext);

  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch();
      console.log("Cached " + guild.memberCount + " members for " + guild.name + ".");
    } catch (err) {
      console.error("Could not cache members for " + guild.name + ":", err.message);
    }
  }
});

registerPlugins(plugins, pluginContext);

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (!message.guild) {
    const dmContent = message.content.trim().toLowerCase();

    if (dmContent === "!help") {
      await handleHelp(message, "Heads up: these commands only work in a text channel on your server, not here in DMs.");
      dmGreetedUsers.add(message.author.id);
      return;
    }

    const dmCommand = findCommand(plugins, message.content.trim(), true);
    if (dmCommand) {
      await dmCommand.command.run(message, dmCommand.args, pluginContext);
      return;
    }

    const displayName = message.author.globalName || message.author.username;
    if (dmGreetedUsers.has(message.author.id)) {
      await message.reply("Type !help for a list of my commands to be used in Text Channels.");
    } else {
      dmGreetedUsers.add(message.author.id);
      await message.reply({
        content: "Hello " + displayName + ", I am a Discord Game Price Bot made by Justin Oros. " +
          "https://github.com/JustinOros/discord-game-price-bot",
        flags: MessageFlags.SuppressEmbeds
      });
    }
    return;
  }

  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (!content.startsWith("!")) {
    if (await runChatHooks(plugins, message, content)) return;
  }

  const pluginCommand = findCommand(plugins, content, false);
  if (pluginCommand) {
    await pluginCommand.command.run(message, pluginCommand.args, pluginContext);
    return;
  }

  if (lower === "!help") {
    await handleHelp(message);
  }
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled error:", err && err.message ? err.message : err);
});

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error("Login failed:", err && err.message ? err.message : err);
  process.exit(1);
});
