const { LIST_LIMIT, COMMAND_LIMIT, bookKey, stars, memberName, embed } = require("./books");
const { safe, linkedSources, mergedFinished } = require("./booksData");

const MAX_RECOMMENDATIONS = 5;
const MAX_FANS_SHOWN = 3;
const LIKE_RATING = 4;
const UNKNOWN_TASTE_WEIGHT = 0.5;
const MIN_TASTE_WEIGHT = 0.2;

function guildIds(message) {
  return message.guild.members.cache.map((member) => member.id).slice(0, 1000);
}

function tasteWeight(mine, theirs) {
  let gap = 0;
  let shared = 0;
  theirs.forEach((item, key) => {
    const own = mine.get(key);
    if (own && own.rating > 0 && item.rating > 0) {
      gap += Math.abs(own.rating - item.rating);
      shared++;
    }
  });
  if (shared < 2) return UNKNOWN_TASTE_WEIGHT;
  return Math.max(MIN_TASTE_WEIGHT, 1 - gap / shared / 4);
}

async function handleRecommend(message, sources) {
  const me = message.author.id;
  const mySources = linkedSources(sources, me);
  if (mySources.length === 0) {
    await message.reply("Link a book service first, like !gr link or !ab link, so I know what you've read.");
    return;
  }

  const mine = await mergedFinished(me, sources);
  const reading = new Set();
  for (const source of mySources) {
    const items = await safe(source.currently(me));
    items.forEach((item) => reading.add(bookKey(item.title)));
  }

  const candidates = new Map();
  let count = 0;
  for (const id of guildIds(message)) {
    if (id === me || linkedSources(sources, id).length === 0) continue;
    if (++count > COMMAND_LIMIT) break;
    const theirs = await mergedFinished(id, sources);
    const weight = tasteWeight(mine, theirs);
    theirs.forEach((item, key) => {
      if (mine.has(key) || reading.has(key) || !(item.rating >= LIKE_RATING)) return;
      const entry = candidates.get(key) || { title: item.title, author: item.author, score: 0, fans: [] };
      entry.score += weight * (item.rating - (LIKE_RATING - 1));
      entry.fans.push({ id: id, rating: item.rating });
      candidates.set(key, entry);
    });
  }

  const ranked = Array.from(candidates.values())
    .sort((a, b) => (b.score - a.score) || (b.fans.length - a.fans.length) || a.title.localeCompare(b.title))
    .slice(0, Math.min(MAX_RECOMMENDATIONS, LIST_LIMIT));
  if (ranked.length === 0) {
    await message.reply("I don't have enough 4 and 5 star ratings from other members to recommend anything new yet. Ratings come from Goodreads.");
    return;
  }

  const lines = ranked.map((entry) => {
    const fans = entry.fans.slice(0, MAX_FANS_SHOWN).map((fan) => memberName(message.guild, fan.id) + " " + stars(fan.rating));
    const more = entry.fans.length > MAX_FANS_SHOWN ? " and " + (entry.fans.length - MAX_FANS_SHOWN) + " more" : "";
    return "**" + entry.title + "**" + (entry.author ? " by " + entry.author : "") + "\nliked by " + fans.join(", ") + more;
  });
  const card = embed("Recommended for " + memberName(message.guild, me), lines.join("\n\n"))
    .setFooter({ text: "Books other members rated 4 or 5 stars that you haven't read, weighted toward members with similar taste." });
  await message.reply({ embeds: [card] });
}

module.exports = { handleRecommend };
