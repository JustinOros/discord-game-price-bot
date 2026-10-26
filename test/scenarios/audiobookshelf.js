const { sc } = require("./helpers");

const SETUP = (ctx) => ctx.setupBooks(["alice", "bob", "carol"]);
const ENV = { "plugins/audiobookshelf/.env": "ABS_URL=https://abs.test/\nABS_TOKEN=tok-secret\n" };
const WITH_ENV = { files: ENV };

module.exports = [
  sc("abs-role-gate-help-and-not-configured", async (ctx) => {
    SETUP(ctx);
    await ctx.say("erin", "!ab help");
    await ctx.say("alice", "!ab");
    await ctx.say("alice", "!audiobookshelf help");
    await ctx.say("alice", "!ab link alicia", { label: "alice: no .env yet" });
    await ctx.say("alice", "!help");
  }),

  sc("abs-link-and-unlink", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link");
    await ctx.say("alice", "!ab link nobody");
    await ctx.say("alice", "!ab link ALICIA");
    await ctx.say("bob", "!ab link alicia", { label: "bob: already linked to alice" });
    await ctx.say("bob", "!ab link bobby");
    await ctx.say("bob", "!ab unlink wrong");
    await ctx.say("bob", "!ab unlink bobby");
    await ctx.say("bob", "!ab unlink");
  }, WITH_ENV),

  sc("abs-server-down-and-bad-token", async (ctx) => {
    SETUP(ctx);
    ctx.fx.networkError("abs.test/api/users", "fetch failed");
    await ctx.say("alice", "!ab link alicia");
    ctx.fx.clearOverrides();
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("alice", "!ab nowplaying");
  }, { files: { "plugins/audiobookshelf/.env": "ABS_URL=https://abs.test\nABS_TOKEN=wrong\n" } }),

  sc("abs-views", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("bob", "!ab link bobby");
    await ctx.say("alice", "!ab nowplaying");
    await ctx.say("alice", "!ab nowplaying " + ctx.mention("bob"));
    await ctx.say("alice", "!ab nowplaying " + ctx.mention("carol"));
    await ctx.say("alice", "!ab finished");
    await ctx.say("alice", "!ab finished " + ctx.mention("bob"));
    await ctx.say("alice", "!ab stats");
    await ctx.say("alice", "!ab stats " + ctx.mention("bob"));
    await ctx.say("alice", "!ab who dune");
    await ctx.say("alice", "!ab who piranesi");
    await ctx.say("alice", "!ab who nothing");
    await ctx.say("alice", "!ab who");
    await ctx.say("alice", "!ab search hail");
    await ctx.say("alice", "!ab search zzz");
    await ctx.say("alice", "!ab search");
    await ctx.say("alice", "!ab new");
    await ctx.say("alice", "!ab compare " + ctx.mention("bob"));
    await ctx.say("alice", "!ab compare");
    await ctx.say("alice", "!ab compare " + ctx.mention("alice"));
    await ctx.say("alice", "!ab compare " + ctx.mention("carol"));
  }, WITH_ENV),

  sc("abs-leaderboard", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab leaderboard");
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("bob", "!ab link bobby");
    await ctx.say("alice", "!ab leaderboard");
    await ctx.say("alice", "!ab leaderboard month");
    await ctx.say("alice", "!ab leaderboard year");
    await ctx.say("alice", "!ab leaderboard decade");
  }, WITH_ENV),

  sc("abs-announcements", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.abs.progress["u-1"].push({ libraryItemId: "li-2", progress: 1, currentTime: 7200, duration: 7200, isFinished: true, finishedAt: Date.UTC(2026, 9, 5), lastUpdate: 9 });
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
    ctx.fx.abs.items["li-9"] = { id: "li-9", addedAt: 1800000000000, media: { duration: 3600, metadata: { title: "Fresh Arrival", authorName: "New Author" } } };
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("abs-announcements-off-and-server-down", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.abs.progress["u-1"].push({ libraryItemId: "li-2", progress: 1, isFinished: true, finishedAt: Date.UTC(2026, 9, 5), lastUpdate: 9 });
    ctx.fx.abs.items["li-9"] = { id: "li-9", addedAt: 1800000000000, media: { duration: 3600, metadata: { title: "Fresh Arrival", authorName: "New Author" } } };
    ctx.fx.networkError("abs.test", "fetch failed", { times: 3 });
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
  }, { files: Object.assign({ "plugins/audiobookshelf/config.yaml": { roleName: "books", announceChannel: "books", announceNewBooks: false } }, ENV) }),

  sc("books-umbrella-both-sources", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("alice", "!gr link 1001");
    await ctx.say("bob", "!ab link bobby");
    await ctx.say("bob", "!gr link 1002");
    await ctx.say("alice", "!books");
    await ctx.say("erin", "!books help");
    await ctx.say("alice", "!books currently");
    await ctx.say("alice", "!books currently " + ctx.mention("bob"));
    await ctx.say("alice", "!books currently " + ctx.mention("carol"));
    await ctx.say("alice", "!books who dune");
    await ctx.say("alice", "!books who nothing");
    await ctx.say("alice", "!books who");
    await ctx.say("alice", "!books leaderboard");
    await ctx.say("alice", "!books leaderboard 2025");
    await ctx.say("alice", "!books leaderboard abc");
    await ctx.say("alice", "!books compare " + ctx.mention("bob"));
    await ctx.say("alice", "!books compare");
    await ctx.say("alice", "!books compare " + ctx.mention("carol"));
    await ctx.say("alice", "!books link");
    await ctx.say("alice", "!books unlink");
    await ctx.say("alice", "!help");
  }, WITH_ENV),

  sc("books-umbrella-goodreads-only", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!gr link 1001");
    await ctx.say("bob", "!gr link 1002");
    await ctx.say("alice", "!books");
    await ctx.say("alice", "!books currently");
    await ctx.say("alice", "!books who dune");
    await ctx.say("alice", "!books leaderboard 2025");
    await ctx.say("alice", "!books compare " + ctx.mention("bob"));
    await ctx.say("alice", "!books link");
  }, { env: { DISABLED_PLUGINS: "audiobookshelf" } }),

  sc("books-umbrella-absent-without-book-plugins", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!books");
    await ctx.say("alice", "!help");
  }, { env: { DISABLED_PLUGINS: "goodreads,audiobookshelf" } }),

  sc("books-umbrella-audiobookshelf-only", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("alice", "!books currently");
    await ctx.say("alice", "!books link");
  }, { env: { DISABLED_PLUGINS: "goodreads" }, files: ENV }),

  sc("books-same-book-finished-on-both-services-posts-once", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("alice", "!gr link 1001");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "95", title: "Piranesi", author: "Susanna Clarke", rating: 5, readAt: "Sun, 04 Oct 2026 00:00:00 -0700", pages: 272 });
    ctx.fx.abs.progress["u-1"].push({ libraryItemId: "li-3", progress: 1, currentTime: 18000, duration: 18000, isFinished: true, finishedAt: Date.UTC(2026, 9, 4), lastUpdate: 9 });
    ctx.fx.abs.progress["u-1"] = ctx.fx.abs.progress["u-1"].filter((entry, index, list) => entry.libraryItemId !== "li-3" || entry.isFinished);
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("abs-bulk-new-books-show-three-and-a-count", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    for (let i = 1; i <= 6; i++) {
      ctx.fx.abs.items["bulk-" + i] = { id: "bulk-" + i, addedAt: 1800000000000 + i * 1000, media: { duration: 3600 * i, metadata: { title: "Bulk Book " + i, authorName: "Bulk Author" } } };
    }
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("abs-bulk-new-books-one-over-then-many-pages", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    for (let i = 1; i <= 4; i++) {
      ctx.fx.abs.items["bulk-" + i] = { id: "bulk-" + i, addedAt: 1800000000000 + i * 1000, media: { duration: 3600, metadata: { title: "Over Book " + i, authorName: "A" } } };
    }
    await ctx.cron("*/30 * * * *");
    for (let i = 1; i <= 230; i++) {
      ctx.fx.abs.items["many-" + i] = { id: "many-" + i, addedAt: 1900000000000 + i * 1000, media: { duration: 60, metadata: { title: "Many " + i, authorName: "M" } } };
    }
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("abs-finished-card-shows-goodreads-rating", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("alice", "!gr link 1001");
    await ctx.say("bob", "!ab link bobby");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.abs.progress["u-1"].push({ libraryItemId: "li-2", progress: 1, isFinished: true, finishedAt: Date.UTC(2026, 9, 5), lastUpdate: 9 });
    ctx.fx.abs.progress["u-2"].push({ libraryItemId: "li-3", progress: 1, isFinished: true, finishedAt: Date.UTC(2026, 9, 5), lastUpdate: 9 });
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("abs-finished-card-with-expanded-item-shape", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.abs.items["li-7"] = { id: "li-7", addedAt: 1700000300000, media: { metadata: { title: "Red Rising", authors: [{ id: "a1", name: "Pierce Brown" }], narrators: ["Tim Gerard Reynolds"], series: [{ id: "s1", name: "Red Rising Saga" }] }, audioFiles: [{ duration: 3600 }, { duration: 7200 }] } };
    ctx.fx.abs.progress["u-1"].push({ libraryItemId: "li-7", progress: 1, isFinished: true, finishedAt: Date.UTC(2026, 9, 5), lastUpdate: 9 });
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV)
];
