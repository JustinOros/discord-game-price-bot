const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");

const ROLES_PATH = path.join(__dirname, "..", "roles.yaml");

function createRoles(deps) {
  const { normalizeTitle, AI_ENABLED, OLLAMA_URL, OLLAMA_MODEL } = deps;

  const ROLE_EMOJI_POOL = [
    "🎮", "🕹️", "🎲", "🎯", "🏆", "🥇", "🥈", "🥉", "🎖️", "🏅",
    "⚔️", "🛡️", "🏹", "🗡️", "🔪", "🪓", "💣", "🧨", "🔫", "🔱",
    "🧙", "🧝", "🧛", "🧟", "🐉", "🐲", "👑", "💎", "🔮", "🗝️",
    "🔑", "🚀", "🛸", "🤖", "👾", "💀", "☠️", "🔥", "❄️", "⚡",
    "🌊", "🌪️", "🌋", "🌟", "⭐", "✨", "🌙", "☀️", "🍀", "🌵",
    "🌲", "🍄", "🦅", "🐺", "🦊", "🦁", "🐯", "🐻", "🐸", "🐍",
    "🕷️", "🦂", "🦇", "🦄", "🐴", "🐙", "🦑", "🦖", "🦕", "🐊",
    "🦈", "🐳", "🎃", "🥷", "🧭", "🏰", "🛶", "⛵", "🚁", "🚂",
    "🎸", "🎺", "🥁", "🎻", "🍕", "🍔", "🌮", "🍩", "☕", "🍺"
  ];

  function loadRoles() {
    try {
      const data = yaml.load(fs.readFileSync(ROLES_PATH, "utf8"));
      return (data && typeof data === "object") ? data : {};
    } catch (err) {
      return {};
    }
  }

  function saveRoles(roles) {
    fs.writeFileSync(ROLES_PATH, yaml.dump(roles));
  }

  function pickRoleEmoji(roles) {
    const used = new Set(Object.values(roles).map((r) => r.emoji));
    const available = ROLE_EMOJI_POOL.filter((e) => !used.has(e));
    const pool = available.length > 0 ? available : ROLE_EMOJI_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const EMOJI_PATTERN = /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*$/u;
  const EMOJI_SUGGEST_TIMEOUT_MS = 8000;

  function isEmoji(str) {
    return EMOJI_PATTERN.test(str);
  }

  async function suggestGameEmoji(title) {
    if (!AI_ENABLED) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMOJI_SUGGEST_TIMEOUT_MS);
    try {
      const res = await fetch(OLLAMA_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          options: { num_predict: 10 },
          messages: [
            { role: "system", content: "You only ever reply with a single emoji character, nothing else - no words, no explanation, no punctuation." },
            { role: "user", content: "Pick one emoji that best fits the video game \"" + title + "\"." }
          ]
        }),
        signal: controller.signal
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = ((data.message && data.message.content) || "").trim();
      const match = text.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/u);
      return match ? match[0] : null;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function pickFittingEmoji(roles, title) {
    const suggested = await suggestGameEmoji(title);
    if (suggested) {
      const used = new Set(Object.values(roles).map((r) => r.emoji));
      if (!used.has(suggested)) return suggested;
    }
    return pickRoleEmoji(roles);
  }

  function findGameRole(roles, query) {
    const normalized = normalizeTitle(query);
    if (roles[normalized]) return { key: normalized, entry: roles[normalized] };
    for (const key of Object.keys(roles)) {
      if (normalized.includes(key) || key.includes(normalized)) return { key: key, entry: roles[key] };
    }
    return null;
  }

  function sortedRoleEntries() {
    const roles = loadRoles();
    return Object.values(roles).sort((a, b) => a.title.localeCompare(b.title));
  }

  const ROLE_PICKER_MAX = 25;

  function roleMemberCounts(guild, entries) {
    const counts = {};
    entries.forEach((entry) => {
      const role = guild && guild.roles.cache.get(entry.roleId);
      counts[entry.roleId] = role ? role.members.size : 0;
    });
    return counts;
  }

  function buildRolePickerComponents(entries, counts) {
    if (entries.length === 0) return { components: [], overflow: false };

    const labelFor = (entry) => {
      const count = counts ? counts[entry.roleId] : undefined;
      return count === undefined ? entry.title : entry.title + " (" + count + ")";
    };

    if (entries.length <= ROLE_PICKER_MAX) {
      const rows = [];
      for (let i = 0; i < entries.length; i += 5) {
        const row = new ActionRowBuilder();
        entries.slice(i, i + 5).forEach((entry) => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("role:" + entry.roleId)
              .setLabel(labelFor(entry).slice(0, 80))
              .setEmoji(entry.emoji)
              .setStyle(ButtonStyle.Secondary)
          );
        });
        rows.push(row);
      }
      return { components: rows, overflow: false };
    }

    const shown = entries.slice(0, ROLE_PICKER_MAX);
    const menu = new StringSelectMenuBuilder()
      .setCustomId("role-select")
      .setPlaceholder("Choose a game role")
      .addOptions(shown.map((entry) => ({
        label: labelFor(entry).slice(0, 100),
        value: entry.roleId,
        emoji: entry.emoji
      })));
    return { components: [new ActionRowBuilder().addComponents(menu)], overflow: true };
  }

  function cleanTitle(title) {
    return title.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
  }

  async function ensureGameRole(guild, title, preferredEmoji) {
    const cleanedTitle = cleanTitle(title);
    const roles = loadRoles();
    const key = normalizeTitle(title);
    const entry = roles[key];

    if (entry) {
      const existing = guild.roles.cache.get(entry.roleId) || await guild.roles.fetch(entry.roleId).catch(() => null);
      if (existing) {
        let changed = false;
        if (entry.title !== cleanedTitle) {
          entry.title = cleanedTitle;
          changed = true;
        }
        if (preferredEmoji && preferredEmoji !== entry.emoji) {
          entry.emoji = preferredEmoji;
          changed = true;
        }

        const tryNative = entry.iconMode !== "name";
        const desiredName = tryNative ? cleanedTitle : (entry.emoji + " " + cleanedTitle);
        const nameOk = existing.name === desiredName;
        const iconOk = !tryNative || existing.unicodeEmoji === entry.emoji;

        if (!nameOk || !iconOk) {
          if (tryNative) {
            try {
              await existing.edit({ name: cleanedTitle, unicodeEmoji: entry.emoji });
              entry.iconMode = "native";
            } catch (err) {
              try {
                await existing.setName(entry.emoji + " " + cleanedTitle);
                entry.iconMode = "name";
              } catch (err2) {
                console.error("Could not update role:", err2.message);
              }
            }
          } else {
            try {
              await existing.setName(entry.emoji + " " + cleanedTitle);
            } catch (err) {
              console.error("Could not update role:", err.message);
            }
          }
          changed = true;
        }

        if (changed) {
          roles[key] = entry;
          saveRoles(roles);
        }
        return { role: existing, emoji: entry.emoji, created: false, title: cleanedTitle };
      }
    }

    const emoji = preferredEmoji || await pickFittingEmoji(roles, cleanedTitle);
    let role;
    let iconMode;
    try {
      role = await guild.roles.create({
        name: cleanedTitle,
        unicodeEmoji: emoji,
        mentionable: true,
        reason: "Game role for " + cleanedTitle
      });
      iconMode = "native";
    } catch (err) {
      role = await guild.roles.create({
        name: emoji + " " + cleanedTitle,
        mentionable: true,
        reason: "Game role for " + cleanedTitle
      });
      iconMode = "name";
    }
    roles[key] = { title: cleanedTitle, roleId: role.id, emoji: emoji, iconMode: iconMode };
    saveRoles(roles);
    return { role: role, emoji: emoji, created: true, title: cleanedTitle };
  }

  return {
    loadRoles,
    saveRoles,
    findGameRole,
    sortedRoleEntries,
    ROLE_PICKER_MAX,
    roleMemberCounts,
    buildRolePickerComponents,
    ensureGameRole,
    isEmoji
  };
}

module.exports = { createRoles };
