'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ *
 * Tiny JSON "database".
 * Everything lives in one file inside Electron's userData folder:
 *   Windows -> C:\Users\<you>\AppData\Roaming\Daily Start\daily-start.json
 * No SQLite, no server, no migrations to babysit.
 *
 * History is kept for years, not weeks -- the Year view needs it, and
 * a year of checklists is only a couple hundred KB of JSON.
 * ------------------------------------------------------------------ */

const KEEP_DAYS = 366 * 6; // ~6 years of history, then the oldest days fall off

const DEFAULT_DATA = {
  version: 3,
  name: 'Akram',
  routines: ['Job', 'Gym', 'SaaS - 2 hours', 'Study'],
  autoLaunch: true,
  theme: 'paper',
  // Second look at the checklist late in the evening. Off by default.
  evening: { enabled: false, time: '22:00' },
  days: {},
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Local (not UTC) date key: 2026-08-23 */
function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftKey(key, deltaDays) {
  const d = parseKey(key);
  d.setDate(d.getDate() + deltaDays);
  return dateKey(d);
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * A day has two slots the app can surface: the morning checklist and the
 * optional evening check-in. Each one ends in exactly one of three states:
 *
 *   done       you pressed the button -- the day was actually started
 *   dismissed  you closed the window -- seen, acknowledged, leave me alone
 *   neither    still owed
 *
 * `dismissed` is the state the old model was missing, which is why closing
 * the window used to leave the slot owed and the app kept re-opening it.
 */
function newSlot() {
  return { done: false, dismissed: false, at: null };
}

function newSlots() {
  return { morning: newSlot(), evening: newSlot() };
}

/** A slot is settled once it has been done OR deliberately dismissed. */
function settled(slot) {
  return Boolean(slot && (slot.done || slot.dismissed));
}

/** "22:00" -> 1320 minutes past midnight. Invalid input -> null. */
function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

class Store {
  constructor(filePath) {
    this.file = filePath;
    this.data = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const data = { ...structuredClone(DEFAULT_DATA), ...parsed };
      // v1 files have no `evening` block
      data.evening = { ...DEFAULT_DATA.evening, ...(parsed.evening || {}) };
      return migrate(data);
    } catch (err) {
      // First run, or a corrupted file. Back the bad one up and start clean.
      if (err.code !== 'ENOENT') {
        try {
          fs.renameSync(this.file, `${this.file}.broken-${Date.now()}`);
        } catch (_) {
          /* ignore */
        }
      }
      return structuredClone(DEFAULT_DATA);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file); // atomic-ish: never leaves a half-written file
    return this.data;
  }

  /* ---------------- day handling ---------------- */

  /**
   * Make sure today's entry exists. If it does not, build it from the
   * routine template -- that is the whole "tomorrow -> reset" mechanic.
   */
  ensureToday(now = new Date()) {
    const key = dateKey(now);
    if (!this.data.days[key]) {
      this.data.days[key] = {
        tasks: this.data.routines.map((title) => ({ id: uid(), title, done: false, routine: true })),
        ...newSlots(),
      };
      this.prune();
      this.save();
    }
    return this.data.days[key];
  }

  prune() {
    const cutoff = shiftKey(dateKey(), -KEEP_DAYS);
    for (const key of Object.keys(this.data.days)) {
      if (key < cutoff) delete this.data.days[key];
    }
  }

  /** Yesterday, or the most recent earlier day that actually has tasks. */
  lastRecap(now = new Date()) {
    const today = dateKey(now);
    const earlier = Object.keys(this.data.days)
      .filter((k) => k < today)
      .sort()
      .reverse();
    for (const key of earlier) {
      const day = this.data.days[key];
      if (day && day.tasks && day.tasks.length) return { key, ...day };
    }
    return null;
  }

  /** Consecutive days ending today where at least one task got done. */
  streak(now = new Date()) {
    let count = 0;
    let key = dateKey(now);
    if ((this.data.days[key]?.tasks || []).some((t) => t.done)) count += 1;
    key = shiftKey(key, -1);
    for (let i = 0; i < KEEP_DAYS; i += 1) {
      const day = this.data.days[key];
      if (day && (day.tasks || []).some((t) => t.done)) {
        count += 1;
        key = shiftKey(key, -1);
      } else {
        break;
      }
    }
    return count;
  }

  /** Oldest / newest keys that hold data. */
  bounds() {
    const keys = Object.keys(this.data.days).sort();
    return { first: keys[0] || null, last: keys[keys.length - 1] || null };
  }

  /* ---------------- analytics ---------------- */

  /**
   * One shape for all three ranges, so the UI only learns it once.
   * scope: 'week' | 'month' | 'year'; anchor: any date key inside the range.
   */
  analytics(scope = 'week', anchor = dateKey(), now = new Date()) {
    const todayKey = dateKey(now);
    const range = this.rangeFor(scope, anchor);
    const days = [];

    let cursor = range.start;
    while (cursor <= range.end) {
      const day = this.data.days[cursor];
      const tasks = (day && day.tasks) || [];
      days.push({
        key: cursor,
        exists: Boolean(day),
        future: cursor > todayKey,
        total: tasks.length,
        done: tasks.filter((t) => t.done).length,
        tasks: tasks.map((t) => ({ title: t.title, done: t.done })),
      });
      cursor = shiftKey(cursor, 1);
    }

    const past = days.filter((d) => !d.future);
    const done = past.reduce((s, d) => s + d.done, 0);
    const total = past.reduce((s, d) => s + d.total, 0);

    const out = {
      scope,
      anchor: range.start,
      label: range.label,
      start: range.start,
      end: range.end,
      days,
      stats: {
        done,
        total,
        rate: total ? Math.round((done / total) * 100) : null,
        activeDays: past.filter((d) => d.done > 0).length,
        perfectDays: past.filter((d) => d.total > 0 && d.done === d.total).length,
        bestStreak: bestRun(past),
      },
      tasks: aggregate(past),
      hasPrev: this.hasDataBefore(range.start),
      hasNext: range.end < todayKey,
    };

    if (scope === 'year') out.months = monthlyRollup(days, Number(range.start.slice(0, 4)));
    return out;
  }

  rangeFor(scope, anchor) {
    const d = parseKey(anchor);
    if (scope === 'year') {
      const y = d.getFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
    }
    if (scope === 'month') {
      const y = d.getFullYear();
      const m = d.getMonth();
      const last = new Date(y, m + 1, 0).getDate();
      return {
        start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        end: `${y}-${String(m + 1).padStart(2, '0')}-${last}`,
        label: `${MONTHS_LONG[m]} ${y}`,
      };
    }
    // week: Sunday -> Saturday
    const startKey = shiftKey(anchor, -d.getDay());
    const endKey = shiftKey(startKey, 6);
    const s = parseKey(startKey);
    const e = parseKey(endKey);
    const label =
      s.getMonth() === e.getMonth()
        ? `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}–${e.getDate()}`
        : `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}`;
    return { start: startKey, end: endKey, label };
  }

  hasDataBefore(key) {
    const { first } = this.bounds();
    return Boolean(first && first < key);
  }

  /** Step one period back or forward from an anchor. */
  stepAnchor(scope, anchor, delta) {
    const d = parseKey(anchor);
    if (scope === 'week') return shiftKey(anchor, 7 * delta);
    if (scope === 'month') return dateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    return dateKey(new Date(d.getFullYear() + delta, 0, 1));
  }

  /* ---------------- mutations ---------------- */

  toggleTask(id, now = new Date()) {
    const day = this.ensureToday(now);
    const task = day.tasks.find((t) => t.id === id);
    if (task) {
      task.done = !task.done;
      this.save();
    }
    return day;
  }

  addTask(title, now = new Date()) {
    const clean = String(title || '').trim().slice(0, 120);
    if (!clean) return this.ensureToday(now);
    const day = this.ensureToday(now);
    day.tasks.push({ id: uid(), title: clean, done: false, routine: false });
    this.save();
    return day;
  }

  removeTask(id, now = new Date()) {
    const day = this.ensureToday(now);
    day.tasks = day.tasks.filter((t) => t.id !== id);
    this.save();
    return day;
  }

  /** Delete one line out of a past day (the history recap). */
  removeFromDay(dayKey, taskId) {
    const day = this.data.days[dayKey];
    if (!day) return null;
    day.tasks = day.tasks.filter((t) => t.id !== taskId);
    if (!day.tasks.length) delete this.data.days[dayKey];
    this.save();
    return day;
  }

  /* ---------------- slot bookkeeping ---------------- */

  slot(name, now = new Date()) {
    const day = this.ensureToday(now);
    if (!day[name]) day[name] = newSlot();
    return day[name];
  }

  /** The button was pressed: the day was actually started / wrapped up. */
  markDone(name, now = new Date()) {
    const slot = this.slot(name, now);
    slot.done = true;
    if (!slot.at) slot.at = now.toISOString();
    this.save();
    return slot;
  }

  /**
   * The window was closed instead. That still counts as "seen" -- the app
   * must not come back on its own, or it turns into a popup that cannot be
   * escaped. It just does not record that the day was started.
   */
  markDismissed(name, now = new Date()) {
    const slot = this.slot(name, now);
    if (!slot.done) slot.dismissed = true;
    this.save();
    return slot;
  }

  /**
   * What is this launch for?
   *   'morning'  -> the checklist is still owed today
   *   'evening'  -> the evening time has passed and that slot is still owed
   *   null       -> nothing owed; an automatic launch should stay quiet
   */
  dueMode(now = new Date()) {
    const day = this.ensureToday(now);
    if (!settled(day.morning)) return 'morning';

    const evening = this.data.evening || {};
    if (!evening.enabled) return null;
    const at = minutesOf(evening.time);
    if (at === null || settled(day.evening)) return null;
    return now.getHours() * 60 + now.getMinutes() >= at ? 'evening' : null;
  }

  /** True while an evening check-in is still ahead of us today. */
  eveningPending(now = new Date()) {
    const evening = this.data.evening || {};
    if (!evening.enabled) return false;
    const at = minutesOf(evening.time);
    if (at === null) return false;
    const day = this.data.days[dateKey(now)];
    if (day && settled(day.evening)) return false;
    return now.getHours() * 60 + now.getMinutes() < at;
  }

  setSettings(patch = {}) {
    if (typeof patch.name === 'string') {
      this.data.name = patch.name.trim().slice(0, 40) || 'friend';
    }
    if (Array.isArray(patch.routines)) {
      this.data.routines = patch.routines
        .map((r) => String(r).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 20);
    }
    if (typeof patch.autoLaunch === 'boolean') this.data.autoLaunch = patch.autoLaunch;
    if (patch.theme === 'paper' || patch.theme === 'ink') this.data.theme = patch.theme;
    if (patch.evening && typeof patch.evening === 'object') {
      const next = { ...this.data.evening };
      if (typeof patch.evening.enabled === 'boolean') next.enabled = patch.evening.enabled;
      if (minutesOf(patch.evening.time) !== null) next.time = patch.evening.time;
      this.data.evening = next;
    }
    this.save();
    return this.data;
  }
}

/* ---------------- helpers ---------------- */

/**
 * v1/v2 stored `opened` / `eveningOpened` booleans, which could only say
 * "done" or "not done" -- there was nowhere to record that a window had been
 * closed on purpose. Fold those into the slot model; an old finished day
 * reads as done, an old unfinished one as still owed.
 */
function migrate(data) {
  if (Number(data.version) >= 3) return data;
  Object.values(data.days || {}).forEach((day) => {
    if (!day.morning) {
      day.morning = { done: Boolean(day.opened), dismissed: false, at: day.startedAt || null };
      day.evening = { done: Boolean(day.eveningOpened), dismissed: false, at: day.eveningAt || null };
    }
    delete day.opened;
    delete day.startedAt;
    delete day.eveningOpened;
    delete day.eveningAt;
  });
  data.version = 3;
  return data;
}

/** Longest run of consecutive days with something done. */
function bestRun(days) {
  let best = 0;
  let run = 0;
  days.forEach((d) => {
    if (d.done > 0) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  });
  return best;
}

/** Group by task title: how often it appeared, how often it got done. */
function aggregate(days) {
  const map = new Map();
  days.forEach((d) => {
    d.tasks.forEach((t) => {
      const row = map.get(t.title) || { title: t.title, seen: 0, done: 0 };
      row.seen += 1;
      if (t.done) row.done += 1;
      map.set(t.title, row);
    });
  });
  return [...map.values()].sort((a, b) => b.done - a.done || b.seen - a.seen).slice(0, 10);
}

function monthlyRollup(days, year) {
  const months = MONTHS_SHORT.map((label, i) => ({
    key: `${year}-${String(i + 1).padStart(2, '0')}`,
    label,
    done: 0,
    total: 0,
    activeDays: 0,
  }));
  days.forEach((d) => {
    if (d.future) return;
    const idx = Number(d.key.slice(5, 7)) - 1;
    months[idx].done += d.done;
    months[idx].total += d.total;
    if (d.done > 0) months[idx].activeDays += 1;
  });
  return months;
}

module.exports = { Store, dateKey, parseKey, shiftKey, minutesOf, DEFAULT_DATA };
