const crypto = require("crypto");
const { GAMES, SEARCH_OVERRIDES, SHOPS, VANITY, STEAM_OWNED, DOCKER_PS_OUTPUT } = require("./gamedata");

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function makeResponse(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status: status,
    statusText: "",
    headers: new Map(),
    json() {
      return Promise.resolve().then(() => JSON.parse(text));
    },
    text() {
      return Promise.resolve(text);
    },
    arrayBuffer() {
      const buf = Buffer.from(text);
      return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }
  };
}

function matches(matcher, req) {
  if (typeof matcher === "string") return req.url.includes(matcher);
  if (matcher instanceof RegExp) return matcher.test(req.url);
  if (typeof matcher === "function") return !!matcher(req);
  return false;
}

function grItem(book) {
  return "<item>\n<guid>https://www.goodreads.com/review/show/" + book.id + "</guid>\n" +
    "<title><![CDATA[" + book.title + "]]></title>\n" +
    "<link><![CDATA[https://www.goodreads.com/review/show/" + book.id + "?utm_medium=api]]></link>\n" +
    "<book_id>" + book.id + "</book_id>\n" +
    "<book_image_url><![CDATA[https://img.test/" + book.id + "-s.jpg]]></book_image_url>\n" +
    "<book_large_image_url><![CDATA[https://img.test/" + book.id + "-l.jpg]]></book_large_image_url>\n" +
    "<author_name>" + (book.author || "Someone") + "</author_name>\n" +
    "<user_rating>" + (book.rating === undefined ? 0 : book.rating) + "</user_rating>\n" +
    "<user_read_at><![CDATA[" + (book.readAt || "") + "]]></user_read_at>\n" +
    "<user_date_added><![CDATA[Mon, 01 Jan 2024 00:00:00 -0800]]></user_date_added>\n" +
    "<user_review><![CDATA[" + (book.review || "") + "]]></user_review>\n" +
    "<book><num_pages>" + (book.pages === undefined ? "" : book.pages) + "</num_pages></book>\n" +
    "</item>\n";
}

function grXml(id, shelf, items) {
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\"><channel>\n" +
    "<title>Reader " + id + "'s bookshelf: " + shelf + "</title>\n" + items.map(grItem).join("") + "</channel></rss>\n";
}

const SERVER_PS_OUTPUT = "TheForest|Up 3 hours|0.0.0.0:8766->8766/udp, :::8766->8766/udp, 0.0.0.0:27016->27016/udp|running\n" +
  "SonsOfTheForest|Exited (0) 5 minutes ago||exited\n" +
  "plex|Up 2 days|0.0.0.0:32400->32400/tcp|running\n";

const DAY_MS = 24 * 60 * 60 * 1000;
const ABS_BOOKS = {
  "li-1": { id: "li-1", addedAt: 1700000000000, media: { duration: 36000, metadata: { title: "Dune", authorName: "Frank Herbert" } } },
  "li-2": { id: "li-2", addedAt: 1700000100000, media: { duration: 7200, metadata: { title: "Project Hail Mary", authorName: "Andy Weir" } } },
  "li-3": { id: "li-3", addedAt: 1700000200000, media: { duration: 18000, metadata: { title: "Piranesi", authorName: "Susanna Clarke" } } }
};

function makeAbs() {
  return {
    users: [{ id: "u-1", username: "alicia" }, { id: "u-2", username: "bobby" }, { id: "u-3", username: "carla" }],
    items: JSON.parse(JSON.stringify(ABS_BOOKS)),
    progress: {
      "u-1": [
        { libraryItemId: "li-1", progress: 1, currentTime: 36000, duration: 36000, isFinished: true, finishedAt: Date.UTC(2026, 2, 3), lastUpdate: 1 },
        { libraryItemId: "li-3", progress: 0.4, currentTime: 7200, duration: 18000, isFinished: false, finishedAt: 0, lastUpdate: 5 },
        { libraryItemId: "ep-1", episodeId: "e1", progress: 0.5, isFinished: false, lastUpdate: 9 }
      ],
      "u-2": [
        { libraryItemId: "li-1", progress: 1, currentTime: 36000, duration: 36000, isFinished: true, finishedAt: Date.UTC(2025, 5, 3), lastUpdate: 2 },
        { libraryItemId: "li-2", progress: 1, currentTime: 7200, duration: 7200, isFinished: true, finishedAt: Date.UTC(2026, 4, 3), lastUpdate: 3 }
      ],
      "u-3": []
    },
    listeningDaysAgo: { "u-1": { 1: 7200, 3: 3600, 20: 7200 }, "u-2": { 2: 1800 }, "u-3": {} },
    libraries: [{ id: "lib-1", name: "Audiobooks", mediaType: "book" }, { id: "lib-2", name: "Podcasts", mediaType: "podcast" }]
  };
}

