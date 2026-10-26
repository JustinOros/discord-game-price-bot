const fs = require("fs");
const path = require("path");
const util = require("util");
const yaml = require("js-yaml");
const { EmbedBuilder } = require("discord.js");
const { queryInfo } = require("./a2s");

const execFileAsync = util.promisify(require("child_process").execFile);

const ROOT = path.join(__dirname, "..", "..");
const STORE_PATH = path.join(ROOT, "serverstatus.json");
const CONFIG_PATH = path.join(__dirname, "config.yaml");
const LOCAL_CONFIG_PATH = path.join(__dirname, "config.local.yaml");
const DEFAULT_INTERVAL_MINUTES = 2;
const SSH_TIMEOUT_MS = 15000;
const LIST_TIMEOUT_MS = 30000;
const REFRESH_MS = 10 * 60 * 1000;
const COLORS = { online: 0x57f287, running: 0xfee75c, offline: 0xed4245, missing: 0x95a5a6, unknown: 0x95a5a6 };
const ICONS = { online: "🟢", running: "🟡", offline: "🔴", missing: "⚪", unknown: "⚪" };
const LABELS = { online: "Online", running: "Running", offline: "Offline", missing: "Not found", unknown: "Unknown" };

let ctx = null;
let checking = false;
const queryPorts = new Map();
const lastNotes = new Map();

function sshSettings() {
  const host = process.env.DOCKER_SSH_HOST;
  const user = process.env.DOCKER_SSH_USER;
  const key = process.env.DOCKER_SSH_KEY_PATH;
  return { host: host, user: user, key: key, ready: !!(host && user && key) };
}

function readYaml(file) {
  try {
    const data = yaml.load(fs.readFileSync(file, "utf8"));
    return (data && typeof data === "object") ? data : {};
  } catch (err) {
    return {};
  }
}

function loadConfig() {
  const config = readYaml(CONFIG_PATH);
  const local = readYaml(LOCAL_CONFIG_PATH);
  const extra = Array.isArray(local.servers) ? local.servers : [];
  if (extra.length === 0) return config;
  const base = Array.isArray(config.servers) ? config.servers : [];
  return Object.assign({}, config, { servers: base.concat(extra) });
}

function servers(config) {
  return (Array.isArray(config.servers) ? config.servers : []).filter((server) => server && server.name && (server.container || server.host));
}

function serverId(server) {
  return String(server.container || server.name).toLowerCase();
}

function isRemote(server) {
  return !server.container;
}

function intervalMinutes(config) {
  const value = Number(config.intervalMinutes);
  return value >= 1 && value <= 59 ? Math.floor(value) : DEFAULT_INTERVAL_MINUTES;
}

function loadStore() {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (data && typeof data === "object") {
      return { messages: data.messages && typeof data.messages === "object" ? data.messages : {}, up: data.up && typeof data.up === "object" ? data.up : {} };
    }
  } catch (err) {
    return { messages: {}, up: {} };
  }
  return { messages: {}, up: {} };
}

function saveStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + "\n");
  } catch (err) {
    console.error("Could not save server status:", err.message);
  }
}

