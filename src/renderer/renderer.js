/*
 * Daily Start - https://github.com/Akram-Sakib/daily-start
 * Copyright 2026 Md Akram Hossain (Akram Sakib)
 * Licensed under the Apache Licence, Version 2.0. See LICENSE and NOTICE.
 */

'use strict';

/* =====================================================================
   Daily Start — renderer

   Talks to the main process only through window.api (see preload.js).
   Week / Month / Year all read the same analytics shape, so each view is
   just a different chart over the same numbers, and every period can be
   stepped backwards for as far as the history goes.
   ===================================================================== */

const bridge = window.api || makeDemoApi();

let state = null;
let view = 'today';
let scope = 'week';
let anchor = null; // date key inside the visible period
let stats = null; // last analytics payload

/* ------------------------------ helpers ------------------------------ */

const $ = (sel) => document.querySelector(sel);
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function prettyDate(key) {
  const d = parseKey(key);
  return `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function shortDate(key) {
  const d = parseKey(key);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

function greetingFor(date) {
  const h = date.getHours();
  if (h < 5) return { text: 'Still Up', icon: 'moon' };
  if (h < 12) return { text: 'Good Morning', icon: 'sun' };
  if (h < 17) return { text: 'Good Afternoon', icon: 'sun' };
  if (h < 21) return { text: 'Good Evening', icon: 'sunset' };
  return { text: 'Good Night', icon: 'moon' };
}

/**
 * done/total -> 0-4 on the sequential ramp. Five steps in total, the same
 * count a contribution graph uses: empty plus four quartiles.
 */
function heatLevel(done, total) {
  if (!total || !done) return 0;
  const r = done / total;
  if (r >= 1) return 4;
  if (r > 0.66) return 3;
  if (r > 0.33) return 2;
  return 1;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name, cls) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  if (cls) svg.setAttribute('class', cls);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/* ------------------------------ tooltip ------------------------------ */

const tip = $('#tooltip');

function bindTip(node, html) {
  node.addEventListener('mouseenter', () => {
    tip.innerHTML = html;
    tip.classList.remove('hidden');
  });
  node.addEventListener('mousemove', (e) => {
    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY - tip.offsetHeight - pad;
    if (x + tip.offsetWidth > window.innerWidth - 6) x = e.clientX - tip.offsetWidth - pad;
    if (y < 6) y = e.clientY + pad;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  node.addEventListener('mouseleave', () => tip.classList.add('hidden'));
}

function hideTip() {
  tip.classList.add('hidden');
}

/* ------------------------------- today ------------------------------ */

async function refresh(next) {
  state = next || (await bridge.getState());
  document.documentElement.dataset.theme = state.theme === 'ink' ? 'ink' : 'paper';
  renderHero();
  renderToday();
  renderFooter();
  if (view !== 'today') await loadStats();
}

function renderHero() {
  const g = greetingFor(new Date(state.now));
  const heroIcon = $('#hero-icon');
  heroIcon.firstElementChild.setAttribute('href', `#i-${g.icon}`);
  heroIcon.dataset.icon = g.icon; // lets CSS tune the odd glyph's optical centre
  $('#greeting').textContent = `${g.text}, ${state.name}`;
  $('#date-line').textContent = prettyDate(state.today.key);

  const line = $('#streak-line');
  line.innerHTML = '';
  if (state.streak > 0) {
    line.append(
      icon('flame', 'streak-icon'),
      el('span', '', state.streak > 1 ? `${state.streak} day streak — keep it alive` : 'Day one. Again.'),
    );
  }
}

function renderToday() {
  const { tasks } = state.today;
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  $('#progress-label').textContent = tasks.length ? `${done} of ${tasks.length} done` : 'Nothing on the list yet';
  $('#progress-pct').textContent = tasks.length ? `${pct}%` : '';
  $('#progress-fill').style.width = `${pct}%`;

  const list = $('#today-list');
  list.innerHTML = '';
  if (!tasks.length) list.append(el('li', 'empty', 'Add your first item below.'));

  tasks.forEach((task) => {
    const li = el('li', `task${task.done ? ' done' : ''}`);
    li.append(makeBox(task.done), el('span', 'task-title', task.title));

    const del = el('button', 'task-del');
    del.title = 'Remove';
    del.append(icon('x'));
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      await refresh(await bridge.removeTask(task.id));
    });
    li.append(del);

    li.addEventListener('click', async () => refresh(await bridge.toggleTask(task.id)));
    list.append(li);
  });

  renderRecap();
}

