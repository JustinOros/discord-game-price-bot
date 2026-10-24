const { sc } = require("./helpers");

const SETUP = (ctx) => ctx.setupBooks(["alice", "bob", "carol"]);

module.exports = [
  sc("goodreads-role-gate-and-help", async (ctx) => {
    SETUP(ctx);
    await ctx.say("erin", "!goodreads link 1001");
    await ctx.say("erin", "!gr");
    await ctx.say("erin", "!help", { label: "erin: no books role, help hides the books lines" });
    await ctx.say("alice", "!goodreads");
    await ctx.say("alice", "!gr nonsense");
    await ctx.say("alice", "!goodreads help");
    await ctx.say("alice", "!gr HELP", { label: "alice: !gr HELP" });
    await ctx.say("erin", "!goodreads help", { label: "erin: no books role cannot see goodreads help" });
    await ctx.say("alice", "!GOODREADS", { label: "alice: upper case command" });
    await ctx.say("alice", "!help", { label: "alice: books role, help shows the books lines" });
    await ctx.dm("alice", "!goodreads link 1001");
    await ctx.say("alice", "!grab something", { label: "alice: !grab is not the alias" });
  }),

  sc("goodreads-role-name-matching", async (ctx) => {
    ctx.world.g1.addRole({ id: "ROLE-FANCY", name: "📚 Books", unicodeEmoji: null });
    ctx.world.g1.addRole({ id: "ROLE-AUDIO", name: "Audiobooks", unicodeEmoji: null });
    ctx.world.g1.addChannel({ id: "CH-books", name: "books" });
    ctx.world.g1.members.cache.get(ctx.world.users.alice.id).roles.apply("add", "ROLE-FANCY");
    ctx.world.g1.members.cache.get(ctx.world.users.bob.id).roles.apply("add", "ROLE-AUDIO");
    await ctx.say("alice", "!goodreads", { label: "alice: emoji in the role name still matches" });
    await ctx.say("bob", "!goodreads", { label: "bob: a different role containing books does not match" });
  }),

  sc("goodreads-role-by-id", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads");
    await ctx.say("erin", "!goodreads");
  }, { files: { "plugins/goodreads/config.yaml": { roleId: "ROLE-BOOKS", announceChannel: "books" } } }),

  sc("goodreads-link-variants", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("bob", "!gr link https://www.goodreads.com/user/show/1002-bobby", { label: "bob: profile url" });
    await ctx.say("carol", "!goodreads link abc");
    await ctx.say("carol", "!goodreads link");
    await ctx.say("carol", "!goodreads link 9404", { label: "carol: private or unknown profile" });
    await ctx.say("carol", "!goodreads link 9500", { label: "carol: feed is not rss" });
    await ctx.say("carol", "!goodreads link 9600", { label: "carol: network failure" });
    await ctx.say("carol", "!goodreads link 7777", { label: "carol: feed needs a key" });
    await ctx.say("carol", "!goodreads link https://www.goodreads.com/review/list_rss/7777?key=SECRETKEY&shelf=read", { label: "carol: rss url with key" });
    await ctx.say("alice", "!goodreads link 1003", { label: "alice: relinking replaces the old link" });
  }),

  sc("goodreads-links-file-corrupt", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads currently");
    await ctx.say("alice", "!goodreads link 1001");
  }, { files: { "goodreads.json": "{not json" } }),

  sc("goodreads-unlink", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads unlink");
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("alice", "!goodreads unlink 1002", { label: "alice: wrong id" });
    await ctx.say("alice", "!goodreads unlink abc", { label: "alice: not an id" });
    await ctx.say("alice", "!goodreads unlink 1001", { label: "alice: right id" });
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("alice", "!goodreads unlink", { label: "alice: no id needed" });
  }),

  sc("goodreads-currently-and-shelf", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("bob", "!goodreads link 1002");
    await ctx.say("carol", "!goodreads link 1003");
    await ctx.say("alice", "!goodreads currently");
    await ctx.say("alice", "!goodreads currently " + ctx.mention("bob"), { label: "alice: bob is not reading anything" });
    await ctx.say("alice", "!goodreads currently " + ctx.mention("erin"), { label: "alice: erin has not linked" });
    await ctx.say("alice", "!goodreads shelf");
    await ctx.say("alice", "!goodreads shelf read");
    await ctx.say("alice", "!goodreads shelf to-read");
    await ctx.say("alice", "!goodreads shelf currently-reading");
    await ctx.say("alice", "!goodreads shelf " + ctx.mention("bob") + " to-read", { label: "alice: bob's to-read shelf" });
    await ctx.say("alice", "!goodreads shelf bogus");
    await ctx.say("alice", "!goodreads shelf " + ctx.mention("carol"), { label: "alice: carol's read shelf is empty" });
    await ctx.say("alice", "!goodreads shelf " + ctx.mention("erin"), { label: "alice: erin has not linked" });
  }),

  sc("goodreads-feed-failures-in-commands", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    delete ctx.fx.goodreads.feeds["1001"];
    await ctx.advance(6 * 60 * 1000);
    await ctx.say("alice", "!goodreads currently");
    await ctx.say("alice", "!goodreads shelf");
    await ctx.say("alice", "!goodreads who dune");
    await ctx.say("alice", "!goodreads overlap");
    await ctx.say("alice", "!goodreads compare " + ctx.mention("bob"));
  }),

  sc("goodreads-who-overlap-compare", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("bob", "!goodreads link 1002");
    await ctx.say("carol", "!goodreads link 1003");
    await ctx.say("alice", "!goodreads who dune");
    await ctx.say("alice", "!goodreads who hail mary");
    await ctx.say("alice", "!goodreads who something nobody read");
    await ctx.say("alice", "!goodreads who");
    await ctx.say("alice", "!goodreads overlap");
    await ctx.say("alice", "!goodreads compare " + ctx.mention("bob"));
    await ctx.say("carol", "!goodreads compare " + ctx.mention("alice") + " " + ctx.mention("bob"), { label: "carol: compare two other members" });
    await ctx.say("alice", "!goodreads compare " + ctx.mention("carol"), { label: "alice: nothing in common" });
    await ctx.say("alice", "!goodreads compare " + ctx.mention("alice"), { label: "alice: compare with self" });
    await ctx.say("alice", "!goodreads compare " + ctx.mention("erin"), { label: "alice: erin has not linked" });
    await ctx.say("alice", "!goodreads compare");
  }),

  sc("goodreads-leaderboard", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("bob", "!goodreads link 1002");
    await ctx.say("carol", "!goodreads link 1003");
    await ctx.say("alice", "!goodreads leaderboard", { label: "alice: nobody finished a book this year" });
    await ctx.say("alice", "!goodreads leaderboard 2025");
    await ctx.say("alice", "!goodreads leaderboard 2024", { label: "alice: single entry" });
    await ctx.say("alice", "!goodreads leaderboard 1999");
    ctx.fx.goodreads.feeds["1003"].read.push({ id: "91", title: "Tie Book", author: "T", rating: 4, readAt: "Wed, 03 Sep 2025 00:00:00 -0700", pages: 400 });
    ctx.fx.goodreads.feeds["1002"].read.push({ id: "92", title: "Late Book", author: "L", rating: 4, readAt: "Wed, 31 Dec 2025 23:00:00 -0700", pages: 0 });
    await ctx.advance(6 * 60 * 1000);
    await ctx.say("alice", "!goodreads leaderboard 2025", { label: "alice: ties are broken by pages" });
    await ctx.say("alice", "!goodreads leaderboard abc");
    await ctx.say("alice", "!goodreads leaderboard 2099");
    await ctx.say("alice", "!goodreads leaderboard 20255");
  }),

  sc("goodreads-leaderboard-skips-failed-feeds", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("bob", "!goodreads link 1002");
    delete ctx.fx.goodreads.feeds["1002"];
    await ctx.advance(6 * 60 * 1000);
    await ctx.say("alice", "!goodreads leaderboard 2025", { label: "alice: bob's feed fails and is skipped" });
  }),

  sc("goodreads-overlap-with-nothing-shared", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("alice", "!goodreads overlap");
  }),

  sc("goodreads-announces-new-finished-books", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.cron("*/30 * * * *", "poll with nothing new");
    ctx.fx.goodreads.feeds["1001"].read.unshift({
      id: "41", title: "Hyperion", author: "Dan Simmons", rating: 5, readAt: "Sun, 05 Oct 2026 00:00:00 -0700", pages: 482,
      review: "Loved it, the ending |is| unreal."
    });
    await ctx.cron("*/30 * * * *", "poll with one new book");
    await ctx.cron("*/30 * * * *", "poll again, nothing repeats");
    for (let i = 1; i <= 5; i++) {
      ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "5" + i, title: "Batch " + i, author: "Author " + i, rating: i, readAt: "", pages: 0 });
    }
    await ctx.cron("*/30 * * * *", "poll with five new books, only three are announced");
    await ctx.cron("*/30 * * * *", "poll again, the other two were skipped for good");
  }),

  sc("goodreads-announce-edge-cases", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.say("alice", "!goodreads link 1001");
    await ctx.say("bob", "!goodreads link 1002");
    ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "61", title: "No Pages No Review", author: "", rating: 0 });
    ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "", title: "Book Without An Id", author: "Nobody", rating: 3 });
    ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "62", title: "Long Review", author: "Wordy", rating: 4, review: "x".repeat(400) });
    delete ctx.fx.goodreads.feeds["1002"];
    await ctx.cron("*/30 * * * *", "poll with edge cases and one broken feed");
  }),

  sc("goodreads-announce-without-channel-or-member", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.say("alice", "!goodreads link 1001");
    ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "71", title: "Unannounced", author: "Quiet", rating: 4 });
    await ctx.cron("*/30 * * * *", "poll with the announce channel missing");
  }, { files: { "plugins/goodreads/config.yaml": { roleName: "books", announceChannel: "no-such-channel" } } }),

  sc("goodreads-announce-send-failure", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.say("alice", "!goodreads link 1001");
    ctx.fx.goodreads.feeds["1001"].read.unshift({ id: "81", title: "Cannot Post", author: "Sad", rating: 2 });
    ctx.world.failNext("send");
    await ctx.cron("*/30 * * * *", "poll where the channel send fails");
  }),

  sc("goodreads-poll-interval-setting", async (ctx) => {
    await ctx.startReady();
    await ctx.cron("*/10 * * * *", "ten minute poll registered");
  }, { files: { "plugins/goodreads/config.yaml": { roleName: "books", announceChannel: "books", pollMinutes: 10 } } }),

  sc("goodreads-poll-interval-defaults", async (ctx) => {
    await ctx.startReady();
    await ctx.cron("*/30 * * * *", "default poll registered");
  }, { files: { "plugins/goodreads/config.yaml": "pollMinutes: 0\n" } }),

  sc("goodreads-config-missing", async (ctx) => {
    SETUP(ctx);
    await ctx.startReady();
    await ctx.say("alice", "!goodreads");
    await ctx.cron("*/30 * * * *", "default poll registered");
  }, { files: { "plugins/goodreads/config.yaml": null } }),

  sc("goodreads-disabled", async (ctx) => {
    SETUP(ctx);
    await ctx.say("alice", "!goodreads");
  }, { env: { DISABLED_PLUGINS: "goodreads" } }),

  sc("goodreads-reads-past-the-first-hundred-books", async (ctx) => {
    SETUP(ctx);
    const read = [];
    for (let i = 1; i <= 230; i++) {
      const year = i <= 100 ? 2026 : (i <= 160 ? 2025 : 2024);
      read.push({ id: "big-" + i, title: i === 150 ? "" : "Big Book " + i, author: "B", rating: 4, readAt: "Mon, 02 Jun " + year + " 00:00:00 -0700", pages: 100 });
    }
    ctx.fx.goodreads.feeds["1004"] = { read: read, "to-read": [], "currently-reading": [] };
    await ctx.say("alice", "!goodreads link 1004");
    await ctx.say("alice", "!goodreads leaderboard 2026");
    await ctx.say("alice", "!goodreads leaderboard 2025");
    await ctx.say("alice", "!goodreads leaderboard 2024");
    await ctx.say("alice", "!books leaderboard 2024");
  })
];
