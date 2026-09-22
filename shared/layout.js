/* ==========================================================================
   Univa — static HTML build. Sidebar + topbar shell shared by every
   authenticated page. Mirrors src/core/layouts/Sidebar.jsx + TopBar.jsx.
   ========================================================================== */

const NAV_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'dashboard.html' },
  {
    key: 'applications',
    label: 'Applications',
    // Sidebar also lists every application the user has created, below the
    // "All applications" link — see renderSidebar()'s dynamicChildren handling.
    dynamicChildren: 'applications',
    children: [{ key: 'applications', label: 'All applications', icon: 'app', href: 'applications.html' }],
  },
  {
    key: 'device-management',
    label: 'Devices management',
    children: [
      { key: 'devices', label: 'Devices', icon: 'device', href: 'devices.html' },
      { key: 'device-profiles', label: 'Device profiles', icon: 'profile', href: 'device-profiles.html' },
      { key: 'credentials', label: 'Credentials', icon: 'credentials', href: 'credentials.html' },
      { key: 'software-ota', label: 'Software OTA', icon: 'cloud-ota', href: 'software-ota.html' },
    ],
  },
  {
    key: 'asset-management',
    label: 'Assets management',
    children: [
      { key: 'assets', label: 'Assets', icon: 'asset', href: 'assets.html' },
      { key: 'asset-groups', label: 'Asset groups', icon: 'group', href: 'asset-groups.html' },
      { key: 'asset-profiles', label: 'Asset profiles', icon: 'profile', href: 'asset-profiles.html' },
    ],
  },
  {
    key: 'shift-management',
    label: 'Shift management',
    children: [
      { key: 'shift-management', label: 'Shift', icon: 'shift', href: 'shift-management.html' },
      { key: 'shift-schedules', label: 'Schedule', icon: 'calendar', href: 'shift-schedules.html' },
      { key: 'shift-instances', label: 'Instance', icon: 'report', href: 'shift-instances.html' },
    ],
  },
  {
    key: 'rule-engines',
    label: 'Rule engines',
    children: [
      { key: 'rule-engines', label: 'Rule engine', icon: 'rule-engine', href: 'rule-engines.html' },
      { key: 'rule-engine-reports', label: 'Reports', icon: 'report', href: 'rule-engine-reports.html' },
    ],
  },
  {
    key: 'user-management',
    label: 'Users & permissions',
    children: [
      { key: 'users', label: 'Users', icon: 'users', href: 'users.html' },
      { key: 'user-groups', label: 'User groups', icon: 'group', href: 'user-groups.html' },
      { key: 'roles', label: 'Roles & permissions', icon: 'shield', href: 'roles.html' },
    ],
  },
]

// Icon choices offered when creating/editing an application (applications.html,
// application-detail.html) — the one picked is what shows next to that
// application's entry under the sidebar's Applications section.
const APPLICATION_ICON_OPTIONS = [
  'app', 'dashboard', 'device', 'asset', 'users', 'shield', 'cloud-ota', 'report',
  'rule-engine', 'shift', 'calendar', 'profile', 'credentials', 'group',
  'folder', 'file', 'chart-bar', 'chart-line', 'chart-pie', 'gear', 'bolt', 'globe',
  'map-pin', 'home', 'factory', 'warehouse', 'truck', 'wifi', 'database', 'server',
  'cpu', 'battery', 'plug', 'thermometer', 'gauge', 'camera', 'mic', 'phone', 'mail',
  'chat', 'clipboard', 'clock', 'lock', 'anchor', 'wrench', 'cube', 'layers',
  'package', 'list', 'tag', 'star', 'flag', 'target', 'book', 'link',
]