/** Checkbox: a rounded square, with the tick drawn in SVG when done. */
function makeBox(done) {
  const box = el('span', 'box');
  if (done) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M5 12.8 9.6 17.4 19 8');
    svg.append(p);
    box.append(svg);
  }
  return box;
}

function renderRecap() {
  const recap = state.recap;
  const block = $('#recap-block');
  const list = $('#recap-list');
  list.innerHTML = '';

  if (!recap || !recap.tasks.length) {
    block.classList.add('hidden');
    return;
  }
  block.classList.remove('hidden');
  const isYesterday = daysBetween(recap.key, state.today.key) === 1;
  $('#recap-title').textContent = isYesterday ? 'Yesterday' : shortDate(recap.key);

  [...recap.tasks]
    .sort((a, b) => Number(b.done) - Number(a.done))
    .forEach((t) => {
      const li = el('li', 'task');
      const mark = el('span', `mark${t.done ? '' : ' miss'}`);
      mark.append(icon(t.done ? 'check' : 'dot'));
      li.append(mark, el('span', 'task-title', t.title));

      // history is editable too — drop a line you never actually did
      const del = el('button', 'task-del');
      del.title = 'Remove from history';
      del.append(icon('x'));
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        hideTip();
        await refresh(await bridge.removeFromHistory(recap.key, t.id));
        if (view !== 'today') await loadStats();
      });
      li.append(del);
      list.append(li);
    });
}

function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

function renderFooter() {
  const btn = $('#btn-start');
  const hint = $('#footer-hint');
  if (state.mode === 'evening') {
    btn.textContent = 'Wrap Up My Day';
    hint.textContent = 'Done for tonight. Closing the window does the same.';
  } else if (state.mode === 'morning') {
    btn.textContent = 'Start My Day';
    hint.textContent = state.evening.enabled
      ? `Back tonight at ${state.evening.pretty}. Closing the window works too.`
      : "Won't open again today. Closing the window works too.";
  } else if (state.mode === 'manual' && state.morning.useTime) {
    btn.textContent = 'Close';
    hint.textContent = state.evening.enabled
      ? `Next check-in tonight at ${state.evening.pretty}.`
      : `Nothing owed today — back tomorrow from ${state.morning.pretty}.`;
  } else {
    btn.textContent = 'Close';
    hint.textContent = state.evening.enabled
      ? `Next check-in tonight at ${state.evening.pretty}.`
      : 'Nothing owed today — this just closes the window.';
  }
}

/* ---------------------------- analytics ---------------------------- */

async function loadStats(payload) {
  stats = payload || (await bridge.getAnalytics(scope, anchor));
  anchor = stats.anchor;
  renderStats();
}

async function step(delta) {
  hideTip();
  await loadStats(await bridge.stepAnalytics(scope, anchor, delta));
}

function renderStats() {
  $('#per-label').textContent = stats.label;
  $('#per-prev').disabled = !stats.hasPrev;
  $('#per-next').disabled = !stats.hasNext;

  const s = stats.stats;
  const tiles = [
    { val: String(s.done), key: 'done', tip: `${s.done} of ${s.total} checklist items ticked off` },
    {
      val: s.rate === null ? '—' : `${s.rate}%`,
      key: 'rate',
      tip: s.rate === null ? 'Nothing on the list in this period' : `${s.rate}% of everything on the list got done`,
    },
  ];
  if (scope === 'week') {
    tiles.push({ val: String(s.perfectDays), key: 'perfect', tip: 'Days where every single item got done' });
  } else {
    tiles.push(
      { val: String(s.activeDays), key: 'active', tip: 'Days with at least one item done' },
      { val: String(s.bestStreak), key: 'streak', tip: 'Longest run of consecutive active days' },
    );
  }
  statTiles('#stat-tiles', tiles);

  const host = $('#chart-host');
  host.innerHTML = '';
  if (scope === 'week') {
    $('#chart-title').textContent = 'Day by day';
    $('#chart-caption').textContent = 'Tasks completed per day';
    host.append(dayBars(stats.days));
  } else if (scope === 'month') {
    $('#chart-title').textContent = 'The month';
    $('#chart-caption').textContent = 'Each square is a day — darker means more done';
    host.append(monthCalendar(stats.days), heatLegend());
  } else {
    $('#chart-title').textContent = 'Month by month';
    $('#chart-caption').textContent = 'Tasks completed per month';
    const heading = el('h2', 'section-title', 'Every day');
    const caption = el('p', 'chart-caption', 'One square per day — darker means more of the list done');
    host.append(
      monthBars(stats.months),
      heading,
      caption,
      contributionGraph(stats.days, Number(stats.start.slice(0, 4))),
      heatLegend(),
    );
  }

  $('#rank-caption').textContent =
    scope === 'week' ? 'Days completed this week' : scope === 'month' ? 'Days completed this month' : 'Days completed this year';
  rankList('#rank-host', stats.tasks);

  const body = $('#table-body');
  body.innerHTML = '';
  if (!stats.tasks.length) {
    const tr = document.createElement('tr');
    const td = el('td', '', 'Nothing recorded in this period.');
    td.colSpan = 4;
    tr.append(td);
    body.append(tr);
  }
  stats.tasks.forEach((r) => {
    const tr = document.createElement('tr');
    [r.title, String(r.done), String(r.seen), `${Math.round((r.done / Math.max(1, r.seen)) * 100)}%`].forEach((v) =>
      tr.append(el('td', '', v)),
    );
    body.append(tr);
  });
}

