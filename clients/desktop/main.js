'use strict';

const { app, BrowserWindow, shell, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Single instance lock: if another instance is already running, quit and
// let the existing instance focus its window instead.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow = null;

  // The web assets are copied into clients/desktop/web/ by the CI build
  // (and manually for local development).
  const webRoot = path.join(__dirname, 'web');

  // Custom "mm://" scheme instead of file://: fetch(file://) is blocked by
  // Chromium, but the crypto WASM module (matrix-sdk-crypto-wasm) is loaded
  // via fetch + WebAssembly.instantiateStreaming and therefore needs a
  // fetch-capable, "standard" origin. Must be registered before app ready.
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'mm',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  };

  /**
   * Maps mm://app/<pfad> requests onto files below clients/desktop/web/.
   * Normalizes the path and refuses anything that would escape webRoot.
   */
  function handleAppRequest(request) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch (e) {
      return new Response('Bad request', { status: 400 });
    }
    if (!pathname || pathname === '/') pathname = '/index.html';

    const resolved = path.normalize(path.join(webRoot, pathname));
    // Traversal-Guard: resolved file must stay inside webRoot.
    if (resolved !== webRoot && !resolved.startsWith(webRoot + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    let data;
    try {
      data = fs.readFileSync(resolved);
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }

    const mime = MIME_TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream';
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': mime }
    });
  }

  /**
   * Decide whether a URL should be opened in the user's default browser
   * instead of inside the app window. Everything that is http(s) counts
   * as external; only mm:// is allowed to stay inside the window.
   */
  function isExternalUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: '#1c1830',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js')
        // Note: webSecurity stays at its default (true). Matrix homeservers
        // send "Access-Control-Allow-Origin: *", so fetch() from the mm://
        // origin works without weakening security (corsEnabled scheme).
      }
    });

    mainWindow.loadURL('mm://app/index.html');

    // Links opened via target="_blank" / window.open: open externally.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalUrl(url)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // In-page navigation: only internal mm:// URLs may stay in the window;
    // external http(s) URLs open in the default browser instead.
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('mm://')) return;
      event.preventDefault();
      if (isExternalUrl(url)) {
        shell.openExternal(url);
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  app.on('second-instance', () => {
    // Someone tried to start a second instance: focus our window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('mm', (request) => handleAppRequest(request));

    // Permission hardening: the renderer only ever needs notifications.
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(permission === 'notifications');
    });

    createWindow();

    app.on('activate', () => {
      // macOS convention: re-create a window when the dock icon is clicked
      // and no other windows are open.
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    // On Windows and Linux, quit when all windows are closed.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
