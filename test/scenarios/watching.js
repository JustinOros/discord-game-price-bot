const { sc, NO_GAMES, bulkGames } = require("./helpers");
const { deal } = require("../lib/gamedata");

module.exports = [
  sc("watch-new-sale-game", async (ctx) => {
    await ctx.say("alice", "!watch hades");
  }, { files: NO_GAMES }),

  sc("watch-variants", async (ctx) => {
    await ctx.say("alice", "!watch celeste");
    await ctx.say("bob", "!watch Minecraft");
    await ctx.say("carol", "!watch Elden Ring");
    await ctx.say("alice", "!watch unrelated query");
    await ctx.say("alice", "!watch ghost game");
    await ctx.say("alice", "!watch Info Fail Game");
    await ctx.say("alice", "!watch Steam Broken Game");
    await ctx.say("alice", "!watch Free Forever Game");
    await ctx.say("alice", "!watch stardew");
    await ctx.say("bob", "!WATCH Terraria");
    await ctx.say("bob", "!watch   Hollow   Knight  ", { label: "bob: !watch with inner and trailing spaces" });
  }, { files: NO_GAMES }),

  sc("watch-already-watched", async (ctx) => {
    await ctx.say("alice", "!watch Hades");
    await ctx.say("alice", "!watch hades");
    await ctx.say("alice", "!watch Celeste");
  }),

  sc("watch-not-found", async (ctx) => {
    await ctx.say("alice", "!watch nonexistent game");
  }, { files: NO_GAMES }),

  sc("watch-search-failure", async (ctx) => {
    await ctx.say("alice", "!watch searchfail");
  }, { files: NO_GAMES }),

  sc("watch-prices-and-info-failure", async (ctx) => {
    ctx.fx.fail("/games/prices/v3");
    await ctx.say("alice", "!watch Hades");
    ctx.fx.clearOverrides();
    ctx.fx.fail("/games/info/v2");
    await ctx.say("alice", "!watch Celeste");
  }, { files: NO_GAMES }),

  sc("no-arg-commands-are-ignored", async (ctx) => {
    const names = [
      "!watch", "!remove", "!unwatch", "!price", "!prices", "!history", "!predict", "!info", "!own", "!unown",
      "!who", "!my-steam-profile", "!role", "!unroll", "!remember", "!forget", "!wiki"
    ];
    for (const name of names) {
      await ctx.say("alice", name);
      await ctx.say("alice", name + "   ", { label: "alice: " + name + " followed by spaces" });
    }
  }),

  sc("remove-and-unwatch", async (ctx) => {
    await ctx.say("alice", "!remove hades");
    await ctx.say("alice", "!remove zzz");
    await ctx.say("alice", "!unwatch celeste");
    await ctx.say("alice", "!unwatch nothing here");
    await ctx.say("alice", "!remove E");
  }),

  sc("list-empty", async (ctx) => {
    await ctx.say("alice", "!list");
  }, { files: NO_GAMES }),

  sc("list-populated", async (ctx) => {
    const games = JSON.parse(ctx.readFile("games.json"));
    games.push({ id: "itad-orphan", title: "Orphan Game", channelId: "CH-games", addedDate: "2026-09-08", lastAlertedPrice: null });
    ctx.writeFile("games.json", games);
    await ctx.say("alice", "!list");
    await ctx.say("alice", "!LIST");
    await ctx.say("alice", "  !list  ", { label: "alice: !list with surrounding spaces" });
  }),

  sc("list-price-failure", async (ctx) => {
    ctx.fx.fail("/games/prices/v3");
    await ctx.say("alice", "!list");
  }),

  sc("list-chunked", async (ctx) => {
    await ctx.say("alice", "!list");
  }, { files: { "games.json": bulkGames(50) } }),

  sc("price-variants", async (ctx) => {
    await ctx.say("alice", "!price hades");
    await ctx.say("alice", "!price celeste");
    await ctx.say("alice", "!price stardew");
    await ctx.say("alice", "!price minecraft");
    await ctx.say("alice", "!price elden ring");
    await ctx.say("alice", "!price ghost game");
    await ctx.say("alice", "!price orphan game");
    await ctx.say("alice", "!price nonexistent game");
    await ctx.say("alice", "!price searchfail");
    await ctx.say("alice", "!price Info Fail Game");
    await ctx.say("alice", "!price Steam Broken Game");
    await ctx.say("alice", "!price Free Forever Game");
    await ctx.say("alice", "!price unrelated query");
    ctx.fx.fail("/games/prices/v3");
    await ctx.say("alice", "!price hades", { label: "alice: !price hades with prices endpoint failing" });
  }),

  sc("price-expiry-formats", async (ctx) => {
    const now = ctx.now();
    const hour = 3600 * 1000;
    const iso = (ms) => new Date(now + ms).toISOString().split(".")[0] + "+00:00";
    const cases = [
      ["within a day", iso(8 * hour)],
      ["exactly 24 hours", iso(24 * hour)],
      ["two days", iso(48 * hour)],
      ["three days minus an hour", iso(71 * hour)],
      ["twenty one days", iso(21 * 24 * hour)],
      ["twenty two days", iso(22 * 24 * hour)],
      ["already expired", iso(-hour)],
      ["invalid date", "not-a-date"],
      ["no expiry", null]
    ];
    for (const [label, expiry] of cases) {
      ctx.fx.clearOverrides();
      ctx.fx.respond("/games/prices/v3", [{ id: "itad-celeste", deals: [deal("itad-celeste", "GOG", 1500, 1999, 25, expiry)] }]);
      await ctx.say("alice", "!price celeste", { label: "alice: !price celeste, expiry " + label });
    }
    ctx.fx.clearOverrides();
    ctx.fx.respond("/games/prices/v3", [{ id: "itad-celeste", deals: [deal("itad-celeste", "GOG", 1500, 1999, 0, iso(8 * hour))] }]);
    await ctx.say("alice", "!price celeste", { label: "alice: !price celeste, no cut with expiry" });
  }),

  sc("prices-variants", async (ctx) => {
    await ctx.say("alice", "!prices hades");
    await ctx.say("alice", "!prices celeste");
    await ctx.say("alice", "!prices elden ring");
    await ctx.say("alice", "!prices elden ring nightreign");
    await ctx.say("alice", "!prices ghost game");
    await ctx.say("alice", "!prices nonexistent game");
    await ctx.say("alice", "!prices searchfail");
    await ctx.say("alice", "!prices Info Fail Game");
    await ctx.say("alice", "!prices Steam Broken Game");
    ctx.fx.fail("/games/prices/v3");
    await ctx.say("alice", "!prices hades", { label: "alice: !prices hades with prices endpoint failing" });
  }),

  sc("history-variants", async (ctx) => {
    await ctx.say("alice", "!history hades");
    await ctx.say("alice", "!history history heavy game");
    await ctx.say("alice", "!history never on sale game");
    await ctx.say("alice", "!history rare sale game");
    await ctx.say("alice", "!history nonexistent game");
    await ctx.say("alice", "!history searchfail");
    ctx.fx.fail("/games/history/v2");
    await ctx.say("alice", "!history hades", { label: "alice: !history hades with history endpoint failing" });
  }),

  sc("predict-variants", async (ctx) => {
    await ctx.say("alice", "!predict hades");
    await ctx.say("alice", "!predict pattern early game");
    await ctx.say("alice", "!predict pattern mid game");
    await ctx.say("alice", "!predict chaotic game");
    await ctx.say("alice", "!predict rare sale game");
    await ctx.say("alice", "!predict never on sale game");
    await ctx.say("alice", "!predict nonexistent game");
    await ctx.say("alice", "!predict searchfail");
    ctx.setNow("2026-12-15T12:00:00Z", "clock moved to 2026-12-15");
    await ctx.say("alice", "!predict hades", { label: "alice: !predict hades in December" });
    await ctx.say("alice", "!predict pattern early game", { label: "alice: !predict pattern early game in December" });
    ctx.setNow("2026-01-20T12:00:00Z", "clock moved to 2026-01-20");
    await ctx.say("alice", "!predict pattern early game", { label: "alice: !predict pattern early game in January" });
    ctx.fx.fail("/games/history/v2");
    await ctx.say("alice", "!predict hades", { label: "alice: !predict hades with history endpoint failing" });
  }),

  sc("shops-variants", async (ctx) => {
    await ctx.say("alice", "!shops");
    ctx.fx.shops = [{ name: "Name Key Shop" }, { title: "Title Key Shop" }, { label: "Label Key Shop" }, { shop: { name: "Nested Shop" } }, { id: 1 }, { title: "alpha lower" }, { title: "Zeta" }];
    await ctx.say("alice", "!shops", { label: "alice: !shops with mixed key shapes" });
    const many = [];
    for (let i = 1; i <= 220; i++) many.push({ id: i, title: "Shop Number " + (i < 100 ? (i < 10 ? "00" : "0") : "") + i });
    ctx.fx.shops = many;
    await ctx.say("alice", "!shops", { label: "alice: !shops with 220 shops" });
    ctx.fx.shops = [];
    await ctx.say("alice", "!shops", { label: "alice: !shops with an empty list" });
    ctx.fx.fail("/service/shops/v1");
    await ctx.say("alice", "!shops", { label: "alice: !shops with shops endpoint failing" });
  }),

  sc("check-command", async (ctx) => {
    await ctx.say("alice", "!check");
    await ctx.say("alice", "!check", { label: "alice: !check again, nothing new" });
  }),

  sc("check-singular-and-empty", async (ctx) => {
    await ctx.say("alice", "!check", { label: "alice: !check with no games" });
    ctx.writeFile("games.json", [{ id: "itad-hades", title: "Hades", channelId: "CH-games", addedDate: "2026-09-01", lastAlertedPrice: null }]);
    await ctx.say("alice", "!check", { label: "alice: !check with one game" });
  }, { files: NO_GAMES }),

  sc("check-price-failure", async (ctx) => {
    ctx.fx.fail("/games/prices/v3");
    await ctx.say("alice", "!check");
  }),

  sc("check-channel-fetch-failure", async (ctx) => {
    ctx.writeFile("games.json", [
      { id: "itad-hades", title: "Hades", channelId: "CH-gone", addedDate: "2026-09-01", lastAlertedPrice: null },
      { id: "itad-elden-ring", title: "Elden Ring", channelId: "CH-games", addedDate: "2026-09-01", lastAlertedPrice: null }
    ]);
    await ctx.say("alice", "!check");
  }),

  sc("check-send-failure", async (ctx) => {
    ctx.failNext("send", Infinity);
    await ctx.say("alice", "!check");
  }),

  sc("check-chunked-digest", async (ctx) => {
    await ctx.say("alice", "!check");
  }, { files: { "games.json": bulkGames(50) } }),

  sc("check-sale-ended-and-price-rules", async (ctx) => {
    ctx.writeFile("games.json", [
      { id: "itad-hollow-knight", title: "Hollow Knight", channelId: "CH-games", addedDate: "2026-09-01", lastAlertedPrice: 740, lastEndingSoonExpiry: "2026-09-30T00:00:00+00:00" },
      { id: "itad-elden-ring", title: "Elden Ring", channelId: "CH-games", addedDate: "2026-09-01", lastAlertedPrice: 3000 },
      { id: "itad-stardew-valley", title: "Stardew Valley", channelId: "CH-games", addedDate: "2026-09-01", lastAlertedPrice: 2000, lastEndingSoonExpiry: "2026-10-07T12:00:00+00:00" },
      { id: "itad-minecraft-legends", title: "Minecraft Legends", channelId: "CH-games", addedDate: "2026-09-01" },
      { id: "itad-celeste", title: "Celeste", channelId: "CH-games", addedDate: "2026-09-01", lastEndingSoonExpiry: "2026-09-01T00:00:00+00:00" }
    ]);
    await ctx.say("alice", "!check");
    ctx.setNow("2026-10-06T12:00:00Z");
    await ctx.say("alice", "!check", { label: "alice: !check again" });
  }),

  sc("cron-daily-price-check", async (ctx) => {
    await ctx.startReady();
    await ctx.cron("0 15 * * *", "cron daily price check, default games");
    await ctx.cron("0 15 * * *", "cron daily price check again");
  }),

  sc("cron-daily-price-check-chunked", async (ctx) => {
    await ctx.startReady();
    await ctx.cron("0 15 * * *", "cron daily price check, 50 games");
  }, { files: { "games.json": bulkGames(50) } }),

  sc("cron-daily-price-check-failure", async (ctx) => {
    await ctx.startReady();
    ctx.fx.fail("/games/prices/v3");
    await ctx.cron("0 15 * * *", "cron daily price check with prices failing");
  }),

  sc("cron-daily-price-check-no-games", async (ctx) => {
    await ctx.startReady();
    await ctx.cron("0 15 * * *", "cron daily price check with no games");
  }, { files: NO_GAMES }),

  sc("itad-country-override", async (ctx) => {
    await ctx.say("alice", "!price hades");
    await ctx.say("alice", "!info celeste");
    await ctx.say("alice", "!history hades");
  }, { env: { ITAD_COUNTRY: "gb" } })
];
