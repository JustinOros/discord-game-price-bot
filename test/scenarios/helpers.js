function sc(name, run, opts) {
  return Object.assign({ name: name, run: run }, opts || {});
}

const NO_GAMES = { "games.json": [] };

function bulkGames(count, channelId) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const n = i < 10 ? "0" + i : String(i);
    out.push({ id: "itad-bulk-" + n, title: "Bulk Game " + n, channelId: channelId || "CH-games", addedDate: "2026-09-10", lastAlertedPrice: null });
  }
  return out;
}

module.exports = { sc, NO_GAMES, bulkGames };
