const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");

const DATA_FILES = ["games.json", "owned.json", "steamlinks.json", "scores.json", "memory.yaml", "roles.yaml"];
const ROOT_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".json", ".yaml", ".yml", ".md"]);
const SKIP_ROOT_FILES = new Set(["package-lock.json"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "test"]);

function defaultFiles() {
  return {
    "games.json": [
      { id: "itad-hades", title: "Hades", channelId: "CH-games", addedDate: "2026-09-01", lastAlertedPrice: null },
      { id: "itad-elden-ring", title: "Elden Ring", channelId: "CH-games", addedDate: "2026-09-02", lastAlertedPrice: 5999 },
      { id: "itad-celeste", title: "Celeste", channelId: "CH-games", addedDate: "2026-09-03", lastAlertedPrice: null },
      { id: "itad-stardew-valley", title: "Stardew Valley", channelId: "CH-deals", addedDate: "2026-09-04", lastAlertedPrice: 1124 },
      { id: "itad-terraria", title: "Terraria", channelId: "CH-deals", addedDate: "2026-09-05", lastAlertedPrice: 499 },
      { id: "itad-hollow-knight", title: "Hollow Knight", channelId: "CH-deals", addedDate: "2026-09-06", lastAlertedPrice: 740, lastEndingSoonExpiry: "2026-09-30T00:00:00+00:00" },
      { id: "itad-ghost", title: "Ghost Game", channelId: "CH-gone", addedDate: "2026-09-07", lastAlertedPrice: null }
    ],
    "owned.json": {
      U1: [{ id: "itad-hades", title: "Hades" }, { id: "itad-celeste", title: "Celeste" }],
      U2: [{ id: "itad-hades", title: "Hades" }],
      U3: [{ id: "itad-celeste", title: "Celeste" }, { id: "itad-elden-ring", title: "Elden Ring" }]
    },
    "steamlinks.json": {
      U4: "76561198000000004",
      U5: "76561198000000005",
      U6: "76561198000000006",
      U7: "76561198000000007"
    },
    "scores.json": { U1: 300, U2: 100, U3: 100, U0: 0 },
    "memory.yaml": {
      U1: ["my name is Alice", "I like roguelikes"],
      U9: ["Finn is the best friend"]
    },
    "roles.yaml": {
      hades: { title: "Hades", roleId: "R-HADES", emoji: "⚔️", iconMode: "native" },
      celeste: { title: "Celeste", roleId: "R-CELESTE", emoji: "🍓", iconMode: "native" },
      "elden ring": { title: "Elden Ring", roleId: "R-ELDEN", emoji: "🗡️", iconMode: "native" }
    }
  };
}

function contentFiles() {
  return {
    "personality.yaml": {
      name: "BMO",
      trigger: "bmo",
      persona: "You are BMO, a cheerful game console robot.\nYou love games and friends.\n"
    },
    "greetings.yaml": {
      greetings: ["Welcome aboard, {user}!", "Hello {user}, glad you are here.", "{user} has joined, hooray!"]
    },
    "goodbyes.yaml": {
      goodbyes: ["Goodbye, {user}.", "{user} has left the building.", "See you later, {user}!"]
    },
    "maps.json": {
      avowed: "https://mapgenie.io/avowed/maps/eora",
      "the forest": "https://mapgenie.io/the-forest/maps/world",
      "baldur's gate 3": "https://mapgenie.io/baldurs-gate-3/maps/world?x=1"
    },
    "trivia.json": [
      { question: "Which company developed the original Half-Life?", choices: ["Valve", "id Software", "Epic Games", "Bethesda"], answer: 0 },
      { question: "What year did Steam first launch?", choices: ["2001", "2003", "2005", "2008"], answer: 1 },
      { question: "What engine powers Fortnite?", choices: ["Source", "Unity", "Unreal Engine", "CryEngine"], answer: 2 }
    ]
  };
}

function serialize(name, value) {
  if (typeof value === "string") return value;
  if (name.endsWith(".json")) return JSON.stringify(value, null, 2) + "\n";
  return yaml.dump(value);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".DS_Store") continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function listFiles(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    const rel = base ? base + "/" + entry.name : entry.name;
    if (entry.isDirectory()) listFiles(full, rel, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function createSandbox(repoRoot, overrides, options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gpb-test-"));
  const sourceFiles = new Set();

  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    const from = path.join(repoRoot, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      copyDir(from, path.join(dir, entry.name));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!ROOT_EXTENSIONS.has(ext)) continue;
      if (DATA_FILES.includes(entry.name) || SKIP_ROOT_FILES.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;
      fs.copyFileSync(from, path.join(dir, entry.name));
    }
  }

  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(dir, "node_modules"), "dir");

  for (const rel of listFiles(dir, "", [])) sourceFiles.add(rel);

  const files = Object.assign(defaultFiles(), options && options.realContent ? {} : contentFiles());
  const merged = Object.assign({}, files, overrides || {});
  const initial = new Map();
  for (const name of Object.keys(merged)) {
    const value = merged[name];
    if (value === null) {
      fs.rmSync(path.join(dir, name), { force: true });
      sourceFiles.delete(name);
      continue;
    }
    sourceFiles.delete(name);
    const text = serialize(name, value);
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
    initial.set(name, text);
  }

  function snapshotChanges() {
    const current = listFiles(dir, "", []);
    const changes = {};
    const seen = new Set();
    for (const rel of current) {
      seen.add(rel);
      const text = fs.readFileSync(path.join(dir, rel), "utf8");
      if (sourceFiles.has(rel)) {
        continue;
      }
      if (!initial.has(rel)) {
        changes[rel] = { status: "created", lines: text.split("\n") };
      } else if (initial.get(rel) !== text) {
        changes[rel] = { status: "modified", lines: text.split("\n") };
      }
    }
    for (const rel of initial.keys()) {
      if (!seen.has(rel)) changes[rel] = { status: "deleted" };
    }
    const sourceChanges = [];
    for (const rel of sourceFiles) {
      if (!seen.has(rel)) sourceChanges.push(rel);
    }
    if (sourceChanges.length > 0) changes["__source_files_missing__"] = { status: "deleted", files: sourceChanges.sort() };
    const sorted = {};
    Object.keys(changes).sort().forEach((k) => {
      sorted[k] = changes[k];
    });
    return sorted;
  }

  function read(name) {
    try {
      return fs.readFileSync(path.join(dir, name), "utf8");
    } catch (err) {
      return null;
    }
  }

  function write(name, value) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, serialize(name, value));
  }

  function remove(name) {
    fs.rmSync(path.join(dir, name), { force: true });
  }

  function cleanup() {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { dir, snapshotChanges, read, write, remove, cleanup, sourceFiles };
}

module.exports = { createSandbox, defaultFiles, DATA_FILES };
