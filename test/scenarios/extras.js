const { sc } = require("./helpers");

module.exports = [
  sc("wiki-search-timeout", async (ctx) => {
    ctx.fx.hang("api.tavily.com");
    await ctx.say("alice", "!wiki anything at all", { noSettle: true });
    await ctx.advance(11999, "advance 11999ms, search still pending");
    await ctx.advance(1, "advance 1ms more, search aborted at 12s");
    ctx.note("pendingTimersAfter", ctx.clock.pendingTimers());
  }),

  sc("own-emoji-suggestion-timeout", async (ctx) => {
    ctx.fx.hang("/api/chat");
    await ctx.say("alice", "!own Stardew", { noSettle: true });
    await ctx.advance(7999, "advance 7999ms, emoji request still pending");
    await ctx.advance(1, "advance 1ms more, emoji request aborted at 8s");
    ctx.note("pendingTimersAfter", ctx.clock.pendingTimers());
  }, { files: { "owned.json": {} } }),

  sc("personality-defaults", async (ctx) => {
    await ctx.say("alice", "hey assistant, are you there");
    await ctx.say("bob", "hey bmo, are you there");
    await ctx.advance(6000);
    ctx.fx.fail("/api/chat");
    await ctx.say("alice", "assistant please answer");
  }, { files: { "personality.yaml": "" } }),

  sc("personality-regex-trigger", async (ctx) => {
    await ctx.say("alice", "hey r2.d2 are you there");
    await ctx.say("bob", "hey r2xd2 are you there");
    await ctx.say("carol", "r2.d2");
  }, { files: { "personality.yaml": { name: "R2", trigger: "r2.d2", persona: "You are R2.\n" } } }),

  sc("member-templates-replace-every-placeholder", async (ctx) => {
    await ctx.joinMember("newbie");
    await ctx.leaveMember("carol");
  }, { files: { "greetings.yaml": { greetings: ["Hi {user} and again {user}!"] }, "goodbyes.yaml": { goodbyes: ["Bye {user}, bye {user}."] } } }),

  sc("data-files-missing", async (ctx) => {
    await ctx.say("alice", "!list");
    await ctx.say("alice", "!watch hades");
    await ctx.say("alice", "!who hades");
    await ctx.say("alice", "!popular");
    await ctx.say("alice", "!info hades");
    await ctx.say("alice", "!own hades");
    await ctx.say("alice", "!unown hades");
    await ctx.say("alice", "!my-steam-profile justinvanity");
    await ctx.say("alice", "!check");
    await ctx.say("alice", "!remove hades");
  }, { files: { "games.json": null, "owned.json": null, "steamlinks.json": null } }),

  sc("roles-and-scores-files-corrupt", async (ctx) => {
    await ctx.say("alice", "!roles");
    await ctx.say("alice", "!score");
    await ctx.say("alice", "!unroll hades");
    await ctx.say("bob", "!role Terraria");
  }, { files: { "roles.yaml": "just a string\n", "scores.json": "{not json" } }),

  sc("roles-file-missing", async (ctx) => {
    await ctx.say("alice", "!roles");
    await ctx.say("alice", "!role Celeste");
    await ctx.joinMember("newbie");
  }, { files: { "roles.yaml": null } }),

  sc("role-title-cleaning", async (ctx) => {
    await ctx.say("alice", "!role Hades™");
    await ctx.say("bob", "!role Brand  New®  Game");
    await ctx.say("carol", "!own Celeste");
  }),

  sc("reply-reference-without-message-id", async (ctx) => {
    await ctx.say("alice", "no trigger here", { referenceRaw: {} });
    await ctx.say("alice", "no trigger here either", { referenceRaw: { messageId: null } });
    await ctx.say("alice", "bmo with an empty reference", { referenceRaw: {} });
  }),

  sc("docker-help-lines-follow-role-in-direct-messages", async (ctx) => {
    await ctx.dm("bob", "!help");
    await ctx.dm("dave", "!help");
    await ctx.dm("eve", "!help");
  })
];
