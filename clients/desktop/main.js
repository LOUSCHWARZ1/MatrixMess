'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Single instance lock: if another instance is already running, quit and
// let the existing instance focus its window instead.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow = null;

  /**
   * Decide whether a URL should be opened in the user's default browser
   * instead of inside the app window. Everything that is http(s) and not
   * part of our local file:// bundle counts as external.
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
        preload: path.join(__dirname, 'preload.js')
        // Note: webSecurity stays at its default (true). Matrix homeservers
        // send "Access-Control-Allow-Origin: *", so fetch() from the file://
        // ("null") origin works without weakening security.
      }
    });

    // The web assets are copied into clients/desktop/web/ by the CI build
    // (and manually for local development).
    mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));

    // Links opened via target="_blank" / window.open: open externally.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalUrl(url)) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // In-page navigation to external http(s) URLs: open externally instead.
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (isExternalUrl(url)) {
        event.preventDefault();
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
