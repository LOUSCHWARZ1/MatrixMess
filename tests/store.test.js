import { describe, it, expect } from 'vitest';
import { serializeRoom, deserializeRoom } from '../clients/web/store.js';

function makeRoom(over = {}) {
  const members = new Map([
    ['@a:x', { displayname: 'Ann', avatarUrl: null, membership: 'join' }],
    ['@b:x', { displayname: 'Bob', avatarUrl: 'mxc://x/1', membership: 'join' }],
  ]);
  const events = [
    { eventId: '$1', sender: '@a:x', type: 'm.room.message', content: { body: 'hi' }, ts: 100,
      editedBody: null, redacted: false, encrypted: false,
      reactions: new Map([['👍', { count: 2, mine: true, myEventId: '$r1' }]]),
      pending: false, failed: false, txnId: null },
  ];
  const eventIndex = new Map(events.map((e) => [e.eventId, e]));
  const reactionIndex = new Map([['$r1', { targetId: '$1', key: '👍', sender: '@a:x' }]]);
  return Object.assign({
    roomId: '!r:x', explicitName: 'Raum', avatarMxc: null, topic: 't', canonicalAlias: '#r:x',
    heroes: ['@a:x'], members, lastEventTs: 100, lastPreview: 'hi', lastPreviewSender: '@a:x',
    unread: 1, isEncrypted: false, isDirect: false, events, eventIndex, reactionIndex,
    prevBatch: 'p', lastReceiptEventId: null, readReceipts: new Map(), markedUnread: false,
    joinedCount: 2, bridgeProtocol: null, bridgeHint: null,
  }, over);
}

describe('store serialize/deserialize', () => {
  it('macht einen verlustfreien Roundtrip der Kernfelder', () => {
    const r = makeRoom();
    const back = deserializeRoom(JSON.parse(JSON.stringify(serializeRoom(r))));
    expect(back.roomId).toBe('!r:x');
    expect(back.explicitName).toBe('Raum');
    expect(back.canonicalAlias).toBe('#r:x');
    expect(back.members.get('@b:x').displayname).toBe('Bob');
    expect(back.events.length).toBe(1);
    expect(back.eventIndex.get('$1').content.body).toBe('hi');
    expect(back.markedUnread).toBe(false);
    expect(back.joinedCount).toBe(2);
  });

  it('behält myEventId der eigenen Reaktion (sonst nicht entfernbar)', () => {
    const back = deserializeRoom(JSON.parse(JSON.stringify(serializeRoom(makeRoom()))));
    const agg = back.eventIndex.get('$1').reactions.get('👍');
    expect(agg.count).toBe(2);
    expect(agg.mine).toBe(true);
    expect(agg.myEventId).toBe('$r1');
  });

  it('persistiert in E2EE-Räumen KEINEN Klartext (nur Ciphertext/Systemzeilen)', () => {
    const r = makeRoom({ isEncrypted: true, lastPreview: 'geheim', lastPreviewSender: '@a:x' });
    // Ein entschlüsseltes Event mit hinterlegtem Ciphertext.
    r.events = [{
      eventId: '$e', sender: '@a:x', type: 'm.room.message', content: { body: 'KLARTEXT' },
      ts: 200, editedBody: null, redacted: false, encrypted: true,
      rawContent: { algorithm: 'm.megolm.v1', ciphertext: 'ABC' },
      reactions: new Map(), pending: false, failed: false, txnId: null,
    }];
    const ser = serializeRoom(r);
    const json = JSON.stringify(ser);
    expect(json).not.toContain('KLARTEXT');
    expect(json).not.toContain('geheim');
    expect(ser.events[0].type).toBe('m.room.encrypted');
    expect(ser.events[0].content.ciphertext).toBe('ABC');
    expect(ser.lastPreview).toBe('');
  });

  it('verwirft prevBatch, wenn Events gekappt wurden (keine stille Lücke)', () => {
    const many = [];
    for (let i = 0; i < 80; i++) {
      many.push({ eventId: '$' + i, sender: '@a:x', type: 'm.room.message', content: { body: String(i) },
        ts: i, editedBody: null, redacted: false, encrypted: false, reactions: new Map(),
        pending: false, failed: false, txnId: null });
    }
    const r = makeRoom({ events: many, prevBatch: 'OLD' });
    expect(serializeRoom(r).prevBatch).toBe(null); // >60 Events -> gekappt
  });
});
