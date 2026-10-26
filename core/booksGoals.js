const { memberName, mentionedIds, stripMentions, embed } = require("./books");
const { linkedSources, finishedKeys } = require("./booksData");
const { loadState, saveState } = require("./booksState");

const MAX_GOAL = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysInYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayOfYear(now) {
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / DAY_MS) + 1;
}

function bar(done, total) {
  const filled = Math.max(0, Math.min(10, Math.round((done / total) * 10)));
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function activeGoal(state, discordId, year) {
  const goal = state.goals[discordId];
  return goal && goal.year === year ? goal : null;
}

function paceLine(count, target, now) {
  if (count >= target) return "Goal reached!";
  const expected = (target * dayOfYear(now)) / daysInYear(now.getFullYear());
  const diff = count - expected;
  const left = target - count;
  const remaining = left + " to go";
  if (diff >= 1) return Math.floor(diff) + " book" + (Math.floor(diff) === 1 ? "" : "s") + " ahead of pace, " + remaining;
  if (diff <= -1) return Math.ceil(-diff) + " book" + (Math.ceil(-diff) === 1 ? "" : "s") + " behind pace, " + remaining;
  return "Right on pace, " + remaining;
}

async function showGoal(message, id, sources, state) {
  const now = new Date(Date.now());
  const year = now.getFullYear();
  const name = memberName(message.guild, id);
  const goal = activeGoal(state, id, year);
  if (!goal) {
    if (id === message.author.id) await message.reply("You haven't set a reading goal for " + year + ". Use !books goal 30 to set one.");
    else await message.reply(name + " hasn't set a reading goal for " + year + ".");
    return;
  }
  if (linkedSources(sources, id).length === 0) {
    await message.reply(name + " has a goal of " + goal.target + " books but hasn't linked a book service yet.");
    return;
  }
  const count = (await finishedKeys(id, sources, year)).size;
  const percent = Math.min(100, Math.round((count / goal.target) * 100));
  const text = "**" + count + " of " + goal.target + " book" + (goal.target === 1 ? "" : "s") + "** (" + percent + "%)\n" + bar(count, goal.target) + "\n" + paceLine(count, goal.target, now);
  await message.reply({ embeds: [embed(name + "'s " + year + " reading goal", text)] });
}

async function handleGoal(message, args, sources) {
  const state = loadState();
  const ids = mentionedIds(args);
  const rest = stripMentions(args);
  if (ids.length > 0) {
    await showGoal(message, ids[0], sources, state);
    return;
  }
  if (rest === "") {
    await showGoal(message, message.author.id, sources, state);
    return;
  }
  const year = new Date(Date.now()).getFullYear();
  if (rest.toLowerCase() === "clear") {
    if (!activeGoal(state, message.author.id, year)) {
      await message.reply("You don't have a reading goal for " + year + ".");
      return;
    }
    delete state.goals[message.author.id];
    saveState(state);
    await message.reply("Cleared your " + year + " reading goal.");
    return;
  }
  const target = /^\d+$/.test(rest) ? parseInt(rest, 10) : NaN;
  if (!(target >= 1 && target <= MAX_GOAL)) {
    await message.reply("Usage: !books goal NUMBER, like !books goal 30. Use !books goal to see your progress or !books goal clear to remove it.");
    return;
  }
  state.goals[message.author.id] = { year: year, target: target };
  saveState(state);
  if (linkedSources(sources, message.author.id).length === 0) {
    await message.reply("Goal set: " + target + " books in " + year + ". Link a book service with !gr link or !ab link so I can count your books.");
    return;
  }
  await showGoal(message, message.author.id, sources, state);
}

module.exports = { handleGoal, activeGoal };
