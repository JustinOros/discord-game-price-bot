const { sc } = require("./helpers");

const LINKS = { U1: "76561198000000011", U2: "76561198000000012", U3: "76561198000000013" };

module.exports = [
  sc("leaderboard-single-game-and-overview", async (ctx) => {
    await ctx.say("alice", "!leaderboard hades");
    await ctx.say("alice", "!leaderboard");
    await ctx.say("alice", "!leaderboard celeste");
    await ctx.say("alice", "!leaderboard nothing");
    await ctx.say("alice", "!help");
  }, { files: { "steamlinks.json": LINKS } }),

  sc("leaderboard-private-profile-hidden", async (ctx) => {
    await ctx.say("alice", "!leaderboard celeste");
    await ctx.say("alice", "!leaderboard");
  }, { files: { "steamlinks.json": { U1: "76561198000000011", U3: "76561198000000014", U2: "76561198000000012" } } }),

  sc("leaderboard-only-private-profiles", async (ctx) => {
    await ctx.say("alice", "!leaderboard celeste");
  }, { files: { "steamlinks.json": { U3: "76561198000000014" } } }),

  sc("leaderboard-nobody-linked", async (ctx) => {
    await ctx.say("alice", "!leaderboard");
    await ctx.say("alice", "!leaderboard hades");
  }, { files: { "steamlinks.json": {} } }),

  sc("leaderboard-no-roles", async (ctx) => {
    await ctx.say("alice", "!leaderboard");
  }, { files: { "roles.yaml": {} } }),

  sc("leaderboard-needs-steam-key", async (ctx) => {
    await ctx.say("alice", "!leaderboard");
  }, { env: { STEAM_API_KEY: null } }),

  sc("leaderboard-owned-games-failure", async (ctx) => {
    await ctx.say("alice", "!leaderboard hades");
  }, { files: { "steamlinks.json": { U1: "76561198000000007" } } })
];
