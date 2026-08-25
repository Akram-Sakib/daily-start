'use strict';

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { Store, dateKey, minutesOf } = require('./store');

/* ------------------------------------------------------------------ *
 * Daily Start -- main process
 *
 * Two moments in a day can open the dashboard:
 *
 *   morning  PC starts -> launched with --autostart -> today not opened yet
 *            -> show the checklist. "Start My Day" marks it opened, and it
 *               will not pop up again for the rest of the day.
 *
 *   evening  optional, off by default. Set a time (e.g. 22:00) and the app
 *            stays in the tray after the morning run, then opens once more
 *            so you can tick off what actually happened.
 *
 * With the evening check-in ON the app is resident, so it no longer depends
 * on a reboot: the ticker notices the date rolling over and opens the fresh
 * checklist by itself. With it OFF the app quits when you are done, exactly
 * as before, and the Windows login item brings it back next morning.
 *
 * Launching it by hand always opens the window.
 * ------------------------------------------------------------------ */

const IS_AUTOSTART = process.argv.includes('--autostart');
const TICK_MS = 30 * 1000;

let win = null;
let tray = null;
let store = null;
let ticker = null;
let currentDay = dateKey();
let mode = 'manual'; // 'morning' | 'evening' | 'manual'

/**
 * Belt and braces against the window ever becoming a popup you cannot
 * escape: the ticker surfaces each slot at most ONCE per day, whatever the
 * stored flags say. The persisted `dismissed` flag survives a restart; this
 * guard makes a loop impossible within a session even if that flag were
 * somehow missed.
 */
let surfaced = { morning: false, evening: false };

/* ---- single instance: a second launch focuses the existing window ---- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow('manual'));
  app.whenReady().then(bootstrap);
}

function bootstrap() {
  store = new Store(path.join(app.getPath('userData'), 'daily-start.json'));
  store.ensureToday();
  syncAutoLaunch();

  surfaced = { morning: false, evening: false };
  const due = store.dueMode();

  if (IS_AUTOSTART && !due) {
    // Nothing to show right now. Either linger quietly for tonight's
    // check-in, or get out of the way completely.
    if (store.eveningPending()) {
      createTray();
      startTicker();
      return;
    }
    app.quit();
    return;
  }

  createTray();
  showWindow(due || 'manual');
  startTicker();
}

/* ------------------------------ window ------------------------------ */

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#F0EEE6',
    title: 'Daily Start',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.removeMenu?.();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Keep external links out of the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Alt+F4 and any other route to closing the window count as dismissing
  // the slot, exactly like the close button does.
  win.on('close', () => {
    if (mode === 'morning' || mode === 'evening') store.markDismissed(mode);
  });

  win.on('closed', () => {
    win = null;
  });
}

function showWindow(nextMode = 'manual') {
  mode = nextMode;
  if (nextMode === 'morning' || nextMode === 'evening') surfaced[nextMode] = true;
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('state:refresh');
}

/**
 * Put the window away.
 *
 * `settle` is what makes the close button safe: closing the window marks the
 * current slot as dealt with, so nothing re-opens it. Pressing the footer
 * button and pressing the close button therefore both end the slot -- the
 * only difference is that the button records the day as actually started,
 * and the close button records that you saw it and moved on.
 *
 * If an evening check-in is still ahead we hide and wait in the tray;
 * otherwise the app exits so nothing lingers in the background.
 */
function dismissWindow({ settle = true } = {}) {
  if (settle && (mode === 'morning' || mode === 'evening')) {
    store.markDismissed(mode);
  }
  mode = 'manual';

  if (store.eveningPending()) {
    win?.hide();
    refreshTray();
    return;
  }
  win?.close();
  app.quit();
}

/* ------------------------------- tray ------------------------------- */

function createTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  try {
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  } catch (err) {
    console.warn('Tray unavailable:', err.message);
    return;
  }
  tray.on('click', () => showWindow('manual'));
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const evening = store.data.evening || {};
  const label = evening.enabled ? `Evening check-in at ${prettyTime(evening.time)}` : 'Evening check-in off';
  tray.setToolTip(`Daily Start — ${label}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open dashboard', click: () => showWindow('manual') },
      { label, enabled: false },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]),
  );
}

function prettyTime(hhmm) {
  const total = minutesOf(hhmm);
  if (total === null) return hhmm;
  const h24 = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/* ------------------------------ ticker ------------------------------ */

/** One timer handles both the midnight rollover and the evening check-in. */
function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    const key = dateKey();

    if (key !== currentDay) {
      currentDay = key;
      surfaced = { morning: false, evening: false };
      store.ensureToday();
      win?.webContents.send('day:changed');
    }

    const due = store.dueMode();
    // A minimised window still counts as open: the person put it there, so
    // nothing should pop it back up or quit underneath it.
    const onScreen = Boolean(win && !win.isDestroyed());

    if (due && !surfaced[due]) {
      if (!onScreen || !win.isVisible()) showWindow(due);
      else if (mode !== due) {
        mode = due;
        surfaced[due] = true;
        win.webContents.send('state:refresh');
      }
    }

    // Nothing owed and no window anywhere -> stop lingering in the tray.
    if (!due && !onScreen && !store.eveningPending()) app.quit();
  }, TICK_MS);
}

/* --------------------------- auto launch ---------------------------- */

function syncAutoLaunch() {
  const options = { openAtLogin: Boolean(store.data.autoLaunch), args: ['--autostart'] };

  // In dev (`pnpm start`) the executable is electron.exe, so it also needs
  // the app path. Packaged builds point straight at the installed .exe.
  if (!app.isPackaged) {
    options.path = process.execPath;
    options.args = [path.resolve(app.getAppPath()), '--autostart'];
  }

  try {
    app.setLoginItemSettings(options);
  } catch (err) {
    console.warn('Could not update login item:', err.message);
  }
}

/* ------------------------------ IPC ------------------------------ */

function snapshot() {
  const now = new Date();
  const today = store.ensureToday(now);
  return {
    name: store.data.name,
    routines: store.data.routines,
    autoLaunch: Boolean(store.data.autoLaunch),
    theme: store.data.theme === 'ink' ? 'ink' : 'paper',
    evening: { ...store.data.evening, pretty: prettyTime(store.data.evening.time) },
    mode,
    today: { key: dateKey(now), ...today },
    recap: store.lastRecap(now),
    streak: store.streak(now),
    now: now.toISOString(),
  };
}

ipcMain.handle('state:get', () => snapshot());

ipcMain.handle('task:toggle', (_e, id) => {
  store.toggleTask(id);
  return snapshot();
});

ipcMain.handle('task:add', (_e, title) => {
  store.addTask(title);
  return snapshot();
});

ipcMain.handle('task:remove', (_e, id) => {
  store.removeTask(id);
  return snapshot();
});

ipcMain.handle('history:remove', (_e, dayKey, taskId) => {
  store.removeFromDay(dayKey, taskId);
  return snapshot();
});

ipcMain.handle('analytics:get', (_e, scope, anchor) => store.analytics(scope, anchor || dateKey()));

ipcMain.handle('analytics:step', (_e, scope, anchor, delta) =>
  store.analytics(scope, store.stepAnchor(scope, anchor, delta)),
);

ipcMain.handle('settings:set', (_e, patch) => {
  store.setSettings(patch || {});
  syncAutoLaunch();
  refreshTray();
  if (store.eveningPending()) createTray();
  return snapshot();
});

/** The footer button: the day was actually started (or wrapped up). */
ipcMain.handle('day:done', () => {
  if (mode === 'morning' || mode === 'evening') store.markDone(mode);
  dismissWindow({ settle: false });
  return { ok: true };
});

// Minimising is not an answer -- the slot stays owed, and the ticker leaves
// a minimised window alone rather than popping it back up.
ipcMain.handle('window:minimize', () => win?.minimize());

ipcMain.handle('window:close', () => dismissWindow());

app.on('window-all-closed', () => {
  // Resident only while an evening check-in is still coming.
  if (!store || !store.eveningPending()) {
    clearInterval(ticker);
    app.quit();
  }
});
