const { sc } = require("./helpers");

module.exports = [
  sc("help-guild-variants", async (ctx) => {
    await ctx.say("bob", "!help");
    await ctx.say("alice", "!help");
    await ctx.say("alice", "!HELP");
  }),

  sc("help-direct-messages", async (ctx) => {
    await ctx.dm("dave", "!help");
    await ctx.dm("dave", "hello after help");
    await ctx.dm("alice", "!help");
    await ctx.dm("eve", "  !HELP  ", { label: "eve dm: padded upper case help" });
  }),

  sc("dm-greeting", async (ctx) => {
    await ctx.dm("eve", "hello");
    await ctx.dm("eve", "hello again");
    await ctx.dm("erin", "hi");
    await ctx.dm("eve", "!watch hades", { label: "eve dm: command in a DM gets the second-time text" });
    await ctx.dm("carol", "!price hades");
    await ctx.dm("robot", "hello from a bot");
    await ctx.dm("frank", "bmo are you there", { label: "frank dm: trigger word in a DM is not AI chat" });
  }),

  sc("non-command-chatter-and-unknown-commands", async (ctx) => {
    await ctx.say("alice", "good morning everyone");
    await ctx.say("alice", "!");
    await ctx.say("alice", "!foo bar");
    await ctx.say("alice", "!watchhades");
    await ctx.say("alice", "!popularity");
    await ctx.say("alice", "!roleplay");
    await ctx.say("alice", "!rolesx");
    await ctx.say("alice", "!checkout");
    await ctx.say("alice", "!list now");
    await ctx.say("alice", "!score board");
    await ctx.say("alice", "!trivia now");
    await ctx.say("alice", "!helpme");
    await ctx.say("alice", "!memories please");
    await ctx.say("robot", "!list", { label: "other bot: !list" });
    await ctx.say("alice", "   !LIST   ", { label: "alice: !LIST with padding" });
    await ctx.say("alice", "hello !list", { label: "alice: command not at the start" });
  }),

  sc("command-dispatch-order-collisions", async (ctx) => {
    await ctx.say("alice", "!prices hades");
    await ctx.say("alice", "!price hades");
    await ctx.say("alice", "!price s hades", { label: "alice: !price s hades" });
    await ctx.say("alice", "!roles");
    await ctx.say("alice", "!role Terraria");
    await ctx.say("alice", "!unroll terraria");
    await ctx.say("alice", "!unown hades");
    await ctx.say("alice", "!unwatch ghost");
    await ctx.say("alice", "!remove ghost");
  }),

  sc("help-text-with-note-on-guild-and-docker-lines", async (ctx) => {
    await ctx.say("bob", "!help");
  }, { env: { DOCKER_PROTECTED_CONTAINERS: null } })
];
