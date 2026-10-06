const { EventEmitter } = require("events");

class Collection extends Map {
  find(fn) {
    for (const [k, v] of this) {
      if (fn(v, k, this)) return v;
    }
    return undefined;
  }
  filter(fn) {
    const out = new Collection();
    for (const [k, v] of this) {
      if (fn(v, k, this)) out.set(k, v);
    }
    return out;
  }
  map(fn) {
    return Array.from(this, ([k, v]) => fn(v, k, this));
  }
  some(fn) {
    for (const [k, v] of this) {
      if (fn(v, k, this)) return true;
    }
    return false;
  }
  every(fn) {
    for (const [k, v] of this) {
      if (!fn(v, k, this)) return false;
    }
    return true;
  }
  first() {
    for (const v of this.values()) return v;
    return undefined;
  }
  toJSON() {
    return Array.from(this.keys());
  }
}

function norm(payload) {
  if (typeof payload === "string") return { content: payload };
  if (payload === undefined || payload === null) return payload;
  return JSON.parse(JSON.stringify(payload));
}

class World {
  constructor(rec, clock) {
    this.rec = rec;
    this.clock = clock;
    this.counters = { msg: 0, sent: 0, role: 0, interaction: 0 };
    this.guilds = new Collection();
    this.channelRegistry = new Map();
    this.users = {};
    this.client = null;
    this.clientOptions = null;
    this.cronJobs = [];
    this.processHandlers = {};
    this.pending = new Set();
    this.failures = new Map();
    this.botUser = { id: "BOT-1", tag: "GamePriceBot#0001", username: "GamePriceBot", bot: true };
  }

  failNext(kind, count) {
    this.failures.set(kind, count === undefined ? 1 : count);
  }

  clearFailures() {
    this.failures.clear();
  }

  shouldFail(kind) {
    const left = this.failures.get(kind);
    if (!left) return false;
    if (typeof left === "object") {
      if (left.skip > 0) {
        left.skip -= 1;
        return false;
      }
      if (left.count <= 0) return false;
      if (left.count !== Infinity) left.count -= 1;
      return true;
    }
    if (left !== Infinity) this.failures.set(kind, left - 1);
    return true;
  }

  trackHandler(fn) {
    const world = this;
    return function wrapped(...args) {
      let result;
      try {
        result = fn.apply(this, args);
      } catch (err) {
        world.handlerError(err);
        return undefined;
      }
      if (result && typeof result.then === "function") {
        const p = result.then(
          () => {},
          (err) => world.handlerError(err)
        );
        world.pending.add(p);
        p.then(() => world.pending.delete(p));
      }
      return undefined;
    };
  }

  handlerError(err) {
    this.rec.push("unhandled", { message: err && err.message ? err.message : String(err) });
    const handler = this.processHandlers.unhandledRejection;
    if (handler) handler(err, null);
  }

  addUser(key, spec) {
    const user = {
      id: spec.id,
      bot: !!spec.bot,
      username: spec.username,
      globalName: spec.globalName === undefined ? null : spec.globalName,
      displayName: spec.displayName === undefined ? spec.username : spec.displayName
    };
    this.users[key] = user;
    return user;
  }

  addGuild(spec) {
    const guild = new FakeGuild(this, spec);
    this.guilds.set(guild.id, guild);
    return guild;
  }

  dmChannel(user) {
    const id = "DM-" + user.id;
    let channel = this.channelRegistry.get(id);
    if (!channel) {
      channel = new FakeChannel(this, { id: id, name: null, guild: null, dm: true });
    }
    return channel;
  }

  nextMessageId() {
    this.counters.msg += 1;
    return "M-" + this.counters.msg;
  }

  createMessage(opts) {
    const user = opts.user;
    const guild = opts.guild || null;
    const channel = guild ? opts.channel : this.dmChannel(user);
    let member = null;
    if (guild) {
      member = opts.member !== undefined ? opts.member : guild.members.cache.get(user.id) || null;
    }
    const message = new FakeMessage(this, {
      id: opts.id || this.nextMessageId(),
      content: opts.content,
      user: user,
      guild: guild,
      member: member,
      channel: channel,
      reference: opts.reference || null,
      referenceRaw: opts.referenceRaw
    });
    channel.store.set(message.id, message);
    return message;
  }

