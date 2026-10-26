const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const STATE_PATH = path.join(__dirname, "..", "books.json");
const CONFIG_PATH = path.join(__dirname, "..", "books.yaml");
const DEFAULT_RECAP_HOUR = 9;

function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return {
      goals: data && data.goals && typeof data.goals === "object" ? data.goals : {},
      lastRecap: data && typeof data.lastRecap === "string" ? data.lastRecap : ""
    };
  } catch (err) {
    return { goals: {}, lastRecap: "" };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function loadBooksConfig() {
  let data = {};
  try {
    const parsed = yaml.load(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (parsed && typeof parsed === "object") data = parsed;
  } catch (err) {
    data = {};
  }
  const hour = Number(data.recapHour);
  return {
    monthlyRecap: data.monthlyRecap !== false,
    recapHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_RECAP_HOUR
  };
}

module.exports = { loadState, saveState, loadBooksConfig };
