const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const EMBED_COLOR = 0xb7a58a;
const LIST_LIMIT = 10;
const COMMAND_LIMIT = 25;
const ANNOUNCED_PATH = path.join(__dirname, "..", "announced.json");
const ANNOUNCED_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function bookKey(title) {
  const base = String(title || "").replace(/\([^)]*\)/g, " ").split(":")[0];
  return normalize(base).replace(/^the /, "");
}

function stars(rating) {
  if (!rating) return "not rated";
  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

function memberName(guild, id) {
  const member = guild && guild.members.cache.get(id);
  if (!member) return "<@" + id + ">";
  return member.displayName || (member.user && (member.user.globalName || member.user.username)) || "<@" + id + ">";
}

function mentionedIds(text) {
  const ids = [];
  const pattern = /<@!?(\w+)>/g;
  let match;
  while ((match = pattern.exec(text)) !== null) ids.push(match[1]);
  return ids;
}

function stripMentions(text) {
  return text.replace(/<@!?\w+>/g, " ").replace(/\s+/g, " ").trim();
}

function hasBooksRole(message, config) {
  if (!message.guild || !message.member) return false;
  const roles = Array.from(message.member.roles.cache.values());
  if (config.roleId) return roles.some((role) => String(role.id) === String(config.roleId));
  const wanted = normalize(config.roleName || "books");
  return roles.some((role) => normalize(role.name) === wanted);
}

function embed(title, description) {
  return new EmbedBuilder().setColor(EMBED_COLOR).setTitle(title).setDescription(String(description).slice(0, 4000));
}

function claimAnnouncement(userId, title) {
  const key = String(userId) + "|" + bookKey(title);
  const now = Date.now();
  let entries = {};
  try {
    const data = JSON.parse(fs.readFileSync(ANNOUNCED_PATH, "utf8"));
    if (data && typeof data === "object") entries = data;
  } catch (err) {
    entries = {};
  }
  Object.keys(entries).forEach((existing) => {
    if (!(now - entries[existing] < ANNOUNCED_TTL_MS)) delete entries[existing];
  });
  if (entries[key]) return false;
  entries[key] = now;
  try {
    fs.writeFileSync(ANNOUNCED_PATH, JSON.stringify(entries, null, 2) + "\n");
  } catch (err) {
    console.error("Could not save announced books:", err.message);
  }
  return true;
}

function registerSource(context, source) {
  if (!Array.isArray(context.bookSources)) context.bookSources = [];
  context.bookSources = context.bookSources.filter((existing) => existing.name !== source.name);
  context.bookSources.push(source);
}

function getSources(context) {
  return context && Array.isArray(context.bookSources) ? context.bookSources : [];
}

module.exports = {
  EMBED_COLOR,
  LIST_LIMIT,
  COMMAND_LIMIT,
  normalize,
  bookKey,
  stars,
  memberName,
  mentionedIds,
  stripMentions,
  hasBooksRole,
  embed,
  claimAnnouncement,
  registerSource,
  getSources
};
