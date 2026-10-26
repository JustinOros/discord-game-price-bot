const { EventEmitter } = require("events");
const util = require("util");

function createDiscordModule(world, realDiscord) {
  class Client extends EventEmitter {
    constructor(options) {
      super();
      world.client = this;
      world.clientOptions = options;
      this.options = options;
      this.user = world.botUser;
      this.guilds = { cache: world.guilds };
      this.channels = {
        cache: world.channelRegistry,
        fetch(id) {
          world.rec.push("ops", { op: "client.channels.fetch", id: id });
          if (world.shouldFail("channelFetch")) return Promise.reject(new Error("Missing Access"));
          const channel = world.channelRegistry.get(id);
          if (!channel) return Promise.reject(new Error("Unknown Channel"));
          return Promise.resolve(channel);
        }
      };
      this.registrations = [];
      this.inOnce = false;
    }

    on(event, fn) {
      if (this.inOnce) return super.on(event, fn);
      this.registrations.push({ method: "on", event: event });
      return super.on(event, world.trackHandler(fn));
    }

    once(event, fn) {
      this.registrations.push({ method: "once", event: event });
      this.inOnce = true;
      try {
        return super.once(event, world.trackHandler(fn));
      } finally {
        this.inOnce = false;
      }
    }

    addListener(event, fn) {
      this.registrations.push({ method: "addListener", event: event });
      return super.addListener(event, world.trackHandler(fn));
    }

    login(token) {
      world.rec.push("ops", { op: "client.login", token: token });
      if (world.shouldFail("login")) return Promise.reject(new Error("An invalid token was provided."));
      return Promise.resolve(token);
    }

    destroy() {
      world.rec.push("ops", { op: "client.destroy" });
      return Promise.resolve();
    }
  }

  const fake = {
    Client: Client,
    Collection: require("./world").Collection,
    GatewayIntentBits: realDiscord.GatewayIntentBits,
    Partials: realDiscord.Partials,
    MessageFlags: realDiscord.MessageFlags,
    GuildScheduledEventStatus: realDiscord.GuildScheduledEventStatus,
    ButtonStyle: realDiscord.ButtonStyle,
    ComponentType: realDiscord.ComponentType,
    PermissionFlagsBits: realDiscord.PermissionFlagsBits,
    Events: realDiscord.Events,
    EmbedBuilder: realDiscord.EmbedBuilder,
    ActionRowBuilder: realDiscord.ActionRowBuilder,
    ButtonBuilder: realDiscord.ButtonBuilder,
    StringSelectMenuBuilder: realDiscord.StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder: realDiscord.StringSelectMenuOptionBuilder
  };

  return new Proxy(fake, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return realDiscord[prop];
    }
  });
}

function createCronModule(world) {
  return {
    schedule(expression, fn, options) {
      world.cronJobs.push({ expression: expression, fn: fn });
      world.rec.push("registration", { cron: expression, options: options === undefined ? null : options });
      return {
        start() {},
        stop() {},
        destroy() {}
      };
    },
    validate() {
      return true;
    }
  };
}

function createChildProcessModule(world, runSsh) {
  function execFile(file, args, options, callback) {
    let argv = args;
    let opts = options;
    let cb = callback;
    if (typeof argv === "function") {
      cb = argv;
      argv = [];
      opts = undefined;
    } else if (typeof opts === "function") {
      cb = opts;
      opts = undefined;
    }
    const promise = runSsh(file, argv || [], opts);
    if (typeof cb === "function") {
      promise.then(
        (result) => cb(null, result.stdout, result.stderr),
        (err) => cb(err, "", "")
      );
    }
    return { pid: 0, kill() {}, on() {}, stdout: null, stderr: null };
  }
  execFile[util.promisify.custom] = (file, args, options) => runSsh(file, args || [], options);

  function blocked(name) {
    return function blockedCall() {
      throw new Error("child_process." + name + " is not stubbed by the test harness");
    };
  }

  return {
    execFile: execFile,
    exec: blocked("exec"),
    execSync: blocked("execSync"),
    execFileSync: blocked("execFileSync"),
    spawn: blocked("spawn"),
    spawnSync: blocked("spawnSync"),
    fork: blocked("fork")
  };
}

function infoResponse(spec) {
  const text = (value) => Buffer.concat([Buffer.from(value, "utf8"), Buffer.from([0])]);
  return Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 17]),
    text(spec.name || "Server"), text("map"), text("folder"), text("game"),
    Buffer.from([0, 0, spec.players, spec.max, 0])
  ]);
}

function createDgramModule(world) {
  function createSocket() {
    const socket = new EventEmitter();
    socket.close = () => {};
    socket.send = (buffer, port, host, callback) => {
      const key = host + ":" + port;
      const spec = (world.a2s || {})[key];
      world.a2sLog = world.a2sLog || [];
      world.a2sLog.push(key + (buffer.length > 25 ? " challenge" : ""));
      if (typeof callback === "function") callback(null);
      setImmediate(() => {
        if (!spec) {
          socket.emit("error", new Error("ECONNREFUSED"));
          return;
        }
        if (spec.challenge && buffer.length <= 25) {
          socket.emit("message", Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41, 1, 2, 3, 4]));
          return;
        }
        socket.emit("message", infoResponse(spec));
      });
    };
    return socket;
  }
  return { createSocket: createSocket };
}

module.exports = { createDiscordModule, createCronModule, createChildProcessModule, createDgramModule };
