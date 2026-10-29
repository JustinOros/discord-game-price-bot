const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ENV_PATH = path.join(__dirname, ".env");
const ENDPOINT = "https://api.hardcover.app/v1/graphql";
const FETCH_TIMEOUT_MS = 15000;
const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS = { wantToRead: 1, reading: 2, read: 3 };

const USER_QUERY = "query ($username: citext!) { users(where: {username: {_eq: $username}}, limit: 1) { id username } }";

const BOOKS_QUERY = "query ($userId: Int!, $status: Int!, $limit: Int!, $offset: Int!) { " +
  "user_books(where: {user_id: {_eq: $userId}, status_id: {_eq: $status}}, order_by: {last_read_date: desc_nulls_last}, limit: $limit, offset: $offset) { " +
  "id rating last_read_date date_added book { id title slug pages cached_image cached_contributors } " +
  "user_book_reads(order_by: {finished_at: desc_nulls_last}, limit: 1) { finished_at } } }";

function loadSettings() {
  let token = String(process.env.HARDCOVER_TOKEN || "").trim();
  try {
    const values = dotenv.parse(fs.readFileSync(ENV_PATH, "utf8"));
    if (values.HARDCOVER_TOKEN) token = String(values.HARDCOVER_TOKEN).trim();
  } catch (err) {
    token = token || "";
  }
  token = token.replace(/^Bearer\s+/i, "");
  return { token: token, ready: !!token };
}

async function graphql(query, variables) {
  const settings = loadSettings();
  if (!settings.ready) return { ok: false, status: 0, notConfigured: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + settings.token,
        "User-Agent": "discord-game-price-bot"
      },
      body: JSON.stringify({ query: query, variables: variables }),
      signal: controller.signal
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    if (body.errors && body.errors.length > 0) return { ok: false, status: 200, error: String(body.errors[0].message || "") };
    return { ok: true, status: 200, data: body.data || {} };
  } catch (err) {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function parseUsername(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  const fromLink = text.match(/hardcover\.app\/@([A-Za-z0-9._-]+)/i);
  if (fromLink) return fromLink[1];
  const bare = text.replace(/^@/, "");
  return /^[A-Za-z0-9._-]+$/.test(bare) ? bare : null;
}

async function findUser(username) {
  const result = await graphql(USER_QUERY, { username: username });
  if (!result.ok) return { ok: false, status: result.status, notConfigured: result.notConfigured };
  const user = Array.isArray(result.data.users) ? result.data.users[0] : null;
  if (!user) return { ok: true, user: null };
  return { ok: true, user: { id: user.id, username: user.username } };
}

function formatDate(text) {
  const match = String(text || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return "";
  return parseInt(match[3], 10) + " " + MONTHS[month - 1] + " " + match[1];
}

function authorOf(book) {
  const list = Array.isArray(book.cached_contributors) ? book.cached_contributors : [];
  const names = list
    .filter((entry) => entry && entry.author && entry.author.name && (!entry.contribution || /author/i.test(entry.contribution)))
    .map((entry) => entry.author.name);
  return names.slice(0, 2).join(", ");
}

function toItem(row) {
  const book = row.book || {};
  const reads = Array.isArray(row.user_book_reads) ? row.user_book_reads : [];
  const finished = reads.length > 0 && reads[0].finished_at ? reads[0].finished_at : row.last_read_date;
  const rating = Math.round(Number(row.rating) || 0);
  const image = book.cached_image && book.cached_image.url ? book.cached_image.url : "";
  return {
    bookId: book.id ? String(book.id) : "",
    title: String(book.title || ""),
    author: authorOf(book),
    rating: rating >= 1 && rating <= 5 ? rating : 0,
    readAt: formatDate(finished),
    addedAt: formatDate(row.date_added),
    image: image,
    link: book.slug ? "https://hardcover.app/books/" + book.slug : "",
    pages: parseInt(book.pages, 10) || 0,
    review: ""
  };
}

async function fetchShelf(userId, status, options) {
  const maxPages = options && options.firstPageOnly ? 1 : MAX_PAGES;
  let items = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await graphql(BOOKS_QUERY, { userId: userId, status: status, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (!result.ok) {
      if (page === 0) return { ok: false, status: result.status, error: result.error };
      break;
    }
    const rows = Array.isArray(result.data.user_books) ? result.data.user_books : [];
    items = items.concat(rows.map(toItem).filter((item) => item.title));
    if (rows.length < PAGE_SIZE) break;
  }
  return { ok: true, status: 200, items: items };
}

module.exports = { loadSettings, graphql, findUser, fetchShelf, parseUsername, formatDate, toItem, STATUS, USER_QUERY, BOOKS_QUERY };
