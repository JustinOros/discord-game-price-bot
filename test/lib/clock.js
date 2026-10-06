const RealDate = Date;

function createClock(startIso) {
  let now = RealDate.parse(startIso);
  let timerSeq = 0;
  let timers = [];

  class FakeDateClass extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }
    static now() {
      return now;
    }
  }

  const FakeDate = new Proxy(FakeDateClass, {
    apply() {
      return new RealDate(now).toString();
    }
  });

  function fakeSetTimeout(fn, ms, ...args) {
    const id = ++timerSeq;
    const entry = { id, at: now + Math.max(0, Number(ms) || 0), fn, args, seq: id };
    timers.push(entry);
    const handle = {
      ref() { return handle; },
      unref() { return handle; },
      hasRef() { return true; },
      refresh() { return handle; },
      [Symbol.toPrimitive]() { return id; },
      _fakeTimerId: id
    };
    entry.handle = handle;
    return handle;
  }

  function fakeClearTimeout(handle) {
    if (!handle) return;
    const id = typeof handle === "object" ? handle._fakeTimerId : handle;
    timers = timers.filter((t) => t.id !== id);
  }

  function nextDue(limit) {
    let best = null;
    for (const t of timers) {
      if (t.at > limit) continue;
      if (!best || t.at < best.at || (t.at === best.at && t.seq < best.seq)) best = t;
    }
    return best;
  }

  async function advance(ms, settle) {
    const target = now + ms;
    for (;;) {
      const due = nextDue(target);
      if (!due) break;
      timers = timers.filter((t) => t.id !== due.id);
      if (due.at > now) now = due.at;
      try {
        const result = due.fn(...due.args);
        if (result && typeof result.then === "function") await result;
      } catch (err) {
        if (settle && settle.onError) settle.onError(err);
      }
      if (settle && settle.fn) await settle.fn();
    }
    now = target;
  }

  return {
    RealDate,
    FakeDate,
    setNow(value) {
      now = typeof value === "number" ? value : RealDate.parse(value);
    },
    getNow() {
      return now;
    },
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    pendingTimers() {
      return timers.length;
    },
    advance
  };
}

function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { createClock, createRandom, RealDate };