  createInteraction(opts) {
    this.counters.interaction += 1;
    return new FakeInteraction(this, "I-" + this.counters.interaction, opts);
  }
}

class FakeChannel {
  constructor(world, spec) {
    this.world = world;
    this.id = spec.id;
    this.name = spec.name;
    this.guild = spec.guild || null;
    this.textBased = spec.textBased !== false;
    this.dm = !!spec.dm;
    this.store = new Map();
    world.channelRegistry.set(this.id, this);
    const channel = this;
    this.messages = {
      fetch(id) {
        const found = channel.store.get(id);
        if (!found) return Promise.reject(new Error("Unknown Message"));
        return Promise.resolve(found);
      }
    };
  }

  isTextBased() {
    return this.textBased;
  }

  isDMBased() {
    return this.dm;
  }

  sendTyping() {
    this.world.rec.push("outgoing", { via: "channel.sendTyping", channel: this.id });
    return Promise.resolve();
  }

  send(payload) {
    const entry = { via: "channel.send", channel: this.id, payload: norm(payload) };
    if (this.world.shouldFail("send")) {
      entry.failed = true;
      this.world.rec.push("outgoing", entry);
      return Promise.reject(new Error("Missing Permissions"));
    }
    this.world.rec.push("outgoing", entry);
    return Promise.resolve(this.world.makeSent(this, payload));
  }
}

World.prototype.makeSent = function makeSent(channel, payload) {
  this.counters.sent += 1;
  const normalized = norm(payload);
  const sent = new FakeSentMessage(this, "S-" + this.counters.sent, channel, normalized);
  channel.store.set(sent.id, sent);
  this.lastSent = sent;
  return sent;
};

class FakeSentMessage {
  constructor(world, id, channel, payload) {
    this.world = world;
    this.id = id;
    this.channel = channel;
    this.channelId = channel.id;
    this.guild = channel.guild;
    this.author = world.botUser;
    this.content = payload && payload.content !== undefined ? payload.content : "";
    this.reference = null;
  }

  edit(payload) {
    this.world.rec.push("outgoing", { via: "sent.edit", message: this.id, payload: norm(payload) });
    return Promise.resolve(this);
  }

  delete() {
    this.world.rec.push("outgoing", { via: "sent.delete", message: this.id });
    return Promise.resolve(this);
  }

  react(emoji) {
    this.world.rec.push("outgoing", { via: "sent.react", message: this.id, emoji: emoji });
    return Promise.resolve();
  }

  reply(payload) {
    this.world.rec.push("outgoing", { via: "sent.reply", message: this.id, payload: norm(payload) });
    return Promise.resolve(this.world.makeSent(this.channel, payload));
  }
}

class FakeMessage {
  constructor(world, spec) {
    this.world = world;
    this.id = spec.id;
    this.content = spec.content;
    this.author = {
      id: spec.user.id,
      bot: spec.user.bot,
      username: spec.user.username,
      globalName: spec.user.globalName
    };
    this.guild = spec.guild;
    this.member = spec.member;
    this.channel = spec.channel;
    this.channelId = spec.channel.id;
    if (spec.referenceRaw !== undefined) this.reference = spec.referenceRaw;
    else this.reference = spec.reference ? { messageId: spec.reference } : null;
    this.client = world.client;
  }

  reply(payload) {
    const entry = { via: "message.reply", to: this.id, payload: norm(payload) };
    if (this.world.shouldFail("reply")) {
      entry.failed = true;
      this.world.rec.push("outgoing", entry);
      return Promise.reject(new Error("Cannot send messages to this user"));
    }
    this.world.rec.push("outgoing", entry);
    return Promise.resolve(this.world.makeSent(this.channel, payload));
  }

  react(emoji) {
    this.world.rec.push("outgoing", { via: "message.react", to: this.id, emoji: emoji });
    return Promise.resolve();
  }

  delete() {
    this.world.rec.push("outgoing", { via: "message.delete", to: this.id });
    return Promise.resolve(this);
  }
}

class FakeMemberRoles {
  constructor(member) {
    this.member = member;
    this.cache = new Collection();
    this.pending = [];
  }

  resolveRole(roleId) {
    const guild = this.member.guild;
    return guild.roles.cache.get(roleId) || { id: roleId, name: "unknown-" + roleId };
  }

  apply(op, roleId) {
    if (op === "add") this.cache.set(roleId, this.resolveRole(roleId));
    else this.cache.delete(roleId);
  }

