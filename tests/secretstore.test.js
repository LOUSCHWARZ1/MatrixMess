import { describe, it, expect, beforeEach } from 'vitest';
import { setSecret, getSecret, removeSecret } from '../clients/web/secretstore.js';

beforeEach(() => { localStorage.clear(); });

describe('secretstore (WebCrypto + IndexedDB)', () => {
  it('verschlüsselt und liest wieder korrekt aus', async () => {
    await setSecret('token', 'geheim-123');
    expect(await getSecret('token')).toBe('geheim-123');
  });

  it('legt das Geheimnis NICHT im Klartext in localStorage ab', async () => {
    await setSecret('token', 'PLAINTEXT-XYZ');
    const dump = JSON.stringify(localStorage);
    expect(dump).not.toContain('PLAINTEXT-XYZ');
  });

  it('entfernt Geheimnisse', async () => {
    await setSecret('token', 'abc');
    await removeSecret('token');
    expect(await getSecret('token')).toBe(null);
  });

  it('null/undefined löscht statt zu speichern', async () => {
    await setSecret('token', 'abc');
    await setSecret('token', null);
    expect(await getSecret('token')).toBe(null);
  });
});
