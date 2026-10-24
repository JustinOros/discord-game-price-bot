const fs = require("fs");
const path = require("path");
const util = require("util");
const Module = require("module");
const yaml = require("js-yaml");

const realDiscord = require("discord.js");
const { createClock, createRandom, RealDate } = require("./clock");
const { Recorder } = require("./recorder");
const { World } = require("./world");
const { createDiscordModule, createCronModule, createChildProcessModule } = require("./modules");
const { Fixtures } = require("./fixtures");
const { createSandbox } = require("./sandbox");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FIXED_NOW = "2026-10-06T12:00:00Z";
const BASE_SEED = 20261006;

const BASE_ENV = {
  DISCORD_BOT_TOKEN: "test-discord-token",
  ITAD_API_KEY: "test-itad-key",
  STEAM_API_KEY: "test-steam-key",
  TAVILY_API_KEY: "test-tavily-key",
  AI_ENABLED: "true",
  DOCKER_SSH_HOST: "docker.test.local",
  DOCKER_SSH_USER: "dockeruser",
  DOCKER_SSH_KEY_PATH: "/keys/test_ed25519",
  DOCKER_ROLE_ID: "ROLE-DOCKER",
  DOCKER_PROTECTED_CONTAINERS: "Plex-Media-Server",
  DOTENV_CONFIG_QUIET: "true"
};
const CLEARED_ENV = ["ITAD_COUNTRY", "OLLAMA_URL", "OLLAMA_MODEL", "DOTENV_CONFIG_PATH", "DOTENV_CONFIG_DEBUG", "DISABLED_PLUGINS"];

function buildWorld(rec, clock) {
  const world = new World(rec, clock);
  world.addUser("alice", { id: "U1", username: "alice", globalName: "Alice G", displayName: "Alice" });
  world.addUser("bob", { id: "U2", username: "bob", globalName: "Bob G", displayName: "Bob" });
  world.addUser("carol", { id: "U3", username: "carol", globalName: null, displayName: "Carol" });
  world.addUser("dave", { id: "U4", username: "dave", globalName: "Dave G", displayName: "Dave" });
  world.addUser("eve", { id: "U5", username: "eve", globalName: "Eve G", displayName: "Eve" });
  world.addUser("erin", { id: "U6", username: "erin", globalName: null, displayName: null });
  world.addUser("frank", { id: "U7", username: "frank", globalName: "Frank G", displayName: null });
  world.addUser("newbie", { id: "U8", username: "newbie", globalName: "Newbie G", displayName: "Newbie" });
  world.addUser("robot", { id: "UB2", username: "otherbot", globalName: null, displayName: "otherbot", bot: true });

  const g1 = world.addGuild({ id: "G1", name: "Test Guild", memberCount: 5 });
  g1.addRole({ id: "ROLE-DOCKER", name: "Docker", unicodeEmoji: null });
  g1.addRole({ id: "R-HADES", name: "Hades", unicodeEmoji: "⚔️" });
  g1.addRole({ id: "R-CELESTE", name: "Celeste", unicodeEmoji: "🍓" });
  g1.addRole({ id: "R-ELDEN", name: "Elden Ring", unicodeEmoji: "🗡️" });
  g1.addChannel({ id: "CH-voice", name: "general", textBased: false });
  g1.addChannel({ id: "CH-general", name: "general" });
  g1.addChannel({ id: "CH-games", name: "games" });
  g1.addChannel({ id: "CH-deals", name: "deals" });
  g1.addMember(world.users.alice, { roleIds: ["R-HADES"] });
  g1.addMember(world.users.bob, { roleIds: ["ROLE-DOCKER", "R-HADES"] });
  g1.addMember(world.users.carol, { roleIds: ["R-CELESTE"] });
  g1.addMember(world.users.erin, {});
  g1.addMember(world.users.frank, {});

  const g2 = world.addGuild({ id: "G2", name: "Second Guild", memberCount: 2 });
  g2.addRole({ id: "ROLE-DOCKER", name: "Docker", unicodeEmoji: null });
  g2.addChannel({ id: "CH-g2-chat", name: "chat" });
  g2.addFetchableMember(world.users.dave, { roleIds: ["ROLE-DOCKER"] });

  world.g1 = g1;
  world.g2 = g2;
  return world;
}

