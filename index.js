const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const cron = require("node-cron");
const yaml = require("js-yaml");
const { Client, GatewayIntentBits, MessageFlags, EmbedBuilder, GuildScheduledEventStatus } = require("discord.js");

const rawLog = console.log.bind(console);
const rawError = console.error.bind(console);
console.log = (...args) => rawLog(new Date().toISOString(), ...args);
console.error = (...args) => rawError(new Date().toISOString(), ...args);

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ITAD_API_KEY = process.env.ITAD_API_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const AI_ENABLED = process.env.AI_ENABLED !== "false";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const AI_COOLDOWN_MS = 5000;
const GREETING_CHANNEL_NAME = "general";
const EVENT_REMINDER_MINUTES = 15;
const POPULAR_TOP_N = 10;
const ALL_PRICES_TOP_N = 10;
const ITAD_BASE = "https://api.isthereanydeal.com";
const GAMES_PATH = path.join(__dirname, "games.json");
const OWNED_PATH = path.join(__dirname, "owned.json");
const STEAMLINKS_PATH = path.join(__dirname, "steamlinks.json");
const GREETINGS_PATH = path.join(__dirname, "greetings.yaml");
const GOODBYES_PATH = path.join(__dirname, "goodbyes.yaml");
const README_PATH = path.join(__dirname, "README.md");
const PERSONALITY_PATH = path.join(__dirname, "personality.yaml");
const MEMORY_PATH = path.join(__dirname, "memory.yaml");
const MAX_MEMORIES_PER_USER = 20;
const MAX_MEMORY_LENGTH = 300;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

if (!DISCORD_BOT_TOKEN || !ITAD_API_KEY) {
  console.error("DISCORD_BOT_TOKEN and ITAD_API_KEY must be set in .env");
  process.exit(1);
}

function loadReadme() {
  try {
    return fs.readFileSync(README_PATH, "utf8");
  } catch (err) {
    return "";
  }
}

const README_CONTENT = loadReadme();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadPersonality() {
  const data = yaml.load(fs.readFileSync(PERSONALITY_PATH, "utf8"));
  return {
    name: (data && data.name) || "Assistant",
    trigger: (data && data.trigger) || "assistant",
    persona: (data && data.persona) || ""
  };
}

const PERSONALITY = loadPersonality();
const TRIGGER_MENTION = new RegExp("\\b" + escapeRegex(PERSONALITY.trigger) + "\\b", "i");

const AI_SYSTEM_PROMPT =
  PERSONALITY.persona.trim() + "\n\n" +
  "You are running inside a Discord bot and you are the resident expert on it - you know every command " +
  "and feature described in the README below, and can help people figure out how to use the bot. " +
  "Reply in character, and keep it extremely short: never more than one sentence, ideally just a few " +
  "words. Stay in character and do not mention that you are an AI, a language model, or any of the " +
  "technical details behind you (Ollama, models, prompts, tokens, code, servers, and so on) - as far as " +
  "you're concerned you just know things, the same way a real character would. If the person you are " +
  "talking to has told you their name, a preference, or asked you to stop doing something (like using a " +
  "certain nickname), always follow that - it overrides your default personality habits from then on in " +
  "this conversation.\n\n" +
  "Here is the bot's README, for reference when someone asks how to use something:\n" + README_CONTENT;

const aiCooldowns = new Map();
const aiHistories = new Map();
const AI_HISTORY_EXCHANGES = 3;
const AI_HISTORY_TTL_MS = 30 * 60 * 1000;

function canUseAI(userId) {
  const now = Date.now();
  const last = aiCooldowns.get(userId) || 0;
  if (now - last < AI_COOLDOWN_MS) return false;
  aiCooldowns.set(userId, now);
  return true;
}

function getAiHistory(userId) {
  const entry = aiHistories.get(userId);
  if (!entry) return [];
  if (Date.now() - entry.lastActive > AI_HISTORY_TTL_MS) {
    aiHistories.delete(userId);
    return [];
  }
  return entry.messages;
}

function rememberAiExchange(userId, question, reply) {
  const messages = getAiHistory(userId).concat(
    { role: "user", content: question },
    { role: "assistant", content: reply }
  );
  while (messages.length > AI_HISTORY_EXCHANGES * 2) {
    messages.shift();
  }
  aiHistories.set(userId, { messages, lastActive: Date.now() });
}