  mutate(op, roleId) {
    const world = this.member.world;
    const kind = op === "add" ? "roleAdd" : "roleRemove";
    const entry = { op: "member.roles." + op, guild: this.member.guild.id, member: this.member.id, roleId: roleId };
    if (world.shouldFail(kind) || this.member.guild.shouldFailRoleOps) {
      entry.failed = true;
      world.rec.push("ops", entry);
      return Promise.reject(new Error("Missing Permissions"));
    }
    if (this.member.lag) {
      entry.cacheLag = true;
      this.pending.push([op, roleId]);
    } else {
      this.apply(op, roleId);
    }
    world.rec.push("ops", entry);
    return Promise.resolve(this.member);
  }

  add(roleId) {
    return this.mutate("add", roleId);
  }

  remove(roleId) {
    return this.mutate("remove", roleId);
  }

  flushLag() {
    for (const [op, roleId] of this.pending) this.apply(op, roleId);
    this.pending = [];
  }
}

class FakeMember {
  constructor(world, guild, user, spec) {
    this.world = world;
    this.guild = guild;
    this.id = user.id;
    this.user = { id: user.id, username: user.username, globalName: user.globalName, bot: user.bot };
    this.displayName = spec && spec.displayName !== undefined ? spec.displayName : user.displayName;
    this.lag = !!(spec && spec.lag);
    this.roles = new FakeMemberRoles(this);
    guild.registerMember(this, spec);
  }

  toString() {
    return "<@" + this.id + ">";
  }
}

class FakeRole {
  constructor(world, guild, spec) {
    this.world = world;
    this.guild = guild;
    this.id = spec.id;
    this.name = spec.name;
    this.unicodeEmoji = spec.unicodeEmoji === undefined ? null : spec.unicodeEmoji;
    this.mentionable = spec.mentionable === undefined ? true : spec.mentionable;
  }

  get members() {
    return this.guild.members.cache.filter((m) => m.roles.cache.has(this.id));
  }

  toString() {
    return "<@&" + this.id + ">";
  }

  edit(options) {
    const entry = { op: "role.edit", guild: this.guild.id, role: this.id, options: norm(options) };
    if (this.world.shouldFail("roleEdit")) {
      entry.failed = true;
      this.world.rec.push("ops", entry);
      return Promise.reject(new Error("Guild lacks the feature for role icons"));
    }
    this.world.rec.push("ops", entry);
    if (options.name !== undefined) this.name = options.name;
    if (options.unicodeEmoji !== undefined) this.unicodeEmoji = options.unicodeEmoji;
    return Promise.resolve(this);
  }

  setName(name) {
    const entry = { op: "role.setName", guild: this.guild.id, role: this.id, name: name };
    if (this.world.shouldFail("roleSetName")) {
      entry.failed = true;
      this.world.rec.push("ops", entry);
      return Promise.reject(new Error("Missing Permissions"));
    }
    this.world.rec.push("ops", entry);
    this.name = name;
    return Promise.resolve(this);
  }
}

class FakeGuild {
  constructor(world, spec) {
    this.world = world;
    this.id = spec.id;
    this.name = spec.name;
    this.memberCount = spec.memberCount;
    this.fetchableMembers = new Map();
    this.eventList = [];
    const guild = this;
    this.members = {
      cache: new Collection(),
      fetch(arg) {
        const entry = { op: "guild.members.fetch", guild: guild.id };
        if (typeof arg === "string") entry.id = arg;
        world.rec.push("ops", entry);
        if (world.shouldFail("membersFetch")) return Promise.reject(new Error("Members didn't arrive in time."));
        if (typeof arg === "string") {
          const cached = guild.members.cache.get(arg);
          if (cached) return Promise.resolve(cached);
          const fetchable = guild.fetchableMembers.get(arg);
          if (fetchable) {
            guild.members.cache.set(arg, fetchable);
            return Promise.resolve(fetchable);
          }
          return Promise.reject(new Error("Unknown Member"));
        }
        return Promise.resolve(guild.members.cache);
      }
    };
    this.roles = {
      cache: new Collection(),
      create(options) {
        const entry = { op: "guild.roles.create", guild: guild.id, options: norm(options) };
        const nativeIcon = options.unicodeEmoji !== undefined;
        if (world.shouldFail("roleCreate") || (nativeIcon && world.shouldFail("roleCreateNative"))) {
          entry.failed = true;
          world.rec.push("ops", entry);
          return Promise.reject(new Error(nativeIcon ? "This server needs more boosts to use role icons" : "Missing Permissions"));
        }
        world.counters.role += 1;
        const role = new FakeRole(world, guild, {
          id: "ROLE-" + world.counters.role,
          name: options.name,
          unicodeEmoji: options.unicodeEmoji,
          mentionable: options.mentionable
        });
        guild.roles.cache.set(role.id, role);
        entry.createdId = role.id;
        world.rec.push("ops", entry);
        return Promise.resolve(role);
      },
      fetch(id) {
        world.rec.push("ops", { op: "guild.roles.fetch", guild: guild.id, id: id });
        if (id === undefined) return Promise.resolve(guild.roles.cache);
        return Promise.resolve(guild.roles.cache.get(id) || null);
      }
    };
    this.channels = { cache: new Collection() };
    this.scheduledEvents = {
      fetch() {
        world.rec.push("ops", { op: "scheduledEvents.fetch", guild: guild.id });
        if (world.shouldFail("eventsFetch")) return Promise.reject(new Error("Missing Access"));
        const out = new Collection();
        guild.eventList.forEach((e) => out.set(e.id, e));
        return Promise.resolve(out);
      }
    };
  }

