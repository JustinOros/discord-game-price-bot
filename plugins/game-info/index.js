const { EmbedBuilder } = require("discord.js");

const FEATURE_TAG_PATTERNS = {
  Multiplayer: /\bmulti-?player\b|\bmmo\b/i,
  "Co-Op": /\bco-?op\b/i,
  "Cross-Play": /\bcross-?(play|platform)\b/i
};

async function handleHistory(message, query, ctx) {
  const { fetchHistory, formatMoney, pickSearchMatch, searchGame } = ctx;
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
    const price = formatMoney(h.deal.price.amountInt, h.deal.price.currency);
    const regular = formatMoney(h.deal.regular.amountInt, h.deal.regular.currency);
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

function describeSaleTiming(sales, ctx) {
  const { MONTH_NAMES } = ctx;
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

async function handlePredict(message, query, ctx) {
  const { fetchFullHistory, pickSearchMatch, searchGame } = ctx;
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

  const timing = describeSaleTiming(sales, ctx);
  if (!timing) {
    await message.reply("\"" + match.title + "\" does not show a clear enough sale pattern to predict.");
    return;
  }

  await message.reply(
    "Based on \"" + match.title + "\"'s full sale history, it might go on sale " + timing + "!"
  );
}

async function countOwners(gameId, appid, ctx) {
  const { findOwnerIds } = ctx;
  const ownerIds = await findOwnerIds(gameId, appid);
  return ownerIds.length;
}

async function handleInfo(message, query, ctx) {
  const { dealNote, fetchGameInfo, fetchPrices, fetchSteamDetails, formatMoney, formatReleaseDate, mergeLiveSteamDeal, pickBestDeal, pickSearchMatch, searchGame } = ctx;
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
      const cutNote = dealNote(deal);
      priceLine = formatMoney(deal.price.amountInt, deal.price.currency) + cutNote;
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

  const ownerCount = await countOwners(match.id, info.appid, ctx);
  embed.addFields({
    name: "Owned by",
    value: ownerCount + " Member" + (ownerCount === 1 ? "" : "s"),
    inline: true
  });

  await message.reply({ embeds: [embed] });
}

module.exports = {
  name: "game-info",
  commands: [
    { name: "history", needsArgs: true, run: (message, args, ctx) => handleHistory(message, args, ctx) },
    { name: "predict", needsArgs: true, run: (message, args, ctx) => handlePredict(message, args, ctx) },
    { name: "info", needsArgs: true, run: (message, args, ctx) => handleInfo(message, args, ctx) }
  ],
  help: [
    { order: 60, text: "!history GAME - show every recorded sale over the past 12 months, with date and price" },
    { order: 70, text: "!predict GAME - guess when it might go on sale next, based on its full sale history" },
    { order: 80, text: "!info GAME - show price, platforms, multiplayer/co-op/cross-play info, a store link, and how many people here own it" }
  ]
};
