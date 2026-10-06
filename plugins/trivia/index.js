const fs = require("fs");
const path = require("path");

const TRIVIA_POINTS = 100;
const SCORE_TOP_N = 10;
const SCORES_PATH = path.join(__dirname, "..", "..", "scores.json");
const TRIVIA_PATH = path.join(__dirname, "..", "..", "trivia.json");

function loadScores() {
  try {
    return JSON.parse(fs.readFileSync(SCORES_PATH, "utf8"));
  } catch (err) {
    return {};
  }
}

function saveScores(scores) {
  fs.writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2) + "\n");
}

function awardTriviaPoints(userId) {
  const scores = loadScores();
  scores[userId] = (scores[userId] || 0) + TRIVIA_POINTS;
  saveScores(scores);
  return scores[userId];
}

const TRIVIA_TIME_LIMIT_MS = 60 * 1000;
const TRIVIA_LETTERS = ["A", "B", "C", "D"];
const activeTrivia = new Map();

const FALLBACK_TRIVIA_QUESTIONS = [
  { question: "Which company developed the original Half-Life?", choices: ["Valve", "id Software", "Epic Games", "Bethesda"], answer: 0 },
  { question: "What year did Steam first launch?", choices: ["2001", "2003", "2005", "2008"], answer: 1 },
  { question: "Which studio made Minecraft?", choices: ["Mojang", "Notch Games", "Microsoft Studios", "Double Fine"], answer: 0 },
  { question: "What engine powers Fortnite?", choices: ["Source", "Unity", "Unreal Engine", "CryEngine"], answer: 2 },
  { question: "Which game popularized the battle royale genre on PC?", choices: ["Fortnite", "PUBG", "Apex Legends", "Warzone"], answer: 1 }
];

function loadTriviaQuestions() {
  try {
    const parsed = JSON.parse(fs.readFileSync(TRIVIA_PATH, "utf8"));
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return FALLBACK_TRIVIA_QUESTIONS;
  } catch (err) {
    return FALLBACK_TRIVIA_QUESTIONS;
  }
}

const TRIVIA_QUESTIONS = loadTriviaQuestions();

function pickTriviaQuestion() {
  return TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
}

async function handleTrivia(message) {
  const channelId = message.channelId;
  if (activeTrivia.has(channelId)) {
    await message.reply("A trivia question is already up in this channel, answer that one first!");
    return;
  }

  const picked = pickTriviaQuestion();
  const entry = { question: picked, timeout: null, answered: new Set() };
  activeTrivia.set(channelId, entry);

  const lines = ["Video game trivia! " + picked.question];
  picked.choices.forEach((choice, i) => lines.push(TRIVIA_LETTERS[i] + ") " + choice));
  lines.push("You have 60 seconds, first correct answer wins!");

  try {
    await message.reply(lines.join("\n"));
  } catch (err) {
    console.error("Trivia post failed:", err.message);
    activeTrivia.delete(channelId);
    return;
  }

  entry.timeout = setTimeout(async () => {
    if (activeTrivia.get(channelId) !== entry) return;
    activeTrivia.delete(channelId);
    try {
      await message.channel.send(
        "Time's up! The answer was " + TRIVIA_LETTERS[picked.answer] + ") " + picked.choices[picked.answer] + "."
      );
    } catch (err) {
      console.error("Trivia timeout message failed:", err.message);
    }
  }, TRIVIA_TIME_LIMIT_MS);
}

async function handleTriviaAnswer(message, content) {
  const channelId = message.channelId;
  const entry = activeTrivia.get(channelId);
  if (!entry) return false;

  const cleaned = content.trim().toUpperCase().replace(/[).:]/g, "");
  const guessIndex = TRIVIA_LETTERS.indexOf(cleaned);
  if (guessIndex === -1) return false;

  if (entry.answered.has(message.author.id)) return false;
  entry.answered.add(message.author.id);

  if (guessIndex !== entry.question.answer) return false;

  clearTimeout(entry.timeout);
  activeTrivia.delete(channelId);

  const displayName = (message.member && message.member.displayName) ||
    message.author.globalName || message.author.username;
  const total = awardTriviaPoints(message.author.id);
  await message.reply(
    "Correct, " + displayName + "! The answer was " + TRIVIA_LETTERS[entry.question.answer] + ") " +
    entry.question.choices[entry.question.answer] + ". +" + TRIVIA_POINTS + " points (" + total + " total)."
  );
  return true;
}

async function handleScore(message) {
  const scores = loadScores();
  const entries = Object.entries(scores)
    .filter(([, points]) => points > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, SCORE_TOP_N);

  if (entries.length === 0) {
    await message.reply("Nobody has scored any trivia points yet! Type !trivia to start a round.");
    return;
  }

  const lines = ["Top trivia scores:"];
  entries.forEach((entry, i) => {
    const userId = entry[0];
    const points = entry[1];
    lines.push((i + 1) + ". <@" + userId + "> - " + points + " point" + (points === 1 ? "" : "s"));
  });

  await message.reply({ content: lines.join("\n"), allowedMentions: { users: [] } });
}

async function checkAnswer(message, content) {
  try {
    return await handleTriviaAnswer(message, content);
  } catch (err) {
    console.error("Trivia answer check failed:", err.message);
    return false;
  }
}

module.exports = {
  name: "trivia",
  commands: [
    { name: "trivia", exact: true, run: (message) => handleTrivia(message) },
    { name: "score", exact: true, run: (message) => handleScore(message) }
  ],
  onChat: checkAnswer,
  help: [
    { order: 220, text: "!trivia - video game trivia, multiple choice, first correct answer in chat wins 100 points" },
    { order: 230, text: "!score - show the top 10 members by trivia points" }
  ]
};