/* --- week: one bar per day --- */
function dayBars(days) {
  const wrap = el('div', 'chart');
  const bars = el('div', 'bars');
  const axis = el('div', 'bar-axis');
  const max = Math.max(1, ...days.map((d) => d.done));
  const today = state.today.key;

  days.forEach((d) => {
    const col = el('div', 'bar-col');
    col.append(el('span', 'bar-val', d.done ? String(d.done) : ''));
    const bar = el('div', `bar${d.done ? '' : ' zero'}`);
    if (d.done) bar.style.height = `${Math.max(6, (d.done / max) * 100)}px`;
    col.append(bar);
    bindTip(col, `<strong>${shortDate(d.key)}</strong><br>${d.future ? 'not yet' : `${d.done} of ${d.total} done`}`);
    bars.append(col);
    axis.append(el('span', d.key === today ? 'today' : '', DAY_INITIALS[parseKey(d.key).getDay()]));
  });

  wrap.append(bars, axis);
  return wrap;
}

/* --- month: a real calendar, coloured by completion --- */
function monthCalendar(days) {
  const wrap = el('div', 'cal');
  const head = el('div', 'cal-head');
  DAY_INITIALS.forEach((d) => head.append(el('span', '', d)));
  wrap.append(head);

  const grid = el('div', 'cal-grid');
  const pad = parseKey(days[0].key).getDay();
  for (let i = 0; i < pad; i += 1) grid.append(el('i', 'cal-cell blank'));

  days.forEach((d) => {
    const lvl = d.future ? 0 : heatLevel(d.done, d.total);
    const cell = el('div', `cal-cell l${lvl}${d.future ? ' future' : ''}${d.key === state.today.key ? ' is-today' : ''}`);
    cell.append(el('span', 'cal-num', String(parseKey(d.key).getDate())));
    if (!d.future) {
      bindTip(cell, `<strong>${shortDate(d.key)}</strong><br>${d.exists ? `${d.done} of ${d.total} done` : 'no list'}`);
    }
    grid.append(cell);
  });

  wrap.append(grid);
  return wrap;
}