function shQuote(text) {
  return "'" + String(text).replace(/'/g, "'\\''") + "'";
}

async function listContainers() {
  const settings = sshSettings();
  const remote = ["docker", "ps", "-a", "--format", "{{.Names}}|{{.Status}}|{{.Ports}}|{{.State}}"].map(shQuote).join(" ");
  const { stdout } = await execFileAsync(
    "ssh",
    ["-i", settings.key, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", settings.user + "@" + settings.host, remote],
    { timeout: SSH_TIMEOUT_MS }
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("|");
      return { name: parts[0], status: parts[1] || "", ports: parts[2] || "", state: (parts[3] || "").toLowerCase() };
    })
    .filter((container) => container.name);
}

function udpPorts(ports) {
  const found = [];
  const pattern = /(?:\d+\.\d+\.\d+\.\d+|\[?::\]?):(\d+)->\d+\/udp/g;
  let match;
  while ((match = pattern.exec(ports)) !== null) {
    const port = parseInt(match[1], 10);
    if (!found.includes(port)) found.push(port);
  }
  return found;
}

async function playerInfo(server, container) {
  const settings = sshSettings();
  const host = server.host || settings.host;
  const candidates = [];
  if (server.queryPort) candidates.push(Number(server.queryPort));
  else {
    const remembered = queryPorts.get(container.name);
    if (remembered) candidates.push(remembered);
    udpPorts(container.ports).forEach((port) => {
      if (!candidates.includes(port)) candidates.push(port);
    });
  }
  const answers = await Promise.all(candidates.map(async (port) => ({ port: port, info: await queryInfo(host, port) })));
  const hit = answers.find((answer) => answer.info);
  if (!hit) {
    const note = "no answer from " + host + " on UDP ports " + (candidates.join(", ") || "none") + " (container ports: " + (container.ports || "none") + ")";
    if (lastNotes.get(container.name) !== note) {
      lastNotes.set(container.name, note);
      console.log("Server status: " + container.name + " " + note);
    }
    return null;
  }
  lastNotes.delete(container.name);
  queryPorts.set(container.name, hit.port);
  return hit.info;
}

async function instanceState(server) {
  try {
    const { stdout } = await execFileAsync("bash", ["-c", server.listCommand], { cwd: ROOT, timeout: LIST_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed.data)) return null;
    const label = String(server.instanceLabel || "").toLowerCase();
    const found = parsed.data.find((instance) => !label || String(instance.label).toLowerCase() === label);
    return found ? String(found.status || "running").toLowerCase() : "none";
  } catch (err) {
    return null;
  }
}

function transitionState(instance) {
  const words = instance.replace(/_/g, " ");
  const stopping = /shutting|stopp|delet|offline/.test(instance);
  return { status: "running", label: stopping ? "Stopping" : "Starting", quiet: true, detail: "Server is " + words };
}

async function checkRemote(server) {
  const port = Number(server.queryPort) || 2457;
  const [info, instance] = await Promise.all([
    server.playerCount === false ? Promise.resolve(null) : queryInfo(server.host, port),
    server.listCommand ? instanceState(server) : Promise.resolve(null)
  ]);
  if (info) return { status: "online", detail: server.host, players: info.players, max: info.max };
  if (instance === "none") return { status: "offline", detail: "Server is stopped" };
  if (instance && server.playerCount === false) return instance === "running" ? { status: "online", detail: "Server is running" } : transitionState(instance);
  if (instance) return { status: "running", detail: "Server is " + instance };
  return { status: "offline", detail: "No answer from " + server.host };
}

async function checkServer(server, containers) {
  if (isRemote(server)) return checkRemote(server);
  const container = containers.find((entry) => entry.name.toLowerCase() === String(server.container).toLowerCase());
  if (!container) return { status: "missing", detail: "No container named " + server.container };
  if (container.state !== "running") return { status: "offline", detail: container.status };
  const info = await playerInfo(server, container);
  if (!info) return { status: "running", detail: container.status };
  return { status: "online", detail: container.status, players: info.players, max: info.max };
}

async function checkAll(config) {
  const list = servers(config);
  let containers = null;
  if (list.some((server) => !isRemote(server)) && sshSettings().ready) {
    try {
      containers = await listContainers();
    } catch (err) {
      console.error("Server status check failed:", err.message);
    }
  }
  const results = [];
  for (const server of list) {
    if (!isRemote(server) && !containers) {
      results.push({ server: server, state: { status: "unknown", detail: "Couldn't reach the Docker host" } });
      continue;
    }
    results.push({ server: server, state: await checkServer(server, containers || []) });
  }
  return results;
}

function describe(state) {
  const lines = [ICONS[state.status] + " **" + (state.label || LABELS[state.status]) + "**"];
  if (state.status === "online" && state.players !== undefined) lines.push("Players: " + state.players + " / " + state.max);
  if (state.status === "running" && !state.quiet) lines.push("No player count available");
  if (state.detail) lines.push(state.detail);
  return lines;
}

function signature(state) {
  return [state.status, state.label || "", state.players === undefined ? "" : state.players, state.max === undefined ? "" : state.max].join("|");
}

function buildCard(server, state) {
  const lines = describe(state);
  lines.push("Updated <t:" + Math.floor(Date.now() / 1000) + ":R>");
  return new EmbedBuilder().setColor(COLORS[state.status]).setTitle(server.name).setDescription(lines.join("\n"));
}

function findChannel(guild, server) {
  const name = String(server.channel || "").toLowerCase();
  if (!name) return null;
  if (/^\d+$/.test(name)) {
    const byId = guild.channels.cache.get(name);
    return byId && byId.isTextBased && byId.isTextBased() ? byId : null;
  }
  return guild.channels.cache.find((channel) => String(channel.name).toLowerCase() === name && channel.isTextBased && channel.isTextBased()) || null;
}

async function refreshMessage(guild, server, state, store) {
  const channel = findChannel(guild, server);
  if (!channel) return;
  const key = guild.id + "|" + serverId(server);
  const entry = store.messages[key];
  const sig = signature(state);
  const now = Date.now();
  if (entry && entry.channelId === channel.id && entry.sig === sig && now - entry.at < REFRESH_MS) return;

  const card = buildCard(server, state);
  if (entry && entry.channelId === channel.id) {
    try {
      const message = await channel.messages.fetch(entry.messageId);
      await message.edit({ embeds: [card] });
      store.messages[key] = { channelId: channel.id, messageId: entry.messageId, sig: sig, at: now };
      return;
    } catch (err) {
      console.error("Could not edit the status message for " + server.name + ", posting a new one:", err.message);
    }
  }
  try {
    const sent = await channel.send({ embeds: [card] });
    store.messages[key] = { channelId: channel.id, messageId: sent.id, sig: sig, at: now };
    try {
      await sent.pin();
    } catch (err) {
      console.error("Could not pin the status message for " + server.name + ":", err.message);
    }
  } catch (err) {
    console.error("Could not post the status message for " + server.name + ":", err.message);
  }
}

async function alertIfChanged(server, state, store, config) {
  const isUp = state.status === "online" || state.status === "running";
  const isDown = state.status === "offline";
  if (!isUp && !isDown) return;
  const key = serverId(server);
  const previous = store.up[key];
  store.up[key] = isUp;
  if (config.alerts === false || previous === undefined || previous === isUp) return;
  for (const guild of Array.from(ctx.client.guilds.cache.values())) {
    const channel = findChannel(guild, server);
    if (!channel) continue;
    try {
      await channel.send(server.name + " is now " + (isUp ? "online." : "offline."));
    } catch (err) {
      console.error("Server status alert failed:", err.message);
    }
  }
}

async function tick() {
  if (checking || !ctx) return;
  checking = true;
  try {
    const config = loadConfig();
    const results = await checkAll(config);
    const store = loadStore();
    for (const result of results) {
      await alertIfChanged(result.server, result.state, store, config);
      for (const guild of Array.from(ctx.client.guilds.cache.values())) {
        await refreshMessage(guild, result.server, result.state, store);
      }
    }
    saveStore(store);
  } catch (err) {
    console.error("Server status update failed:", err.message);
  } finally {
    checking = false;
  }
}

async function handleServers(message) {
  const config = loadConfig();
  const list = servers(config);
  if (!sshSettings().ready && list.every((server) => !isRemote(server))) {
    await message.reply("Server status isn't set up. Set DOCKER_SSH_HOST, DOCKER_SSH_USER and DOCKER_SSH_KEY_PATH in .env to enable it.");
    return;
  }
  if (list.length === 0) {
    await message.reply("No game servers are listed in plugins/server-status/config.yaml yet.");
    return;
  }
  const results = await checkAll(config);
  const lines = results.map((result) => {
    const state = result.state;
    const detail = state.status === "online" ? (state.players === undefined ? "running" : state.players + " / " + state.max + " players") : (state.status === "running" ? (state.quiet ? (state.label || "running").toLowerCase() : "running, no player count") : (state.detail || LABELS[state.status]));
    return ICONS[state.status] + " **" + result.server.name + "** - " + detail;
  });
  const card = new EmbedBuilder().setColor(0x5865f2).setTitle("Game servers").setDescription(lines.join("\n"));
  await message.reply({ embeds: [card] });
}

module.exports = {
  name: "server-status",
  onReady(context) {
    ctx = context;
    context.cron.schedule("*/" + intervalMinutes(loadConfig()) + " * * * *", () => tick());
  },
  commands: [{ name: "servers", run: (message) => handleServers(message) }],
  help: [
    { order: 164, text: "!servers - show whether the game servers are online and how many players are on them" }
  ]
};
