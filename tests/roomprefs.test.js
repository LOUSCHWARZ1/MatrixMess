import { describe, it, expect, beforeEach } from 'vitest';
import * as rp from '../clients/web/roomprefs.js';

beforeEach(async () => {
  localStorage.clear();
  // Ohne Hooks: kein account_data-Sync, nur lokaler Zustand.
  await rp.initRoomPrefs({});
});

describe('roomprefs Stummschalten', () => {
  it('für immer (-1) ist immer stumm', () => {
    rp.setMute('!r', -1);
    expect(rp.isMuted('!r')).toBe(true);
    expect(rp.muteLabel('!r')).toBe('für immer');
  });

  it('abgelaufene Stummschaltung gilt nicht mehr', () => {
    rp.setMute('!r', Date.now() - 1000);
    expect(rp.isMuted('!r')).toBe(false);
  });

  it('0 hebt die Stummschaltung auf', () => {
    rp.setMute('!r', -1);
    rp.setMute('!r', 0);
    expect(rp.isMuted('!r')).toBe(false);
  });
});

describe('roomprefs Anpinnen', () => {
  it('respektiert das Maximum an Pins', () => {
    for (let i = 0; i < rp.MAX_PINS; i++) {
      expect(rp.togglePin('!r' + i).ok).toBe(true);
    }
    const over = rp.togglePin('!rX');
    expect(over.ok).toBe(false);
    expect(over.pinned).toBe(false);
    expect(rp.isPinned('!rX')).toBe(false);
  });

  it('kann wieder lospinnen', () => {
    rp.togglePin('!r');
    expect(rp.isPinned('!r')).toBe(true);
    rp.togglePin('!r');
    expect(rp.isPinned('!r')).toBe(false);
  });
});

describe('roomprefs Benachrichtigungsmodus', () => {
  it('Standard ist "all", umschaltbar auf "mentions"', () => {
    expect(rp.getNotifyMode('!r')).toBe('all');
    rp.setNotifyMode('!r', 'mentions');
    expect(rp.getNotifyMode('!r')).toBe('mentions');
  });
});
