const { sc } = require("./helpers");

const SETUP = (ctx) => ctx.setupBooks(["alice", "bob", "carol"]);
const ENV = { "plugins/audiobookshelf/.env": "ABS_URL=https://abs.test/\nABS_TOKEN=tok-secret\n" };

function septemberData(ctx) {
  ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "s1", title: "Septembook One", author: "Ann Author", rating: 5, readAt: "Tue, 15 Sep 2026 00:00:00 -0700", pages: 300 });
  ctx.fx.goodreads.feeds["1002"].read.unshift({ id: "s2", title: "Septembook Two", author: "Bo Writer", rating: 4, readAt: "Wed, 16 Sep 2026 00:00:00 -0700", pages: 200 });
  ctx.fx.goodreads.feeds["1002"].read.unshift({ id: "s1", title: "Septembook One", author: "Ann Author", rating: 3, readAt: "Thu, 17 Sep 2026 00:00:00 -0700", pages: 300 });
  ctx.fx.abs.progress["u-1"].push({ libraryItemId: "li-2", progress: 1, isFinished: true, finishedAt: Date.UTC(2026, 8, 15, 12), lastUpdate: 9 });
  ctx.fx.abs.listeningDaysAgo["u-1"] = { 20: 3600, 21: 3600, 22: 7200, 23: 3600, 40: 3600 };
  ctx.fx.abs.listeningDaysAgo["u-2"] = { 25: 1800 };
}

async function linkAll(ctx) {
  await ctx.say("alice", "!ab link alicia");
  await ctx.say("alice", "!gr link 1001");
  await ctx.say("bob", "!ab link bobby");
  await ctx.say("bob", "!gr link 1002");
}

module.exports = [
  sc("books-goal-set-view-and-clear", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!books goal");
    await ctx.say("alice", "!books goal 30", { label: "alice: goal before linking" });
    await linkAll(ctx);
    await ctx.say("alice", "!books goal 30");
    await ctx.say("alice", "!books goal");
    await ctx.say("bob", "!books goal " + ctx.mention("alice"));
    await ctx.say("bob", "!books goal " + ctx.mention("carol"));
    await ctx.say("bob", "!books goal 1");
    await ctx.say("bob", "!books goal 2");
    await ctx.say("alice", "!books goal abc");
    await ctx.say("alice", "!books goal 0");
    await ctx.say("alice", "!books goal 5000");
    await ctx.say("alice", "!books leaderboard 2026");
    await ctx.say("alice", "!books leaderboard 2025");
    await ctx.say("alice", "!books goal clear");
    await ctx.say("alice", "!books goal clear");
    await ctx.say("alice", "!books goal");
  }, { files: ENV }),

  sc("books-goal-for-old-year-is-ignored", async (ctx) => {
    SETUP(ctx);
    await linkAll(ctx);
    await ctx.say("alice", "!books goal");
    await ctx.say("alice", "!books leaderboard 2026");
  }, { files: Object.assign({ "books.json": { goals: { U1: { year: 2025, target: 10 } }, lastRecap: "" } }, ENV) }),

  sc("books-recommend", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!books recommend", { label: "alice: not linked" });
    ctx.fx.goodreads.feeds["1002"].read.unshift({ id: "r1", title: "Hyperion", author: "Dan Simmons", rating: 5, readAt: "Mon, 02 Jun 2025 00:00:00 -0700", pages: 500 });
    ctx.fx.goodreads.feeds["1002"].read.unshift({ id: "r2", title: "Meh Book", author: "M", rating: 2, readAt: "Mon, 02 Jun 2025 00:00:00 -0700", pages: 100 });
    ctx.fx.goodreads.feeds["1003"] = { read: [
      { id: "r1", title: "Hyperion", author: "Dan Simmons", rating: 4, readAt: "Mon, 02 Jun 2025 00:00:00 -0700", pages: 500 },
      { id: "r3", title: "Solaris", author: "Stanislaw Lem", rating: 5, readAt: "Mon, 02 Jun 2025 00:00:00 -0700", pages: 200 },
      { id: "11", title: "Dune", author: "Frank Herbert", rating: 5, readAt: "Mon, 02 Jun 2025 00:00:00 -0700", pages: 612 }
    ], "to-read": [], "currently-reading": [] };
    await ctx.say("alice", "!gr link 1001");
    await ctx.say("bob", "!gr link 1002");
    await ctx.say("carol", "!gr link 1003");
    await ctx.say("alice", "!books recommend");
    await ctx.say("bob", "!books recommend");
    await ctx.say("erin", "!books recommend");
  }),

  sc("books-recommend-without-ratings", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!ab link alicia");
    await ctx.say("bob", "!ab link bobby");
    await ctx.say("alice", "!books recommend");
  }, { files: ENV }),

  sc("books-recap-command", async (ctx) => {
    SETUP(ctx);
    septemberData(ctx);
    await linkAll(ctx);
    await ctx.say("alice", "!books recap");
    await ctx.say("alice", "!books recap this");
    await ctx.say("erin", "!books recap");
    await ctx.say("alice", "!books help");
  }, { files: ENV }),

  sc("books-recap-nothing-to-report", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!gr link 1003");
    await ctx.say("alice", "!books recap");
  }),

  sc("books-monthly-recap-posts-once", async (ctx) => {
    SETUP(ctx);
    septemberData(ctx);
    await linkAll(ctx);
    await ctx.startReady();
    await ctx.cron("0 * * * *", "first hourly tick posts the recap");
    await ctx.cron("0 * * * *", "second tick does nothing");
  }, { files: Object.assign({ "books.json": { goals: {}, lastRecap: "2026-08" } }, ENV) }),

  sc("books-monthly-recap-first-run-records-without-posting", async (ctx) => {
    SETUP(ctx);
    septemberData(ctx);
    await linkAll(ctx);
    await ctx.startReady();
    await ctx.cron("0 * * * *", "first run only records the month");
    await ctx.cron("0 * * * *", "second tick does nothing");
  }, { files: ENV }),

  sc("books-monthly-recap-can-be-turned-off", async (ctx) => {
    SETUP(ctx);
    septemberData(ctx);
    await linkAll(ctx);
    await ctx.startReady();
    await ctx.cron("0 * * * *");
  }, { files: Object.assign({ "books.yaml": "monthlyRecap: false\n", "books.json": { goals: {}, lastRecap: "2026-08" } }, ENV) }),

  sc("books-monthly-recap-waits-for-the-hour", async (ctx) => {
    SETUP(ctx);
    septemberData(ctx);
    await linkAll(ctx);
    await ctx.startReady();
    await ctx.cron("0 * * * *");
  }, { files: Object.assign({ "books.yaml": "monthlyRecap: true\nrecapHour: 23\n", "books.json": { goals: {}, lastRecap: "2026-08" } }, ENV) })
];
