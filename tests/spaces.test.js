import { describe, it, expect } from 'vitest';
import { detectBridge } from '../clients/web/spaces.js';

describe('detectBridge', () => {
  it('erkennt bekannte Bridges am Protokoll', () => {
    expect(detectBridge({ bridgeProtocol: 'whatsapp' })).toBe('whatsapp');
    expect(detectBridge({ bridgeProtocol: 'signal' })).toBe('signal');
    expect(detectBridge({ bridgeHint: '@telegram_123:x' })).toBe('telegram');
  });

  it('liefert "bridge" bei Bridge-Signal ohne bekannten Dienst', () => {
    expect(detectBridge({ bridgeProtocol: 'irgendwas' })).toBe('bridge');
  });

  it('liefert null ohne jedes Bridge-Signal', () => {
    expect(detectBridge({})).toBe(null);
    expect(detectBridge(null)).toBe(null);
  });
});