function sanitize(value, replacements) {
  let text = JSON.stringify(value);
  for (const [from, to] of replacements) {
    if (from) text = text.split(JSON.stringify(from).slice(1, -1)).join(to);
  }
  return JSON.parse(text);
}

async function runScenario(scn) {
  const rec = new Recorder();
  const clock = createClock(FIXED_NOW);
  const world = buildWorld(rec, clock);
  const env = Object.assign({}, BASE_ENV);
  Object.keys(scn.env || {}).forEach((k) => {
    if (scn.env[k] === null) delete env[k];
    else env[k] = scn.env[k];
  });
  const sandbox = createSandbox(REPO_ROOT, scn.files, { realContent: !!scn.realContent });
  const readme = sandbox.read("README.md") || "";
  const fx = new Fixtures(env, readme);
  const discordModule = createDiscordModule(world, realDiscord);
  const cronModule = createCronModule(world);
  const cpModule = createChildProcessModule(world, (file, args, options) => {
    rec.push("ssh", { file: file, args: args, options: options === undefined ? null : JSON.parse(JSON.stringify(options)) });
    return fx.runSsh(file, args, options);
  });

  let rng = createRandom(BASE_SEED);
  rec.onBegin = (idx) => {
    rng = createRandom(BASE_SEED + idx * 7919);
  };

  const saved = {
    Date: globalThis.Date,
    random: Math.random,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    fetch: globalThis.fetch,
    exit: process.exit,
    on: process.on,
    once: process.once,
    addListener: process.addListener,
    load: Module._load,
    console: {},
    env: {}
  };
  const consoleLevels = ["log", "error", "warn", "info", "debug"];
  consoleLevels.forEach((level) => {
    saved.console[level] = console[level];
  });
  Object.keys(BASE_ENV).concat(CLEARED_ENV).forEach((k) => {
    saved.env[k] = process.env[k];
  });

  const sandboxDir = sandbox.dir;

  function restore() {
    globalThis.Date = saved.Date;
    Math.random = saved.random;
    globalThis.setTimeout = saved.setTimeout;
    globalThis.clearTimeout = saved.clearTimeout;
    globalThis.fetch = saved.fetch;
    process.exit = saved.exit;
    process.on = saved.on;
    process.once = saved.once;
    process.addListener = saved.addListener;
    Module._load = saved.load;
    consoleLevels.forEach((level) => {
      console[level] = saved.console[level];
    });
    Object.keys(saved.env).forEach((k) => {
      if (saved.env[k] === undefined) delete process.env[k];
      else process.env[k] = saved.env[k];
    });
    Object.keys(require.cache).forEach((k) => {
      if (k.startsWith(sandboxDir)) delete require.cache[k];
    });
  }

  function install() {
    CLEARED_ENV.forEach((k) => {
      delete process.env[k];
    });
    Object.keys(BASE_ENV).forEach((k) => {
      delete process.env[k];
    });
    Object.keys(env).forEach((k) => {
      process.env[k] = env[k];
    });
    globalThis.Date = clock.FakeDate;
    Math.random = () => rng();
    globalThis.setTimeout = clock.setTimeout;
    globalThis.clearTimeout = clock.clearTimeout;
    globalThis.fetch = async (url, init) => {
      const result = await fx.handle(url, init);
      rec.push("fetches", result.record);
      if (result.hang) {
        return new Promise((resolve, reject) => {
          const signal = result.signal;
          if (!signal) return;
          const onAbort = () => {
            result.record.aborted = true;
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        });
      }
      if (result.error) throw result.error;
      return result.response;
    };
    consoleLevels.forEach((level) => {
      console[level] = (...args) => {
        rec.push("console", { level: level, text: util.format(...args) });
      };
    });
    process.exit = (code) => {
      rec.push("exit", { code: code === undefined ? null : code });
    };
    const captureProcess = (event, fn) => {
      world.processHandlers[event] = fn;
      rec.push("registration", { process: event });
      return process;
    };
    process.on = captureProcess;
    process.once = captureProcess;
    process.addListener = captureProcess;
    Module._load = function load(request, parent, isMain) {
      const fromSandbox = parent && typeof parent.filename === "string" && parent.filename.startsWith(sandboxDir + path.sep);
      if (fromSandbox) {
        if (request === "discord.js") return discordModule;
        if (request === "node-cron") return cronModule;
        if (request === "child_process" || request === "node:child_process") return cpModule;
      }
      return saved.load.apply(this, arguments);
    };
  }

  async function settle() {
    for (let i = 0; i < 500; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      if (world.pending.size === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (world.pending.size === 0) return;
      }
    }
    throw new Error("settle did not converge");
  }

  async function settleSoft() {
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      if (world.pending.size === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (world.pending.size === 0) return;
      }
    }
  }

  const ctx = {
    world,
    fx,
    sandbox,
    clock,
    rec,
    users: world.users,
    g1: world.g1,
    g2: world.g2,
    settle,
    env,
    step(label) {
      rec.begin(label);
    },
    note(key, value) {
      rec.push("notes", { key: key, value: value });
    },
    failNext(kind, count) {
      world.failNext(kind, count);
    },
    clearFailures() {
      world.clearFailures();
    },
    channel(guild, id) {
      return guild.channels.cache.get(id);
    },
    member(key, guild) {
      return (guild || world.g1).members.cache.get(world.users[key].id);
    },
    lastSent() {
      return world.lastSent;
    },
    lastPayload() {
      const steps = rec.steps;
      for (let i = steps.length - 1; i >= 0; i--) {
        const out = steps[i].outgoing;
        if (out && out.length > 0) return out[out.length - 1].payload;
      }
      return null;
    },
    emit(event, ...args) {
      world.client.emit(event, ...args);
    },
    async emitAndSettle(event, ...args) {
      world.client.emit(event, ...args);
      await settle();
    },
    async say(userKey, content, opts) {
      const o = opts || {};
      const user = world.users[userKey];
      const guild = o.dm ? null : o.guild || world.g1;
      const channel = guild ? guild.channels.cache.get(o.channel || (guild === world.g1 ? "CH-general" : "CH-g2-chat")) : null;
      const message = world.createMessage({ user: user, guild: guild, channel: channel, content: content, reference: o.reference || null, referenceRaw: o.referenceRaw, member: o.member });
      const label = o.label || (o.dm ? "dm " : "") + userKey + ": " + content;
      if (!o.sameStep) rec.begin(label.length > 140 ? label.slice(0, 140) + "..." : label);
      world.client.emit("messageCreate", message);
      if (o.noSettle) return message;
      await settle();
      return message;
    },
    async dm(userKey, content, opts) {
      return ctx.say(userKey, content, Object.assign({}, opts, { dm: true }));
    },
    async interact(kind, userKey, customId, opts) {
      const o = opts || {};
      const user = world.users[userKey];
      const guild = o.guild || world.g1;
      const member = guild.members.cache.get(user.id) || null;
      const interaction = world.createInteraction({
        kind: kind,
        customId: customId,
        values: o.values,
        user: user,
        member: member,
        guild: guild,
        message: o.message || world.lastSent || null
      });
      rec.begin(o.label || userKey + " " + kind + " " + customId + (o.values ? " " + o.values.join(",") : ""));
      world.client.emit("interactionCreate", interaction);
      await settle();
      return interaction;
    },
    click(userKey, customId, opts) {
      return ctx.interact("button", userKey, customId, opts);
    },
    select(userKey, customId, values, opts) {
      return ctx.interact("select", userKey, customId, Object.assign({}, opts, { values: values }));
    },
    command(userKey, customId, opts) {
      return ctx.interact("command", userKey, customId, opts);
    },
    async joinMember(userKey, opts) {
      const o = opts || {};
      const guild = o.guild || world.g1;
      const user = world.users[userKey];
      let member = guild.members.cache.get(user.id);
      if (!member) member = guild.addMember(user, {});
      rec.begin(o.label || "guildMemberAdd " + userKey);
      world.client.emit("guildMemberAdd", member);
      await settle();
      return member;
    },
    async leaveMember(userKey, opts) {
      const o = opts || {};
      const guild = o.guild || world.g1;
      const user = world.users[userKey];
      let member = guild.members.cache.get(user.id);
      if (o.noUser) {
        member = { guild: guild, id: user.id, user: null, toString: () => "<@" + user.id + ">" };
      } else if (!member) {
        member = guild.addMember(user, {});
      }
      rec.begin(o.label || "guildMemberRemove " + userKey);
      world.client.emit("guildMemberRemove", member);
      await settle();
      return member;
    },
    async cron(expression, label) {
      rec.begin(label || "cron " + expression);
      const jobs = world.cronJobs.filter((j) => j.expression === expression);
      if (jobs.length === 0) {
        rec.push("notes", { key: "cron-not-registered", value: expression });
        return;
      }
      for (const job of jobs) {
        try {
          const result = job.fn();
          if (result && typeof result.then === "function") await result;
        } catch (err) {
          world.handlerError(err);
        }
      }
      await settle();
    },
    async advance(ms, label) {
      await settleSoft();
      rec.begin(label || "advance " + ms + "ms");
      await clock.advance(ms, { fn: settleSoft, onError: (err) => world.handlerError(err) });
      await settleSoft();
    },
    setNow(value, label) {
      clock.setNow(value);
      rec.push("notes", { key: "setNow", value: label || String(value) });
    },
    now() {
      return clock.getNow();
    },
    fromNowMs(ms) {
      return new RealDate(clock.getNow() + ms);
    },
    async startReady(label) {
      rec.begin(label || "clientReady");
      world.client.emit("clientReady");
      await settle();
    },
    readFile(name) {
      return sandbox.read(name);
    },
    writeFile(name, value) {
      sandbox.write(name, value);
      rec.push("notes", { key: "writeFile", value: name });
    },
    personality() {
      return yaml.load(sandbox.read("personality.yaml"));
    },
    triviaQuestions() {
      try {
        return JSON.parse(sandbox.read("trivia.json"));
      } catch (err) {
        return [];
      }
    },
    addEvent(guild, spec) {
      return guild.addEvent(spec);
    },
    setupBooks(userKeys) {
      const guild = world.g1;
      guild.addRole({ id: "ROLE-BOOKS", name: "Books", unicodeEmoji: null });
      guild.addChannel({ id: "CH-books", name: "books" });
      userKeys.forEach((key) => {
        const user = world.users[key];
        let member = guild.members.cache.get(user.id);
        if (!member) member = guild.addMember(user, {});
        member.roles.apply("add", "ROLE-BOOKS");
      });
    },
    mention(userKey) {
      return "<@" + world.users[userKey].id + ">";
    },
    manyRoles(count) {
      const roles = {};
      for (let i = 1; i <= count; i++) {
        const n = i < 10 ? "0" + i : String(i);
        const title = "Role Game " + n;
        const roleId = "RG-" + n;
        roles[title.toLowerCase()] = { title: title, roleId: roleId, emoji: "🎮", iconMode: "native" };
        world.g1.addRole({ id: roleId, name: title, unicodeEmoji: "🎮" });
      }
      return roles;
    }
  };

  let transcript;
  try {
    install();
    if (scn.beforeLoad) scn.beforeLoad(ctx);
    let loadError = null;
    try {
      require(path.join(sandboxDir, "index.js"));
    } catch (err) {
      loadError = err && err.stack ? err.stack : String(err);
    }
    if (world.client) {
      world.client.registrations.forEach((r) => rec.push("registration", r));
      rec.push("registration", { clientOptions: world.clientOptions });
    }
    if (loadError) rec.push("loadError", { message: loadError });
    await settle();
    await scn.run(ctx);
    await settle();
    transcript = {
      steps: rec.steps,
      pendingTimers: clock.pendingTimers(),
      files: sandbox.snapshotChanges()
    };
  } finally {
    restore();
    sandbox.cleanup();
  }

  return sanitize(transcript, [[sandboxDir, "<TMP>"], [REPO_ROOT, "<REPO>"]]);
}

module.exports = { runScenario, REPO_ROOT, FIXED_NOW };
