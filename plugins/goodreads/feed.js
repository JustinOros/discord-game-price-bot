const FEED_BASE = "https://www.goodreads.com/review/list_rss/";
const FETCH_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;
const MAX_PAGES = 12;
const SHORT_PAGE_SLACK = 10;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function tagValue(block, name) {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  if (!match) return "";
  let value = match[1].trim();
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) value = cdata[1];
  else value = decodeEntities(value);
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+>/g, "").trim();
}

function parseFeed(xml) {
  if (typeof xml !== "string" || !/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml)) return null;
  const firstItem = xml.search(/<item[\s>]/i);
  const head = firstItem === -1 ? xml : xml.slice(0, firstItem);
  const items = (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map((block) => {
    const bookId = tagValue(block, "book_id");
    const title = tagValue(block, "title") || tagValue(block, "book_title");
    const rating = parseInt(tagValue(block, "user_rating"), 10);
    return {
      bookId: bookId,
      title: title,
      author: tagValue(block, "author_name"),
      rating: Number.isFinite(rating) ? rating : 0,
      readAt: tagValue(block, "user_read_at"),
      addedAt: tagValue(block, "user_date_added"),
      image: tagValue(block, "book_large_image_url") || tagValue(block, "book_medium_image_url") || tagValue(block, "book_image_url"),
      link: tagValue(block, "link"),
      pages: parseInt(tagValue(block, "num_pages"), 10) || 0,
      review: tagValue(block, "user_review")
    };
  }).filter((item) => item.title);
  const rawCount = (xml.match(/<item[\s>]/gi) || []).length;
  return { title: tagValue(head, "title"), items: items, rawCount: rawCount };
}

function feedUrl(link, shelf, page) {
  return FEED_BASE + encodeURIComponent(link.userId) + "?" + (link.key ? "key=" + encodeURIComponent(link.key) + "&" : "") +
    "shelf=" + encodeURIComponent(shelf) + "&per_page=" + PAGE_SIZE + "&sort=date_read&order=d" + (page > 1 ? "&page=" + page : "");
}

async function fetchPage(link, shelf, page) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl(link, shelf, page), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; discord-game-price-bot)", "Accept": "application/rss+xml, application/xml, text/xml" },
      signal: controller.signal
    });
    if (!res.ok) return { ok: false, status: res.status, items: [] };
    const parsed = parseFeed(await res.text());
    if (!parsed) return { ok: false, status: 200, items: [] };
    return { ok: true, status: 200, items: parsed.items, rawCount: parsed.rawCount };
  } catch (err) {
    return { ok: false, status: 0, items: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchShelf(link, shelf, options) {
  const maxPages = options && options.firstPageOnly ? 1 : MAX_PAGES;
  const first = await fetchPage(link, shelf, 1);
  if (!first.ok) return first;
  let items = first.items;
  let lastCount = first.rawCount;
  for (let page = 2; page <= maxPages && lastCount >= PAGE_SIZE - SHORT_PAGE_SLACK; page++) {
    const next = await fetchPage(link, shelf, page);
    if (!next.ok) break;
    lastCount = next.rawCount;
    items = items.concat(next.items);
  }
  return { ok: true, status: 200, items: items };
}

function parseLinkInput(text) {
  const input = (text || "").trim();
  const keyMatch = input.match(/[?&]key=([A-Za-z0-9_-]+)/);
  const idMatch = input.match(/^\d+$/) || input.match(/list_rss\/(\d+)/) || input.match(/user\/show\/(\d+)/);
  if (!idMatch) return null;
  return { userId: idMatch[1] || idMatch[0], key: keyMatch ? keyMatch[1] : null };
}

module.exports = { parseFeed, fetchShelf, parseLinkInput, decodeEntities };