function iconSvg(name) {
  const icons = {
    dashboard:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5"/><rect x="13" y="10" width="7.5" height="10.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/></svg>',
    device:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M9 3.5v6" stroke-linecap="round"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 19c1-3.2 3.4-5 6-5s5 1.8 6 5" stroke-linecap="round"/><circle cx="17" cy="8.5" r="2.3"/><path d="M15.5 5.3a3 3 0 0 1 0 5.9" stroke-linecap="round"/><path d="M19.5 19c-.6-2.1-1.7-3.6-3-4.4" stroke-linecap="round"/></svg>',
    asset:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 7.5 12 12l8-4.5M12 12v9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    app:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
    'rule-engine':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7 5h6a4 4 0 0 1 4 4v0M7 19h6a4 4 0 0 0 4-4v0" stroke-linecap="round"/></svg>',
    shift:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
    profile:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.5 15.5c.6-1.4 1.5-2 2.5-2s1.9.6 2.5 2" stroke-linecap="round"/><path d="M14.5 9.5h3M14.5 12.5h3" stroke-linecap="round"/></svg>',
    credentials:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 18 5M15.5 7.5l2 2M18.5 4.5l2 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'cloud-ota':
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.5 9 4 4 0 0 1 17 18H7Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    group:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c.8-2.8 2.6-4.3 5-4.3s4.2 1.5 5 4.3M11 19c.8-2.8 2.6-4.3 5-4.3s4.2 1.5 5 4.3" stroke-linecap="round"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 19 6v6c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V6l7-2.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    report:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M8 13v4M12 9.5v7.5M16 11.5v5.5" stroke-linecap="round"/></svg>',
    bell:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 18.5a2 2 0 0 0 4 0" stroke-linecap="round"/></svg>',
    user:
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c1.3-3.6 4.2-5.7 7.5-5.7s6.2 2.1 7.5 5.7" stroke-linecap="round"/></svg>',
    'admin-dashboard':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5.5" rx="1.5"/><rect x="13.5" y="12.5" width="7" height="8" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/></svg>',
    'admin-tenant':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="6" height="10" rx="1"/><rect x="14" y="4" width="6" height="16" rx="1"/><path d="M6.5 13.5h1M6.5 16.5h1M16.5 7.5h1M16.5 10.5h1M16.5 13.5h1M16.5 16.5h1" stroke-linecap="round"/></svg>',
    'admin-tenant-profile':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10.5" r="2"/><path d="M5.8 16c.7-1.8 1.9-2.7 3.2-2.7s2.5.9 3.2 2.7" stroke-linecap="round"/><path d="M14.5 9h3M14.5 12h3" stroke-linecap="round"/></svg>',
    'admin-logout':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 16l4-4-4-4M20 12H9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    hamburger:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"/></svg>',
    // Extended icon set offered by the sidebar/application icon picker
    // (APPLICATION_ICON_OPTIONS) — 50+ choices so custom applications can
    // pick a sidebar icon that actually matches what they represent.
    folder:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V3.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 3.5V8h4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'chart-bar':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="12" width="3.5" height="8" rx="1"/><rect x="10.2" y="7" width="3.5" height="13" rx="1"/><rect x="16.5" y="3" width="3.5" height="17" rx="1"/></svg>',
    'chart-line':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 17 9 11l4 3 7-8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke-linecap="round"/></svg>',
    'chart-pie':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8 6.3 6.3" stroke-linecap="round"/></svg>',
    bolt:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3 5 13.5h5.5L11 21l8-11.5h-5.5L13 3Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.8 5.4 3.8 8.5s-1.3 6.1-3.8 8.5c-2.5-2.4-3.8-5.4-3.8-8.5s1.3-6.1 3.8-8.5Z" stroke-linecap="round"/></svg>',
    'map-pin':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="9" r="2.3"/></svg>',
    home:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 11.5 12 4l8 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9.5h12V10" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 19.5V14h4v5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    factory:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 20V11l5 3.5V11l5 3.5V9.5l6-3.5V20H3.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.5 16v2.5M10.5 16v2.5M14.5 16v2.5" stroke-linecap="round"/></svg>',
    warehouse:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 5l9 5.5V20H3V10.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 20v-6h7v6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    truck:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 7.5h10V16h-10z" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 10.5H18l2.5 3V16h-7v-5.5Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>',
    wifi:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9.5a11.5 11.5 0 0 1 16 0" stroke-linecap="round"/><path d="M7 13a7 7 0 0 1 10 0" stroke-linecap="round"/><path d="M10 16.5a2.8 2.8 0 0 1 4 0" stroke-linecap="round"/><circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none"/></svg>',
    database:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6" stroke-linecap="round"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" stroke-linecap="round"/></svg>',
    server:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="6.5" rx="1.5"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.5"/><circle cx="7" cy="7.25" r="0.9" fill="currentColor" stroke="none"/><circle cx="7" cy="16.75" r="0.9" fill="currentColor" stroke="none"/></svg>',
    cpu:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4" rx="0.5"/><path d="M9 3.5V7M15 3.5V7M9 17v3.5M15 17v3.5M3.5 9H7M3.5 15H7M17 9h3.5M17 15h3.5" stroke-linecap="round"/></svg>',
    battery:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="8" width="16" height="8" rx="1.5"/><path d="M20.5 10.5v3" stroke-linecap="round"/><path d="M6.5 11v2M9.5 11v2" stroke-linecap="round"/></svg>',
    plug:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3.5v5M15 3.5v5" stroke-linecap="round"/><path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-5.5 5.5 5.5 5.5 0 0 1-5.5-5.5v-3Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 17v3.5" stroke-linecap="round"/></svg>',
    thermometer:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5a2 2 0 0 0-2 2v9.2a4 4 0 1 0 4 0V5.5a2 2 0 0 0-2-2Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.5" r="1.8" fill="currentColor" stroke="none"/></svg>',
    gauge:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="13" r="7.5"/><path d="M12 13 16 9" stroke-linecap="round"/><path d="M8 6.5 6.5 5M16 6.5 17.5 5" stroke-linecap="round"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8.5h3l1.5-2h7l1.5 2h3v10H4v-10Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.2"/></svg>',
    mic:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0" stroke-linecap="round"/><path d="M12 17.5v3M9 20.5h6" stroke-linecap="round"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5.5 4h3.2l1.3 4.2-2 1.6a13 13 0 0 0 6.2 6.2l1.6-2 4.2 1.3v3.2c0 1-.9 1.7-1.8 1.5C10.4 18.9 5.1 13.6 4 5.8 3.8 4.9 4.5 4 5.5 4Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mail:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 6.5 8 6.5 8-6.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chat:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5h16v10H9l-3.5 3v-3H4v-10Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    clipboard:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="16" rx="1.8"/><rect x="9" y="3" width="6" height="3.5" rx="1"/><path d="M8.5 12h7M8.5 16h7" stroke-linecap="round"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 3.5 5 6M16.5 3.5 19 6" stroke-linecap="round"/></svg>',
    lock:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke-linecap="round"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>',
    anchor:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="5.5" r="2"/><path d="M12 7.5V20M5 13a7 7 0 0 0 14 0M5 13H3.5M18.5 13H20" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wrench:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3.5a4.5 4.5 0 0 0-6 4.2l-7 7 2.3 2.3 7-7a4.5 4.5 0 0 0 4.2-6l-2.6 2.6-2.3-2.3L17 3.5Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cube:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 8l8 4.5L20 8M12 12.5V21" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    layers:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 20.5 8 12 12.5 3.5 8 12 3.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    package:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 7.5 12 11.5 20 7.5M12 11.5V20.5M8 5.5l8 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    list:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" stroke-linecap="round"/><circle cx="4" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="17.5" r="1" fill="currentColor" stroke="none"/></svg>',
    tag:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12.5 3.5h6a1.5 1.5 0 0 1 1.5 1.5v6L11 20 4 13l9-9.5Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none"/></svg>',
    star:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3.5 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 3.5Z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flag:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5.5 3.5v17" stroke-linecap="round"/><path d="M5.5 4.5h12l-3 4 3 4h-12" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    target:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
    book:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5c2-1 5-1.3 8 0 3-1.3 6-1 8 0v13c-2-1-5-1.3-8 0-3-1.3-6-1-8 0v-13Z" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5.5v13" stroke-linecap="round"/></svg>',
    link:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 14.5 14.5 9.5" stroke-linecap="round"/><path d="M11 6.5 13.3 4.2a4 4 0 1 1 5.6 5.6L16.5 12M13 17.5l-2.3 2.3a4 4 0 1 1-5.6-5.6L7.5 12" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  }
  return icons[name] || ''
}

function renderSidebar(active) {
  const items = NAV_SECTIONS.map((section) => {
    if (!section.children) {
      const isActive = section.key === active
      return `<a class="sidebar-link${isActive ? ' active' : ''}" href="${section.href}" title="${section.label}">${iconSvg(section.icon)}<span>${section.label}</span></a>`
    }
    // Static section — always shows its children, no expand/collapse.
    let sectionChildren = section.children
    if (section.dynamicChildren === 'applications') {
      const apps = (window.Store ? Store.get().applications : []) || []
      sectionChildren = sectionChildren.concat(
        apps.map((a) => ({ key: `application-${a.id}`, label: a.name, icon: a.icon || 'app', href: a.name === 'Notion' ? `notion.html#${a.id}` : `application-detail.html#${a.id}` })),
      )
    }
    const children = sectionChildren
      .map((child) => `<a class="sidebar-child-link${child.key === active ? ' active' : ''}" href="${child.href}" title="${child.label}">${iconSvg(child.icon)}<span>${child.label}</span></a>`)
      .join('')
    return `
      <div class="sidebar-section" data-group="${section.key}">
        <div class="sidebar-section-header">
          <span class="sidebar-section-label">${section.label}</span>
        </div>
        <div class="sidebar-section-children">${children}</div>
      </div>`
  }).join('')

  return `
    <nav class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-brand-icon"><img src="assets/favicon.png" alt="Univa"></span>
      </div>
      ${items}
    </nav>`
}

function renderTopBar(breadcrumbs) {
  const crumbHtml = breadcrumbs
    .map((crumb, index) => {
      const isLast = index === breadcrumbs.length - 1
      const label = isLast
        ? `<span class="breadcrumb-current">${crumb.label}</span>`
        : `<a class="breadcrumb-link" href="${crumb.href}" title="${crumb.label}">${crumb.label}</a>`
      return index === 0 ? label : `<span class="breadcrumb-separator">/</span>${label}`
    })
    .join('')

  return `
    <header class="top-bar">
      <div class="top-bar-left">
        <button type="button" class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="Toggle navigation" title="Toggle navigation">${iconSvg('hamburger')}</button>
        <div class="top-bar-breadcrumbs">${crumbHtml}</div>
      </div>
      <div class="top-bar-actions">
        <button type="button" class="top-bar-icon-button" title="Notifications">${iconSvg('bell')}</button>
        <button type="button" class="top-bar-icon-button" id="logout-button" title="Sign out">${iconSvg('user')}</button>
      </div>
    </header>`
}

// Off-canvas sidebar drawer below the tablet/mobile breakpoint (app.css
// `@media (max-width: 900px)`). One shell (#app-shell) is reused by both
// the regular app layout and the sysadmin layout, so this wiring covers both.
function ensureSidebarBackdrop(shell) {
  if (shell.querySelector('.sidebar-backdrop')) return
  const backdrop = document.createElement('div')
  backdrop.className = 'sidebar-backdrop'
  backdrop.addEventListener('click', () => shell.classList.remove('sidebar-open'))
  shell.appendChild(backdrop)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') shell.classList.remove('sidebar-open')
  })
}

