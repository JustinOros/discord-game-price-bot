const { sc } = require("./helpers");

const SCHEDULED = 1;
const ACTIVE = 2;
const TICK = "* * * * *";

module.exports = [
  sc("event-reminders", async (ctx) => {
    await ctx.startReady();
    ctx.addEvent(ctx.g1, { id: "E1", name: "Hades Night", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(4 * 60000) });
    ctx.addEvent(ctx.g1, { id: "E2", name: "Movie Night", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(2 * 60000) });
    await ctx.cron(TICK, "tick 1 two events in window");
    await ctx.cron(TICK, "tick 2 already notified");
    ctx.g1.eventList.length = 0;
    await ctx.cron(TICK, "tick 3 events gone, notified set pruned");
    ctx.addEvent(ctx.g1, { id: "E1", name: "Hades Night", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(3 * 60000) });
    await ctx.cron(TICK, "tick 4 same id reappears and is notified again");
  }),

  sc("event-window-edges", async (ctx) => {
    await ctx.startReady();
    ctx.addEvent(ctx.g1, { id: "EX5", name: "Exactly Five Minutes", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(5 * 60000) });
    ctx.addEvent(ctx.g1, { id: "EX5S", name: "Five Minutes One Second", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(5 * 60000 + 1000) });
    ctx.addEvent(ctx.g1, { id: "EX0", name: "Starting Right Now", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(0) });
    ctx.addEvent(ctx.g1, { id: "EXPAST", name: "Already Started", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(-60000) });
    ctx.addEvent(ctx.g1, { id: "EXACTIVE", name: "Active Event", status: ACTIVE, scheduledStartAt: ctx.fromNowMs(2 * 60000) });
    ctx.addEvent(ctx.g1, { id: "EXNOSTART", name: "No Start Time", status: SCHEDULED, scheduledStartAt: null });
    ctx.addEvent(ctx.g1, { id: "EXFAR", name: "Far Away", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(60 * 60000) });
    await ctx.cron(TICK, "tick 1");
    await ctx.advance(2 * 60000, "advance 2 minutes");
    await ctx.cron(TICK, "tick 2 five-minutes-one-second event now inside the window");
    await ctx.advance(60 * 60000, "advance one hour");
    await ctx.cron(TICK, "tick 3 far event now inside the window");
  }),

  sc("event-no-general-channel", async (ctx) => {
    await ctx.startReady();
    ctx.addEvent(ctx.g2, { id: "G2E1", name: "Other Guild Event", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(3 * 60000) });
    await ctx.cron(TICK, "tick 1 guild without a general channel");
    await ctx.cron(TICK, "tick 2 not retried");
  }),

  sc("event-send-failure", async (ctx) => {
    await ctx.startReady();
    ctx.addEvent(ctx.g1, { id: "E1", name: "Hades Night", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(3 * 60000) });
    ctx.failNext("send");
    await ctx.cron(TICK, "tick 1 send fails");
    await ctx.cron(TICK, "tick 2 still marked notified");
  }),

  sc("event-fetch-failure", async (ctx) => {
    await ctx.startReady();
    ctx.addEvent(ctx.g1, { id: "E1", name: "Hades Night", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(3 * 60000) });
    ctx.failNext("eventsFetch", Infinity);
    await ctx.cron(TICK, "tick 1 events fetch fails for both guilds");
  }),

  sc("event-multiple-guilds-and-role-mention", async (ctx) => {
    await ctx.startReady();
    ctx.addEvent(ctx.g1, { id: "E1", name: "Elden Ring Co-op", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(1 * 60000) });
    ctx.addEvent(ctx.g1, { id: "E2", name: "celeste speedrun", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(2 * 60000) });
    ctx.addEvent(ctx.g1, { id: "E3", name: "Role Missing From Guild", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(2 * 60000) });
    ctx.writeFile("roles.yaml", {
      hades: { title: "Hades", roleId: "R-HADES", emoji: "⚔️", iconMode: "native" },
      celeste: { title: "Celeste", roleId: "R-CELESTE", emoji: "🍓", iconMode: "native" },
      "elden ring": { title: "Elden Ring", roleId: "R-ELDEN", emoji: "🗡️", iconMode: "native" },
      missing: { title: "Missing", roleId: "R-NOT-IN-GUILD", emoji: "❓", iconMode: "native" }
    });
    ctx.addEvent(ctx.g1, { id: "E4", name: "Missing Role Night", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(2 * 60000) });
    ctx.addEvent(ctx.g2, { id: "G2E1", name: "Other Guild Event", status: SCHEDULED, scheduledStartAt: ctx.fromNowMs(3 * 60000) });
    await ctx.cron(TICK, "tick 1");
  })
];
