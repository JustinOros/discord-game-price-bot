const fs = require("fs");
const path = require("path");

function loadPlugins(pluginsDir, disabled) {
  const plugins = [];
  if (!fs.existsSync(pluginsDir)) return plugins;
  const names = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    if (disabled.includes(name)) continue;
    try {
      const plugin = require(path.join(pluginsDir, name));
      plugin.name = plugin.name || name;
      plugins.push(plugin);
    } catch (err) {
      console.error("Could not load plugin " + name + ":", err.message);
    }
  }
  return plugins;
}

function findCommand(plugins, content, inDm) {
  const lower = content.toLowerCase();
  for (const plugin of plugins) {
    for (const command of plugin.commands || []) {
      if (inDm && !command.dm) continue;
      const token = "!" + command.name;
      if (lower === token || (!command.exact && lower.startsWith(token + " "))) {
        return { plugin: plugin, command: command, args: content.slice(token.length).trim() };
      }
    }
  }
  return null;
}

async function collectHelpEntries(plugins, message) {
  const entries = [];
  const checked = new Map();
  for (const plugin of plugins) {
    for (const line of plugin.help || []) {
      if (line.visible) {
        if (!checked.has(line.visible)) checked.set(line.visible, await line.visible(message));
        if (!checked.get(line.visible)) continue;
      }
      entries.push({ order: line.order, text: line.text });
    }
  }
  return entries;
}

function startPlugins(plugins, context) {
  for (const plugin of plugins) {
    if (typeof plugin.onReady !== "function") continue;
    try {
      plugin.onReady(context);
    } catch (err) {
      console.error("Could not start plugin " + plugin.name + ":", err.message);
    }
  }
}

function registerPlugins(plugins, context) {
  for (const plugin of plugins) {
    if (typeof plugin.register !== "function") continue;
    try {
      plugin.register(context);
    } catch (err) {
      console.error("Could not register plugin " + plugin.name + ":", err.message);
    }
  }
}

async function runChatHooks(plugins, message, content) {
  for (const plugin of plugins) {
    if (typeof plugin.onChat !== "function") continue;
    if (await plugin.onChat(message, content)) return true;
  }
  return false;
}

module.exports = { loadPlugins, findCommand, collectHelpEntries, startPlugins, registerPlugins, runChatHooks };
