const { sc } = require("./helpers");

const LETTERS = ["A", "B", "C", "D"];

function currentQuestion(ctx) {
  const payload = ctx.lastPayload();
  if (!payload || typeof payload.content !== "string") return null;
  return ctx.triviaQuestions().find((q) => payload.content.includes(q.question)) || null;
}

function wrongLetter(q) {
  return LETTERS[(q.answer + 1) % 4];
}

module.exports = [
  sc("trivia-round", async (ctx) => {
    await ctx.say("alice", "!trivia");
    const q = currentQuestion(ctx);
    ctx.note("questionFound", !!q);
    await ctx.say("bob", "!trivia", { label: "bob: !trivia while one is up" });
    await ctx.say("carol", wrongLetter(q), { label: "carol answers wrong" });
    await ctx.say("carol", LETTERS[q.answer], { label: "carol answers right after already guessing" });
    await ctx.say("erin", "hello chat", { label: "erin chatter during trivia" });
    await ctx.say("erin", "e", { label: "erin invalid letter" });
    await ctx.say("alice", LETTERS[q.answer].toLowerCase() + ")", { label: "alice answers right" });
    await ctx.say("bob", LETTERS[q.answer], { label: "bob answers after round ended" });
    await ctx.say("alice", "!score");
    await ctx.advance(31000, "advance past the original timeout");
  }),

  sc("trivia-answer-formats", async (ctx) => {
    const formats = [
      (l) => l,
      (l) => l.toLowerCase(),
      (l) => l + ")",
      (l) => l + ".",
      (l) => l + ":",
      (l) => "  " + l + "  ",
      (l) => "(" + l + ")"
    ];
    const players = ["alice", "bob", "carol", "erin", "frank", "dave", "eve"];
    for (let i = 0; i < formats.length; i++) {
      await ctx.say("newbie", "!trivia", { label: "round " + (i + 1) + ": !trivia" });
      const q = currentQuestion(ctx);
      await ctx.say(players[i], formats[i](LETTERS[q.answer]), { label: "round " + (i + 1) + ": " + players[i] + " answers " + JSON.stringify(formats[i](LETTERS[q.answer])) });
    }
  }),

  sc("trivia-timeout", async (ctx) => {
    await ctx.say("alice", "!trivia");
    await ctx.advance(29999, "advance 29999ms");
    await ctx.advance(1, "advance 1ms more, timeout fires");
    await ctx.say("bob", "!trivia", { label: "bob: new round after timeout" });
    const q = currentQuestion(ctx);
    await ctx.say("carol", LETTERS[q.answer], { label: "carol answers the new round" });
    await ctx.advance(31000, "advance past the second timeout, nothing should be sent");
    ctx.note("pendingTimersAfter", ctx.clock.pendingTimers());
  }),

  sc("trivia-timeout-send-failure", async (ctx) => {
    await ctx.say("alice", "!trivia");
    ctx.failNext("send");
    await ctx.advance(30000, "advance 30s, timeout send fails");
  }),

  sc("trivia-two-channels", async (ctx) => {
    await ctx.say("alice", "!trivia", { channel: "CH-general" });
    const q1 = currentQuestion(ctx);
    await ctx.say("bob", "!trivia", { channel: "CH-games" });
    const q2 = currentQuestion(ctx);
    await ctx.say("carol", LETTERS[q1.answer], { channel: "CH-games", label: "carol answers channel 1 answer in channel 2" });
    await ctx.say("carol", LETTERS[q2.answer], { channel: "CH-games", label: "carol answers channel 2 correctly" });
    await ctx.say("erin", LETTERS[q1.answer], { channel: "CH-general", label: "erin answers channel 1 correctly" });
  }),

  sc("trivia-post-failure", async (ctx) => {
    ctx.failNext("reply");
    await ctx.say("alice", "!trivia", { label: "alice: !trivia reply fails" });
    await ctx.say("bob", "!trivia", { label: "bob: !trivia works afterwards" });
  }),

  sc("trivia-answer-display-names", async (ctx) => {
    for (const who of ["erin", "frank", "dave", "alice"]) {
      await ctx.say("newbie", "!trivia", { label: "newbie: !trivia for " + who });
      const q = currentQuestion(ctx);
      await ctx.say(who, LETTERS[q.answer], { label: who + " answers right" });
    }
  }),

  sc("trivia-answer-reply-failure", async (ctx) => {
    await ctx.say("alice", "!trivia");
    const q = currentQuestion(ctx);
    ctx.failNext("reply");
    await ctx.say("bob", LETTERS[q.answer], { label: "bob answers right but the reply fails" });
    await ctx.say("alice", "!score");
  }),

  sc("trivia-uses-real-or-fallback-questions", async (ctx) => {
    await ctx.say("alice", "!trivia");
    ctx.note("firstLine", String(ctx.lastPayload().content).split("\n")[0]);
  }, { files: { "trivia.json": [] } }),

  sc("trivia-file-missing-uses-fallback", async (ctx) => {
    await ctx.say("alice", "!trivia");
    ctx.note("firstLine", String(ctx.lastPayload().content).split("\n")[0]);
    await ctx.advance(30000, "advance 30s");
  }, { files: { "trivia.json": null } }),

  sc("trivia-file-invalid-uses-fallback", async (ctx) => {
    await ctx.say("alice", "!trivia");
    ctx.note("firstLine", String(ctx.lastPayload().content).split("\n")[0]);
  }, { files: { "trivia.json": "{broken" } }),

  sc("score-variants", async (ctx) => {
    await ctx.say("alice", "!score");
  }),

  sc("score-empty", async (ctx) => {
    await ctx.say("alice", "!score");
  }, { files: { "scores.json": {} } }),

  sc("score-missing-file-then-award", async (ctx) => {
    await ctx.say("alice", "!score");
    await ctx.say("alice", "!trivia");
    const q = currentQuestion(ctx);
    await ctx.say("bob", LETTERS[q.answer]);
    await ctx.say("alice", "!score");
  }, { files: { "scores.json": null } }),

  sc("score-top-ten-and-singular", async (ctx) => {
    await ctx.say("alice", "!score");
  }, {
    files: {
      "scores.json": {
        U1: 1, U2: 500, U3: 400, U4: 300, U5: 200, U6: 100, U7: 900, U8: 800, U10: 700, U11: 600, U12: 50, U13: 20, U14: 0, U15: -5
      }
    }
  })
];