  registerMember(member, spec) {
    this.members.cache.set(member.id, member);
    if (spec && spec.roleIds) {
      spec.roleIds.forEach((roleId) => member.roles.apply("add", roleId));
    }
  }

  addRole(spec) {
    const role = new FakeRole(this.world, this, spec);
    this.roles.cache.set(role.id, role);
    return role;
  }

  addChannel(spec) {
    const channel = new FakeChannel(this.world, Object.assign({}, spec, { guild: this }));
    this.channels.cache.set(channel.id, channel);
    return channel;
  }

  addMember(user, spec) {
    return new FakeMember(this.world, this, user, spec);
  }

  addFetchableMember(user, spec) {
    const member = new FakeMember(this.world, this, user, Object.assign({}, spec, { hidden: true }));
    this.members.cache.delete(member.id);
    this.fetchableMembers.set(member.id, member);
    return member;
  }

  addEvent(spec) {
    this.eventList.push(spec);
    return spec;
  }

  toString() {
    return this.name;
  }
}

class FakeInteraction {
  constructor(world, id, opts) {
    this.world = world;
    this.id = id;
    this.kind = opts.kind;
    this.customId = opts.customId;
    this.values = opts.values || [];
    this.user = opts.user;
    this.member = opts.member || null;
    this.guild = opts.guild || null;
    this.message = opts.message || null;
    this.channelId = opts.message && opts.message.channelId ? opts.message.channelId : null;
    this.deferred = false;
    this.replied = false;
  }

  isButton() {
    return this.kind === "button";
  }

  isStringSelectMenu() {
    return this.kind === "select";
  }

  isAnySelectMenu() {
    return this.kind === "select";
  }

  isMessageComponent() {
    return this.kind === "button" || this.kind === "select";
  }

  isChatInputCommand() {
    return this.kind === "command";
  }

  isCommand() {
    return this.kind === "command";
  }

  isModalSubmit() {
    return false;
  }

  isAutocomplete() {
    return false;
  }

  record(via, kind, payload) {
    const entry = { via: "interaction." + via, interaction: this.id };
    if (payload !== undefined) entry.payload = norm(payload);
    if (this.world.shouldFail(kind)) {
      entry.failed = true;
      this.world.rec.push("outgoing", entry);
      return Promise.reject(new Error("Unknown Interaction"));
    }
    this.world.rec.push("outgoing", entry);
    return Promise.resolve(undefined);
  }

  deferUpdate() {
    this.deferred = true;
    return this.record("deferUpdate", "deferUpdate");
  }

  reply(payload) {
    this.replied = true;
    return this.record("reply", "interactionReply", payload);
  }

  update(payload) {
    return this.record("update", "interactionUpdate", payload);
  }

  editReply(payload) {
    return this.record("editReply", "editReply", payload);
  }

  followUp(payload) {
    return this.record("followUp", "followUp", payload);
  }
}

module.exports = { World, Collection, FakeChannel, FakeGuild, FakeMember, FakeRole, FakeMessage, FakeInteraction, norm, EventEmitter };
