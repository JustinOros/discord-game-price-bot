const { sc } = require("./helpers");

const SIX = 6000;

module.exports = [
  sc("ai-mention-basic", async (ctx) => {
    await ctx.say("alice", "hey bmo how are you");
    await ctx.say("bob", "BMO!", { label: "bob: BMO! upper case trigger" });
    await ctx.say("carol", "unbmo is not the trigger");
    await ctx.say("carol", "bmo's turn", { label: "carol: bmo's turn" });
    await ctx.say("erin", "!bmo hi", { label: "erin: command-shaped message with trigger" });
    await ctx.say("frank", "nothing to see here");
    await ctx.say("robot", "bmo hello from another bot");
    await ctx.say("eve", "bmo hello in a DM", { dm: true });
  }),

  sc("ai-cooldown", async (ctx) => {
    await ctx.say("alice", "bmo first");
    await ctx.say("alice", "bmo second right away");
    await ctx.say("bob", "bmo different user is not limited");
    await ctx.advance(4999, "advance 4999ms");
    await ctx.say("alice", "bmo third at 4999ms");
    await ctx.advance(1, "advance 1ms more");
    await ctx.say("alice", "bmo fourth at 5000ms");
    await ctx.advance(SIX, "advance 6s");
    await ctx.say("alice", "bmo fifth after the cooldown");
  }),

  sc("ai-history-cap-and-ttl", async (ctx) => {
    for (let i = 1; i <= 5; i++) {
      await ctx.say("alice", "bmo turn " + i);
      await ctx.advance(SIX, "advance 6s after turn " + i);
    }
    await ctx.advance(30 * 60 * 1000 - SIX, "advance so the history age equals the 30 minute TTL exactly");
    await ctx.say("alice", "bmo exactly at the ttl");
    await ctx.advance(30 * 60 * 1000 + 1, "advance past the 30 minute TTL");
    await ctx.say("alice", "bmo after the ttl");
  }),

  sc("ai-reply-to-bot", async (ctx) => {
    await ctx.say("alice", "bmo hello there");
    const botMessage = ctx.lastSent();
    await ctx.say("bob", "what about me", { reference: botMessage.id, label: "bob replies to the bot message without a trigger" });
    const plain = await ctx.say("carol", "just chatting");
    await ctx.say("erin", "replying to a human message", { reference: plain.id });
    await ctx.say("frank", "replying to an unknown message", { reference: "M-DOES-NOT-EXIST" });
    await ctx.say("alice", "!list", { reference: botMessage.id, label: "alice: command that replies to the bot is still a command" });
  }),

  sc("ai-display-names", async (ctx) => {
    await ctx.say("alice", "bmo who am i");
    await ctx.say("erin", "bmo who am i", { label: "erin: no displayName and no globalName" });
    await ctx.say("frank", "bmo who am i", { label: "frank: no displayName, has globalName" });
    await ctx.say("dave", "bmo who am i", { label: "dave: not a cached member" });
  }),

  sc("ai-failure-modes", async (ctx) => {
    await ctx.say("alice", "bmo [[ollama-500]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo [[ollama-throw]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo [[ollama-empty]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo [[ollama-nomessage]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo [[stage]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo [[incomplete]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo [[nopunct]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo and now a normal one");
  }),

  sc("ai-disabled", async (ctx) => {
    await ctx.say("alice", "hey bmo");
    await ctx.say("alice", "!wiki where is the key card");
    const botMessage = ctx.lastSent();
    await ctx.say("bob", "reply to nothing", { reference: botMessage ? botMessage.id : "none" });
  }, { env: { AI_ENABLED: "false" } }),

  sc("ai-system-prompt-full-text", async (ctx) => {
    ctx.fx.recordFullSystem = true;
    await ctx.say("alice", "hey bmo");
  }),

  sc("ai-without-memory-file", async (ctx) => {
    await ctx.say("alice", "hey bmo");
  }, { files: { "memory.yaml": null } }),

  sc("ai-facts-from-memory", async (ctx) => {
    await ctx.say("alice", "hey bmo");
  }, { files: { "memory.yaml": { U1: ["a", "b"], U2: ["c"], U3: [], U4: ["d", "e", "f"] } } }),

  sc("ai-readme-missing", async (ctx) => {
    await ctx.say("alice", "hey bmo");
  }, { files: { "README.md": null } }),

  sc("ai-custom-ollama-endpoint", async (ctx) => {
    await ctx.say("alice", "hey bmo");
    await ctx.say("alice", "!own Stardew", { label: "alice: !own Stardew uses the custom ollama endpoint for the emoji" });
  }, { env: { OLLAMA_URL: "http://ollama.test:1234", OLLAMA_MODEL: "mistral" }, files: { "owned.json": {} } }),

  sc("ai-history-shared-between-mention-and-wiki", async (ctx) => {
    await ctx.say("alice", "bmo first question");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki what is the best sword in avowed");
    await ctx.advance(SIX);
    await ctx.say("alice", "bmo follow up");
  }),

  sc("wiki-search-answer", async (ctx) => {
    await ctx.say("alice", "!wiki where is the key card [[tavily-answer]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki where can i find the key in avowed [[tavily-answer]]", { label: "alice: !wiki with a known map and an answer" });
    await ctx.advance(SIX);
    await ctx.say("alice", "!WIKI where is the thing in baldur's gate 3 [[tavily-answer]]", { label: "alice: !WIKI with a map url that already has a query" });
  }),

  sc("wiki-search-results-only", async (ctx) => {
    await ctx.say("alice", "!wiki best sword in avowed");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki how do i beat the boss in the forest");
  }),

  sc("wiki-search-none-and-failures", async (ctx) => {
    await ctx.say("alice", "!wiki anything [[tavily-none]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki anything [[tavily-500]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki anything [[tavily-throw]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki anything [[ollama-500]] [[tavily-none]]");
    await ctx.advance(SIX);
    await ctx.say("alice", "!wiki anything [[ollama-empty]] [[tavily-none]]");
  }),

  sc("wiki-cooldown", async (ctx) => {
    await ctx.say("alice", "!wiki first [[tavily-answer]]");
    await ctx.say("alice", "!wiki second [[tavily-answer]]");
    await ctx.say("alice", "bmo mention while on cooldown");
    await ctx.say("bob", "!wiki other user [[tavily-answer]]");
  }),

  sc("wiki-without-web-search-key", async (ctx) => {
    await ctx.say("alice", "!wiki where is the key card");
  }, { env: { TAVILY_API_KEY: null } }),

  sc("wiki-maps-file-invalid", async (ctx) => {
    await ctx.say("alice", "!wiki where can i find the key in avowed [[tavily-answer]]");
  }, { files: { "maps.json": "{not json" } }),

  sc("wiki-maps-file-not-an-object", async (ctx) => {
    await ctx.say("alice", "!wiki where can i find the key in avowed [[tavily-answer]]");
  }, { files: { "maps.json": "null" } }),

  sc("wiki-map-search-term-extraction", async (ctx) => {
    const queries = [
      "where is the iron ore in the forest [[tavily-answer]]",
      "how do i get the golden armor in avowed [[tavily-answer]]",
      "location of the secret door in avowed [[tavily-answer]]",
      "avowed [[tavily-answer]]",
      "where can i find the lost key near the bridge of avowed [[tavily-answer]]"
    ];
    for (const q of queries) {
      await ctx.say("alice", "!wiki " + q);
      await ctx.advance(SIX);
    }
  })
];
