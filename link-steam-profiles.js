require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const DISCORD_API = "https://discord.com/api/v10";
const STEAMLINKS_PATH = path.join(__dirname, "steamlinks.json");
const OWNER_CONFIG_PATH = path.join(__dirname, ".link-steam-profiles-owner.json");

if (!DISCORD_BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set in .env. Run bash install.sh first to set it up.");
  process.exit(1);
}

if (!STEAM_API_KEY) {
  console.error("STEAM_API_KEY is not set in .env. Run bash install.sh and provide a Steam Web API key first.");
  process.exit(1);
}

function loadSteamLinks() {
  if (!fs.existsSync(STEAMLINKS_PATH)) return {};
  return JSON.parse(fs.readFileSync(STEAMLINKS_PATH, "utf8"));
}

function saveSteamLinks(links) {
  fs.writeFileSync(STEAMLINKS_PATH, JSON.stringify(links, null, 2) + "\n");
}

function loadOwnerSteamId() {
  if (!fs.existsSync(OWNER_CONFIG_PATH)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(OWNER_CONFIG_PATH, "utf8"));
    return data.steamId || null;
  } catch (err) {
    return null;
  }
}

function saveOwnerSteamId(steamId) {
  fs.writeFileSync(OWNER_CONFIG_PATH, JSON.stringify({ steamId: steamId }, null, 2) + "\n");
}

function parseSteamProfileInput(rawInput) {
  const trimmed = rawInput.trim();
  let m = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return { type: "id", value: m[1] };
  m = trimmed.match(/steamcommunity\.com\/id\/([^\/\s]+)/i);
  if (m) return { type: "vanity", value: m[1] };
  if (/^\d{17}$/.test(trimmed)) return { type: "id", value: trimmed };
  return { type: "vanity", value: trimmed };
}

async function resolveSteamId(rawInput) {
  const parsed = parseSteamProfileInput(rawInput);
  if (parsed.type === "id") return parsed.value;

  const url = "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=" +
    STEAM_API_KEY + "&vanityurl=" + encodeURIComponent(parsed.value);
  const res = await fetch(url);
  if (!res.ok) throw new Error("resolve vanity url failed: " + res.status);
  const data = await res.json();
  if (data.response && data.response.success === 1) return data.response.steamid;
  return null;
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

async function fetchFriendList(steamId) {
  const url = "https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=" +
    STEAM_API_KEY + "&steamid=" + steamId + "&relationship=friend";
  const res = await fetch(url);
  if (res.status === 401) {
    throw new Error(
      "your Steam friends list is set to private. Go to Steam > Settings > Privacy Settings > " +
      "\"My friends list\" and set it to Public, then try again."
    );
  }
  if (!res.ok) throw new Error("Steam friend list failed: " + res.status);
  const data = await res.json();
  return (data.friendslist && data.friendslist.friends) || [];
}

async function fetchPlayerSummaries(steamIds) {
  const url = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=" +
    STEAM_API_KEY + "&steamids=" + steamIds.join(",");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Steam player summaries failed: " + res.status);
  const data = await res.json();
  return (data.response && data.response.players) || [];
}

function memberDisplayName(member) {
  return member.nick || member.user.global_name || member.user.username;
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

  let ownerSteamId = loadOwnerSteamId();
  if (!ownerSteamId) {
    console.log("First, we need your own Steam profile so we can read your friends list from it.");
    const profileInput = await rl.question("Enter your Steam profile URL or SteamID: ");
    try {
      ownerSteamId = await resolveSteamId(profileInput);
    } catch (err) {
      console.error("Could not look up that Steam profile:", err.message);
      rl.close();
      process.exit(1);
    }
    if (!ownerSteamId) {
      console.error("Could not find a Steam profile matching that.");
      rl.close();
      process.exit(1);
    }
    saveOwnerSteamId(ownerSteamId);
    console.log("Saved, so you won't be asked again next time.");
  }

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

  let friends;
  try {
    friends = await fetchFriendList(ownerSteamId);
  } catch (err) {
    console.error("Could not load your Steam friends list:", err.message);
    rl.close();
    process.exit(1);
  }

  if (friends.length === 0) {
    console.error(
      "No Steam friends were returned. This usually means your Steam friends list privacy " +
      "is not set to public - check that in your Steam privacy settings and try again."
    );
    rl.close();
    process.exit(1);
  }

  let friendProfiles = [];
  const friendIds = friends.map((f) => f.steamid);
  for (let i = 0; i < friendIds.length; i += 100) {
    const batch = friendIds.slice(i, i + 100);
    try {
      const summaries = await fetchPlayerSummaries(batch);
      friendProfiles.push(...summaries);
    } catch (err) {
      console.error("Could not load some friend profiles:", err.message);
    }
  }
  friendProfiles.sort((a, b) => (a.personaname || "").localeCompare(b.personaname || ""));

  let keepGoing = true;
  while (keepGoing) {
    let members;
    try {
      members = await fetchGuildMembers(guild.id);
    } catch (err) {
      console.error("Could not load server members:", err.message);
      break;
    }

    members = members.filter((m) => !m.user.bot);
    members.sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));

    if (members.length === 0) {
      console.error("No members found in that server.");
      break;
    }

    const currentLinks = loadSteamLinks();
    const member = await pickFromList(
      rl,
      "Which Discord server member?",
      members,
      (m) => memberDisplayName(m) + " (@" + m.user.username + ") - " +
        (currentLinks[m.user.id] ? "(linked)" : "(unlinked)")
    );
    if (!member) break;

    const friend = await pickFromList(
      rl,
      "Which Steam profile?",
      friendProfiles,
      (f) => (f.personaname || "unknown") + " - " + f.profileurl
    );
    if (!friend) continue;

    const links = loadSteamLinks();
    links[member.user.id] = friend.steamid;
    saveSteamLinks(links);

    console.log("Linked " + memberDisplayName(member) + " to " + (friend.personaname || friend.steamid) + ".");

    const again = (await rl.question("Link another? (y/N): ")).trim().toLowerCase();
    keepGoing = again === "y" || again === "yes";
  }

  console.log("Done.");
  rl.close();
}

main();
