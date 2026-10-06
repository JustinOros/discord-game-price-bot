function flatten(value, prefix, out) {
  if (value !== null && typeof value === "object") {
    const keys = Array.isArray(value) ? value.map((_, i) => i) : Object.keys(value);
    if (keys.length === 0) {
      out.set(prefix, Array.isArray(value) ? "[]" : "{}");
      return out;
    }
    for (const key of keys) {
      const next = Array.isArray(value) ? prefix + "[" + key + "]" : prefix ? prefix + "." + key : String(key);
      flatten(value[key], next, out);
    }
    return out;
  }
  out.set(prefix, JSON.stringify(value));
  return out;
}

function clip(text, max) {
  if (text === undefined) return "(missing)";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function diffTranscripts(expected, actual, limit) {
  const a = flatten(expected, "", new Map());
  const b = flatten(actual, "", new Map());
  const lines = [];
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    const av = a.get(key);
    const bv = b.get(key);
    if (av === bv) continue;
    lines.push("  at " + key);
    lines.push("    expected: " + clip(av, 400));
    lines.push("    actual:   " + clip(bv, 400));
  }
  const total = lines.length / 3;
  if (total === 0) return [];
  const max = limit || 30;
  if (total > max) {
    const shown = lines.slice(0, max * 3);
    shown.push("  ... " + (total - max) + " more differences");
    return shown;
  }
  return lines;
}

module.exports = { diffTranscripts, flatten };
