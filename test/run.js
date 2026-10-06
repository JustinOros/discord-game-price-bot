const fs = require("fs");
const path = require("path");
const { runScenario } = require("./lib/harness");
const { diffTranscripts } = require("./lib/diff");
const scenarios = require("./scenarios");

const BASELINE_PATH = path.join(__dirname, "snapshots", "baseline.json");

function loadBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  } catch (err) {
    return null;
  }
}

function writeBaseline(map) {
  const ordered = {};
  Object.keys(map).sort().forEach((k) => {
    ordered[k] = map[k];
  });
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ scenarios: ordered }, null, 2) + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const update = args.includes("--update");
  const list = args.includes("--list");
  const names = args.filter((a) => !a.startsWith("--"));

  if (list) {
    scenarios.forEach((s) => console.log(s.name));
    return 0;
  }

  const known = new Set(scenarios.map((s) => s.name));
  for (const n of names) {
    if (!known.has(n)) {
      console.log("Unknown scenario: " + n);
      return 2;
    }
  }

  const selected = names.length > 0 ? scenarios.filter((s) => names.includes(s.name)) : scenarios;
  const baseline = loadBaseline();
  const baseMap = baseline ? baseline.scenarios : {};
  const results = {};
  let failed = 0;
  let passed = 0;

  for (const scn of selected) {
    let transcript;
    try {
      transcript = await runScenario(scn);
    } catch (err) {
      console.log("FAIL " + scn.name);
      console.log("  scenario crashed: " + (err && err.stack ? err.stack : err));
      failed += 1;
      continue;
    }
    results[scn.name] = transcript;
    if (update) {
      console.log("UPDATED " + scn.name);
      continue;
    }
    const expected = baseMap[scn.name];
    if (expected === undefined) {
      console.log("FAIL " + scn.name);
      console.log("  no baseline recorded for this scenario (run with --update)");
      failed += 1;
      continue;
    }
    const diff = diffTranscripts(expected, JSON.parse(JSON.stringify(transcript)));
    if (diff.length === 0) {
      console.log("PASS " + scn.name);
      passed += 1;
    } else {
      console.log("FAIL " + scn.name);
      diff.forEach((line) => console.log(line));
      failed += 1;
    }
  }

  if (update) {
    if (failed > 0) {
      console.log("Baseline not written: " + failed + " scenario(s) crashed.");
      return 1;
    }
    const merged = names.length > 0 ? Object.assign({}, baseMap, results) : results;
    if (names.length === 0) {
      Object.keys(baseMap).forEach((k) => {
        if (!known.has(k)) console.log("Dropped baseline entry for removed scenario: " + k);
      });
    }
    writeBaseline(merged);
    console.log("Baseline written with " + Object.keys(merged).length + " scenarios.");
    return 0;
  }

  if (names.length === 0) {
    Object.keys(baseMap).forEach((k) => {
      if (!known.has(k)) {
        console.log("FAIL " + k);
        console.log("  scenario exists in the baseline but is no longer defined");
        failed += 1;
      }
    });
  }

  console.log("");
  console.log(passed + " passed, " + failed + " failed");
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.log("Harness error: " + (err && err.stack ? err.stack : err));
    process.exitCode = 2;
  }
);
