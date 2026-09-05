/* ==========================================================================
   Univa — static HTML build. Sidebar + topbar shell shared by every
   authenticated page. Mirrors src/core/layouts/Sidebar.jsx + TopBar.jsx.
   ========================================================================== */

const NAV_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'dashboard.html' },
  {
    key: 'device-management',
    label: 'Device management',
    icon: 'device',
    children: [
      { key: 'devices', label: 'Devices', href: 'devices.html' },
      { key: 'device-profiles', label: 'Device profiles', href: 'device-profiles.html' },
      { key: 'credentials', label: 'Credentials', href: 'credentials.html' },
      { key: 'software-ota', label: 'Software OTA', href: 'software-ota.html' },
    ],
  },
  {
    key: 'user-management',
    label: 'User management',
    icon: 'users',
    children: [
      { key: 'users', label: 'Users', href: 'users.html' },
      { key: 'user-groups', label: 'User groups', href: 'user-groups.html' },
      { key: 'roles', label: 'Roles & permissions', href: 'roles.html' },
    ],
  },
  {
    key: 'asset-management',
    label: 'Asset management',
    icon: 'asset',
    children: [
      { key: 'assets', label: 'Assets', href: 'assets.html' },
      { key: 'asset-groups', label: 'Asset groups', href: 'asset-groups.html' },
      { key: 'asset-profiles', label: 'Asset profiles', href: 'asset-profiles.html' },
    ],
  },
  {
    key: 'rule-engines',
    label: 'Rule engines',
    icon: 'rule-engine',
    children: [
      { key: 'rule-engines', label: 'Rule engine', href: 'rule-engines.html' },
      { key: 'rule-engine-reports', label: 'Reports', href: 'rule-engine-reports.html' },
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
    'rule-engine':
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7 5h6a4 4 0 0 1 4 4v0M7 19h6a4 4 0 0 0 4-4v0" stroke-linecap="round"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
  }
  return icons[name] || ''
}

function sectionContainsActive(section, active) {
  if (section.key === active) return true
  if (section.children) return section.children.some((c) => c.key === active)
  return false
}

function renderSidebar(active) {
  const items = NAV_SECTIONS.map((section) => {
    if (!section.children) {
      const isActive = section.key === active
      return `<a class="sidebar-link${isActive ? ' active' : ''}" href="${section.href}">${iconSvg(section.icon)}<span>${section.label}</span></a>`
    }
    // Every group starts expanded, matching Sidebar.jsx's default state.
    const children = section.children
      .map((child) => `<a class="sidebar-child-link${child.key === active ? ' active' : ''}" href="${child.href}">${child.label}</a>`)
      .join('')
    return `
      <div class="sidebar-group expanded" data-group="${section.key}">
        <button type="button" class="sidebar-group-header">
          ${iconSvg(section.icon)}
          <span class="sidebar-group-label">${section.label}</span>
          <span class="sidebar-group-chevron">${iconSvg('chevron')}</span>
        </button>
        <div class="sidebar-group-children">${children}</div>
        ${sectionContainsActive(section, active) ? '<span class="sidebar-active-bar"></span>' : ''}
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
      <div class="top-bar-breadcrumbs">${crumbHtml}</div>
      <div class="top-bar-actions">
        <button type="button" class="top-bar-icon-button" title="Notifications">${iconSvg('bell')}</button>
        <button type="button" class="top-bar-icon-button" id="logout-button" title="Sign out">${iconSvg('user')}</button>
      </div>
    </header>`
}

const Layout = {
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
  },

  mount({ active, breadcrumbs }) {
    Store.requireAuth()

    const shell = document.getElementById('app-shell')
    const contentHost = document.getElementById('app-content')
    if (!shell || !contentHost) return

    shell.insertAdjacentHTML('afterbegin', renderSidebar(active))
    contentHost.insertAdjacentHTML('beforebegin', renderTopBar(breadcrumbs || []))

    shell.querySelectorAll('.sidebar-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        header.closest('.sidebar-group').classList.toggle('expanded')
      })
    })

    const logoutButton = document.getElementById('logout-button')
    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        Store.logout()
        window.location.href = 'login.html'
      })
    }
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
        <span class="admin-top-bar-title">Control Center</span>
        <div class="admin-top-bar-actions">
          <button type="button" class="admin-top-bar-icon-button" aria-label="Notifications">${iconSvg('bell')}</button>
          <button type="button" class="admin-top-bar-icon-button" aria-label="Account">${iconSvg('user')}</button>
        </div>
      </header>`,
    )
  },
}

window.Layout = Layout
