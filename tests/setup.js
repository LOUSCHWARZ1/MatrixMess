// Test-Setup: IndexedDB in Node bereitstellen (jsdom hat keins) und WebCrypto
// sicherstellen. Läuft vor jeder Testdatei.
import 'fake-indexeddb/auto';

// jsdom liefert kein crypto.subtle – Node hat WebCrypto global.
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  // eslint-disable-next-line no-global-assign
  globalThis.crypto = webcrypto;
}