const GR_FEEDS = {
  "1001": {
    read: [
      { id: "11", title: "Dune", author: "Frank Herbert", rating: 5, readAt: "Sat, 13 Sep 2025 00:00:00 -0700", pages: 612 },
      { id: "12", title: "Project Hail Mary", author: "Andy Weir", rating: 4, readAt: "Tue, 01 Jul 2025 00:00:00 -0700", pages: 476 },
      { id: "13", title: "Fish & Chips: A Tale", author: "Pat O'Brien &amp; Co", rating: 0, readAt: "", pages: 120 }
    ],
    "to-read": [
      { id: "21", title: "The Hobbit", author: "J.R.R. Tolkien" },
      { id: "22", title: "Neuromancer", author: "William Gibson" },
      { id: "23", title: "Hyperion", author: "Dan Simmons" }
    ],
    "currently-reading": [
      { id: "31", title: "Children of Time", author: "Adrian Tchaikovsky", pages: 600 },
      { id: "32", title: "Piranesi", author: "Susanna Clarke", pages: 272 }
    ]
  },
  "1002": {
    read: [
      { id: "11", title: "Dune", author: "Frank Herbert", rating: 3, readAt: "Mon, 02 Jun 2025 00:00:00 -0700", pages: 612 },
      { id: "14", title: "Neuromancer", author: "William Gibson", rating: 4, readAt: "Fri, 02 Feb 2024 00:00:00 -0800", pages: 271 }
    ],
    "to-read": [
      { id: "21", title: "The Hobbit", author: "J.R.R. Tolkien" },
      { id: "23", title: "Hyperion", author: "Dan Simmons" },
      { id: "24", title: "Solo Pick", author: "Only Bob" }
    ],
    "currently-reading": []
  },
  "1003": { read: [], "to-read": [{ id: "21", title: "The Hobbit", author: "J.R.R. Tolkien" }], "currently-reading": [] },
  "7777": { needsKey: "SECRETKEY", read: [{ id: "11", title: "Dune", author: "Frank Herbert", rating: 2, readAt: "Mon, 02 Jun 2025 00:00:00 -0700" }], "to-read": [], "currently-reading": [] }
};

class Fixtures {
  constructor(env, readmeText) {
    this.env = env;
    this.readmeText = readmeText;
    this.overrides = [];
    this.sshState = { fail: false, failRestart: false, output: null, serverOutput: null, failTimes: 0, listOutput: null, listFail: false };
    this.recordFullSystem = false;
    this.extraSearch = {};
    this.shops = SHOPS;
    this.goodreads = { feeds: JSON.parse(JSON.stringify(GR_FEEDS)) };
    this.abs = makeAbs();
  }

  on(matcher, responder, options) {
    this.overrides.push({ matcher: matcher, responder: responder, times: options && options.times ? options.times : Infinity });
  }

  fail(matcher, status, body, options) {
    this.on(matcher, () => ({ status: status === undefined ? 500 : status, body: body === undefined ? "fixture failure" : body }), options);
  }

  respond(matcher, body, options) {
    this.on(matcher, () => ({ status: 200, body: body }), options);
  }

  hang(matcher, options) {
    this.on(matcher, () => ({ hang: true }), options);
  }

  networkError(matcher, message, options) {
    this.on(matcher, () => {
      throw new Error(message || "fetch failed");
    }, options);
  }

  clearOverrides() {
    this.overrides = [];
  }

