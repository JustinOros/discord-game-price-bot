const SHOP_IDS = {
  Steam: 61,
  GOG: 35,
  "Humble Store": 37,
  Fanatical: 6,
  GreenManGaming: 52,
  Gamesplanet: 26,
  GamersGate: 24,
  Voidu: 83,
  "2Game": 4,
  Kinguin: 36,
  Eneba: 88,
  DLGamer: 21,
  "Microsoft Store": 48,
  "Bulk Store": 99
};

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function money(cents) {
  return { amount: cents / 100, amountInt: cents, currency: "USD" };
}

function deal(gameId, shop, price, regular, cut, expiry) {
  return {
    shop: { id: SHOP_IDS[shop] || 1, name: shop },
    price: money(price),
    regular: money(regular),
    cut: cut,
    voucher: null,
    storeLow: money(Math.max(1, price - 100)),
    flag: null,
    drm: [{ id: 61, name: "Steam" }],
    platforms: [{ id: 1, name: "Windows" }],
    timestamp: "2026-10-05T08:00:00+00:00",
    expiry: expiry || null,
    url: "https://itad.link/" + slug(shop) + "/" + gameId
  };
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function isoPlus(date) {
  return date.toISOString().split(".")[0] + "+00:00";
}

function hist(shop, price, regular, cut, timestamp) {
  return {
    timestamp: timestamp,
    shop: { id: SHOP_IDS[shop] || 1, name: shop },
    deal: { price: money(price), regular: money(regular), cut: cut }
  };
}

function histEnd(shop, timestamp) {
  return { timestamp: timestamp, shop: { id: SHOP_IDS[shop] || 1, name: shop }, deal: null };
}

function build() {
  const games = {};

  function add(id, def) {
    games[id] = Object.assign({ id: id, slug: slug(def.title), deals: [], history: [], tags: [], platforms: null, appid: null, releaseDate: null, steam: null, urlGame: true }, def);
  }

  add("itad-hades", {
    title: "Hades",
    appid: 1145360,
    releaseDate: "2020-09-17",
    tags: ["Singleplayer", "Action", "Roguelike"],
    platforms: [{ id: 1, name: "Windows" }, { id: 2, name: "Mac" }],
    deals: [
      deal("itad-hades", "Steam", 1999, 2499, 20),
      deal("itad-hades", "GOG", 1599, 2499, 36, "2026-10-08T12:00:00+00:00"),
      deal("itad-hades", "Humble Store", 1799, 2499, 28, "2026-10-06T20:00:00+00:00"),
      deal("itad-hades", "Fanatical", 1699, 2499, 32)
    ],
    steam: {
      categories: ["Single-player", "Steam Achievements", "Full controller support"],
      platforms: { windows: true, mac: true, linux: false },
      header: "https://cdn.fixture.test/hades/header.jpg",
      price: { currency: "USD", initial: 2499, final: 1499, discount_percent: 40 }
    },
    history: [
      hist("GOG", 1999, 2499, 20, "2022-06-23T14:00:00+00:00"),
      hist("Steam", 1499, 2499, 40, "2022-11-24T18:00:00+00:00"),
      hist("Steam", 1749, 2499, 30, "2023-06-22T17:00:00+00:00"),
      hist("Steam", 1499, 2499, 40, "2023-11-23T18:00:00+00:00"),
      hist("Steam", 1999, 2499, 20, "2024-06-27T17:00:00+00:00"),
      hist("Steam", 1249, 2499, 50, "2024-11-28T18:00:00+00:00"),
      hist("Steam", 1499, 2499, 40, "2025-06-26T17:00:00+00:00"),
      hist("Steam", 1249, 2499, 50, "2025-11-27T18:00:00+00:00"),
      hist("Humble Store", 1799, 2499, 28, "2026-02-14T10:00:00+00:00"),
      hist("Steam", 1499, 2499, 40, "2026-06-25T17:00:00+00:00"),
      hist("GOG", 1599, 2499, 36, "2026-09-20T09:00:00+00:00"),
      histEnd("GOG", "2026-09-27T09:00:00+00:00")
    ]
  });

  add("itad-hades-2", { title: "Hades II", releaseDate: "2025-09-25", tags: ["Singleplayer"] });

  const eldenShops = [
    ["Kinguin", 3999, 33], ["Eneba", 4099, 32], ["Fanatical", 4199, 30], ["2Game", 4299, 28],
    ["GreenManGaming", 4349, 27], ["Gamesplanet", 4399, 27], ["Humble Store", 4499, 25],
    ["Voidu", 4549, 24], ["GamersGate", 4649, 22], ["DLGamer", 4749, 21], ["GOG", 4799, 20]
  ];

  add("itad-elden-ring", {
    title: "Elden Ring",
    appid: 1245620,
    releaseDate: "2022-02-25",
    tags: ["Singleplayer", "Multiplayer", "Open World"],
    deals: [deal("itad-elden-ring", "Steam", 5999, 5999, 0)].concat(
      eldenShops.map((s) => deal("itad-elden-ring", s[0], s[1], 5999, s[2], s[0] === "Eneba" ? "2026-10-20T12:00:00+00:00" : null))
    ),
    steam: {
      categories: ["Single-player", "Multi-player", "Co-op", "Online Co-op", "Steam Cloud"],
      platforms: { windows: true, mac: false, linux: false },
      header: "https://cdn.fixture.test/elden-ring/header.jpg",
      price: { currency: "USD", initial: 5999, final: 4799, discount_percent: 20 }
    },
    history: [hist("Steam", 4199, 5999, 30, "2026-03-14T12:00:00+00:00"), hist("Kinguin", 3999, 5999, 33, "2026-08-01T12:00:00+00:00")]
  });

  add("itad-elden-ring-nightreign", {
    title: "Elden Ring Nightreign",
    releaseDate: "2025-05-30",
    tags: ["Multiplayer", "Co-op"],
    deals: [deal("itad-elden-ring-nightreign", "Steam", 3999, 3999, 0)].concat(
      eldenShops.map((s) => deal("itad-elden-ring-nightreign", s[0], s[1] - 1000, 3999, 10 + (s[2] % 10)))
    )
  });

  add("itad-celeste", {
    title: "Celeste",
    appid: 504230,
    releaseDate: "2018-01-25",
    tags: ["Singleplayer", "Co-op"],
    platforms: [],
    urlGame: false,
    deals: [deal("itad-celeste", "Steam", 1999, 1999, 0), deal("itad-celeste", "GOG", 1999, 1999, 0)],
    steam: {
      categories: [],
      platforms: { windows: true, mac: true, linux: true },
      header: "https://cdn.fixture.test/celeste/header.jpg",
      price: { currency: "USD", initial: 1999, final: 1999, discount_percent: 0 }
    }
  });

  add("itad-stardew-valley", {
    title: "Stardew Valley",
    appid: 413150,
    releaseDate: "2016-02-26",
    tags: ["Singleplayer", "Multiplayer", "Co-op"],
    platforms: [{ id: 1, name: "Windows" }, { id: 3, name: "Linux" }],
    deals: [
      deal("itad-stardew-valley", "Steam", 1124, 1499, 25, "2026-10-07T12:00:00+00:00"),
      deal("itad-stardew-valley", "Humble Store", 1349, 1499, 10)
    ],
    steam: null
  });

  add("itad-terraria", {
    title: "Terraria",
    appid: 105600,
    releaseDate: "2011-05-16",
    tags: ["Singleplayer"],
    deals: [deal("itad-terraria", "Steam", 499, 999, 50)],
    steam: {
      categories: ["Single-player", "Cross-Platform Multiplayer", "Co-op"],
      platforms: { windows: true, mac: true, linux: true },
      header: "https://cdn.fixture.test/terraria/header.jpg",
      price: { currency: "USD", initial: 999, final: 499, discount_percent: 50 }
    }
  });

  add("itad-hollow-knight", {
    title: "Hollow Knight",
    appid: 367520,
    releaseDate: "2017-02-24",
    tags: ["Singleplayer"],
    deals: [deal("itad-hollow-knight", "Steam", 1479, 1479, 0), deal("itad-hollow-knight", "GOG", 1479, 1479, 0)],
    steam: {
      categories: ["Single-player"],
      platforms: { windows: true, mac: true, linux: true },
      header: null,
      price: { currency: "USD", initial: 1479, final: 1479, discount_percent: 0 }
    }
  });

  add("itad-minecraft-legends", {
    title: "Minecraft Legends",
    releaseDate: "2023-04-18",
    tags: ["Multiplayer", "Co-op", "Cross-Play"],
    platforms: [{ id: 1, name: "Windows" }, { id: 9, name: "Xbox" }],
    deals: [deal("itad-minecraft-legends", "Microsoft Store", 3199, 3999, 20, "2026-11-30T12:00:00+00:00")]
  });

  add("itad-minecraft-legends-deluxe", { title: "Minecraft Legends Deluxe Edition", releaseDate: "2023-04-18" });

  add("itad-ghost", {
    title: "Ghost Game",
    releaseDate: "2024-01-01",
    deals: []
  });

  add("itad-orphan", { title: "Orphan Game", releaseDate: "2024-02-02" });

  add("itad-infofail", {
    title: "Info Fail Game",
    deals: [deal("itad-infofail", "GOG", 999, 1999, 50)]
  });

  add("itad-steambroken", {
    title: "Steam Broken Game",
    appid: 999001,
    releaseDate: "2021-07-07",
    tags: ["Singleplayer"],
    deals: [deal("itad-steambroken", "GOG", 1500, 2000, 25)]
  });

  add("itad-free", {
    title: "Free Forever Game",
    appid: 777001,
    releaseDate: null,
    tags: ["Multiplayer"],
    deals: [],
    steam: {
      categories: ["Multi-player"],
      platforms: { windows: true, mac: false, linux: false },
      header: "https://cdn.fixture.test/free/header.jpg",
      price: null
    }
  });

  const heavy = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2025, 9, 10, 12, 0, 0) + i * 9 * 24 * 60 * 60 * 1000);
    const cut = 20 + (i % 5) * 10;
    heavy.push(hist(i % 2 === 0 ? "Steam" : "GOG", 3000 - cut * 10, 3000, cut, isoPlus(d)));
  }
  add("itad-history-heavy", { title: "History Heavy Game", releaseDate: "2020-01-01", history: heavy });

  add("itad-history-none", { title: "Never On Sale Game", releaseDate: "2020-01-01", history: [histEnd("Steam", "2026-01-01T00:00:00+00:00")] });

  add("itad-history-few", {
    title: "Rare Sale Game",
    releaseDate: "2020-01-01",
    history: [hist("Steam", 1000, 2000, 50, "2025-12-20T12:00:00+00:00"), hist("GOG", 1200, 2000, 40, "2026-05-02T12:00:00+00:00")]
  });

  add("itad-pattern-early", {
    title: "Pattern Early Game",
    releaseDate: "2020-01-01",
    history: [
      hist("Steam", 1000, 2000, 50, "2023-01-05T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2024-01-04T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2024-03-15T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2025-01-08T12:00:00+00:00")
    ]
  });

  add("itad-pattern-mid", {
    title: "Pattern Mid Game",
    releaseDate: "2020-01-01",
    history: [
      hist("Steam", 1000, 2000, 50, "2023-10-12T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2024-10-15T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2025-02-01T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2025-10-17T12:00:00+00:00")
    ]
  });

  add("itad-chaotic", {
    title: "Chaotic Game",
    releaseDate: "2020-01-01",
    history: [
      hist("Steam", 1000, 2000, 50, "2023-01-10T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2024-06-12T12:00:00+00:00"),
      hist("Steam", 1000, 2000, 50, "2025-10-14T12:00:00+00:00")
    ]
  });

  for (let i = 1; i <= 50; i++) {
    const n = pad2(i);
    const id = "itad-bulk-" + n;
    add(id, {
      title: "Bulk Game " + n,
      releaseDate: null,
      deals: [deal(id, "Bulk Store", 1000 + i * 10, 2000 + i * 10, 30 + (i % 20))]
    });
  }

  return games;
}

