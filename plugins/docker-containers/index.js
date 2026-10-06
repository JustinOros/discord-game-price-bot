const util = require("util");
const execFileAsync = util.promisify(require("child_process").execFile);

const DOCKER_SSH_HOST = process.env.DOCKER_SSH_HOST;
const DOCKER_SSH_USER = process.env.DOCKER_SSH_USER;
const DOCKER_SSH_KEY_PATH = process.env.DOCKER_SSH_KEY_PATH;
const DOCKER_ROLE_ID = process.env.DOCKER_ROLE_ID;
const DOCKER_PROTECTED_CONTAINERS = (process.env.DOCKER_PROTECTED_CONTAINERS || "")
  .split(",")
  .map((name) => name.trim().toLowerCase())
  .filter((name) => name.length > 0);
const DOCKER_ENABLED = !!(DOCKER_SSH_HOST && DOCKER_SSH_USER && DOCKER_SSH_KEY_PATH && DOCKER_ROLE_ID);
const DOCKER_SSH_TIMEOUT_MS = 15000;

function shQuote(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

async function runDockerCommand(args) {
  const remoteCommand = "docker " + args.map(shQuote).join(" ");
  const { stdout } = await execFileAsync(
    "ssh",
    [
      "-i", DOCKER_SSH_KEY_PATH,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      DOCKER_SSH_USER + "@" + DOCKER_SSH_HOST,
      remoteCommand
    ],
    { timeout: DOCKER_SSH_TIMEOUT_MS }
  );
  return stdout;
}

async function fetchDockerContainers() {
  const stdout = await runDockerCommand(["ps", "-a", "--format", "{{.ID}}|{{.Names}}|{{.Status}}"]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("|");
      return { id: parts[0], name: parts[1], status: parts[2] };
    });
}

function isProtectedContainer(name) {
  return DOCKER_PROTECTED_CONTAINERS.includes(name.toLowerCase());
}

async function handleDockerPs(message) {
  try {
    const containers = await fetchDockerContainers().then((list) =>
      list.filter((c) => !isProtectedContainer(c.name))
    );
    if (containers.length === 0) {
      await message.reply("No containers found.");
      return;
    }
    const lines = containers.map((c) => c.name + " - " + c.status);
    await message.reply("```\n" + lines.join("\n") + "\n```");
  } catch (err) {
    console.error("docker ps failed:", err.message);
    await message.reply("Could not reach the Docker host.");
  }
}

async function handleDockerRestart(message, name) {
  if (!name) {
    await message.reply("Usage: !docker restart CONTAINER NAME");
    return;
  }

  if (isProtectedContainer(name)) {
    await message.reply("The \"" + name + "\" container is protected and can't be restarted through the bot.");
    return;
  }

  let containers;
  try {
    containers = await fetchDockerContainers();
  } catch (err) {
    console.error("docker ps failed:", err.message);
    await message.reply("Could not reach the Docker host.");
    return;
  }

  const match = containers.find((c) =>
    c.name.toLowerCase() === name.toLowerCase() || c.id === name || c.id.startsWith(name.toLowerCase())
  );
  if (!match) {
    await message.reply("No container named \"" + name + "\" found. Use !docker ps to see the list.");
    return;
  }

  if (isProtectedContainer(match.name)) {
    await message.reply("The \"" + match.name + "\" container is protected and can't be restarted through the bot.");
    return;
  }

  try {
    await runDockerCommand(["restart", match.name]);
    await message.reply("Restarted \"" + match.name + "\".");
  } catch (err) {
    console.error("docker restart failed:", err.message);
    await message.reply("Could not restart \"" + match.name + "\".");
  }
}

async function hasDockerRole(message) {
  if (message.guild) {
    return message.member.roles.cache.has(DOCKER_ROLE_ID);
  }
  for (const guild of message.client.guilds.cache.values()) {
    let member = guild.members.cache.get(message.author.id);
    if (!member) {
      member = await guild.members.fetch(message.author.id).catch(() => null);
    }
    if (member && member.roles.cache.has(DOCKER_ROLE_ID)) return true;
  }
  return false;
}

async function handleDocker(message, input) {
  if (!DOCKER_ENABLED) {
    await message.reply("Docker control isn't set up. Set DOCKER_SSH_HOST, DOCKER_SSH_USER, DOCKER_SSH_KEY_PATH, and DOCKER_ROLE_ID in .env to enable it.");
    return;
  }
  if (!(await hasDockerRole(message))) {
    await message.reply("You don't have permission to use !docker.");
    return;
  }

  const parts = input.trim().split(/\s+/).filter((p) => p.length > 0);
  const subcommand = (parts[0] || "").toLowerCase();

  if (subcommand === "ps") {
    await handleDockerPs(message);
    return;
  }
  if (subcommand === "restart") {
    await handleDockerRestart(message, parts.slice(1).join(" "));
    return;
  }
  await message.reply("Usage: !docker ps or !docker restart CONTAINER NAME");
}

const visible = async (message) => DOCKER_ENABLED && (await hasDockerRole(message));

module.exports = {
  name: "docker-containers",
  commands: [{ name: "docker", dm: true, run: handleDocker }],
  help: [
    { order: 161, text: "!docker ps - list containers on the game server (requires the Docker role)", visible: visible },
    { order: 162, text: "!docker restart CONTAINER NAME - restart a container by name (requires the Docker role, some containers may be protected)", visible: visible }
  ]
};