  redact(text) {
    let out = String(text);
    const names = ["ITAD_API_KEY", "STEAM_API_KEY", "TAVILY_API_KEY", "DISCORD_BOT_TOKEN"];
    for (const name of names) {
      const value = this.env[name];
      if (value) out = out.split(value).join("<" + name + ">");
    }
    return out;
  }

  describe(req) {
    const out = { method: req.method, url: this.redact(req.url) };
    if (req.u.host === "api.isthereanydeal.com" && req.u.pathname === "/games/prices/v3") {
      out.body = req.body;
    } else if (req.u.host === "api.tavily.com") {
      const auth = (req.headers && (req.headers.Authorization || req.headers.authorization)) || "";
      out.headers = {
        "Content-Type": req.headers && req.headers["Content-Type"],
        Authorization: auth === "Bearer " + this.env.TAVILY_API_KEY ? "Bearer <TAVILY_API_KEY>" : auth
      };
      out.body = req.body;
      out.hasSignal = !!req.hasSignal;
    } else if (req.u.pathname === "/api/chat") {
      out.hasSignal = !!req.hasSignal;
      out.headers = req.headers;
      out.body = this.describeChat(req.body);
    } else if (req.body !== null && req.body !== undefined) {
      out.body = req.body;
    }
    return out;
  }

  describeChat(body) {
    if (!body || !Array.isArray(body.messages)) return body;
    const messages = body.messages.map((m) => {
      if (m.role !== "system" || typeof m.content !== "string" || m.content.length < 400) {
        return { role: m.role, content: m.content };
      }
      const readme = this.readmeText;
      let head = m.content;
      let tail = "";
      let readmeIncluded = false;
      if (readme) {
        const idx = m.content.indexOf(readme);
        if (idx !== -1) {
          readmeIncluded = true;
          head = m.content.slice(0, idx);
          tail = m.content.slice(idx + readme.length);
        }
      }
      const out = { role: m.role, readmeIncluded: readmeIncluded, headLength: head.length, headSha1: sha1(head), tail: tail };
      if (this.recordFullSystem) out.head = head.split("\n");
      return out;
    });
    return { model: body.model, stream: body.stream, options: body.options, messages: messages };
  }

  async handle(url, init) {
    const u = new URL(url);
    const method = ((init && init.method) || "GET").toUpperCase();
    let body = null;
    if (init && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch (err) {
        body = init.body;
      }
    }
    const req = { method: method, url: String(url), u: u, query: u.searchParams, body: body, headers: (init && init.headers) || null, hasSignal: !!(init && init.signal) };
    const record = this.describe(req);

    for (let i = this.overrides.length - 1; i >= 0; i--) {
      const o = this.overrides[i];
      if (o.times <= 0) continue;
      if (!matches(o.matcher, req)) continue;
      if (o.times !== Infinity) o.times -= 1;
      try {
        const spec = o.responder(req);
        if (spec && spec.hang) {
          record.override = true;
          record.hang = true;
          return { record: record, hang: true, signal: init && init.signal };
        }
        if (spec) {
          record.override = true;
          record.status = spec.status;
          return { record: record, response: makeResponse(spec.status, spec.body) };
        }
      } catch (err) {
        record.override = true;
        record.networkError = err.message;
        return { record: record, error: err };
      }
    }

    let spec;
    try {
      spec = this.route(req);
    } catch (err) {
      record.networkError = err.message;
      return { record: record, error: err };
    }
    record.status = spec.status;
    return { record: record, response: makeResponse(spec.status, spec.body) };
  }

  route(req) {
    const host = req.u.host;
    const p = req.u.pathname;
    if (host === "api.isthereanydeal.com") return this.routeItad(req, p);
    if (host === "store.steampowered.com") return this.routeSteamStore(req);
    if (host === "api.steampowered.com") return this.routeSteamApi(req, p);
    if (p === "/api/chat") return this.routeOllama(req);
    if (host === "api.tavily.com") return this.routeTavily(req);
    if (host === "www.goodreads.com") return this.routeGoodreads(req);
    if (host === "abs.test") return this.routeAbs(req);
    return { status: 404, body: "unmocked " + req.method + " " + req.url };
  }

