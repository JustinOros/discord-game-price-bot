const { sc } = require("./helpers");

const SETUP = (ctx) => ctx.setupBooks(["alice", "bob", "carol"]);
const ENV = { "plugins/hardcover/.env": "HARDCOVER_TOKEN=Bearer hc-token-secret\n" };
const WITH_ENV = { files: ENV };

function row(id, title, extra) {
  return Object.assign({
    id: 9000 + id,
    rating: 4,
    last_read_date: "2026-10-10",
    date_added: "2026-01-02",
    book: {
      id: 100 + id,
      title: title,
      slug: "book-" + id,
      pages: 300 + id,
      cached_image: { url: "https://assets.hardcover.app/book-" + id + ".jpg" },
      cached_contributors: [{ author: { name: "Writer " + id }, contribution: null }, { author: { name: "Narrator " + id }, contribution: "Narrator" }]
    },
    user_book_reads: [{ finished_at: "2026-10-1" + (id % 9) }]
  }, extra || {});
}

function seed(ctx) {
  ctx.fx.hardcover.users.alicehc = { id: 501 };
  ctx.fx.hardcover.users.bobhc = { id: 502 };
  ctx.fx.hardcover.users.hidden = { id: 503 };
  ctx.fx.hardcover.errorFor[503] = true;
  ctx.fx.hardcover.books[501] = {
    3: [row(1, "Hardcover Read One"), row(2, "Hardcover Read Two", { rating: 3.5, user_book_reads: [] }), row(3, "Hardcover Read Three", { rating: null, last_read_date: null, user_book_reads: [] })],
    2: [row(4, "Hardcover Reading Now")],
    1: [row(5, "Hardcover Wishlist")]
  };
  ctx.fx.hardcover.books[502] = { 3: [row(6, "Bob Hardcover Book")] };
}

module.exports = [
  sc("hardcover-role-gate-help-and-not-configured", async (ctx) => {
    SETUP(ctx);
    await ctx.say("erin", "!hc link alicehc");
    await ctx.say("alice", "!hc");
    await ctx.say("alice", "!hardcover help");
    await ctx.say("alice", "!hc link alicehc", { label: "alice: no token yet" });
    await ctx.say("alice", "!help");
  }),

  sc("hardcover-link-views-and-unlink", async (ctx) => {
    SETUP(ctx);
    seed(ctx);
    await ctx.say("alice", "!hc link");
    await ctx.say("alice", "!hc link nobodyhere");
    await ctx.say("alice", "!hc link hidden");
    await ctx.say("alice", "!hc link https://hardcover.app/@alicehc");
    await ctx.say("bob", "!hc link alicehc", { label: "bob: already linked to alice" });
    await ctx.say("bob", "!hc link bobhc");
    await ctx.say("alice", "!hc currently");
    await ctx.say("alice", "!hc shelf");
    await ctx.say("alice", "!hc shelf want-to-read");
    await ctx.say("alice", "!hc shelf nonsense");
    await ctx.say("alice", "!hc shelf " + ctx.mention("bob"));
    await ctx.say("alice", "!hc currently " + ctx.mention("carol"));
    await ctx.say("bob", "!hc unlink");
    await ctx.say("bob", "!hc unlink");
  }, WITH_ENV),

  sc("hardcover-books-umbrella-and-finished-announcements", async (ctx) => {
    SETUP(ctx);
    seed(ctx);
    await ctx.say("alice", "!hc link alicehc");
    await ctx.say("alice", "!books currently");
    await ctx.say("alice", "!books goal 10");
    await ctx.say("alice", "!books help");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.hardcover.books[501][3].unshift(row(7, "Hardcover Fresh Finish", { rating: 5 }));
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("hardcover-old-finish-dates-are-not-announced", async (ctx) => {
    SETUP(ctx);
    seed(ctx);
    await ctx.say("alice", "!hc link alicehc");
    await ctx.startReady();
    await ctx.cron("*/30 * * * *");
    ctx.fx.hardcover.books[501][3].unshift(row(8, "Synced Old Book", { last_read_date: "2020-03-04", user_book_reads: [{ finished_at: "2020-03-04" }] }));
    await ctx.cron("*/30 * * * *");
    await ctx.cron("*/30 * * * *");
  }, WITH_ENV),

  sc("hardcover-bad-token-and-network-down", async (ctx) => {
    SETUP(ctx);
    seed(ctx);
    await ctx.say("alice", "!hc link alicehc");
    ctx.fx.networkError("api.hardcover.app", "fetch failed");
    await ctx.say("bob", "!hc link bobhc");
  }, { files: { "plugins/hardcover/.env": "HARDCOVER_TOKEN=wrong\n" } })
];