function trimIncompleteSentence(text) {
  const trimmed = text.trim();
  if (/[.!?]["')]*$/.test(trimmed)) return trimmed;
  const lastEnd = Math.max(trimmed.lastIndexOf("."), trimmed.lastIndexOf("!"), trimmed.lastIndexOf("?"));
  if (lastEnd === -1) return trimmed;
  return trimmed.slice(0, lastEnd + 1);
}

async function askAI(question, history, displayName, memories) {
  const messages = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    { role: "system", content: "The Discord member you are talking to is called " + displayName + ". Do not address them by any other name." }
  ];

  if (memories && memories.length > 0) {
    messages.push({
      role: "system",
      content: "Permanent facts this member has asked you to remember about them - always follow these, " +
        "they override your default personality habits:\n" + memories.map((m) => "- " + m).join("\n")
    });
  }

  messages.push(...history, { role: "user", content: question });

  const res = await fetch(OLLAMA_URL + "/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: { num_predict: 120 },
      messages: messages
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Ollama request failed: " + res.status + " " + body);
  }
  const data = await res.json();
  const reply = data.message && data.message.content;
  return reply ? trimIncompleteSentence(reply) : null;
}

function loadGreetings() {
  const data = yaml.load(fs.readFileSync(GREETINGS_PATH, "utf8"));
  return (data && data.greetings) || [];
}

const GREETINGS = loadGreetings();

function loadGoodbyes() {
  const data = yaml.load(fs.readFileSync(GOODBYES_PATH, "utf8"));
  return (data && data.goodbyes) || [];
}

const GOODBYES = loadGoodbyes();

function loadGames() {
  return JSON.parse(fs.readFileSync(GAMES_PATH, "utf8"));
}

function saveGames(games) {
  fs.writeFileSync(GAMES_PATH, JSON.stringify(games, null, 2) + "\n");
}

function loadOwned() {
  return JSON.parse(fs.readFileSync(OWNED_PATH, "utf8"));
}

function saveOwned(owned) {
  fs.writeFileSync(OWNED_PATH, JSON.stringify(owned, null, 2) + "\n");
}

function loadSteamLinks() {
  return JSON.parse(fs.readFileSync(STEAMLINKS_PATH, "utf8"));
}

function saveSteamLinks(links) {
  fs.writeFileSync(STEAMLINKS_PATH, JSON.stringify(links, null, 2) + "\n");
}

function loadMemory() {
  try {
    const data = yaml.load(fs.readFileSync(MEMORY_PATH, "utf8"));
    return data || {};
  } catch (err) {
    return {};
  }
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_PATH, yaml.dump(memory));
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
  const url = ITAD_BASE + "/games/prices/v3?key=" + ITAD_API_KEY + "&country=US";
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
    "&cc=us&filters=categories,platforms,basic";
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
    "&cc=us&filters=price_overview";
  const res = await fetch(url);
  if (!res.ok) throw new Error("steam price failed: " + res.status);
  const data = await res.json();
  const entry = data && data[appid];
  if (!entry || !entry.success || !entry.data) return null;

  const overview = entry.data.price_overview;
  if (!overview) return null;

  return {
    shop: { name: "Steam" },
    price: { amountInt: overview.final },
    regular: { amountInt: overview.initial },
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
    "&id=" + encodeURIComponent(id) + "&country=US&since=" + encodeURIComponent(since);
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

function formatMoney(cents) {
  return "$" + (cents / 100).toFixed(2);
}

async function handleWatch(message, query) {
  if (!query) {
    await message.reply("Usage: !watch GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);
  const games = loadGames();

  if (games.some((g) => g.id === match.id)) {
    await message.reply("\"" + match.title + "\" is already being watched.");
    return;
  }

  games.push({
    id: match.id,
    title: match.title,
    channelId: message.channel.id,
    addedDate: new Date().toISOString().slice(0, 10),
    lastAlertedPrice: null
  });
  saveGames(games);

  let watchAppid = null;
  try {
    const info = await fetchGameInfo(match.id);
    watchAppid = info.appid || null;
  } catch (err) {
    watchAppid = null;
  }

  let priceNote = "";
  try {
    const priceData = await fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const deals = await mergeLiveSteamDeal((entry && entry.deals) || [], watchAppid);
    const deal = pickBestDeal(deals);
    if (deal) {
      const cutNote = deal.cut > 0 ? " (" + deal.cut + "% off right now)" : "";
      priceNote = " Current best price: " + formatMoney(deal.price.amountInt) + cutNote +
        " at " + deal.shop.name + ".\n" + deal.url;
    } else {
      priceNote = " Could not find a current listing for it yet.";
    }
  } catch (err) {
    priceNote = "";
  }

  await message.reply({
    content: "Now watching \"" + match.title + "\" for sales." + priceNote,
    flags: MessageFlags.SuppressEmbeds
  });
}

async function handlePrice(message, query) {
  if (!query) {
    await message.reply("Usage: !price GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);

  let priceAppid = null;
  try {
    const info = await fetchGameInfo(match.id);
    priceAppid = info.appid || null;
  } catch (err) {
    priceAppid = null;
  }

  try {
    const priceData = await fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const deals = await mergeLiveSteamDeal((entry && entry.deals) || [], priceAppid);
    const deal = pickBestDeal(deals);
    if (!deal) {
      await message.reply("\"" + match.title + "\" - could not find a current listing for it.");
      return;
    }
    const cutNote = deal.cut > 0 ? " (" + deal.cut + "% off)" : "";
    await message.reply({
      content: "\"" + match.title + "\": " + formatMoney(deal.price.amountInt) + cutNote +
        " at " + deal.shop.name + "\n" + deal.url,
      flags: MessageFlags.SuppressEmbeds
    });
  } catch (err) {
    await message.reply("Could not load the price right now.");
  }
}

async function handleAllPrices(message, query) {
  if (!query) {
    await message.reply("Usage: !prices GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);

  let appid = null;
  try {
    const info = await fetchGameInfo(match.id);
    appid = info.appid || null;
  } catch (err) {
    appid = null;
  }

  try {
    const priceData = await fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const merged = await mergeLiveSteamDeal((entry && entry.deals) || [], appid);
    const deals = merged.filter((deal) => deal.cut > 0);

    if (deals.length === 0) {
      await message.reply("\"" + match.title + "\" is not currently on sale anywhere I track.");
      return;
    }

    const sorted = deals.slice().sort((a, b) => a.price.amountInt - b.price.amountInt);
    const top = sorted.slice(0, ALL_PRICES_TOP_N);

    const lines = ["\"" + match.title + "\" is on sale at:"];
    top.forEach((deal) => {
      const cutNote = deal.cut > 0 ? " (" + deal.cut + "% off)" : "";
      lines.push(deal.shop.name + ": " + formatMoney(deal.price.amountInt) + cutNote);
    });

    const remaining = sorted.length - top.length;
    if (remaining > 0) {
      lines.push("...and " + remaining + " more store" + (remaining === 1 ? "" : "s") + ".");
    }

    await message.reply({ content: lines.join("\n"), flags: MessageFlags.SuppressEmbeds });
  } catch (err) {
    await message.reply("Could not load prices right now.");
  }
}

async function handleHistory(message, query) {
  if (!query) {
    await message.reply("Usage: !history GAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);

  let history;
  try {
    history = await fetchHistory(match.id);
  } catch (err) {
    console.error("History fetch failed:", err.message);
    await message.reply("Could not load sale history right now.");
    return;
  }

  const sales = (history || []).filter((h) => h.deal && h.deal.cut > 0);
  if (sales.length === 0) {
    await message.reply("\"" + match.title + "\" has no recorded sales.");
    return;
  }

  sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const lines = sales.map((h) => {
    const date = h.timestamp.slice(0, 10);
    const price = formatMoney(h.deal.price.amountInt);
    const regular = formatMoney(h.deal.regular.amountInt);
    return "- " + date + ": " + price + " (" + h.deal.cut + "% off, was " + regular + ") at " + h.shop.name;
  });

  const header = "Sale history for \"" + match.title + "\", past 12 months (" + sales.length + " events):\n";
  const full = header + lines.join("\n");

  if (full.length <= 1900) {
    await message.reply(full);
    return;
  }

  let chunk = header;
  for (const line of lines) {
    const candidate = chunk + line + "\n";
    if (candidate.length > 1900) {
      await message.reply(chunk);
      chunk = line + "\n";
    } else {
      chunk = candidate;
    }
  }
  if (chunk) {
    await message.reply(chunk);
  }
}

function describeSaleTiming(sales) {
  const monthYears = {};
  const monthDays = {};
  const years = new Set();

  const seenYearMonth = new Set();
  for (const s of sales) {
    const d = new Date(s.timestamp);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    years.add(year);

    const key = year + "-" + month;
    if (!seenYearMonth.has(key)) {
      seenYearMonth.add(key);
      monthYears[month] = (monthYears[month] || 0) + 1;
    }
    if (!monthDays[month]) monthDays[month] = [];
    monthDays[month].push(day);
  }

  const totalYears = years.size;
  const threshold = Math.max(1, Math.ceil(totalYears * 0.4));

  const qualifying = Object.keys(monthYears)
    .map(Number)
    .filter((m) => monthYears[m] >= threshold);

  if (qualifying.length === 0) return null;

  const currentMonth = new Date().getUTCMonth() + 1;
  let targetMonth = null;
  for (let offset = 1; offset <= 12; offset++) {
    const candidate = ((currentMonth - 1 + offset) % 12) + 1;
    if (qualifying.includes(candidate)) {
      targetMonth = candidate;
      break;
    }
  }
  if (!targetMonth) return null;

  const days = monthDays[targetMonth];
  const avgDay = days.reduce((a, b) => a + b, 0) / days.length;
  let qualifier;
  if (avgDay <= 10) qualifier = "early";
  else if (avgDay <= 20) qualifier = "mid";
  else qualifier = "late";

  return qualifier + " " + MONTH_NAMES[targetMonth - 1];
}

async function handlePredict(message, query) {
  if (!query) {
    await message.reply("Usage: !predict GAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);

  let history;
  try {
    history = await fetchFullHistory(match.id);
  } catch (err) {
    console.error("Predict history fetch failed:", err.message);
    await message.reply("Could not load sale history right now.");
    return;
  }

  const sales = (history || []).filter((h) => h.deal && h.deal.cut > 0);
  if (sales.length < 3) {
    await message.reply("\"" + match.title + "\" does not have enough sale history yet to make a good guess.");
    return;
  }

  const timing = describeSaleTiming(sales);
  if (!timing) {
    await message.reply("\"" + match.title + "\" does not show a clear enough sale pattern to predict.");
    return;
  }

  await message.reply(
    "Based on \"" + match.title + "\"'s full sale history, it might go on sale " + timing + "!"
  );
}

const FEATURE_TAG_PATTERNS = {
  Multiplayer: /\bmulti-?player\b|\bmmo\b/i,
  "Co-Op": /\bco-?op\b/i,
  "Cross-Play": /\bcross-?(play|platform)\b/i
};

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

async function countOwners(gameId, appid) {
  const ownerIds = await findOwnerIds(gameId, appid);
  return ownerIds.length;
}

async function handleWho(message, query) {
  if (!query) {
    await message.reply("Usage: !who GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);

  let appid = null;
  try {
    const info = await fetchGameInfo(match.id);
    appid = info.appid || null;
  } catch (err) {
    appid = null;
  }

  const ownerIds = await findOwnerIds(match.id, appid);

  if (ownerIds.length === 0) {
    await message.reply(
      "Nobody on this Discord server has confirmed owning \"" + match.title +
      "\" yet. (type !own GAME to confirm ownership)"
    );
    return;
  }

  const lines = ["\"" + match.title + "\" has been marked owned by:"];
  ownerIds.forEach((id) => lines.push("<@" + id + ">"));
  lines.push("");
  lines.push("Type \"!own GAME\" or \"!my-steam-profile LINK\" to update your owned games.");

  await message.reply({ content: lines.join("\n"), allowedMentions: { users: [] } });
}

async function handlePopular(message) {
  const tally = {};

  function addOwner(key, title, userId) {
    if (!tally[key]) tally[key] = { title: title, owners: new Set() };
    tally[key].owners.add(userId);
  }

  const owned = loadOwned();
  const appidCache = {};

  for (const userId of Object.keys(owned)) {
    for (const game of owned[userId]) {
      if (!(game.id in appidCache)) {
        try {
          const info = await fetchGameInfo(game.id);
          appidCache[game.id] = info.appid || null;
        } catch (err) {
          appidCache[game.id] = null;
        }
      }
      const appid = appidCache[game.id];
      const key = appid ? "steam:" + appid : "itad:" + game.id;
      addOwner(key, game.title, userId);
    }
  }

  if (STEAM_API_KEY) {
    const links = loadSteamLinks();
    for (const userId of Object.keys(links)) {
      let games;
      try {
        games = await fetchOwnedGames(links[userId]);
      } catch (err) {
        console.error("Owned games check failed for " + userId + ":", err.message);
        continue;
      }
      for (const game of games) {
        addOwner("steam:" + game.appid, game.name, userId);
      }
    }
  }

  const popular = Object.values(tally)
    .filter((g) => g.owners.size > 1)
    .map((g) => ({ title: g.title, count: g.owners.size }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

  if (popular.length === 0) {
    await message.reply("Nobody owns any games?! Type !own GAME to add a game you own to the list!");
    return;
  }

  const top = popular.slice(0, POPULAR_TOP_N);
  const lines = ["Here's what members are playing!"];
  top.forEach((g) => lines.push(g.title + ": " + g.count + " member" + (g.count === 1 ? "" : "s")));

  const remaining = popular.length - top.length;
  if (remaining > 0) {
    lines.push("...and " + remaining + " more game" + (remaining === 1 ? "" : "s") + " with multiple owners.");
  }

  await message.reply(lines.join("\n"));
}

async function handleInfo(message, query) {
  if (!query) {
    await message.reply("Usage: !info GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);

  let info;
  try {
    info = await fetchGameInfo(match.id);
  } catch (err) {
    console.error("Info fetch failed:", err.message);
    await message.reply("Could not load game info right now.");
    return;
  }

  let platforms = (info.platforms || []).map((p) => p.name).join(", ");
  let featureSource = info.tags || [];
  let headerImage = null;

  if (info.appid) {
    try {
      const steamDetails = await fetchSteamDetails(info.appid);
      if (steamDetails) {
        if (steamDetails.categories.length > 0) {
          featureSource = steamDetails.categories;
        }
        if (!platforms && steamDetails.platforms.length > 0) {
          platforms = steamDetails.platforms.join(", ");
        }
        headerImage = steamDetails.headerImage;
      }
    } catch (err) {
      console.error("Steam details fetch failed:", err.message);
    }
  }

  if (!platforms) platforms = "unknown";

  let priceLine = "unavailable";
  let dealUrl = null;
  try {
    const priceData = await fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const deals = await mergeLiveSteamDeal((entry && entry.deals) || [], info.appid || null);
    const deal = pickBestDeal(deals);
    if (deal) {
      const cutNote = deal.cut > 0 ? " (" + deal.cut + "% off)" : "";
      priceLine = formatMoney(deal.price.amountInt) + cutNote;
      dealUrl = deal.url;
    }
  } catch (err) {
    priceLine = "unavailable";
  }

  const releaseDate = formatReleaseDate(info.releaseDate);
  const title = releaseDate ? match.title + " (" + releaseDate + ")" : match.title;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .addFields(
      { name: "Price", value: priceLine, inline: true },
      { name: "Platform(s)", value: platforms, inline: true }
    );

  if (headerImage) {
    embed.setImage(headerImage);
  }

  for (const label of Object.keys(FEATURE_TAG_PATTERNS)) {
    const pattern = FEATURE_TAG_PATTERNS[label];
    const hits = featureSource.filter((t) => pattern.test(t));
    embed.addFields({ name: label, value: hits.length > 0 ? "✅" : "❌", inline: true });
  }

  const storeUrl = dealUrl || (info.appid ? "https://store.steampowered.com/app/" + info.appid : null);
  if (storeUrl) {
    embed.addFields({ name: "Store page", value: "[🔗 link](" + storeUrl + ")", inline: true });
  }

  if (info.urls && info.urls.game) {
    embed.addFields({ name: "More info", value: "[🔗 link](" + info.urls.game + ")", inline: true });
  }

  const ownerCount = await countOwners(match.id, info.appid);
  embed.addFields({
    name: "Owned by",
    value: ownerCount + " Member" + (ownerCount === 1 ? "" : "s"),
    inline: true
  });

  await message.reply({ embeds: [embed] });
}

async function handleOwn(message, query) {
  if (!query) {
    await message.reply("Usage: !own GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);
  const owned = loadOwned();
  const list = owned[message.author.id] || [];

  if (list.some((g) => g.id === match.id)) {
    await message.reply("You already have \"" + match.title + "\" marked as owned.");
    return;
  }

  list.push({ id: match.id, title: match.title });
  owned[message.author.id] = list;
  saveOwned(owned);

  await message.reply("Marked \"" + match.title + "\" as owned.");
}

async function handleUnown(message, query) {
  if (!query) {
    await message.reply("Usage: !unown GAME NAME");
    return;
  }

  let results;
  try {
    results = await searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = pickSearchMatch(query, results);
  const owned = loadOwned();
  const list = owned[message.author.id] || [];

  if (!list.some((g) => g.id === match.id)) {
    await message.reply("You don't have \"" + match.title + "\" marked as owned.");
    return;
  }

  owned[message.author.id] = list.filter((g) => g.id !== match.id);
  saveOwned(owned);

  await message.reply("Removed \"" + match.title + "\" from your owned list.");
}

async function handleRemember(message, text) {
  if (!text) {
    await message.reply("Usage: !remember SOMETHING (e.g. !remember my name is Justin, or !remember don't call me buddy)");
    return;
  }

  const memory = loadMemory();
  const list = memory[message.author.id] || [];

  if (list.length >= MAX_MEMORIES_PER_USER) {
    await message.reply(
      "I'm already remembering " + list.length + " things about you, that's my limit. " +
      "Use !memories to see them and !forget one first."
    );
    return;
  }

  const fact = text.length > MAX_MEMORY_LENGTH ? text.slice(0, MAX_MEMORY_LENGTH) : text;

  if (list.some((m) => m.toLowerCase() === fact.toLowerCase())) {
    await message.reply("I already remember that.");
    return;
  }

  list.push(fact);
  memory[message.author.id] = list;
  saveMemory(memory);

  await message.reply("Got it, I'll remember: " + fact);
}

async function handleForget(message, text) {
  if (!text) {
    await message.reply("Usage: !forget SOMETHING (must match what you had me remember), or !forget all");
    return;
  }

  const memory = loadMemory();
  const list = memory[message.author.id] || [];

  if (list.length === 0) {
    await message.reply("I don't have anything remembered about you.");
    return;
  }

  if (text.toLowerCase() === "all") {
    delete memory[message.author.id];
    saveMemory(memory);
    await message.reply("Forgot everything I knew about you.");
    return;
  }

  const index = list.findIndex((m) => m.toLowerCase() === text.toLowerCase());
  if (index === -1) {
    await message.reply("I don't have that saved. Use !memories to see what I remember about you.");
    return;
  }

  list.splice(index, 1);
  if (list.length === 0) {
    delete memory[message.author.id];
  } else {
    memory[message.author.id] = list;
  }
  saveMemory(memory);

  await message.reply("Forgot it.");
}

async function handleMemories(message) {
  const memory = loadMemory();
  const list = memory[message.author.id] || [];

  if (list.length === 0) {
    await message.reply("I don't have anything remembered about you yet. Use !remember SOMETHING to teach me.");
    return;
  }

  await message.reply(
    "Here's what I remember about you:\n" + list.map((m, i) => (i + 1) + ". " + m).join("\n")
  );
}

async function handleLinkSteam(message, input) {
  if (!STEAM_API_KEY) {
    await message.reply("Steam linking is not set up on this bot yet - it needs a Steam Web API key added to .env.");
    return;
  }

  if (!input) {
    await message.reply("Usage: !my-steam-profile YOUR_STEAM_PROFILE_URL");
    return;
  }

  let steamId;
  try {
    steamId = await resolveSteamId(input);
  } catch (err) {
    console.error("Steam profile resolve failed:", err.message);
    await message.reply("Could not look up that Steam profile right now.");
    return;
  }

  if (!steamId) {
    await message.reply(
      "Could not find a Steam profile matching that. Use your full profile URL, like " +
      "https://steamcommunity.com/id/yourname or https://steamcommunity.com/profiles/7656119..."
    );
    return;
  }

  const links = loadSteamLinks();
  links[message.author.id] = steamId;
  saveSteamLinks(links);

  await message.reply(
    "Linked your Discord account to that Steam profile. !info will now count you automatically for any game " +
    "you own there, as long as your Steam profile's game details are set to public."
  );
}

async function handleRemove(message, query, commandName) {
  if (!query) {
    await message.reply("Usage: " + (commandName || "!remove") + " GAME NAME");
    return;
  }

  const games = loadGames();
  const needle = query.toLowerCase();
  const matches = games.filter((g) => g.title.toLowerCase().includes(needle));

  if (matches.length === 0) {
    await message.reply("Nothing in the watchlist matches \"" + query + "\".");
    return;
  }

  const remaining = games.filter((g) => !matches.includes(g));
  saveGames(remaining);

  const titles = matches.map((g) => g.title).join(", ");
  await message.reply("Removed from the watchlist: " + titles);
}

async function handleList(message) {
  const games = loadGames();
  if (games.length === 0) {
    await message.reply("Nothing is being watched yet. Use !watch GAME NAME to add one.");
    return;
  }

  let priceById = {};
  try {
    const priceData = await fetchPrices(games.map((g) => g.id));
    priceData.forEach((entry) => {
      priceById[entry.id] = entry;
    });
  } catch (err) {
    console.error("List price fetch failed:", err.message);
  }

  const lines = games.map((g) => {
    const entry = priceById[g.id];
    const deal = entry && pickBestDeal(entry.deals);
    if (!deal) {
      return "- **" + g.title + "** (price unavailable)";
    }
    const price = formatMoney(deal.price.amountInt);
    return "- **" + g.title + "** - " + price + " at " + deal.shop.name + " - [🔗 link](" + deal.url + ")";
  });

  const chunks = [];
  let chunk = "";
  for (const line of lines) {
    const candidate = chunk ? chunk + "\n" + line : line;
    if (candidate.length > 4000) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);

  for (let i = 0; i < chunks.length; i++) {
    const embed = new EmbedBuilder()
      .setTitle(i === 0 ? "Currently watching" : "Currently watching (continued)")
      .setDescription(chunks[i]);
    await message.reply({ embeds: [embed] });
  }
}

async function handleShops(message) {
  let shops;
  try {
    shops = await fetchShops();
  } catch (err) {
    console.error("Shops fetch failed:", err.message);
    await message.reply("Could not load the store list right now.");
    return;
  }

  if (!shops || shops.length === 0) {
    await message.reply("No store list available.");
    return;
  }

  console.log("Sample shop entry:", JSON.stringify(shops[0]));

  const names = shops
    .map((s) => s.name || s.title || s.label || (s.shop && s.shop.name) || "")
    .filter((n) => n)
    .sort((a, b) => a.localeCompare(b));
  const header = "Stores I check prices at (" + names.length + "):\n";
  const full = header + names.join(", ");

  if (full.length <= 1900) {
    await message.reply(full);
    return;
  }

  const perMessage = 30;
  for (let i = 0; i < names.length; i += perMessage) {
    const slice = names.slice(i, i + perMessage).join(", ");
    await message.reply(i === 0 ? header + slice : slice);
  }
}

async function handleHelp(message) {
  await message.reply(
    "Commands:\n" +
    "!watch GAME - start watching a game for sales\n" +
    "!remove GAME - stop watching a game (!unwatch also works)\n" +
    "!list - show everything being watched\n" +
    "!price GAME - check a game's current best price without watching it\n" +
    "!prices GAME - list every store the game is on sale at, cheapest first\n" +
    "!history GAME - show every recorded sale over the past 12 months, with date and price\n" +
    "!predict GAME - guess when it might go on sale next, based on its full sale history\n" +
    "!info GAME - show price, platforms, multiplayer/co-op/cross-play info, a store link, and how many people here own it\n" +
    "!own GAME - mark a game as owned by you\n" +
    "!unown GAME - remove a game from your owned list\n" +
    "!my-steam-profile LINK - link your Steam profile so !info can count games you own automatically\n" +
    "!who GAME - list who has confirmed they own a game\n" +
    "!popular - list games owned by more than one member, most owned first\n" +
    "!remember SOMETHING - permanently teach me a fact about you (a name, a preference), I'll remember it across restarts\n" +
    "!forget SOMETHING - make me forget something you had me remember (must match exactly), or !forget all\n" +
    "!memories - show everything I remember about you\n" +
    "!check - run the sale check right now instead of waiting for the daily run\n" +
    "!shops - list every store I check prices at"
  );
}

async function checkPrices(client) {
  const games = loadGames();
  if (games.length === 0) return { checked: 0, alerted: 0 };

  let priceData;
  try {
    priceData = await fetchPrices(games.map((g) => g.id));
  } catch (err) {
    console.error("Price check failed:", err.message);
    return { checked: 0, alerted: 0, failed: true };
  }

  const priceById = {};
  priceData.forEach((entry) => {
    priceById[entry.id] = entry;
  });

  let changed = false;
  let alerted = 0;

  for (const game of games) {
    const entry = priceById[game.id];
    const deal = entry && pickBestDeal(entry.deals);
    if (!deal) continue;

    if (deal.cut > 0) {
      const isNewAlert = game.lastAlertedPrice === null || game.lastAlertedPrice === undefined ||
        deal.price.amountInt < game.lastAlertedPrice;
      if (isNewAlert) {
        try {
          const channel = await client.channels.fetch(game.channelId);
          await channel.send({
            content: game.title + " is on sale at " + deal.shop.name + ": " + formatMoney(deal.price.amountInt) +
              " (" + deal.cut + "% off, was " + formatMoney(deal.regular.amountInt) + ")\n" + deal.url,
            flags: MessageFlags.SuppressEmbeds
          });
        } catch (err) {
          console.error("Could not send alert for " + game.title + ":", err.message);
        }
        game.lastAlertedPrice = deal.price.amountInt;
        changed = true;
        alerted++;
      }
    } else if (game.lastAlertedPrice !== null && game.lastAlertedPrice !== undefined) {
      game.lastAlertedPrice = null;
      changed = true;
    }
  }

  if (changed) {
    saveGames(games);
  }

  return { checked: games.length, alerted: alerted };
}

const notifiedEvents = new Set();

async function checkUpcomingEvents(client) {
  const stillScheduled = new Set();

  for (const guild of client.guilds.cache.values()) {
    let events;
    try {
      events = await guild.scheduledEvents.fetch();
    } catch (err) {
      console.error("Could not fetch scheduled events for " + guild.name + ":", err.message);
      continue;
    }

    for (const event of events.values()) {
      if (event.status !== GuildScheduledEventStatus.Scheduled || !event.scheduledStartAt) continue;
      stillScheduled.add(event.id);

      if (notifiedEvents.has(event.id)) continue;

      const minutesUntil = (event.scheduledStartAt.getTime() - Date.now()) / 60000;
      if (minutesUntil <= 0 || minutesUntil > EVENT_REMINDER_MINUTES) continue;

      const channel = guild.channels.cache.find(
        (c) => c.name === GREETING_CHANNEL_NAME && c.isTextBased && c.isTextBased()
      );
      if (!channel) {
        console.error("Could not find a #" + GREETING_CHANNEL_NAME + " channel in " + guild.name);
        notifiedEvents.add(event.id);
        continue;
      }

      try {
        await channel.send(event.name + " starting in " + EVENT_REMINDER_MINUTES + " minutes!");
      } catch (err) {
        console.error("Could not send event reminder:", err.message);
      }
      notifiedEvents.add(event.id);
    }
  }

  for (const id of Array.from(notifiedEvents)) {
    if (!stillScheduled.has(id)) notifiedEvents.delete(id);
  }
}

async function handleCheck(message, client) {
  await message.reply("Checking prices now...");
  const result = await checkPrices(client);
  if (result.failed) {
    await message.reply("Price check failed, see bot.error.log.");
    return;
  }
  await message.reply(
    "Checked " + result.checked + " game" + (result.checked === 1 ? "" : "s") +
    ", sent " + result.alerted + " new sale alert" + (result.alerted === 1 ? "" : "s") + "."
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents
  ]
});

client.once("clientReady", () => {
  console.log("Logged in as " + client.user.tag);
  cron.schedule("0 15 * * *", () => checkPrices(client));
  cron.schedule("* * * * *", () => checkUpcomingEvents(client));
});

client.on("guildMemberAdd", async (member) => {
  if (GREETINGS.length === 0) return;

  const channel = member.guild.channels.cache.find(
    (c) => c.name === GREETING_CHANNEL_NAME && c.isTextBased && c.isTextBased()
  );
  if (!channel) {
    console.error("Could not find a #" + GREETING_CHANNEL_NAME + " channel in " + member.guild.name);
    return;
  }

  const template = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  const text = template.replace(/\{user\}/g, member.toString());
  try {
    await channel.send(text);
  } catch (err) {
    console.error("Could not send greeting:", err.message);
  }
});

client.on("guildMemberRemove", async (member) => {
  if (GOODBYES.length === 0) return;

  const channel = member.guild.channels.cache.find(
    (c) => c.name === GREETING_CHANNEL_NAME && c.isTextBased && c.isTextBased()
  );
  if (!channel) {
    console.error("Could not find a #" + GREETING_CHANNEL_NAME + " channel in " + member.guild.name);
    return;
  }

  const template = GOODBYES[Math.floor(Math.random() * GOODBYES.length)];
  const name = member.user ? member.user.username : "someone";
  const text = template.replace(/\{user\}/g, name);
  try {
    await channel.send(text);
  } catch (err) {
    console.error("Could not send goodbye:", err.message);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (lower.startsWith("!watch ")) {
    await handleWatch(message, content.slice(7).trim());
  } else if (lower.startsWith("!remove ")) {
    await handleRemove(message, content.slice(8).trim());
  } else if (lower.startsWith("!unwatch ")) {
    await handleRemove(message, content.slice(9).trim(), "!unwatch");
  } else if (lower.startsWith("!prices ")) {
    await handleAllPrices(message, content.slice(8).trim());
  } else if (lower.startsWith("!price ")) {
    await handlePrice(message, content.slice(7).trim());
  } else if (lower.startsWith("!history ")) {
    await handleHistory(message, content.slice(9).trim());
  } else if (lower.startsWith("!predict ")) {
    await handlePredict(message, content.slice(9).trim());
  } else if (lower.startsWith("!info ")) {
    await handleInfo(message, content.slice(6).trim());
  } else if (lower.startsWith("!own ")) {
    await handleOwn(message, content.slice(5).trim());
  } else if (lower.startsWith("!unown ")) {
    await handleUnown(message, content.slice(7).trim());
  } else if (lower.startsWith("!my-steam-profile ")) {
    await handleLinkSteam(message, content.slice(18).trim());
  } else if (lower.startsWith("!who ")) {
    await handleWho(message, content.slice(5).trim());
  } else if (lower === "!popular") {
    await handlePopular(message);
  } else if (lower.startsWith("!remember ")) {
    await handleRemember(message, content.slice(10).trim());
  } else if (lower.startsWith("!forget ")) {
    await handleForget(message, content.slice(8).trim());
  } else if (lower === "!memories") {
    await handleMemories(message);
  } else if (lower === "!check") {
    await handleCheck(message, client);
  } else if (lower === "!list") {
    await handleList(message);
  } else if (lower === "!shops") {
    await handleShops(message);
  } else if (lower === "!help") {
    await handleHelp(message);
  } else if (!content.startsWith("!") && TRIGGER_MENTION.test(content) && AI_ENABLED) {
    if (canUseAI(message.author.id)) {
      try {
        const history = getAiHistory(message.author.id);
        const displayName = (message.member && message.member.displayName) ||
          message.author.globalName || message.author.username;
        const memory = loadMemory();
        const memories = memory[message.author.id] || [];
        const aiReply = await askAI(content, history, displayName, memories);
        if (aiReply) {
          await message.reply(aiReply);
          rememberAiExchange(message.author.id, content, aiReply);
        }
      } catch (err) {
        console.error(PERSONALITY.name + " AI reply failed:", err.message);
      }
    }
  }
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled error:", err && err.message ? err.message : err);
});

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error("Login failed:", err && err.message ? err.message : err);
  process.exit(1);
});