  routeItad(req, p) {
    if (p === "/games/search/v1") {
      const title = (req.query.get("title") || "").toLowerCase().trim();
      if (title === "searchfail") return { status: 500, body: "search exploded" };
      let ids = this.extraSearch[title] || SEARCH_OVERRIDES[title];
      if (!ids) {
        ids = Object.keys(GAMES).filter((id) => GAMES[id].title.toLowerCase() === title);
      }
      const results = ids.map((id) => ({ id: id, slug: GAMES[id].slug, title: GAMES[id].title, type: "game", mature: false }));
      return { status: 200, body: results.slice(0, 5) };
    }
    if (p === "/games/prices/v3" && req.method === "POST") {
      const ids = Array.isArray(req.body) ? req.body : [];
      const out = [];
      ids.forEach((id) => {
        const g = GAMES[id];
        if (!g || id === "itad-orphan") return;
        out.push({ id: id, historyLow: { all: { amount: 1, amountInt: 100, currency: "USD" } }, deals: g.deals });
      });
      return { status: 200, body: out };
    }
    if (p === "/games/info/v2") {
      const id = req.query.get("id");
      const g = GAMES[id];
      if (!g) return { status: 404, body: "game not found" };
      if (id === "itad-infofail") return { status: 404, body: "game not found" };
      const info = {
        id: g.id,
        slug: g.slug,
        title: g.title,
        type: "game",
        mature: false,
        assets: { boxart: "https://cdn.fixture.test/" + g.slug + "/box.jpg" },
        earlyAccess: false,
        achievements: true,
        tradingCards: false,
        tags: g.tags,
        releaseDate: g.releaseDate,
        developers: [{ id: 1, name: "Fixture Dev" }],
        publishers: [{ id: 2, name: "Fixture Pub" }],
        reviews: [{ score: 90, source: "Steam", count: 1000 }],
        stats: { rank: 100, waitlisted: 10, collected: 20 },
        players: { recent: 1, day: 2, week: 3, peak: 4 }
      };
      if (g.appid) info.appid = g.appid;
      if (g.platforms) info.platforms = g.platforms;
      if (g.urlGame) info.urls = { game: "https://isthereanydeal.com/game/" + g.slug + "/info/" };
      return { status: 200, body: info };
    }
    if (p === "/games/history/v2") {
      const id = req.query.get("id");
      const g = GAMES[id];
      if (!g) return { status: 404, body: "game not found" };
      const since = Date.parse(req.query.get("since"));
      const items = g.history.filter((h) => Date.parse(h.timestamp) >= since);
      return { status: 200, body: items };
    }
    if (p === "/service/shops/v1") {
      return { status: 200, body: this.shops };
    }
    return { status: 404, body: "unmocked itad " + p };
  }

  routeSteamStore(req) {
    if (req.u.pathname !== "/api/appdetails") return { status: 404, body: "unmocked steam store" };
    const appid = req.query.get("appids");
    const filters = req.query.get("filters");
    if (appid === "999001") return { status: 500, body: "steam store error" };
    const g = Object.values(GAMES).find((x) => String(x.appid) === appid);
    const out = {};
    if (!g || !g.steam) {
      out[appid] = { success: false };
      return { status: 200, body: out };
    }
    if (filters === "price_overview") {
      if (!g.steam.price) {
        out[appid] = { success: true, data: [] };
      } else {
        out[appid] = {
          success: true,
          data: {
            price_overview: {
              currency: g.steam.price.currency,
              initial: g.steam.price.initial,
              final: g.steam.price.final,
              discount_percent: g.steam.price.discount_percent
            }
          }
        };
      }
      return { status: 200, body: out };
    }
    const data = {
      type: "game",
      name: g.title,
      steam_appid: g.appid,
      categories: g.steam.categories.map((description, i) => ({ id: i + 1, description: description })),
      platforms: g.steam.platforms
    };
    if (g.steam.header) data.header_image = g.steam.header;
    out[appid] = { success: true, data: data };
    return { status: 200, body: out };
  }

