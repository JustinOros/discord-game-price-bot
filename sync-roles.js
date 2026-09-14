require("dotenv").config();
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_API = "https://discord.com/api/v10";
const ROLES_PATH = path.join(__dirname, "roles.yaml");

if (!DISCORD_BOT_TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set in .env. Run bash install.sh first to set it up.");
  process.exit(1);
}

function loadRoles() {
  try {
    const data = yaml.load(fs.readFileSync(ROLES_PATH, "utf8"));
    return (data && typeof data === "object") ? data : {};
  } catch (err) {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBotGuilds() {
  const res = await fetch(DISCORD_API + "/users/@me/guilds", {
    headers: { Authorization: "Bot " + DISCORD_BOT_TOKEN }
  });
  if (!res.ok) throw new Error("Discord guild list failed: " + res.status);
  return res.json();
}

async function fetchGuildRoles(guildId) {
  const res = await fetch(DISCORD_API + "/guilds/" + guildId + "/roles", {
    headers: { Authorization: "Bot " + DISCORD_BOT_TOKEN }
  });
  if (!res.ok) throw new Error("Discord role list failed: " + res.status);
  return res.json();
}

async function renameRole(guildId, roleId, name) {
  const res = await fetch(DISCORD_API + "/guilds/" + guildId + "/roles/" + roleId, {
    method: "PATCH",
    headers: {
      Authorization: "Bot " + DISCORD_BOT_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: name })
  });
  if (!res.ok) throw new Error("role rename failed: " + res.status + " " + (await res.text()));
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
  const roles = loadRoles();
  const keys = Object.keys(roles);
  if (keys.length === 0) {
    console.log("No roles in roles.yaml, nothing to sync.");
    return;
  }

  let guilds;
  try {
    guilds = await fetchBotGuilds();
  } catch (err) {
    console.error("Could not load your Discord server list:", err.message);
    process.exit(1);
  }

  if (!guilds || guilds.length === 0) {
    console.error("The bot is not in any Discord server yet.");
    process.exit(1);
  }

  let guild = guilds[0];
  if (guilds.length > 1) {
    const rl = readline.createInterface({ input, output });
    guild = await pickFromList(rl, "Which Discord server?", guilds, (g) => g.name);
    rl.close();
    if (!guild) return;
  }

  let discordRoles;
  try {
    discordRoles = await fetchGuildRoles(guild.id);
  } catch (err) {
    console.error("Could not load server roles:", err.message);
    process.exit(1);
  }

  const byId = {};
  discordRoles.forEach((r) => {
    byId[r.id] = r;
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of keys) {
    const entry = roles[key];
    const desiredName = entry.emoji + " " + entry.title;
    const current = byId[entry.roleId];

    if (!current) {
      console.error("Role for \"" + entry.title + "\" no longer exists in Discord, skipping.");
      skipped++;
      continue;
    }

    if (current.name === desiredName) {
      skipped++;
      continue;
    }

    try {
      await renameRole(guild.id, entry.roleId, desiredName);
      console.log("Updated \"" + current.name + "\" to \"" + desiredName + "\".");
      updated++;
    } catch (err) {
      failed++;
      console.error("Could not update the role for \"" + entry.title + "\":", err.message);
    }
    await sleep(300);
  }

  console.log("");
  console.log("Done. Updated: " + updated + ", already in sync or skipped: " + skipped +
    (failed > 0 ? ", failed: " + failed : "") + ".");
}

main();
