/**
 * icons.js — SVG icon module for the MatrixMess web client.
 *
 * Stroke-based icon set (SF Symbols / Lucide style):
 *   24x24 viewBox, stroke="currentColor", stroke-width 2,
 *   round linecap/linejoin, fill="none" (filled exceptions where noted).
 *
 * Usage:
 *   import { icon, ICON_NAMES } from './icons.js';
 *   button.appendChild(icon('send', 18));
 *
 * Icons inherit color via currentColor; no innerHTML is used —
 * everything is built with createElementNS + setAttribute.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Shape data per icon: an array of [tagName, attributes] tuples.
 * All geometry lives on a 24x24 grid. Shapes default to the svg root's
 * stroke settings; per-shape attributes (e.g. fill) override them.
 */
const ICONS = {
  // --- Communication -------------------------------------------------
  'chat': [
    ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
  ],
  'send': [
    // Paper plane, lightly filled body + fold line.
    ['path', {
      d: 'M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11Z',
      fill: 'currentColor',
      'fill-opacity': '0.2',
    }],
    ['path', { d: 'm21.85 2.15-10.94 10.94' }],
  ],
  'paperclip': [
    ['path', { d: 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48' }],
  ],
  'mic': [
    ['rect', { x: 9, y: 2, width: 6, height: 13, rx: 3 }],
    ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }],
    ['path', { d: 'M12 19v3' }],
  ],
  'smile': [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }],
    ['path', { d: 'M9 9h.01' }],
    ['path', { d: 'M15 9h.01' }],
  ],
  'reply': [
    ['path', { d: 'm9 17-5-5 5-5' }],
    ['path', { d: 'M20 18v-2a4 4 0 0 0-4-4H4' }],
  ],
  'forward': [
    ['path', { d: 'm15 17 5-5-5-5' }],
    ['path', { d: 'M4 18v-2a4 4 0 0 1 4-4h12' }],
  ],

  // --- Actions --------------------------------------------------------
  'settings': [
    ['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  'search': [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['path', { d: 'm21 21-4.35-4.35' }],
  ],
  'x': [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  'check': [
    ['path', { d: 'M20 6 9 17l-5-5' }],
  ],
  'check-double': [
    ['path', { d: 'M18 6 7 17l-5-5' }],
    ['path', { d: 'm22 10-7.5 7.5L13 16' }],
  ],
  'plus': [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'M5 12h14' }],
  ],
  'edit': [
    ['path', { d: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],
  'trash': [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
  ],
  'download': [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['path', { d: 'm7 10 5 5 5-5' }],
    ['path', { d: 'M12 15V3' }],
  ],
  'external': [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
  'refresh': [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  'logout': [
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
  ],

  // --- Navigation -----------------------------------------------------
  'chevron-left': [
    ['path', { d: 'm15 18-6-6 6-6' }],
  ],
  'chevron-right': [
    ['path', { d: 'm9 18 6-6-6-6' }],
  ],
  'chevron-down': [
    ['path', { d: 'm6 9 6 6 6-6' }],
  ],
  'chevron-up': [
    ['path', { d: 'm18 15-6-6-6 6' }],
  ],
  'arrow-down': [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'm19 12-7 7-7-7' }],
  ],
  'more-h': [
    ['circle', { cx: 12, cy: 12, r: 1 }],
    ['circle', { cx: 5, cy: 12, r: 1 }],
    ['circle', { cx: 19, cy: 12, r: 1 }],
  ],
  'more-v': [
    ['circle', { cx: 12, cy: 12, r: 1 }],
    ['circle', { cx: 12, cy: 5, r: 1 }],
    ['circle', { cx: 12, cy: 19, r: 1 }],
  ],
  'sidebar': [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M9 3v18' }],
  ],

  // --- Status / favorites ----------------------------------------------
  'star': [
    ['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26' }],
  ],
  'star-filled': [
    ['polygon', {
      points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26',
      fill: 'currentColor',
    }],
  ],
  'pin': [
    ['path', { d: 'M12 17v5' }],
    ['path', { d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z' }],
  ],
  'bell': [
    ['path', { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }],
    ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }],
  ],
  'bell-off': [
    ['path', { d: 'M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5' }],
    ['path', { d: 'M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7' }],
    ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  'clock': [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 6v6l4 2' }],
  ],
  'sparkles': [
    ['path', { d: 'M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94a2 2 0 0 0 1.44-1.44l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0Z' }],
    ['path', { d: 'M20 3v4' }],
    ['path', { d: 'M22 5h-4' }],
    ['path', { d: 'M4 17v2' }],
    ['path', { d: 'M5 18H3' }],
  ],

  // --- People ----------------------------------------------------------
  'user': [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 12, cy: 7, r: 4 }],
  ],
  'users': [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ],

  // --- Calendar / time --------------------------------------------------
  'calendar': [
    ['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M3 10h18' }],
  ],
  'calendar-plus': [
    ['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M3 10h18' }],
    ['path', { d: 'M12 13.5v5' }],
    ['path', { d: 'M9.5 16h5' }],
  ],

  // --- Media -------------------------------------------------------------
  'play': [
    ['polygon', { points: '6 3 20 12 6 21', fill: 'currentColor' }],
  ],
  'pause': [
    ['rect', { x: 6, y: 4, width: 4, height: 16, rx: 1 }],
    ['rect', { x: 14, y: 4, width: 4, height: 16, rx: 1 }],
  ],
  'image': [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['circle', { cx: 9, cy: 9, r: 2 }],
    ['path', { d: 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21' }],
  ],
  'file': [
    ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ],
  'video': [
    ['rect', { x: 2, y: 6, width: 14, height: 12, rx: 2 }],
    ['path', { d: 'm22 8-6 4 6 4V8Z' }],
  ],
  'folder': [
    ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
  ],

  // --- Security / privacy --------------------------------------------------
  'lock': [
    ['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'unlock': [
    ['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }],
  ],
  'shield': [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z' }],
  ],

  // --- Fun ------------------------------------------------------------------
  'gamepad': [
    ['path', { d: 'M6 11h4' }],
    ['path', { d: 'M8 9v4' }],
    ['path', { d: 'M15 12h.01' }],
    ['path', { d: 'M18 10h.01' }],
    ['path', { d: 'M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.01.05-.01.1-.02.15C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.42.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.54-.6-6.58-.68-7.26-.01-.05-.01-.1-.02-.15A4 4 0 0 0 17.32 5Z' }],
  ],
  'dice': [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M8 8h.01' }],
    ['path', { d: 'M16 8h.01' }],
    ['path', { d: 'M12 12h.01' }],
    ['path', { d: 'M8 16h.01' }],
    ['path', { d: 'M16 16h.01' }],
  ],

  // --- Misc / theme ------------------------------------------------------------
  'globe': [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  'sun': [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M12 2v2' }],
    ['path', { d: 'M12 20v2' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41' }],
    ['path', { d: 'm17.66 17.66 1.41 1.41' }],
    ['path', { d: 'M2 12h2' }],
    ['path', { d: 'M20 12h2' }],
    ['path', { d: 'm6.34 17.66-1.41 1.41' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41' }],
  ],
  'moon': [
    ['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  ],
  'monitor': [
    ['rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }],
    ['path', { d: 'M8 21h8' }],
    ['path', { d: 'M12 17v4' }],
  ],
  'heart': [
    ['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.04 3 5.5l7 7Z' }],
  ],
  'home': [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    ['path', { d: 'M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }],
  ],
  'briefcase': [
    ['rect', { x: 2, y: 7, width: 20, height: 13, rx: 2 }],
    ['path', { d: 'M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2' }],
  ],
  'archive': [
    ['rect', { x: 2, y: 3, width: 20, height: 5, rx: 1 }],
    ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }],
    ['path', { d: 'M10 12h4' }],
  ],
  'link': [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],

  // --- Marken-Glyphen (vereinfachte, stroke-basierte Silhouetten) ---------
  'brand-whatsapp': [
    ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
    ['path', { d: 'M9 8.5c-.5.5-.6 1.7 0 2.9.7 1.4 2.2 2.9 3.6 3.6 1.2.6 2.4.5 2.9 0l-1.5-2-1.5.6-2.1-2.1.6-1.5Z' }],
  ],
  'brand-signal': [
    ['circle', { cx: 12, cy: 12, r: 9.5, 'stroke-dasharray': '3.4 2.6' }],
    ['path', { d: 'M9.4 15.7A5.4 5.4 0 1 0 7 13.3L6.4 17.6Z' }],
  ],
  'brand-telegram': [
    ['path', { d: 'm21.6 3.8-3 15a1 1 0 0 1-1.44.7l-4.36-2.2-2.3 2.72a.7.7 0 0 1-1.2-.28l-1.1-4.14-4.72-1.7a.9.9 0 0 1 .06-1.72L20.4 2.7a.9.9 0 0 1 1.2 1.1Z' }],
    ['path', { d: 'M8.3 15.6 19.5 5.3' }],
  ],
  'brand-instagram': [
    ['rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5 }],
    ['circle', { cx: 12, cy: 12, r: 4.2 }],
    ['path', { d: 'M17.4 6.6h.01' }],
  ],
  'brand-discord': [
    ['path', { d: 'M8.6 17.7c-4.6-1-5-4.6-3.7-8.9C6.1 7.5 7.7 6.8 9.4 6.6l.6 1.3a12.6 12.6 0 0 1 4 0l.6-1.3c1.7.2 3.3.9 4.5 2.2 1.3 4.3.9 7.9-3.7 8.9l-1-1.5a9.8 9.8 0 0 1-4.8 0Z' }],
    ['path', { d: 'M9.6 12.2h.01' }],
    ['path', { d: 'M14.4 12.2h.01' }],
  ],

  // --- Anrufe ----------------------------------------------------------
  'phone': [
    ['path', { d: 'M13.83 8.5a3 3 0 0 1 1.67 1.67M13.5 5a6 6 0 0 1 5 5M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z' }],
  ],
  'phone-off': [
    ['path', { d: 'M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-3.33-2.67' }],
    ['path', { d: 'M5.09 5.11A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  'video-off': [
    ['path', { d: 'M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8' }],
    ['path', { d: 'M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  'mic-off': [
    ['path', { d: 'M12 19v3' }],
    ['path', { d: 'M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6' }],
    ['path', { d: 'M17 16.95A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.11 1.23' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
};

/** All available icon names. */
export const ICON_NAMES = Object.keys(ICONS);

/**
 * Create an SVG icon element.
 *
 * @param {string} name  Icon name (see ICON_NAMES).
 * @param {number} [size=20]  Rendered width/height in px.
 * @returns {SVGElement}  A detached <svg> element, color via currentColor.
 */
export function icon(name, size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-icon', name);

  let shapes = ICONS[name];
  if (!shapes) {
    console.warn(`[icons] Unknown icon "${name}" — using circle fallback.`);
    shapes = [['circle', { cx: 12, cy: 12, r: 9 }]];
  }

  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const key of Object.keys(attrs)) {
      el.setAttribute(key, String(attrs[key]));
    }
    svg.appendChild(el);
  }

  return svg;
}