  routeSteamApi(req, p) {
    if (p.startsWith("/ISteamUser/ResolveVanityURL")) {
      const vanity = req.query.get("vanityurl");
      if (vanity === "vanityerror") return { status: 500, body: "steam down" };
      if (VANITY[vanity]) return { status: 200, body: { response: { success: 1, steamid: VANITY[vanity] } } };
      return { status: 200, body: { response: { success: 42, message: "No match" } } };
    }
    if (p.startsWith("/IPlayerService/GetOwnedGames")) {
      const steamid = req.query.get("steamid");
      const owned = STEAM_OWNED[steamid];
      if (owned === "error") return { status: 403, body: "forbidden" };
      if (owned === undefined || owned === null) return { status: 200, body: { response: {} } };
      return { status: 200, body: { response: { game_count: owned.length, games: owned } } };
    }
    return { status: 404, body: "unmocked steam api" };
  }

  routeOllama(req) {
    const messages = (req.body && req.body.messages) || [];
    const first = messages[0] && messages[0].content;
    if (typeof first === "string" && first.startsWith("You only ever reply with a single emoji")) {
      const prompt = messages[messages.length - 1].content;
      const m = prompt.match(/video game "(.*)"\.$/);
      const title = m ? m[1] : "";
      const table = {
        Hades: "🔥",
        Celeste: "🍓",
        "Elden Ring": "💍",
        Terraria: "⚔️",
        "Stardew Valley": "Definitely 🌾 for this one",
        "Hollow Knight": "ERROR",
        "Minecraft Legends": "I would pick a pickaxe but I cannot choose",
        "Pattern Early Game": "🧙‍♂️"
      };
      const answer = table[title];
      if (answer === "ERROR") return { status: 500, body: "ollama emoji failure" };
      if (answer === undefined) return { status: 200, body: { message: { role: "assistant", content: "🎮" } } };
      return { status: 200, body: { message: { role: "assistant", content: answer } } };
    }

    if (typeof first === "string" && first.startsWith("You identify which PC video game")) {
      const asked = String(messages[messages.length - 1].content).toLowerCase();
      if (asked.includes("[[game-throw]]")) throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      if (asked.includes("[[game-500]]")) return { status: 500, body: "ollama exploded" };
      const table = [
        ["elden ring", "Elden Ring"],
        ["dead by daylight", "Dead by Daylight"],
        ["[[game-nonsense]]", "Zzzz Not A Real Game Qqqq"],
        ["[[game-long]]", "x".repeat(80)]
      ];
      const hit = table.find((row) => asked.includes(row[0]));
      return { status: 200, body: { message: { role: "assistant", content: hit ? hit[1] : "NONE" } } };
    }

    if (typeof first === "string" && first.startsWith("You pick the mood")) {
      const said = String(messages[messages.length - 1].content);
      if (said.includes("brokenmood")) return { status: 500, body: "mood exploded" };
      if (said.includes("weirdest")) return { status: 200, body: { message: { role: "assistant", content: "bananas" } } };
      if (said.includes(" 0 earlier lines")) return { status: 200, body: { message: { role: "assistant", content: "Happy." } } };
      return { status: 200, body: { message: { role: "assistant", content: "I would say sad" } } };
    }

    const last = messages.length > 0 ? String(messages[messages.length - 1].content) : "";
    if (last.includes("[[mood-weird]]")) {
      return { status: 200, body: { message: { role: "assistant", content: "I am feeling the weirdest thing today." } } };
    }
    if (last.includes("[[mood-broken]]")) {
      return { status: 200, body: { message: { role: "assistant", content: "This one has brokenmood in it." } } };
    }
    if (last.includes("[[ollama-500]]")) return { status: 500, body: "ollama exploded" };
    if (last.includes("[[ollama-throw]]")) throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
    if (last.includes("[[ollama-empty]]")) return { status: 200, body: { message: { role: "assistant", content: "" } } };
    if (last.includes("[[ollama-nomessage]]")) return { status: 200, body: {} };
    if (last.includes("[[stage]]")) {
      return {
        status: 200,
        body: { message: { role: "assistant", content: "*whirrs* Sure thing, buddy. Beep boop. Here is a second line! Is this the third one? A fourth sentence should be cut." } }
      };
    }
    if (last.includes("[[selfname]]")) {
      return { status: 200, body: { message: { role: "assistant", content: "Oh my glob, I can't help with that, BMO. BMO, here is another line. Well, BMO, this is the last one. I am BMO and that stays." } } };
    }
    if (last.includes("[[incomplete]]")) {
      return { status: 200, body: { message: { role: "assistant", content: "I love that game so much. It is really fun and the" } } };
    }
    if (last.includes("[[nopunct]]")) {
      return { status: 200, body: { message: { role: "assistant", content: "no punctuation at all here" } } };
    }

    const system = String((messages[0] && messages[0].content) || "");
    const tailStart = system.lastIndexOf("\n\nYou are talking with ");
    const tail = tailStart === -1 ? "" : system.slice(tailStart);
    const nameMatch = tail.match(/You are talking with (.*?) right now\./);
    const name = nameMatch ? nameMatch[1] : "nobody";
    const factsIdx = tail.indexOf("Permanent facts Discord members have taught you");
    const facts = factsIdx === -1 ? 0 : tail.slice(factsIdx).split("\n- ").length - 1;
    let context = "none";
    messages.forEach((m) => {
      if (typeof m.content === "string" && m.content.includes("already looked up for you")) context = "answer";
      if (typeof m.content === "string" && m.content.includes("Here are live search results")) context = "results";
    });
    const nonSystem = messages.filter((m) => m.role !== "system").length;
    const earlier = nonSystem - 1 - (context === "none" ? 0 : 2);
    return {
      status: 200,
      body: { message: { role: "assistant", content: "Hey " + name + "! I see " + earlier + " earlier lines, " + facts + " shared facts, and context " + context + "." } }
    };
  }