/* --- year: 12 bars + the full-year square strip --- */
function monthBars(months) {
  const wrap = el('div', 'chart');
  const bars = el('div', 'bars');
  const axis = el('div', 'bar-axis');
  const max = Math.max(1, ...months.map((m) => m.done));

  months.forEach((m) => {
    const col = el('div', 'bar-col');
    col.append(el('span', 'bar-val', m.done ? String(m.done) : ''));
    const bar = el('div', `bar${m.done ? '' : ' zero'}`);
    if (m.done) bar.style.height = `${Math.max(6, (m.done / max) * 100)}px`;
    col.append(bar);
    bindTip(
      col,
      `<strong>${m.label}</strong><br>${m.done} of ${m.total} done<br>${m.activeDays} active day${
        m.activeDays === 1 ? '' : 's'
      }`,
    );
    bars.append(col);
    axis.append(el('span', '', m.label[0]));
  });

  wrap.append(bars, axis);
  return wrap;
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

/**
 * The year as a contribution graph: 7 weekday rows, one column per week,
 * month labels across the top, Mon/Wed/Fri down the left.
 *
 * A full 53-column year needs ~690px at GitHub's own square size and this
 * window has ~400, so the year is wrapped into two half-year bands rather
 * than squashed into 5px dots. Everything else follows the original: week
 * columns start on Sunday, partial weeks at either end stay partial, and
 * the scale is empty + four steps.
 */
function contributionGraph(days, year) {
  const wrap = el('div', 'gh');

  // bucket the year into week columns, Sunday first
  const weeks = [];
  let column = null;
  days.forEach((d) => {
    const weekday = parseKey(d.key).getDay();
    if (weekday === 0 || !column) {
      column = { days: new Array(7).fill(null) };
      weeks.push(column);
    }
    column.days[weekday] = d;
  });

  const july = `${year}-07-01`;
  const firstOfSecondHalf = weeks.findIndex((w) => w.days.some((d) => d && d.key >= july));
  const bands = [weeks.slice(0, firstOfSecondHalf), weeks.slice(firstOfSecondHalf)];

  bands.forEach((band) => {
    if (!band.length) return;
    const grid = el('div', 'gh-band');
    // column 1 holds the weekday labels; the rest are one week each
    grid.style.gridTemplateColumns = `26px repeat(${band.length}, 1fr)`;

    WEEKDAY_LABELS.forEach((label, weekday) => {
      if (!label) return;
      const node = el('span', 'gh-day-label', label);
      node.style.gridRow = String(weekday + 2);
      grid.append(node);
    });

    // month labels: placed on the first column that holds that month, and
    // spanning until the next one starts. Runs under two columns wide are
    // dropped rather than overlapping their neighbour.
    const starts = [];
    band.forEach((week, index) => {
      const month = firstMonthIn(week);
      if (month !== null && (!starts.length || starts[starts.length - 1].month !== month)) {
        starts.push({ month, index });
      }
    });
    starts.forEach((entry, i) => {
      const span = (i + 1 < starts.length ? starts[i + 1].index : band.length) - entry.index;
      if (span < 2) return;
      const node = el('span', 'gh-month', MONTHS[entry.month].slice(0, 3));
      node.style.gridColumn = `${entry.index + 2} / span ${span}`;
      grid.append(node);
    });

    band.forEach((week, index) => {
      week.days.forEach((d, weekday) => {
        const cell = el('i', 'gh-cell');
        cell.style.gridColumn = String(index + 2);
        cell.style.gridRow = String(weekday + 2);
        if (!d) {
          cell.classList.add('void');
        } else if (d.future) {
          cell.classList.add('ahead');
        } else {
          cell.classList.add(`l${heatLevel(d.done, d.total)}`);
          if (d.key === state.today.key) cell.classList.add('is-today');
          bindTip(
            cell,
            `<strong>${prettyDate(d.key)}</strong><br>${d.exists ? `${d.done} of ${d.total} done` : 'no list'}`,
          );
        }
        grid.append(cell);
      });
    });

    wrap.append(grid);
  });

  return wrap;
}

function firstMonthIn(week) {
  const first = week.days.find(Boolean);
  return first ? Number(first.key.slice(5, 7)) - 1 : null;
}

function heatLegend() {
  const wrap = el('div', 'heat-legend');
  wrap.append(el('span', 'muted', 'less'));
  for (let i = 0; i <= 4; i += 1) wrap.append(el('i', `hl l${i}`));
  wrap.append(el('span', 'muted', 'more'));
  return wrap;
}

/* --- shared pieces --- */

function rankList(sel, rows) {
  const host = $(sel);
  host.innerHTML = '';
  if (!rows.length) {
    host.append(el('p', 'empty', 'Nothing recorded in this period yet.'));
    return;
  }
  rows.forEach((r) => {
    const wrap = el('div', 'rank');
    const head = el('div', 'rank-head');
    head.append(el('span', 'rank-name', r.title), el('span', 'rank-num', `${r.done}/${r.seen}`));
    const track = el('div', 'rank-track');
    const fill = el('div', 'rank-fill');
    const pct = Math.round((r.done / Math.max(1, r.seen)) * 100);
    fill.style.width = `${pct}%`;
    track.append(fill);
    wrap.append(head, track);
    bindTip(wrap, `<strong>${r.title}</strong><br>done ${r.done} of ${r.seen} days<br>${pct}% completion`);
    host.append(wrap);
  });
}

function statTiles(sel, tiles) {
  const host = $(sel);
  host.innerHTML = '';
  tiles.forEach((t) => {
    const box = el('div', 'stat');
    box.append(el('div', 'stat-val', t.val), el('div', 'stat-key', t.key));
    if (t.tip) bindTip(box, t.tip);
    host.append(box);
  });
}

/* ------------------------------- events ------------------------------ */

async function setView(next) {
  view = next;
  hideTip();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === next));
  $('#view-today').classList.toggle('hidden', next !== 'today');
  $('#view-stats').classList.toggle('hidden', next === 'today');
  document.querySelector('.sheet').scrollTop = 0;

  if (next !== 'today') {
    if (next !== scope) {
      scope = next;
      anchor = state.today.key; // switching scope jumps back to now
    }
    await loadStats();
  }
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
$('#per-prev').addEventListener('click', () => step(-1));
$('#per-next').addEventListener('click', () => step(1));

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#add-input');
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  await refresh(await bridge.addTask(value));
});

