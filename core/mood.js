const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const FALLBACK_MOODS = ["neutral", "default"];
const MOOD_COLOR = 0x5fd4b0;
const MOOD_PICK_TOKENS = 8;

function createMood(options) {
  const { rootDir, completeShort } = options;
  const moodsDir = path.join(rootDir, "moods");

  function isEnabled() {
    try {
      const data = yaml.load(fs.readFileSync(path.join(rootDir, "personality.yaml"), "utf8"));
      return !!(data && data.moodImages === true);
    } catch (err) {
      return false;
    }
  }

  function listImages() {
    let names;
    try {
      names = fs.readdirSync(moodsDir);
    } catch (err) {
      return [];
    }
    return names
      .filter((file) => IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()))
      .sort()
      .map((file) => ({
        mood: path.basename(file, path.extname(file)).toLowerCase(),
        path: path.join(moodsDir, file),
        name: "mood" + path.extname(file).toLowerCase()
      }));
  }

  function imageFor(mood) {
    if (!isEnabled()) return null;
    return listImages().find((image) => image.mood === mood) || null;
  }

  function fallbackImage(images) {
    for (const mood of FALLBACK_MOODS) {
      const found = images.find((image) => image.mood === mood);
      if (found) return found;
    }
    return null;
  }

  function parseMood(raw, images) {
    if (!raw) return null;
    const words = raw.toLowerCase().match(/[a-z]+/g) || [];
    for (const word of words) {
      const found = images.find((image) => image.mood === word);
      if (found) return found;
    }
    return null;
  }

  async function pickImage(text) {
    if (!isEnabled()) return null;
    const images = listImages();
    if (images.length === 0) return null;
    if (images.length === 1) return images[0];

    const moods = images.map((image) => image.mood).join(", ");
    let raw = null;
    try {
      raw = await completeShort(
        "You pick the mood a cartoon robot is in from the words it just said. Reply with exactly one word from this " +
        "list and nothing else: " + moods + ".",
        text,
        MOOD_PICK_TOKENS
      );
    } catch (err) {
      raw = null;
    }
    return parseMood(raw, images) || fallbackImage(images);
  }

  return { isEnabled, listImages, imageFor, pickImage, color: MOOD_COLOR };
}

module.exports = { createMood };
