/*
 * Daily Start - https://github.com/Akram-Sakib/daily-start
 * Copyright 2026 Md Akram Hossain (Akram Sakib)
 * Licensed under the Apache Licence, Version 2.0. See LICENSE and NOTICE.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* The only bridge between the UI and the file system. */
contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  toggleTask: (id) => ipcRenderer.invoke('task:toggle', id),
  addTask: (title) => ipcRenderer.invoke('task:add', title),
  removeTask: (id) => ipcRenderer.invoke('task:remove', id),
  removeFromHistory: (dayKey, taskId) => ipcRenderer.invoke('history:remove', dayKey, taskId),
  getAnalytics: (scope, anchor) => ipcRenderer.invoke('analytics:get', scope, anchor),
  stepAnalytics: (scope, anchor, delta) => ipcRenderer.invoke('analytics:step', scope, anchor, delta),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  finishDay: () => ipcRenderer.invoke('day:done'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  onDayChanged: (fn) => ipcRenderer.on('day:changed', fn),
  onRefresh: (fn) => ipcRenderer.on('state:refresh', fn),
});
