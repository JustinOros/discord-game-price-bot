const { sc } = require("./helpers");

module.exports = [
  sc("startup-registration", async (ctx) => {
    ctx.note("cronJobsBeforeReady", ctx.world.cronJobs.length);
  }),

  sc("client-ready", async (ctx) => {
    await ctx.startReady();
    ctx.note("cronExpressions", ctx.world.cronJobs.map((j) => j.expression));
  }),

  sc("client-ready-member-fetch-failure", async (ctx) => {
    ctx.failNext("membersFetch", Infinity);
    await ctx.startReady();
  }),

  sc("client-ready-web-search-disabled", async (ctx) => {
    await ctx.startReady();
  }, { env: { TAVILY_API_KEY: null } }),

  sc("unhandled-rejection-handler", async (ctx) => {
    const handler = ctx.world.processHandlers.unhandledRejection;
    ctx.step("handler with Error");
    handler(new Error("boom"), null);
    ctx.step("handler with string");
    handler("plain string reason", null);
    ctx.step("handler with null");
    handler(null, null);
    ctx.step("handler with object without message");
    handler({ code: 42 }, null);
    ctx.step("handler with empty message object");
    handler({ message: "" }, null);
  }),

  sc("login-failure", async (ctx) => {
    ctx.note("loginAttempted", true);
  }, { beforeLoad(ctx) { ctx.world.failNext("login"); } }),

  sc("missing-discord-token", async (ctx) => {
    ctx.note("clientCreated", !!ctx.world.client);
  }, { env: { DISCORD_BOT_TOKEN: null } }),

  sc("missing-itad-key", async (ctx) => {
    ctx.note("clientCreated", !!ctx.world.client);
  }, { env: { ITAD_API_KEY: null } }),

  sc("handler-exception-reaches-unhandled-rejection", async (ctx) => {
    ctx.failNext("deferUpdate");
    await ctx.click("alice", "role:R-CELESTE");
  }),

  sc("real-content-files", async (ctx) => {
    await ctx.startReady();
    await ctx.say("alice", "!trivia");
    const payload = ctx.lastPayload();
    const questions = ctx.triviaQuestions();
    ctx.note("triviaQuestionFromRealFile", questions.some((q) => payload.content.includes(q.question)));
    ctx.note("triviaLines", payload.content.split("\n").length);
    await ctx.joinMember("newbie", { label: "guildMemberAdd newbie (real greetings)" });
    const sends = ctx.rec.current.outgoing || [];
    ctx.note("greetingMentionsUser", sends.length > 0 && sends[0].payload.content.includes("<@U8>"));
    await ctx.leaveMember("carol", { label: "guildMemberRemove carol (real goodbyes)" });
    const bye = ctx.rec.current.outgoing || [];
    ctx.note("goodbyeMentionsName", bye.length > 0 && bye[0].payload.content.includes("carol"));
    await ctx.say("alice", "hey " + ctx.personality().trigger + " how are you", { label: "alice mention (real persona)" });
    const aiOut = ctx.rec.current.outgoing || [];
    ctx.note("aiReplied", aiOut.length > 0);
  }, { realContent: true })
];
