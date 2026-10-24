const fs = require("fs");
const path = require("path");

const PACK_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const LAST_GAME_TTL_MS = 30 * 60 * 1000;
const PACK_MAX_CHARS = 3500;
const SNIPPET_MAX_CHARS = 700;
const CONTEXT_MAX_CHARS = 7000;
const MAX_GAME_NAME_LENGTH = 60;
const MIN_KNOWN_TITLE_LENGTH = 3;

const GAME_QUESTION = new RegExp(
  "\\b(builds?|perks?|loadouts?|tier\\s*list|meta|strateg(y|ies)|guides?|walkthroughs?|bosse?s?|killers?|survivors?|" +
  "weapons?|characters?|classes|class|quests?|endings?|achievements?|unlock(s|ed)?|farm(ing)?|grind(ing)?|spawns?|" +
  "drops?|recipes?|craft(ing)?|talents?|skill\\s*tree|add-?ons?|nerf(ed)?|buff(ed)?|patch(es)?|dlc|co-?op|speedrun|" +
  "cheat\\s*codes?|easter\\s*eggs?|collectibles?|" +
  "how\\s+(do|can|to)\\s+(i\\s+)?(beat|get|unlock|find|kill|defeat|survive|escape|level|win|play|farm|craft|build)|" +
  "where\\s+(is|are|do\\s+i|can\\s+i|to)|" +
  "what\\s+(should|do)\\s+i\\s+(play|use|pick|do|equip|take|run))\\b",
  "i"
);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "game";
}

function clip(text, max) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() + "..." : clean;
}

function createGameKnowledge(deps) {
  const {
    cacheDir,
    normalizeTitle,
    completeShort,
    searchWeb,
    searchGame,
    pickSearchMatch,
    listKnownTitles
  } = deps;

  const lastGames = new Map();
  const packs = new Map();
  const inflight = new Map();

  function looksLikeGameQuestion(text) {
    return GAME_QUESTION.test(text || "");
  }

  function findKnownTitle(text) {
    const normalized = normalizeTitle(text);
    const titles = Array.from(new Set(listKnownTitles().map((t) => normalizeTitle(t))))
      .filter((t) => t.length >= MIN_KNOWN_TITLE_LENGTH)
      .sort((a, b) => b.length - a.length);
    for (const title of titles) {
      const pattern = new RegExp("(^|[^a-z0-9])" + escapeRegex(title) + "($|[^a-z0-9])");
      if (pattern.test(normalized)) return title;
    }
    return null;
  }

  function parseGameName(raw) {
    if (!raw) return null;
    const line = raw.split("\n")[0].replace(/^["'`\s]+|["'`.\s]+$/g, "").trim();
    if (!line || /^none$/i.test(line) || /^unknown$/i.test(line)) return null;
    if (line.length > MAX_GAME_NAME_LENGTH) return null;
    return line;
  }

  async function canonicalTitle(name) {
    let results;
    try {
      results = await searchGame(name);
    } catch (err) {
      return name;
    }
    if (!results || results.length === 0) return null;
    const match = pickSearchMatch(name, results);
    if (!match) return null;
    const wanted = normalizeTitle(name);
    const found = normalizeTitle(match.title);
    if (found === wanted) return match.title;
    if (found.includes(wanted) || wanted.includes(found)) return wanted.length > found.length ? name : match.title;
    return null;
  }

  function rememberGame(userId, title) {
    lastGames.set(userId, { title: title, at: Date.now() });
  }

  function recallGame(userId) {
    const entry = lastGames.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.at > LAST_GAME_TTL_MS) {
      lastGames.delete(userId);
      return null;
    }
    return entry.title;
  }

  async function identifyGame(userId, text, force) {
    if (!force && !looksLikeGameQuestion(text)) return null;

    const known = findKnownTitle(text);
    if (known) {
      const canonical = await canonicalTitle(known);
      const title = canonical || known;
      rememberGame(userId, title);
      return title;
    }

    const raw = await completeShort(
      "You identify which PC video game a question is about. Reply with only the exact official name of that game, " +
      "or the single word NONE if the question does not name or clearly imply one specific video game.",
      text,
      24
    );
    const name = parseGameName(raw);
    if (name) {
      const canonical = await canonicalTitle(name);
      if (canonical) {
        rememberGame(userId, canonical);
        return canonical;
      }
    }

    return recallGame(userId);
  }

  function readPackFile(file) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (parsed && typeof parsed.text === "string" && typeof parsed.fetchedAt === "number") return parsed;
    } catch (err) {
      return null;
    }
    return null;
  }

  async function buildPack(title) {
    const search = await searchWeb(title + " wiki guide overview characters items mechanics", { includeAnswer: false });
    const results = (search && search.results) || [];
    if (results.length === 0) return null;
    const text = results
      .map((r) => r.title + ": " + clip(r.description, SNIPPET_MAX_CHARS))
      .join("\n")
      .slice(0, PACK_MAX_CHARS);
    return { title: title, fetchedAt: Date.now(), text: text };
  }

  async function getPack(title) {
    const key = slugify(title);
    const cached = packs.get(key);
    if (cached && Date.now() - cached.fetchedAt < PACK_TTL_MS) return cached.text;

    const file = path.join(cacheDir, key + ".json");
    const stored = readPackFile(file);
    if (stored && Date.now() - stored.fetchedAt < PACK_TTL_MS) {
      packs.set(key, stored);
      return stored.text;
    }

    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
      try {
        const pack = await buildPack(title);
        if (!pack) return stored ? stored.text : null;
        packs.set(key, pack);
        try {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(pack, null, 2) + "\n");
        } catch (err) {
          console.error("Could not save game knowledge for " + title + ":", err.message);
        }
        return pack.text;
      } catch (err) {
        console.error("Could not build game knowledge for " + title + ":", err.message);
        return stored ? stored.text : null;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, job);
    return job;
  }

  async function buildContext(userId, question, force, triggerPattern) {
    const cleaned = triggerPattern ? question.replace(triggerPattern, " ").replace(/\s+/g, " ").trim() : question;
    const title = await identifyGame(userId, cleaned, force);
    if (!title) return null;

    const [pack, live] = await Promise.all([
      getPack(title),
      searchWeb(title + " " + cleaned)
    ]);

    const parts = [];
    if (live && live.answer) parts.push("Quick answer from a live search: " + live.answer);
    if (live && live.results && live.results.length > 0) {
      parts.push(
        "Live search results for this exact question:\n" +
        live.results.map((r, i) => (i + 1) + ". " + r.title + " - " + clip(r.description, SNIPPET_MAX_CHARS) + " (" + r.url + ")").join("\n")
      );
    }
    if (pack) parts.push("General background on " + title + ":\n" + pack);

    return {
      title: title,
      material: parts.join("\n\n").slice(0, CONTEXT_MAX_CHARS),
      answer: live && live.answer ? live.answer : null
    };
  }

  return { looksLikeGameQuestion, identifyGame, getPack, buildContext };
}

module.exports = { createGameKnowledge };
