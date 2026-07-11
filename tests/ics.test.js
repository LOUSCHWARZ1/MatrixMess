import { describe, it, expect } from 'vitest';
import { parseIcs, icsToOccurrences, normalizeFeedUrl, parseIcsDuration } from '../clients/web/calendar.js';

function ical(lines) { return ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n'); }

describe('ICS-Parser', () => {
  it('parst ein einfaches VEVENT inkl. Escaping und Fortsetzungszeile', () => {
    const soon = new Date(Date.now() + 2 * 86400000);
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = `${soon.getFullYear()}${p2(soon.getMonth() + 1)}${p2(soon.getDate())}`;
    const text = ical([
      'BEGIN:VEVENT', 'UID:a@x', 'SUMMARY:Zahnarzt\\, Kontrolle',
      `DTSTART:${stamp}T093000Z`, `DTEND:${stamp}T101500Z`,
      'DESCRIPTION:Bitte 10 Min', ' frueher da', 'END:VEVENT',
    ]);
    const evs = parseIcs(text);
    expect(evs.length).toBe(1);
    const occ = icsToOccurrences(text, 50);
    expect(occ.length).toBe(1);
    expect(occ[0].title).toBe('Zahnarzt, Kontrolle');
    expect(occ[0].note).toContain('frueher da');
  });

  it('expandiert WEEKLY;COUNT und behält die Dauer', () => {
    const soon = new Date(Date.now() + 86400000);
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = `${soon.getFullYear()}${p2(soon.getMonth() + 1)}${p2(soon.getDate())}`;
    const text = ical([
      'BEGIN:VEVENT', 'UID:w@x', 'SUMMARY:Sport',
      `DTSTART:${stamp}T180000Z`, 'DURATION:PT1H30M',
      'RRULE:FREQ=WEEKLY;COUNT=4', 'END:VEVENT',
    ]);
    const occ = icsToOccurrences(text, 50).filter((o) => o.title === 'Sport');
    expect(occ.length).toBe(4);
    expect(Math.round((occ[0].endTs - occ[0].startTs) / 60000)).toBe(90);
  });

  it('normalizeFeedUrl: webcal -> https, blockt fremde Schemata', () => {
    expect(normalizeFeedUrl('webcal://p.icloud.com/x')).toBe('https://p.icloud.com/x');
    expect(normalizeFeedUrl('javascript:alert(1)')).toBe(null);
    expect(normalizeFeedUrl('  ')).toBe(null);
  });

  it('parseIcsDuration versteht ISO-8601', () => {
    expect(parseIcsDuration('P1D')).toBe(86400000);
    expect(parseIcsDuration('PT30M')).toBe(1800000);
  });
});
