const { sc } = require("./helpers");

module.exports = [
  sc("memory-remember", async (ctx) => {
    await ctx.say("bob", "!remember I like cats");
    await ctx.say("bob", "!remember I LIKE CATS");
    await ctx.say("bob", "!remember   my favorite color is green  ");
    await ctx.say("bob", "!remember " + "x".repeat(400), { label: "bob: !remember with 400 characters" });
    await ctx.say("alice", "!remember my name is alice");
  }),

  sc("memory-remember-limit", async (ctx) => {
    const list = [];
    for (let i = 1; i <= 20; i++) list.push("fact number " + i);
    ctx.writeFile("memory.yaml", { U2: list });
    await ctx.say("bob", "!remember one fact too many");
    await ctx.say("alice", "!remember alice can still add");
  }),

  sc("memory-forget", async (ctx) => {
    await ctx.say("alice", "!forget MY NAME IS ALICE");
    await ctx.say("alice", "!forget not saved");
    await ctx.say("alice", "!forget all");
    await ctx.say("alice", "!forget anything");
    await ctx.say("carol", "!forget something");
  }),

  sc("memory-forget-last-item-removes-user", async (ctx) => {
    await ctx.say("bob", "!forget only fact");
    await ctx.say("bob", "!memories");
    await ctx.say("bob", "!forget ALL");
    await ctx.say("bob", "!memories", { label: "bob: !memories after forgetting all" });
  }, { files: { "memory.yaml": { U2: ["only fact"], U1: ["keep me"] } } }),

  sc("memory-memories", async (ctx) => {
    await ctx.say("alice", "!memories");
    await ctx.say("carol", "!memories");
    await ctx.say("alice", "!MEMORIES");
  }),

  sc("memory-file-missing", async (ctx) => {
    await ctx.say("alice", "!memories");
    await ctx.say("alice", "!remember first fact");
    await ctx.say("alice", "!memories", { label: "alice: !memories after first remember" });
  }, { files: { "memory.yaml": null } }),

  sc("memory-file-corrupt", async (ctx) => {
    await ctx.say("alice", "!memories");
    await ctx.say("alice", "!remember recovered fact");
  }, { files: { "memory.yaml": "key: [unclosed\n  - broken: : :\n" } })
];
