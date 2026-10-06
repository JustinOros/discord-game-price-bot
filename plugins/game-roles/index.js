const { MessageFlags } = require("discord.js");

async function handleRoles(message, ctx) {
  const entries = ctx.sortedRoleEntries();
  if (entries.length === 0) {
    await message.reply("No game roles yet. Use !own GAME or !role GAME to create one.");
    return;
  }

  const guild = message.guild;
  if (guild) {
    try {
      await guild.members.fetch();
    } catch (err) {
      console.error("Could not refresh member cache:", err.message);
    }
  }

  const counts = ctx.roleMemberCounts(guild, entries);
  const picker = ctx.buildRolePickerComponents(entries, counts);
  const content = picker.overflow
    ? "Use the dropdown below to add yourself to a role (showing the first " + ctx.ROLE_PICKER_MAX + " alphabetically - use !role GAME for any others):"
    : "Click a button below to add or remove yourself from a role:";
  await message.reply({ content: content, components: picker.components });
}

async function handleRole(message, input, ctx) {
  if (!input) {
    await message.reply("Usage: !role GAME NAME or !role EMOJI GAME NAME");
    return;
  }
  if (!message.guild) {
    await message.reply("Roles only work inside a server, not in DMs.");
    return;
  }

  let customEmoji = null;
  let query = input;
  const firstSpace = input.indexOf(" ");
  const firstToken = firstSpace === -1 ? input : input.slice(0, firstSpace);
  if (ctx.isEmoji(firstToken)) {
    customEmoji = firstToken;
    query = firstSpace === -1 ? "" : input.slice(firstSpace + 1).trim();
  }

  if (!query) {
    await message.reply("Usage: !role GAME NAME or !role EMOJI GAME NAME");
    return;
  }

  let roleTitle = query.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  try {
    const results = await ctx.searchGame(query);
    const needle = ctx.normalizeTitle(query);
    const exact = (results || []).find((r) => ctx.normalizeTitle(r.title) === needle);
    if (exact) roleTitle = exact.title;
  } catch (err) {
    console.error("Role title search failed:", err.message);
  }

  try {
    const roleResult = await ctx.ensureGameRole(message.guild, roleTitle, customEmoji);
    if (message.member.roles.cache.has(roleResult.role.id)) {
      await message.reply("You already have the " + roleResult.emoji + " " + roleResult.title + " role.");
      return;
    }
    await message.member.roles.add(roleResult.role.id);
    await message.reply((roleResult.created ? "Created the " : "Added you to the ") + roleResult.emoji + " " + roleResult.title + " role.");
  } catch (err) {
    console.error("Role assignment failed:", err.message);
    await message.reply("Could not assign that role - make sure I have Manage Roles permission and my role is above the roles I manage.");
  }
}

async function handleUnroll(message, query, ctx) {
  if (!query) {
    await message.reply("Usage: !unroll GAME NAME");
    return;
  }
  if (!message.guild) {
    await message.reply("Roles only work inside a server, not in DMs.");
    return;
  }

  const roles = ctx.loadRoles();
  const found = ctx.findGameRole(roles, query);
  if (!found) {
    await message.reply("No role exists for \"" + query + "\".");
    return;
  }

  if (!message.member.roles.cache.has(found.entry.roleId)) {
    await message.reply("You don't have the " + found.entry.emoji + " " + found.entry.title + " role.");
    return;
  }

  try {
    await message.member.roles.remove(found.entry.roleId);
    await message.reply("Removed you from the " + found.entry.emoji + " " + found.entry.title + " role.");
  } catch (err) {
    console.error("Role removal failed:", err.message);
    await message.reply("Could not remove that role - make sure I have Manage Roles permission.");
  }
}

async function handleRoleInteraction(interaction, roleId, ctx) {
  const roles = ctx.loadRoles();
  const entry = Object.values(roles).find((r) => r.roleId === roleId);
  if (!entry) {
    await interaction.reply({ content: "That role no longer exists.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferUpdate();

  const hadRole = interaction.member.roles.cache.has(roleId);
  let confirmation;
  try {
    if (hadRole) {
      await interaction.member.roles.remove(roleId);
      confirmation = "Removed you from the " + entry.emoji + " " + entry.title + " role.";
    } else {
      await interaction.member.roles.add(roleId);
      confirmation = "Added you to the " + entry.emoji + " " + entry.title + " role.";
    }
  } catch (err) {
    console.error("Role button interaction failed:", err.message);
    await interaction.followUp({ content: "Could not update that role - make sure I have Manage Roles permission and my role is above the roles I manage.", flags: MessageFlags.Ephemeral });
    return;
  }

  const entries = ctx.sortedRoleEntries();
  const counts = ctx.roleMemberCounts(interaction.guild, entries);
  const role = interaction.guild.roles.cache.get(roleId);
  const cacheHasMember = role ? role.members.has(interaction.member.id) : false;
  const shouldHaveMember = !hadRole;
  if (counts[roleId] !== undefined && cacheHasMember !== shouldHaveMember) {
    counts[roleId] = Math.max(0, counts[roleId] + (shouldHaveMember ? 1 : -1));
  }
  const picker = ctx.buildRolePickerComponents(entries, counts);
  try {
    await interaction.editReply({ components: picker.components });
  } catch (err) {
    console.error("Could not refresh role picker message:", err.message);
  }
  await interaction.followUp({ content: confirmation, flags: MessageFlags.Ephemeral });
}

function register(ctx) {
  ctx.client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith("role:")) {
      await handleRoleInteraction(interaction, interaction.customId.slice(5), ctx);
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === "role-select") {
      await handleRoleInteraction(interaction, interaction.values[0], ctx);
      return;
    }
  });
}

module.exports = {
  name: "game-roles",
  priority: 200,
  register,
  commands: [
    { name: "roles", exact: true, run: (message, args, ctx) => handleRoles(message, ctx) },
    { name: "role", needsArgs: true, run: (message, args, ctx) => handleRole(message, args, ctx) },
    { name: "unroll", needsArgs: true, run: (message, args, ctx) => handleUnroll(message, args, ctx) }
  ],
  help: [
    { order: 140, text: "!roles - list every game role and how many members have each" },
    { order: 150, text: "!role GAME - create (if it doesn't exist) and join that game's role, with an emoji picked for you; !role EMOJI GAME to pick your own emoji instead" },
    { order: 160, text: "!unroll GAME - leave a game's role" }
  ]
};
