const { sc, bulkGames } = require("./helpers");

function manyOwned() {
  const owned = { U1: [], U2: [], U3: [] };
  for (let i = 1; i <= 12; i++) {
    const n = i < 10 ? "0" + i : String(i);
    const entry = { id: "itad-bulk-" + n, title: "Bulk Game " + n };
    owned.U1.push(entry);
    owned.U2.push(entry);
    if (i <= 4) owned.U3.push(entry);
  }
  return owned;
}

module.exports = [
  sc("info-variants", async (ctx) => {
    await ctx.say("alice", "!info hades");
    await ctx.say("alice", "!info celeste");
    await ctx.say("alice", "!info stardew");
    await ctx.say("alice", "!info terraria");
    await ctx.say("alice", "!info elden ring");
    await ctx.say("alice", "!info minecraft");
    await ctx.say("alice", "!info hollow knight");
    await ctx.say("alice", "!info ghost game");
    await ctx.say("alice", "!info free forever game");
    await ctx.say("alice", "!info steam broken game");
    await ctx.say("alice", "!info info fail game");
    await ctx.say("alice", "!info nonexistent game");
    await ctx.say("alice", "!info searchfail");
    ctx.fx.fail("/games/prices/v3");
    await ctx.say("alice", "!info hades", { label: "alice: !info hades with prices endpoint failing" });
  }),

  sc("info-without-steam-key", async (ctx) => {
    await ctx.say("alice", "!info hades");
    await ctx.say("alice", "!info celeste");
  }, { env: { STEAM_API_KEY: null } }),

  sc("own-new-and-roles", async (ctx) => {
    await ctx.say("alice", "!own Hades");
    await ctx.say("alice", "!own Hades");
    await ctx.say("alice", "!own Hollow Knight");
    await ctx.say("alice", "!own Stardew");
    await ctx.say("alice", "!own Terraria");
    await ctx.say("alice", "!own Minecraft");
    await ctx.say("bob", "!own Celeste");
    await ctx.say("alice", "!own Pattern Early Game");
    await ctx.say("alice", "!own nonexistent game");
    await ctx.say("alice", "!own searchfail");
    await ctx.say("erin", "!own Elden Ring", { member: null, label: "erin: !own Elden Ring without a cached member" });
  }, { files: { "owned.json": {} } }),

  sc("own-with-custom-emoji", async (ctx) => {
    await ctx.say("alice", "!own 🌴 Hollow Knight");
    await ctx.say("bob", "!own 🌴");
    await ctx.say("bob", "!own 🍓 Terraria");
  }, { files: { "owned.json": {} } }),

  sc("own-existing-role-repair-paths", async (ctx) => {
    const celeste = ctx.g1.roles.cache.get("R-CELESTE");
    celeste.name = "Celeste Old Name";
    await ctx.say("alice", "!own Celeste");
    ctx.note("celesteRoleNameAfter", celeste.name);
    celeste.name = "Wrong Again";
    ctx.failNext("roleEdit");
    await ctx.say("bob", "!own Celeste");
    ctx.note("celesteRoleNameAfterEditFailure", celeste.name);
    celeste.name = "Mismatch In Name Mode";
    await ctx.say("carol", "!own Celeste", { label: "carol: !own Celeste while role is in name mode" });
    celeste.name = "Mismatch Again";
    ctx.failNext("roleSetName");
    await ctx.say("erin", "!own Celeste", { label: "erin: !own Celeste, setName fails in name mode" });
    ctx.writeFile("roles.yaml", {
      hades: { title: "Hades", roleId: "R-HADES", emoji: "⚔️", iconMode: "native" },
      celeste: { title: "Celeste", roleId: "R-CELESTE", emoji: "🍓", iconMode: "native" }
    });
    celeste.name = "Native Mismatch";
    ctx.failNext("roleEdit");
    ctx.failNext("roleSetName");
    await ctx.say("frank", "!own Celeste", { label: "frank: !own Celeste, edit and setName both fail" });
  }, { files: { "owned.json": {} } }),

  sc("own-role-deleted-from-guild", async (ctx) => {
    ctx.writeFile("roles.yaml", { terraria: { title: "Terraria", roleId: "R-GONE", emoji: "🌳", iconMode: "native" } });
    await ctx.say("alice", "!own Terraria");
  }, { files: { "owned.json": {} } }),

  sc("own-role-creation-fallbacks", async (ctx) => {
    ctx.failNext("roleCreateNative", Infinity);
    await ctx.say("alice", "!own Hollow Knight");
    ctx.clearFailures();
    ctx.failNext("roleCreate", Infinity);
    await ctx.say("alice", "!own Stardew");
    ctx.clearFailures();
    ctx.failNext("roleAdd");
    await ctx.say("alice", "!own Minecraft");
  }, { files: { "owned.json": {} } }),

  sc("own-with-ai-disabled", async (ctx) => {
    await ctx.say("alice", "!own Hollow Knight");
    await ctx.say("alice", "!own Stardew");
  }, { env: { AI_ENABLED: "false" }, files: { "owned.json": {} } }),

  sc("own-with-ollama-down", async (ctx) => {
    ctx.fx.networkError("/api/chat", "connect ECONNREFUSED 127.0.0.1:11434");
    await ctx.say("alice", "!own Stardew");
    ctx.fx.clearOverrides();
    ctx.fx.fail("/api/chat", 503);
    await ctx.say("alice", "!own Minecraft");
  }, { files: { "owned.json": {} } }),

  sc("unown-variants", async (ctx) => {
    await ctx.say("alice", "!unown Hades");
    await ctx.say("alice", "!unown Hades");
    await ctx.say("alice", "!unown Elden Ring");
    await ctx.say("alice", "!unown nonexistent game");
    await ctx.say("alice", "!unown searchfail");
    await ctx.say("carol", "!unown Celeste");
  }),

  sc("who-variants", async (ctx) => {
    await ctx.say("alice", "!who hades");
    await ctx.say("alice", "!who elden ring");
    await ctx.say("alice", "!who terraria");
    await ctx.say("alice", "!who minecraft");
    await ctx.say("alice", "!who ghost game");
    await ctx.say("alice", "!who info fail game");
    await ctx.say("alice", "!who nonexistent game");
    await ctx.say("alice", "!who searchfail");
  }),

  sc("who-without-steam-key", async (ctx) => {
    await ctx.say("alice", "!who hades");
    await ctx.say("alice", "!who terraria");
  }, { env: { STEAM_API_KEY: null } }),

  sc("popular-default", async (ctx) => {
    await ctx.say("alice", "!popular");
  }),

  sc("popular-empty", async (ctx) => {
    await ctx.say("alice", "!popular");
  }, { files: { "owned.json": {}, "steamlinks.json": {} } }),

  sc("popular-more-than-ten", async (ctx) => {
    await ctx.say("alice", "!popular");
    await ctx.say("alice", "!POPULAR");
  }, { files: { "owned.json": manyOwned(), "steamlinks.json": {}, "games.json": bulkGames(12) } }),

  sc("popular-info-failures-and-steam-failure", async (ctx) => {
    ctx.writeFile("owned.json", {
      U1: [{ id: "itad-unknown-x", title: "Unknown X" }, { id: "itad-infofail", title: "Info Fail Game" }],
      U2: [{ id: "itad-unknown-x", title: "Unknown X" }, { id: "itad-infofail", title: "Info Fail Game" }]
    });
    await ctx.say("alice", "!popular");
  }),

  sc("popular-without-steam-key", async (ctx) => {
    await ctx.say("alice", "!popular");
  }, { env: { STEAM_API_KEY: null } }),

  sc("steam-profile-linking", async (ctx) => {
    await ctx.say("alice", "!my-steam-profile justinvanity");
    await ctx.say("carol", "!my-steam-profile https://steamcommunity.com/id/profileguy/");
    await ctx.say("bob", "!my-steam-profile https://steamcommunity.com/profiles/76561198123456789");
    await ctx.say("erin", "!my-steam-profile 76561198123456780");
    await ctx.say("frank", "!my-steam-profile https://STEAMCOMMUNITY.com/id/justinvanity?x=1", { label: "frank: !my-steam-profile uppercase host with query" });
    await ctx.say("alice", "!my-steam-profile nosuchuser");
    await ctx.say("alice", "!my-steam-profile vanityerror");
    await ctx.say("alice", "!my-steam-profile profileguy");
  }, { files: { "steamlinks.json": {} } }),

  sc("steam-profile-without-key", async (ctx) => {
    await ctx.say("alice", "!my-steam-profile justinvanity");
    await ctx.say("alice", "!my-steam-profile");
  }, { env: { STEAM_API_KEY: null } })
];