$('#btn-start').addEventListener('click', () => bridge.finishDay());
$('#btn-min').addEventListener('click', () => bridge.minimize());
$('#btn-close').addEventListener('click', () => bridge.close());

$('#btn-theme').addEventListener('click', async () => {
  const next = document.documentElement.dataset.theme === 'ink' ? 'paper' : 'ink';
  document.documentElement.dataset.theme = next;
  await refresh(await bridge.setSettings({ theme: next }));
});

/* --- settings panel --- */

const panel = $('#settings-panel');

function syncTimeRows() {
  const morningOn = $('#set-morning').checked;
  $('#morning-time-row').classList.toggle('off', !morningOn);
  $('#set-morning-time').disabled = !morningOn;

  const eveningOn = $('#set-evening').checked;
  $('#evening-time-row').classList.toggle('off', !eveningOn);
  $('#set-evening-time').disabled = !eveningOn;
}

function openSettings() {
  $('#set-name').value = state.name;
  $('#set-routines').value = state.routines.join('\n');
  $('#set-autolaunch').checked = state.autoLaunch;
  $('#set-morning').checked = Boolean(state.morning.useTime);
  $('#set-morning-time').value = state.morning.time || '08:00';
  $('#set-evening').checked = Boolean(state.evening.enabled);
  $('#set-evening-time').value = state.evening.time || '22:00';
  syncTimeRows();
  panel.classList.remove('hidden');
}

$('#btn-settings').addEventListener('click', openSettings);
$('#btn-settings-close').addEventListener('click', () => panel.classList.add('hidden'));
$('#set-morning').addEventListener('change', syncTimeRows);
$('#set-evening').addEventListener('change', syncTimeRows);
panel.addEventListener('click', (e) => {
  if (e.target === panel) panel.classList.add('hidden');
});

$('#btn-save-settings').addEventListener('click', async () => {
  const patch = {
    name: $('#set-name').value,
    routines: $('#set-routines').value.split('\n'),
    autoLaunch: $('#set-autolaunch').checked,
    morning: { useTime: $('#set-morning').checked, time: $('#set-morning-time').value },
    evening: { enabled: $('#set-evening').checked, time: $('#set-evening-time').value },
  };
  panel.classList.add('hidden');
  await refresh(await bridge.setSettings(patch));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!panel.classList.contains('hidden')) panel.classList.add('hidden');
    else bridge.close();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    setView('today').then(() => $('#add-input').focus());
  }
  if (view !== 'today' && !e.ctrlKey && !e.metaKey) {
    if (e.key === 'ArrowLeft' && stats?.hasPrev) step(-1);
    if (e.key === 'ArrowRight' && stats?.hasNext) step(1);
  }
});

bridge.onDayChanged?.(() => refresh());
bridge.onRefresh?.(() => refresh());

refresh().then(() => {
  anchor = state.today.key;
});

/* ------------------------- browser-preview demo ------------------------ */

