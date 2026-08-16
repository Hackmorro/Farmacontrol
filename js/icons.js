// =============================================================================
// FarmaControl — icons.js
// Set de íconos vectoriales propios (estilo trazo, sin relleno, 1.75px).
// Uso: icon('nombre', 'w-5 h-5') → devuelve el <svg> como string.
// =============================================================================

const ICON_PATHS = {
  package: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  'alert-triangle': '<path d="M10.3 3.9 1.8 18a1.6 1.6 0 0 0 1.4 2.5h17.6a1.6 1.6 0 0 0 1.4-2.5L13.7 3.9a1.6 1.6 0 0 0-2.8 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6"/><path d="M9 15h6"/>',
  users: '<path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M22 20c0-2.8-1.9-5.1-4.5-5.8"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z"/><path d="M9 20v-6h6v6"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21 7H6"/>',
  receipt: '<path d="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  pencil: '<path d="M13.5 4.5 19 10 8 21H2v-6z"/><path d="M12 6.5 17 11"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.9 4.9l1.4 1.4"/><path d="M17.7 17.7l1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.9 19.1l1.4-1.4"/><path d="M17.7 6.3l1.4-1.4"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M3 6.5l9 6.5 9-6.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3.5 10h17"/>',
  phone: '<path d="M5.5 3h3l1.5 5-2.3 1.6a13 13 0 0 0 5.7 5.7L15 13l5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3z"/>',
  'id-card': '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c0-1.7 1.5-2.5 3-2.5s3 .8 3 2.5"/><path d="M14.5 9.5h5"/><path d="M14.5 13h5"/>',
  'chevron-left': '<path d="M14.5 5 8 12l6.5 7"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/>',
  factory: '<path d="M3 21V10l5 3.5V10l5 3.5V10l5 3.5V21z"/><path d="M3 21h18"/><path d="M6 17h.01"/><path d="M10 17h.01"/><path d="M14 17h.01"/>',
  truck: '<rect x="1.5" y="7" width="12" height="10" rx="1"/><path d="M13.5 10.5H17l3 3V17h-6.5"/><circle cx="5.5" cy="18.5" r="1.6"/><circle cx="16.5" cy="18.5" r="1.6"/>',
  inbox: '<path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l2.5 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>'
};

function icon(name, cls) {
  const path = ICON_PATHS[name] || '';
  return `<svg class="icon ${cls || 'w-5 h-5'}" viewBox="0 0 24 24">${path}</svg>`;
}
