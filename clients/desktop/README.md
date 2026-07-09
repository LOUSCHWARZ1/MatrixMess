# MatrixMess Desktop (Windows)

Electron wrapper around the MatrixMess web client (`clients/web/`). It loads
the static web assets from a local `web/` directory — no build step, no
bundler.

## Run locally

```sh
cd clients/desktop
npm install
cp -r ../web ./web   # copy the web client assets (index.html, styles.css, app.js)
npm start
```

The `web/` directory is git-ignored; re-copy it after changing the web client.

## CI build

The GitHub Actions workflow `.github/workflows/desktop-windows-build.yml`
runs on `windows-latest` for pushes touching `clients/web/**` or
`clients/desktop/**` (and via manual dispatch). It copies `clients/web` to
`clients/desktop/web`, runs `npm install`, and builds with
`electron-builder --win`, producing an NSIS installer and a portable EXE.
Both are uploaded as the `MatrixMess-Windows-Setup` artifact.

Local equivalent: `npm run dist:win` (output lands in `dist/`).

## Notes

- External `http(s)` links open in the default browser, not in the app window.
- `contextIsolation` is on, `nodeIntegration` is off, `webSecurity` stays at
  its secure default. Matrix homeservers send `Access-Control-Allow-Origin: *`,
  so API calls from the `file://` origin work as-is.