function makeDemoApi() {
  const key = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const routines = ['Job', 'Gym', 'SaaS - 2 hours', 'Study'];
  const today = {
    key: key(0),
    tasks: routines.map((title, i) => ({ id: `d${i}`, title, done: i < 2 })),
    opened: false,
  };
  const parse = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const dayFor = (k, i) => {
    const seed = (parse(k).getTime() / 86400000 + 3) % 7;
    const tasks = routines.map((title, idx) => ({ title, done: (seed + idx) % 4 !== 0 }));
    if (seed === 5) tasks.length = 0;
    return {
      key: k,
      exists: tasks.length > 0,
      future: k > key(0),
      total: tasks.length,
      done: tasks.filter((t) => t.done).length,
      tasks,
    };
  };

  const build = (sc, anch) => {
    const a = parse(anch || key(0));
    let start;
    let end;
    let label;
    if (sc === 'year') {
      start = new Date(a.getFullYear(), 0, 1);
      end = new Date(a.getFullYear(), 11, 31);
      label = String(a.getFullYear());
    } else if (sc === 'month') {
      start = new Date(a.getFullYear(), a.getMonth(), 1);
      end = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      label = `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    } else {
      start = new Date(a);
      start.setDate(start.getDate() - start.getDay());
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      label = `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()}–${end.getDate()}`;
    }
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(dayFor(fmt(d), days.length));
    const past = days.filter((d) => !d.future);
    const done = past.reduce((s, d) => s + d.done, 0);
    const total = past.reduce((s, d) => s + d.total, 0);
    const map = new Map();
    past.forEach((d) =>
      d.tasks.forEach((t) => {
        const r = map.get(t.title) || { title: t.title, seen: 0, done: 0 };
        r.seen += 1;
        if (t.done) r.done += 1;
        map.set(t.title, r);
      }),
    );
    const out = {
      scope: sc,
      anchor: fmt(start),
      label,
      days,
      stats: {
        done,
        total,
        rate: total ? Math.round((done / total) * 100) : null,
        activeDays: past.filter((d) => d.done > 0).length,
        perfectDays: past.filter((d) => d.total > 0 && d.done === d.total).length,
        bestStreak: 11,
      },
      tasks: [...map.values()].sort((x, y) => y.done - x.done),
      hasPrev: true,
      hasNext: end < new Date(),
    };
    if (sc === 'year') {
      out.months = MONTHS.map((m, i) => {
        const inMonth = past.filter((d) => parse(d.key).getMonth() === i);
        return {
          key: `${a.getFullYear()}-${i}`,
          label: m.slice(0, 3),
          done: inMonth.reduce((s, d) => s + d.done, 0),
          total: inMonth.reduce((s, d) => s + d.total, 0),
          activeDays: inMonth.filter((d) => d.done > 0).length,
        };
      });
    }
    return out;
  };

  const snap = () => ({
    name: 'Akram',
    routines,
    autoLaunch: true,
    theme: document.documentElement.dataset.theme || 'paper',
    morning: { useTime: true, time: '08:00', pretty: '8:00 AM' },
    evening: { enabled: true, time: '22:00', pretty: '10:00 PM' },
    mode: 'morning',
    today,
    recap: {
      key: key(-1),
      tasks: [
        { id: 'r1', title: 'Finished API', done: true },
        { id: 'r2', title: 'Gym', done: true },
        { id: 'r3', title: 'Study', done: false },
      ],
    },
    streak: 9,
    now: new Date().toISOString(),
  });

  return {
    getState: async () => snap(),
    toggleTask: async (id) => {
      const t = today.tasks.find((x) => x.id === id);
      if (t) t.done = !t.done;
      return snap();
    },
    addTask: async (title) => {
      today.tasks.push({ id: `d${today.tasks.length + 9}`, title, done: false });
      return snap();
    },
    removeTask: async (id) => {
      today.tasks = today.tasks.filter((x) => x.id !== id);
      return snap();
    },
    removeFromHistory: async () => snap(),
    getAnalytics: async (sc, anch) => build(sc, anch),
    stepAnalytics: async (sc, anch, delta) => {
      const a = parse(anch);
      if (sc === 'week') a.setDate(a.getDate() + 7 * delta);
      else if (sc === 'month') a.setMonth(a.getMonth() + delta);
      else a.setFullYear(a.getFullYear() + delta);
      return build(sc, fmt(a));
    },
    setSettings: async (patch) => {
      if (patch.theme) document.documentElement.dataset.theme = patch.theme;
      return snap();
    },
    finishDay: async () => {},
    minimize: () => {},
    close: () => {},
    onDayChanged: () => {},
    onRefresh: () => {},
  };
}
