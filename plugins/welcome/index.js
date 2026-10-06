const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const GREETINGS_PATH = path.join(__dirname, "..", "..", "greetings.yaml");
const GOODBYES_PATH = path.join(__dirname, "..", "..", "goodbyes.yaml");

function loadGreetings() {
  const data = yaml.load(fs.readFileSync(GREETINGS_PATH, "utf8"));
  return (data && data.greetings) || [];
}

function loadGoodbyes() {
  const data = yaml.load(fs.readFileSync(GOODBYES_PATH, "utf8"));
  return (data && data.goodbyes) || [];
}

const GREETINGS = loadGreetings();
const GOODBYES = loadGoodbyes();

async function onMemberAdd(member, ctx) {
  if (GREETINGS.length === 0) return;

  const channel = member.guild.channels.cache.find(
    (c) => c.name === ctx.GREETING_CHANNEL_NAME && c.isTextBased && c.isTextBased()
  );
  if (!channel) {
    console.error("Could not find a #" + ctx.GREETING_CHANNEL_NAME + " channel in " + member.guild.name);
    return;
  }

  const template = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  const text = template.replace(/\{user\}/g, member.toString());
  try {
    await channel.send(text);
  } catch (err) {
    console.error("Could not send greeting:", err.message);
  }

  const entries = ctx.sortedRoleEntries();
  if (entries.length > 0) {
    const counts = ctx.roleMemberCounts(member.guild, entries);
    const picker = ctx.buildRolePickerComponents(entries, counts);
    const content = "Add yourself to a role for games you own or play, " + member.toString() + ":" +
      (picker.overflow ? " (showing the first " + ctx.ROLE_PICKER_MAX + " alphabetically in the dropdown, !role GAME works for the rest)" : "");
    try {
      await channel.send({ content: content, components: picker.components });
    } catch (err) {
      console.error("Could not send role picker:", err.message);
    }
  }
}

async function onMemberRemove(member, ctx) {
  if (GOODBYES.length === 0) return;

  const channel = member.guild.channels.cache.find(
    (c) => c.name === ctx.GREETING_CHANNEL_NAME && c.isTextBased && c.isTextBased()
  );
  if (!channel) {
    console.error("Could not find a #" + ctx.GREETING_CHANNEL_NAME + " channel in " + member.guild.name);
    return;
  }

  const template = GOODBYES[Math.floor(Math.random() * GOODBYES.length)];
  const name = member.user ? member.user.username : "someone";
  const text = template.replace(/\{user\}/g, name);
  try {
    await channel.send(text);
  } catch (err) {
    console.error("Could not send goodbye:", err.message);
  }
}

module.exports = {
  name: "welcome",
  register(ctx) {
    ctx.client.on("guildMemberAdd", (member) => onMemberAdd(member, ctx));
    ctx.client.on("guildMemberRemove", (member) => onMemberRemove(member, ctx));
  }
};
