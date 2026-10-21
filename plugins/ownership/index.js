const POPULAR_TOP_N = 10;

async function handleWho(message, query, ctx) {
  const { fetchGameInfo, findOwnerIds, pickSearchMatch, searchGame } = ctx;
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

async function handlePopular(message, ctx) {
  const { STEAM_API_KEY, fetchGameInfo, fetchOwnedGames, loadOwned, loadSteamLinks } = ctx;
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

async function handleOwn(message, query, ctx) {
  const { ensureGameRole, isEmoji, loadOwned, pickSearchMatch, saveOwned, searchGame } = ctx;
  if (!query) {
    await message.reply("Usage: !own GAME NAME");
    return;
  }

  let customEmoji = null;
  const firstSpace = query.indexOf(" ");
  const firstToken = firstSpace === -1 ? query : query.slice(0, firstSpace);
  if (isEmoji(firstToken)) {
    customEmoji = firstToken;
    query = firstSpace === -1 ? "" : query.slice(firstSpace + 1).trim();
    if (!query) {
      await message.reply("Usage: !own GAME NAME or !own EMOJI GAME NAME");
      return;
    }
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
  const roleTitle = query.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const owned = loadOwned();
  const list = owned[message.author.id] || [];

  if (list.some((g) => g.id === match.id)) {
    await message.reply("You already have \"" + match.title + "\" marked as owned.");
    return;
  }

  list.push({ id: match.id, title: match.title });
  owned[message.author.id] = list;
  saveOwned(owned);

  let roleNote = "";
  if (message.guild && message.member) {
    try {
      const roleResult = await ensureGameRole(message.guild, roleTitle, customEmoji);
      await message.member.roles.add(roleResult.role.id);
      roleNote = " and gave you the " + roleResult.emoji + " " + roleResult.title + " role.";
    } catch (err) {
      console.error("Role assignment failed:", err.message);
    }
  }

  await message.reply("Marked \"" + match.title + "\" as owned" + (roleNote || "."));
}

async function handleUnown(message, query, ctx) {
  const { loadOwned, pickSearchMatch, saveOwned, searchGame } = ctx;
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

async function handleLinkSteam(message, input, ctx) {
  const { STEAM_API_KEY, loadSteamLinks, resolveSteamId, saveSteamLinks } = ctx;
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

module.exports = {
  name: "ownership",
  commands: [
    { name: "own", needsArgs: true, run: (message, args, ctx) => handleOwn(message, args, ctx) },
    { name: "unown", needsArgs: true, run: (message, args, ctx) => handleUnown(message, args, ctx) },
    { name: "my-steam-profile", needsArgs: true, run: (message, args, ctx) => handleLinkSteam(message, args, ctx) },
    { name: "who", needsArgs: true, run: (message, args, ctx) => handleWho(message, args, ctx) },
    { name: "popular", exact: true, run: (message, args, ctx) => handlePopular(message, ctx) }
  ],
  help: [
    { order: 90, text: "!own GAME - mark a game as owned by you" },
    { order: 100, text: "!unown GAME - remove a game from your owned list" },
    { order: 110, text: "!my-steam-profile LINK - link your Steam profile so !info can count games you own automatically" },
    { order: 120, text: "!who GAME - list who has confirmed they own a game" },
    { order: 130, text: "!popular - list games owned by more than one member, most owned first" }
  ]
};