  routeAbs(req) {
    const auth = req.headers && (req.headers.Authorization || req.headers.authorization);
    if (auth !== "Bearer tok-secret") return { status: 401, body: "unauthorized" };
    const p = req.u.pathname;
    const abs = this.abs;
    if (p === "/api/users") return { status: 200, body: { users: abs.users } };
    let m = p.match(/^\/api\/users\/([^/]+)\/listening-stats$/);
    if (m) {
      const spec = abs.listeningDaysAgo[m[1]];
      if (!spec) return { status: 404, body: "no user" };
      const days = {};
      let total = 0;
      Object.keys(spec).forEach((ago) => {
        days[new Date(Date.now() - Number(ago) * DAY_MS).toISOString().slice(0, 10)] = spec[ago];
        total += spec[ago];
      });
      return { status: 200, body: { days: days, totalTime: total } };
    }
    m = p.match(/^\/api\/users\/([^/]+)$/);
    if (m) {
      if (!abs.progress[m[1]]) return { status: 404, body: "no user" };
      return { status: 200, body: { id: m[1], mediaProgress: abs.progress[m[1]] } };
    }
    m = p.match(/^\/api\/items\/([^/]+)\/cover$/);
    if (m) return abs.items[m[1]] ? { status: 200, body: "JPEGDATA" } : { status: 404, body: "no cover" };
    m = p.match(/^\/api\/items\/([^/]+)$/);
    if (m) return abs.items[m[1]] ? { status: 200, body: abs.items[m[1]] } : { status: 404, body: "no item" };
    if (p === "/api/libraries") return { status: 200, body: { libraries: abs.libraries } };
    m = p.match(/^\/api\/libraries\/([^/]+)\/items$/);
    if (m) {
      const list = m[1] === "lib-1" ? Object.values(abs.items).sort((a, b) => b.addedAt - a.addedAt) : [];
      const size = Number(req.query.get("limit")) || 10;
      const page = Number(req.query.get("page")) || 0;
      return { status: 200, body: { results: list.slice(page * size, (page + 1) * size) } };
    }
    m = p.match(/^\/api\/libraries\/([^/]+)\/search$/);
    if (m) {
      const q = (req.query.get("q") || "").toLowerCase();
      const hits = m[1] === "lib-1" ? Object.values(abs.items).filter((item) => item.media.metadata.title.toLowerCase().includes(q)) : [];
      return { status: 200, body: { book: hits.map((item) => ({ libraryItem: item })) } };
    }
    return { status: 404, body: "unmocked abs path" };
  }

