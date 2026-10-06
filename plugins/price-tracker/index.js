const fs = require("fs");
const path = require("path");
const { EmbedBuilder, MessageFlags } = require("discord.js");

const ALL_PRICES_TOP_N = 10;
const SALE_ENDING_SOON_HOURS = 48;
const GAMES_PATH = path.join(__dirname, "..", "..", "games.json");

let ctx = null;

function loadGames() {
  return JSON.parse(fs.readFileSync(GAMES_PATH, "utf8"));
}

function saveGames(games) {
  fs.writeFileSync(GAMES_PATH, JSON.stringify(games, null, 2) + "\n");
}

async function handleWatch(message, query) {
  if (!query) {
    await message.reply("Usage: !watch GAME NAME");
    return;
  }

  let results;
  try {
    results = await ctx.searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = ctx.pickSearchMatch(query, results);
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
    const info = await ctx.fetchGameInfo(match.id);
    watchAppid = info.appid || null;
  } catch (err) {
    watchAppid = null;
  }

  let priceNote = "";
  try {
    const priceData = await ctx.fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const deals = await ctx.mergeLiveSteamDeal((entry && entry.deals) || [], watchAppid);
    const deal = ctx.pickBestDeal(deals);
    if (deal) {
      const cutNote = ctx.dealNote(deal, "right now");
      priceNote = " Current best price: " + ctx.formatMoney(deal.price.amountInt, deal.price.currency) + cutNote +
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
    results = await ctx.searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = ctx.pickSearchMatch(query, results);

  let priceAppid = null;
  try {
    const info = await ctx.fetchGameInfo(match.id);
    priceAppid = info.appid || null;
  } catch (err) {
    priceAppid = null;
  }

  try {
    const priceData = await ctx.fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const deals = await ctx.mergeLiveSteamDeal((entry && entry.deals) || [], priceAppid);
    const deal = ctx.pickBestDeal(deals);
    if (!deal) {
      await message.reply("\"" + match.title + "\" - could not find a current listing for it.");
      return;
    }
    const cutNote = ctx.dealNote(deal);
    await message.reply({
      content: "\"" + match.title + "\": " + ctx.formatMoney(deal.price.amountInt, deal.price.currency) + cutNote +
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
    results = await ctx.searchGame(query);
  } catch (err) {
    await message.reply("Search failed, try again in a moment.");
    return;
  }

  if (!results || results.length === 0) {
    await message.reply("Could not find a game called \"" + query + "\".");
    return;
  }

  const match = ctx.pickSearchMatch(query, results);

  let appid = null;
  try {
    const info = await ctx.fetchGameInfo(match.id);
    appid = info.appid || null;
  } catch (err) {
    appid = null;
  }

  try {
    const priceData = await ctx.fetchPrices([match.id]);
    const entry = priceData && priceData[0];
    const merged = await ctx.mergeLiveSteamDeal((entry && entry.deals) || [], appid);
    const deals = merged.filter((deal) => deal.cut > 0);

    if (deals.length === 0) {
      await message.reply("\"" + match.title + "\" is not currently on sale anywhere I track.");
      return;
    }

    const sorted = deals.slice().sort((a, b) => a.price.amountInt - b.price.amountInt);
    const top = sorted.slice(0, ALL_PRICES_TOP_N);

    const lines = ["\"" + match.title + "\" is on sale at:"];
    top.forEach((deal) => {
      const cutNote = ctx.dealNote(deal);
      lines.push(deal.shop.name + ": " + ctx.formatMoney(deal.price.amountInt, deal.price.currency) + cutNote);
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
    const priceData = await ctx.fetchPrices(games.map((g) => g.id));
    priceData.forEach((entry) => {
      priceById[entry.id] = entry;
    });
  } catch (err) {
    console.error("List price fetch failed:", err.message);
  }

  const lines = games.map((g) => {
    const entry = priceById[g.id];
    const deal = entry && ctx.pickBestDeal(entry.deals);
    if (!deal) {
      return "- **" + g.title + "** (price unavailable)";
    }
    const price = ctx.formatMoney(deal.price.amountInt, deal.price.currency);
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
    shops = await ctx.fetchShops();
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

async function checkPrices(client) {
  const games = loadGames();
  if (games.length === 0) return { checked: 0, alerted: 0 };

  let priceData;
  try {
    priceData = await ctx.fetchPrices(games.map((g) => g.id));
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
    const deal = entry && ctx.pickBestDeal(entry.deals);
    if (!deal) continue;

    if (deal.cut > 0) {
      const isNewAlert = game.lastAlertedPrice === null || game.lastAlertedPrice === undefined ||
        deal.price.amountInt < game.lastAlertedPrice;
      const expiryText = ctx.formatExpiry(deal.expiry);
      if (isNewAlert) {
        pushLine(newSalesByChannel, game.channelId,
          "**" + game.title + "** is on sale at " + deal.shop.name + ": " + ctx.formatMoney(deal.price.amountInt, deal.price.currency) +
          " (" + deal.cut + "% off, was " + ctx.formatMoney(deal.regular.amountInt, deal.regular.currency) +
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
          ctx.formatMoney(deal.price.amountInt, deal.price.currency) + " (" + deal.cut + "% off)\n" + deal.url);
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
    channel = await ctx.client.channels.fetch(channelId);
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

module.exports = {
  name: "price-tracker",
  priority: 50,
  register(context) {
    ctx = context;
  },
  onReady(context) {
    context.cron.schedule("0 15 * * *", () => checkPrices(context.client));
  },
  commands: [
    { name: "watch", needsArgs: true, run: (message, args) => handleWatch(message, args) },
    { name: "remove", needsArgs: true, run: (message, args) => handleRemove(message, args) },
    { name: "unwatch", needsArgs: true, run: (message, args) => handleRemove(message, args, "!unwatch") },
    { name: "prices", needsArgs: true, run: (message, args) => handleAllPrices(message, args) },
    { name: "price", needsArgs: true, run: (message, args) => handlePrice(message, args) },
    { name: "check", exact: true, run: (message) => handleCheck(message, ctx.client) },
    { name: "list", exact: true, run: (message) => handleList(message) },
    { name: "shops", exact: true, run: (message) => handleShops(message) }
  ],
  help: [
    { order: 10, text: "!watch GAME - start watching a game for sales" },
    { order: 20, text: "!remove GAME - stop watching a game (!unwatch also works)" },
    { order: 30, text: "!list - show everything being watched" },
    { order: 40, text: "!price GAME - check a game's current best price without watching it" },
    { order: 50, text: "!prices GAME - list every store the game is on sale at, cheapest first" },
    { order: 200, text: "!check - run the sale check right now instead of waiting for the daily run" },
    { order: 210, text: "!shops - list every store I check prices at" }
  ]
};
