const hc = require("./plugins/hardcover/hc");

const username = process.argv[2];

async function main() {
  if (!hc.loadSettings().ready) {
    console.error("Put HARDCOVER_TOKEN in plugins/hardcover/.env first.");
    process.exit(1);
  }
  if (!username) {
    console.error("Usage: node hardcover-probe.js USERNAME");
    process.exit(1);
  }
  const user = await hc.graphql(hc.USER_QUERY, { username: username });
  console.log("user lookup:", JSON.stringify(user));
  const found = user.ok && Array.isArray(user.data.users) ? user.data.users[0] : null;
  if (!found) process.exit(1);
  for (const status of [3, 2, 1]) {
    const result = await hc.graphql(hc.BOOKS_QUERY, { userId: found.id, status: status, limit: 2, offset: 0 });
    console.log("status " + status + ":", JSON.stringify(result, null, 1).slice(0, 1500));
  }
  const parsed = await hc.fetchShelf(found.id, hc.STATUS.read, { firstPageOnly: true });
  console.log("parsed first items:", JSON.stringify(parsed.ok ? parsed.items.slice(0, 3) : parsed, null, 1));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
