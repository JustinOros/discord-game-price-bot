const { sc } = require("./helpers");

module.exports = [
  sc("member-add-greeting-and-picker", async (ctx) => {
    await ctx.joinMember("newbie");
    await ctx.joinMember("eve", { label: "guildMemberAdd eve (second greeting uses next random pick)" });
  }),

  sc("member-add-no-roles", async (ctx) => {
    await ctx.joinMember("newbie");
  }, { files: { "roles.yaml": {} } }),

  sc("member-add-overflow-picker", async (ctx) => {
    ctx.writeFile("roles.yaml", ctx.manyRoles(30));
    await ctx.joinMember("newbie");
  }),

  sc("member-add-no-text-general-channel", async (ctx) => {
    ctx.g1.channels.cache.delete("CH-general");
    await ctx.joinMember("newbie", { label: "guildMemberAdd with only a voice channel named general" });
    await ctx.joinMember("dave", { guild: ctx.g2, label: "guildMemberAdd in second guild without general" });
  }),

  sc("member-add-send-failures", async (ctx) => {
    ctx.failNext("send", { skip: 0, count: 1 });
    await ctx.joinMember("newbie", { label: "guildMemberAdd greeting send fails, picker succeeds" });
    ctx.clearFailures();
    ctx.failNext("send", { skip: 1, count: 1 });
    await ctx.joinMember("eve", { label: "guildMemberAdd greeting ok, picker send fails" });
  }),

  sc("member-add-empty-greetings", async (ctx) => {
    await ctx.joinMember("newbie");
  }, { files: { "greetings.yaml": "greetings: []\n" } }),

  sc("member-add-greetings-file-without-key", async (ctx) => {
    await ctx.joinMember("newbie");
  }, { files: { "greetings.yaml": "other: 1\n" } }),

  sc("member-remove-goodbye", async (ctx) => {
    await ctx.leaveMember("carol");
    await ctx.leaveMember("bob", { noUser: true, label: "guildMemberRemove bob without user object" });
  }),

  sc("member-remove-no-channel-and-failures", async (ctx) => {
    await ctx.leaveMember("dave", { guild: ctx.g2, label: "guildMemberRemove in second guild without general" });
    ctx.failNext("send");
    await ctx.leaveMember("carol", { label: "guildMemberRemove goodbye send fails" });
  }),

  sc("member-remove-empty-goodbyes", async (ctx) => {
    await ctx.leaveMember("carol");
  }, { files: { "goodbyes.yaml": "goodbyes: []\n" } })
];
