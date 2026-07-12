'use strict';

// Minimal preload script. The web client needs almost nothing from the main
// process; we expose a small, read-only info object plus a single narrow IPC:
// the renderer registers the origin(s) of the user's configured homeserver so
// the main process can relax CORS ONLY for those origins (see main.js), instead
// of forcing it open for every host on the internet.
// (Sandboxed preload: only 'electron' and process.versions are available.)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('matrixmessDesktop', {
  isDesktop: true,
  electronVersion: process.versions.electron,
  // Returns a promise that resolves once main has registered the origin, so the
  // renderer can await it before issuing the first request to a new homeserver.
  allowHomeserverOrigin: (origin) => ipcRenderer.invoke('mm:allow-origin', String(origin))
});