  routeGoodreads(req) {
    const match = req.u.pathname.match(/^\/review\/list_rss\/(\d+)$/);
    if (!match) return { status: 404, body: "unmocked goodreads path" };
    const id = match[1];
    if (id === "9600") throw new Error("getaddrinfo ENOTFOUND www.goodreads.com");
    if (id === "9500") return { status: 200, body: "<html><body>Please sign in</body></html>" };
    const feed = this.goodreads.feeds[id];
    if (!feed) return { status: 404, body: "not found" };
    if (feed.needsKey && req.query.get("key") !== feed.needsKey) return { status: 403, body: "forbidden" };
    const shelf = req.query.get("shelf") || "read";
    const all = feed[shelf] || [];
    const page = Number(req.query.get("page")) || 1;
    const lengths = feed.pageLengths || [];
    let start = 0;
    for (let n = 1; n < page; n++) start += lengths[n - 1] || 100;
    const items = all.slice(start, start + (lengths[page - 1] || 100));
    return { status: 200, body: grXml(id, shelf, items) };
  }

  routeTavily(req) {
    const query = (req.body && req.body.query) || "";
    if (query.includes("[[tavily-500]]")) return { status: 500, body: "tavily exploded" };
    if (query.includes("[[tavily-throw]]")) throw new Error("getaddrinfo ENOTFOUND api.tavily.com");
    if (query.includes("[[tavily-none]]")) return { status: 200, body: { results: [] } };
    if (query.includes("[[tavily-answer]]")) {
      return {
        status: 200,
        body: {
          answer: "The <b>key card</b> is inside the bunker. Head north from the lake. Then follow the road east. This fourth sentence gets capped.",
          results: [{ title: "Key card guide", content: "Bunker key card location", url: "https://mapgenie.io/the-forest/maps/world" }]
        }
      };
    }
    return {
      status: 200,
      body: {
        answer: null,
        results: [
          { title: "<b>The Forest</b> Interactive Map", content: "The <i>key card</i> sits in the bunker near the lake.", url: "https://mapgenie.io/the-forest/maps/world" },
          { title: "Second result", content: "Another page about the same thing.", url: "https://example.test/second" },
          { title: "Third result", content: "Yet another page.", url: "https://example.test/third" },
          { title: "Fourth result", content: "Fourth page.", url: "https://example.test/fourth" },
          { title: "Fifth result", content: "Fifth page.", url: "https://example.test/fifth" },
          { title: "Sixth result", content: "Sixth page that is sliced off.", url: "https://example.test/sixth" }
        ]
      }
    };
  }

  async runSsh(file, args, options) {
    const state = this.sshState;
    const remote = args[args.length - 1];
    if (file === "bash") {
      if (state.listFail || state.listOutput === null) throw new Error("bash failed");
      return { stdout: state.listOutput, stderr: "" };
    }
    if (state.fail) {
      if (state.failTimes > 0) {
        state.failTimes -= 1;
        if (state.failTimes === 0) state.fail = false;
      }
      throw new Error("ssh: connect to host " + this.env.DOCKER_SSH_HOST + " port 22: Connection timed out");
    }
    if (state.failRestart && String(remote).startsWith("docker 'restart'")) {
      throw new Error("Command failed: ssh restart");
    }
    if (String(remote).includes("{{.Ports}}")) {
      return { stdout: state.serverOutput === null ? SERVER_PS_OUTPUT : state.serverOutput, stderr: "" };
    }
    if (String(remote).startsWith("docker 'ps'")) {
      return { stdout: state.output === null ? DOCKER_PS_OUTPUT : state.output, stderr: "" };
    }
    if (String(remote).startsWith("docker 'restart'")) {
      const m = String(remote).match(/^docker 'restart' '(.*)'$/);
      return { stdout: (m ? m[1] : "") + "\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }
}

module.exports = { Fixtures, makeResponse, sha1 };