// Re-run after every renderTopBar() (including Layout.setBreadcrumbs(), which
// replaces .top-bar's outerHTML and so discards the previous button node).
function wireSidebarToggle(shell) {
  const toggleBtn = document.getElementById('sidebar-toggle-btn')
  if (toggleBtn) toggleBtn.addEventListener('click', () => shell.classList.toggle('sidebar-open'))
}

// Loads the floating AI assistant widget's assets on demand rather than
// requiring a <link>/<script> tag on every one of this app's pages — see
// shared/chatbot.js. NAV_SECTIONS is passed in so the widget's navigate
// tool always matches the real sidebar without duplicating the page list.
function loadChatbot() {
  if (!document.querySelector('link[data-chatbot-css]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'shared/chatbot.css'
    link.setAttribute('data-chatbot-css', '')
    document.head.appendChild(link)
  }
  if (window.Chatbot) {
    window.Chatbot.mount(NAV_SECTIONS)
    return
  }
  const script = document.createElement('script')
  script.src = 'shared/chatbot.js'
  script.onload = () => window.Chatbot.mount(NAV_SECTIONS)
  document.body.appendChild(script)
}

const Layout = {
  // Pages with dynamic sidebar children (e.g. application-detail.html, one
  // per application) sit at the same URL path across items — clicking a
  // sidebar link only changes the hash, which the browser treats as a
  // same-document navigation and never reloads. Those pages must listen for
  // 'hashchange' and call this to move the active highlight themselves.
  setActive(active) {
    const existing = document.querySelector('.sidebar')
    if (existing) existing.outerHTML = renderSidebar(active)
  },

  // Mirrors useBreadcrumbSuffix — some pages (e.g. Credentials) append a tab
  // name as a trailing breadcrumb segment that changes without a page reload.
  setBreadcrumbs(breadcrumbs) {
    const existing = document.querySelector('.top-bar')
    if (existing) existing.outerHTML = renderTopBar(breadcrumbs || [])
    const logoutButton = document.getElementById('logout-button')
    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        Store.logout()
        window.location.href = 'login.html'
      })
    }
    const shell = document.getElementById('app-shell')
    if (shell) wireSidebarToggle(shell)
  },

  mount({ active, breadcrumbs }) {
    Store.requireAuth()

    const shell = document.getElementById('app-shell')
    const contentHost = document.getElementById('app-content')
    if (!shell || !contentHost) return

    shell.insertAdjacentHTML('afterbegin', renderSidebar(active))
    contentHost.insertAdjacentHTML('beforebegin', renderTopBar(breadcrumbs || []))

    const logoutButton = document.getElementById('logout-button')
    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        Store.logout()
        window.location.href = 'login.html'
      })
    }

    ensureSidebarBackdrop(shell)
    wireSidebarToggle(shell)
    loadChatbot()
  },

  // Mirrors src/core/layouts/AdminSidebar.jsx + AdminLayout.jsx — a
  // separate, flat nav and a plain "Control Center" top bar (no
  // breadcrumbs) used only by the /sysadmin tenant-management area.
  // No auth guard here, matching the real app: the /sysadmin route group
  // has no login check at all, and SysAdminLoginPage navigates
  // unconditionally on submit.
  mountAdmin({ active }) {
    const shell = document.getElementById('app-shell')
    const contentHost = document.getElementById('app-content')
    if (!shell || !contentHost) return

    shell.classList.add('admin-layout')
    const mainEl = shell.querySelector('.app-main')
    if (mainEl) mainEl.classList.add('admin-layout-content')
    contentHost.classList.add('admin-layout-main')

    const links = [
      { key: 'dashboard', label: 'Dashboard', href: 'admin-dashboard.html', icon: 'admin-dashboard' },
      { key: 'tenants', label: 'Tenants', href: 'admin-tenants.html', icon: 'admin-tenant' },
      { key: 'tenant-profiles', label: 'Tenant profiles', href: 'admin-tenant-profiles.html', icon: 'admin-tenant-profile' },
    ]

    const linkHtml = links
      .map(
        (link) =>
          `<a class="sidebar-link${link.key === active ? ' active' : ''}" href="${link.href}" title="${link.label}"><span class="sidebar-link-icon">${iconSvg(link.icon)}</span>${link.label}</a>`,
      )
      .join('')

    shell.insertAdjacentHTML(
      'afterbegin',
      `<nav class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-icon"><img src="assets/favicon.png" alt="Univa"></span>
        </div>
        ${linkHtml}
        <a class="sidebar-link" href="sysadmin-login.html" title="Sign out"><span class="sidebar-link-icon">${iconSvg('admin-logout')}</span>Sign out</a>
      </nav>`,
    )
    contentHost.insertAdjacentHTML(
      'beforebegin',
      `<header class="admin-top-bar">
        <div class="admin-top-bar-left">
          <button type="button" class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="Toggle navigation" title="Toggle navigation">${iconSvg('hamburger')}</button>
          <span class="admin-top-bar-title">Control Center</span>
        </div>
        <div class="admin-top-bar-actions">
          <button type="button" class="admin-top-bar-icon-button" aria-label="Notifications" title="Notifications">${iconSvg('bell')}</button>
          <button type="button" class="admin-top-bar-icon-button" aria-label="Account" title="Account">${iconSvg('user')}</button>
        </div>
      </header>`,
    )

    ensureSidebarBackdrop(shell)
    wireSidebarToggle(shell)
  },
}

window.Layout = Layout