const GAMES = build();

const SEARCH_OVERRIDES = {
  hades: ["itad-hades", "itad-hades-2"],
  "elden ring": ["itad-elden-ring-nightreign", "itad-elden-ring"],
  minecraft: ["itad-minecraft-legends-deluxe", "itad-minecraft-legends"],
  stardew: ["itad-stardew-valley"],
  "unrelated query": ["itad-celeste", "itad-hades"],
  "terra": ["itad-terraria"],
  "hollow": ["itad-hollow-knight"]
};

const SHOPS = [
  { id: 61, title: "Steam" }, { id: 35, title: "GOG" }, { id: 16, title: "Epic Game Store" },
  { id: 37, title: "Humble Store" }, { id: 6, title: "Fanatical" }, { id: 24, title: "GamersGate" },
  { id: 26, title: "Gamesplanet" }, { id: 52, title: "GreenManGaming" }, { id: 48, title: "Microsoft Store" },
  { id: 83, title: "Voidu" }
];

const VANITY = {
  justinvanity: "76561198000000001",
  profileguy: "76561198000000002"
};

const STEAM_OWNED = {
  "76561198000000004": [
    { appid: 1145360, name: "Hades", playtime_forever: 120 },
    { appid: 413150, name: "Stardew Valley", playtime_forever: 900 },
    { appid: 105600, name: "Terraria", playtime_forever: 300 }
  ],
  "76561198000000005": [
    { appid: 413150, name: "Stardew Valley", playtime_forever: 50 },
    { appid: 105600, name: "Terraria", playtime_forever: 60 },
    { appid: 504230, name: "Celeste", playtime_forever: 10 }
  ],
  "76561198000000006": null,
  "76561198000000007": "error",
  "76561198000000001": [],
  "76561198000000002": [{ appid: 1245620, name: "Elden Ring", playtime_forever: 1 }]
};

const DOCKER_PS_OUTPUT = [
  "a1b2c3d4e5f6|Plex-Media-Server|Up 3 days",
  "b2c3d4e5f6a7|retroassembly|Up 5 hours",
  "c3d4e5f6a7b8|gitea|Up 2 weeks",
  "d4e5f6a7b8c9|sotf-server|Exited (0) 2 hours ago",
  ""
].join("\n");

module.exports = { GAMES, SEARCH_OVERRIDES, SHOPS, VANITY, STEAM_OWNED, DOCKER_PS_OUTPUT, slug, deal, hist, money, isoPlus, pad2 };
