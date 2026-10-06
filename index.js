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
const ALL_PRICES_TOP_N = 10;
const SALE_ENDING_SOON_HOURS = 48;
const ITAD_BASE = "https://api.isthereanydeal.com";
const GAMES_PATH = path.join(__dirname, "games.json");
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
      const cutNote = dealNote(deal, "right now");
      priceNote = " Current best price: " + formatMoney(deal.price.amountInt, deal.price.currency) + cutNote +
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
    const cutNote = dealNote(deal);
    await message.reply({
      content: "\"" + match.title + "\": " + formatMoney(deal.price.amountInt, deal.price.currency) + cutNote +
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
      const cutNote = dealNote(deal);
      lines.push(deal.shop.name + ": " + formatMoney(deal.price.amountInt, deal.price.currency) + cutNote);
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
    const price = formatMoney(deal.price.amountInt, deal.price.currency);
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


const HELP_LINES = [
  { order: 10, text: "!watch GAME - start watching a game for sales" },
  { order: 20, text: "!remove GAME - stop watching a game (!unwatch also works)" },
  { order: 30, text: "!list - show everything being watched" },
  { order: 40, text: "!price GAME - check a game's current best price without watching it" },
  { order: 50, text: "!prices GAME - list every store the game is on sale at, cheapest first" },
  { order: 200, text: "!check - run the sale check right now instead of waiting for the daily run" },
  { order: 210, text: "!shops - list every store I check prices at" },
];

async function handleHelp(message, note) {
  const entries = HELP_LINES.concat(await collectHelpEntries(plugins, message));
  entries.sort((a, b) => a.order - b.order);
  const description = "Commands:\n" + entries.map((entry) => entry.text).join("\n") + (note ? "\n\n" + note : "");
  const embed = new EmbedBuilder().setDescription(description);
  await message.reply({ embeds: [embed] });
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

  const newSalesByChannel = new Map();
  const endingSoonByChannel = new Map();

  function pushLine(map, channelId, line) {
    if (!map.has(channelId)) map.set(channelId, []);
    map.get(channelId).push(line);
  }

  for (const game of games) {
    const entry = priceById[game.id];
    const deal = entry && pickBestDeal(entry.deals);
    if (!deal) continue;

    if (deal.cut > 0) {
      const isNewAlert = game.lastAlertedPrice === null || game.lastAlertedPrice === undefined ||
        deal.price.amountInt < game.lastAlertedPrice;
      const expiryText = formatExpiry(deal.expiry);
      if (isNewAlert) {
        pushLine(newSalesByChannel, game.channelId,
          "**" + game.title + "** is on sale at " + deal.shop.name + ": " + formatMoney(deal.price.amountInt, deal.price.currency) +
          " (" + deal.cut + "% off, was " + formatMoney(deal.regular.amountInt, deal.regular.currency) +
          (expiryText ? ", " + expiryText : "") + ")\n" + deal.url);
        game.lastAlertedPrice = deal.price.amountInt;
        game.lastEndingSoonExpiry = deal.expiry || null;
        changed = true;
        alerted++;
      } else if (deal.expiry && expiryText &&
          new Date(deal.expiry).getTime() - Date.now() <= SALE_ENDING_SOON_HOURS * 60 * 60 * 1000 &&
          game.lastEndingSoonExpiry !== deal.expiry) {
        pushLine(endingSoonByChannel, game.channelId,
          "**" + game.title + "**'s sale at " + deal.shop.name + " is " + expiryText + " - " +
          formatMoney(deal.price.amountInt, deal.price.currency) + " (" + deal.cut + "% off)\n" + deal.url);
        game.lastEndingSoonExpiry = deal.expiry;
        changed = true;
      }
    } else if ((game.lastAlertedPrice !== null && game.lastAlertedPrice !== undefined) ||
        (game.lastEndingSoonExpiry !== null && game.lastEndingSoonExpiry !== undefined)) {
      game.lastAlertedPrice = null;
      game.lastEndingSoonExpiry = null;
      changed = true;
    }
  }

  if (changed) {
    saveGames(games);
  }

  const channelIds = new Set([...newSalesByChannel.keys(), ...endingSoonByChannel.keys()]);
  for (const channelId of channelIds) {
    const sections = [];
    const newSales = newSalesByChannel.get(channelId);
    if (newSales && newSales.length > 0) {
      sections.push("**On sale:**\n" + newSales.join("\n\n"));
    }
    const endingSoon = endingSoonByChannel.get(channelId);
    if (endingSoon && endingSoon.length > 0) {
      sections.push("**Ending soon:**\n" + endingSoon.join("\n\n"));
    }
    await sendDigest(channelId, sections);
  }

  return { checked: games.length, alerted: alerted };
}

async function sendDigest(channelId, sections) {
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    console.error("Could not fetch channel " + channelId + " for digest:", err.message);
    return;
  }

  const chunks = [];
  let chunk = "";
  for (const section of sections) {
    const candidate = chunk ? chunk + "\n\n" + section : section;
    if (candidate.length > 1900 && chunk) {
      chunks.push(chunk);
      chunk = section;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);

  for (const c of chunks) {
    try {
      await channel.send({ content: c, flags: MessageFlags.SuppressEmbeds });
    } catch (err) {
      console.error("Could not send digest to channel " + channelId + ":", err.message);
    }
  }
}

const dmGreetedUsers = new Set();

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
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents
  ],
  partials: [Partials.Channel]
});

const pluginContext = { client, cron, loadRoles, findGameRole, GREETING_CHANNEL_NAME, sortedRoleEntries, roleMemberCounts, buildRolePickerComponents, ROLE_PICKER_MAX, searchGame, normalizeTitle, ensureGameRole, isEmoji, fetchGameInfo, findOwnerIds, pickSearchMatch, STEAM_API_KEY, fetchOwnedGames, loadOwned, saveOwned, loadSteamLinks, saveSteamLinks, resolveSteamId, MONTH_NAMES, fetchHistory, formatMoney, fetchFullHistory, dealNote, fetchPrices, fetchSteamDetails, formatReleaseDate, mergeLiveSteamDeal, pickBestDeal };

client.once("clientReady", async () => {
  console.log("Logged in as " + client.user.tag);
  cron.schedule("0 15 * * *", () => checkPrices(client));
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
  } else if (lower === "!check") {
    await handleCheck(message, client);
  } else if (lower === "!list") {
    await handleList(message);
  } else if (lower === "!shops") {
    await handleShops(message);
  } else if (lower === "!help") {
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
