const { sc } = require("./helpers");

module.exports = [
  sc("roles-picker-small", async (ctx) => {
    await ctx.say("alice", "!roles");
  }),

  sc("roles-picker-empty", async (ctx) => {
    await ctx.say("alice", "!roles");
  }, { files: { "roles.yaml": {} } }),

  sc("roles-picker-sizes", async (ctx) => {
    ctx.writeFile("roles.yaml", ctx.manyRoles(25));
    await ctx.say("alice", "!roles", { label: "alice: !roles with exactly 25 roles" });
    ctx.writeFile("roles.yaml", ctx.manyRoles(26));
    await ctx.say("alice", "!roles", { label: "alice: !roles with 26 roles" });
    ctx.writeFile("roles.yaml", ctx.manyRoles(30));
    await ctx.say("alice", "!roles", { label: "alice: !roles with 30 roles" });
  }),

  sc("roles-picker-member-fetch-failure", async (ctx) => {
    ctx.failNext("membersFetch");
    await ctx.say("alice", "!roles");
  }),

  sc("roles-picker-long-title", async (ctx) => {
    const long = "A".repeat(120);
    ctx.writeFile("roles.yaml", {
      long: { title: long, roleId: "R-HADES", emoji: "⚔️", iconMode: "native" },
      other: { title: "Zed", roleId: "R-CELESTE", emoji: "🍓", iconMode: "native" }
    });
    await ctx.say("alice", "!roles");
    const many = ctx.manyRoles(26);
    many["role game 01"].title = long;
    ctx.writeFile("roles.yaml", many);
    await ctx.say("alice", "!roles", { label: "alice: !roles dropdown with a 120 character title" });
  }),

  sc("role-command", async (ctx) => {
    await ctx.say("alice", "!role Terraria");
    await ctx.say("alice", "!role Terraria");
    await ctx.say("bob", "!role Celeste");
    await ctx.say("bob", "!role 🎯 Minecraft");
    await ctx.say("carol", "!role Minecraft");
    await ctx.say("carol", "!role 🎯");
    await ctx.say("alice", "!role celeste adventure");
    await ctx.say("alice", "!role 🔥 Hades");
    await ctx.say("erin", "!role searchfail");
    await ctx.say("erin", "!role abc def");
    await ctx.say("frank", "!role 🧙‍♂️ Pattern Early Game");
    await ctx.say("frank", "!role hollow");
  }),

  sc("role-command-failure", async (ctx) => {
    ctx.failNext("roleCreate", Infinity);
    await ctx.say("alice", "!role Brand New Game");
    ctx.clearFailures();
    ctx.failNext("roleAdd");
    await ctx.say("alice", "!role Celeste");
  }),

  sc("unroll-command", async (ctx) => {
    await ctx.say("alice", "!unroll hades");
    await ctx.say("alice", "!unroll hades");
    await ctx.say("alice", "!unroll nonexistent");
    await ctx.say("bob", "!unroll celeste");
    await ctx.say("bob", "!unroll hade");
    ctx.failNext("roleRemove");
    await ctx.say("carol", "!unroll celeste");
  }),

  sc("role-button-interactions", async (ctx) => {
    await ctx.say("alice", "!roles");
    await ctx.click("alice", "role:R-CELESTE");
    await ctx.click("alice", "role:R-CELESTE", { label: "alice clicks Celeste again (remove)" });
    await ctx.click("alice", "role:R-GONE");
    await ctx.click("bob", "role:R-HADES", { label: "bob clicks Hades (has it, remove)" });
    await ctx.click("bob", "role:R-ELDEN");
  }),

  sc("role-button-cache-lag", async (ctx) => {
    ctx.member("alice").lag = true;
    await ctx.click("alice", "role:R-ELDEN", { label: "alice clicks Elden Ring with lagging member cache (add)" });
    ctx.member("alice").roles.flushLag();
    ctx.member("alice").lag = true;
    await ctx.click("alice", "role:R-ELDEN", { label: "alice clicks Elden Ring again with lag (remove)" });
    ctx.member("alice").roles.flushLag();
    ctx.member("alice").lag = false;
    await ctx.click("alice", "role:R-ELDEN", { label: "alice clicks Elden Ring without lag (add)" });
  }),

  sc("role-button-failures", async (ctx) => {
    ctx.failNext("editReply");
    await ctx.click("alice", "role:R-CELESTE", { label: "alice clicks Celeste, editReply fails" });
    ctx.failNext("roleRemove");
    await ctx.click("alice", "role:R-CELESTE", { label: "alice clicks Celeste, role removal fails" });
    ctx.failNext("roleAdd");
    await ctx.click("bob", "role:R-ELDEN", { label: "bob clicks Elden Ring, role add fails" });
    ctx.failNext("followUp");
    await ctx.click("bob", "role:R-ELDEN", { label: "bob clicks Elden Ring, followUp fails" });
  }),

  sc("role-select-interactions", async (ctx) => {
    ctx.writeFile("roles.yaml", ctx.manyRoles(30));
    await ctx.say("alice", "!roles");
    await ctx.select("alice", "role-select", ["RG-03"]);
    await ctx.select("alice", "role-select", ["RG-03"], { label: "alice selects RG-03 again (remove)" });
    await ctx.select("alice", "role-select", ["RG-99"], { label: "alice selects a role that does not exist" });
    ctx.writeFile("roles.yaml", { hades: { title: "Hades", roleId: "R-HADES", emoji: "⚔️", iconMode: "native" } });
    await ctx.select("bob", "role-select", ["R-HADES"], { label: "bob selects Hades with a small role list" });
  }),

  sc("unrelated-interactions-are-ignored", async (ctx) => {
    await ctx.click("alice", "other:thing");
    await ctx.click("alice", "role-select");
    await ctx.select("alice", "other-select", ["x"]);
    await ctx.select("alice", "role:R-HADES", ["R-HADES"], { label: "alice select menu with a role: customId" });
    await ctx.command("alice", "ping");
  })
];
