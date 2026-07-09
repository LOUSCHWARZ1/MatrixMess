'use strict';

// Minimal preload script. The web client needs nothing from the main
// process; we only expose a small, read-only info object for display.
// (Sandboxed preload: only 'electron' and process.versions are available.)
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('matrixmessDesktop', {
  isDesktop: true,
  electronVersion: process.versions.electron
});
