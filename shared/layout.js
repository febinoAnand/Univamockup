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
    label: 'Devices',
    children: [
      { key: 'devices', label: 'Devices', icon: 'device', href: 'devices.html' },
      { key: 'device-profiles', label: 'Device profiles', icon: 'profile', href: 'device-profiles.html' },
      { key: 'credentials', label: 'Credentials', icon: 'credentials', href: 'credentials.html' },
      { key: 'software-ota', label: 'Software OTA', icon: 'cloud-ota', href: 'software-ota.html' },
    ],
  },
  {
    key: 'asset-management',
    label: 'Assets',
    children: [
      { key: 'assets', label: 'Assets', icon: 'asset', href: 'assets.html' },
      { key: 'asset-groups', label: 'Asset groups', icon: 'group', href: 'asset-groups.html' },
      { key: 'asset-profiles', label: 'Asset profiles', icon: 'profile', href: 'asset-profiles.html' },
    ],
  },
  { key: 'shift-management', label: 'Shifts', icon: 'shift', href: 'shift-management.html' },
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
    label: 'Users',
    children: [
      { key: 'users', label: 'Users', icon: 'users', href: 'users.html' },
      { key: 'user-groups', label: 'User groups', icon: 'group', href: 'user-groups.html' },
      { key: 'roles', label: 'Roles & permissions', icon: 'shield', href: 'roles.html' },
    ],
  },
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
  }
  return icons[name] || ''
}

function renderSidebar(active) {
  const items = NAV_SECTIONS.map((section) => {
    if (!section.children) {
      const isActive = section.key === active
      return `<a class="sidebar-link${isActive ? ' active' : ''}" href="${section.href}">${iconSvg(section.icon)}<span>${section.label}</span></a>`
    }
    // Static section — always shows its children, no expand/collapse.
    let sectionChildren = section.children
    if (section.dynamicChildren === 'applications') {
      const apps = (window.Store ? Store.get().applications : []) || []
      sectionChildren = sectionChildren.concat(
        apps.map((a) => ({ key: `application-${a.id}`, label: a.name, icon: 'app', href: `application-detail.html#${a.id}` })),
      )
    }
    const children = sectionChildren
      .map((child) => `<a class="sidebar-child-link${child.key === active ? ' active' : ''}" href="${child.href}">${iconSvg(child.icon)}<span>${child.label}</span></a>`)
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
        : `<a class="breadcrumb-link" href="${crumb.href}">${crumb.label}</a>`
      return index === 0 ? label : `<span class="breadcrumb-separator">/</span>${label}`
    })
    .join('')

  return `
    <header class="top-bar">
      <div class="top-bar-left">
        <button type="button" class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="Toggle navigation">${iconSvg('hamburger')}</button>
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
          `<a class="sidebar-link${link.key === active ? ' active' : ''}" href="${link.href}"><span class="sidebar-link-icon">${iconSvg(link.icon)}</span>${link.label}</a>`,
      )
      .join('')

    shell.insertAdjacentHTML(
      'afterbegin',
      `<nav class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-icon"><img src="assets/favicon.png" alt="Univa"></span>
        </div>
        ${linkHtml}
        <a class="sidebar-link" href="sysadmin-login.html"><span class="sidebar-link-icon">${iconSvg('admin-logout')}</span>Sign out</a>
      </nav>`,
    )
    contentHost.insertAdjacentHTML(
      'beforebegin',
      `<header class="admin-top-bar">
        <div class="admin-top-bar-left">
          <button type="button" class="sidebar-toggle-btn" id="sidebar-toggle-btn" aria-label="Toggle navigation">${iconSvg('hamburger')}</button>
          <span class="admin-top-bar-title">Control Center</span>
        </div>
        <div class="admin-top-bar-actions">
          <button type="button" class="admin-top-bar-icon-button" aria-label="Notifications">${iconSvg('bell')}</button>
          <button type="button" class="admin-top-bar-icon-button" aria-label="Account">${iconSvg('user')}</button>
        </div>
      </header>`,
    )

    ensureSidebarBackdrop(shell)
    wireSidebarToggle(shell)
  },
}

window.Layout = Layout
