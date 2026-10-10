/* ==========================================================================
   Univa — static HTML build. Database backup, on the Settings page
   (settings.html, "Settings > Backup" in the sidebar).

   One backup covers the whole workspace. The pages that go into it are
   chosen with checkboxes, grouped like the sidebar, and the choice is kept
   in the backup settings so manual and automatic backups use the same pages.

   The Backups tab picks the pages, takes a backup, and lists the backups
   already taken (download one as an SQL file, or delete it). The Settings tab
   has the automatic schedule (daily / weekly / monthly) and how many backups
   to keep.

   What a page contributes:
     Dashboard            the saved widget layout
     All applications     the application list and its settings
     <each application>   its records, Custom App pages, EMS / CMS
                          collections and saved dashboard layouts
     Devices, Device profiles, Assets, Asset groups, Asset profiles, Shift,
     Schedule, Instance, Rule engine, Reports, Users, User groups,
     Roles & permissions   the data behind that page
   Credentials, Software OTA and the Data explorer keep nothing of their own,
   and device telemetry belongs to the devices, so they aren't offered.

   Backups are kept in the browser (Store.listBackups) so the list survives
   page loads and a file can be downloaded again later. There is no server to
   run a schedule, so Layout.mount() calls Backup.runDue() on every page: when
   automatic backups are on and the last backup is older than the interval,
   one is taken. Settings is for owners and admins only (Store.hasPermission
   answers 'settings' by role; it isn't on the Roles & permissions page).
   Styles: shared/backup.css.
   ========================================================================== */
(function () {
  const DEFAULT_SETTINGS = { auto: false, frequency: 'daily', keep: 10, excluded: [] }
  const FREQUENCIES = [
    { key: 'daily', label: 'Daily', hours: 24 },
    { key: 'weekly', label: 'Weekly', hours: 24 * 7 },
    { key: 'monthly', label: 'Monthly', hours: 24 * 30 },
  ]
  const KEEP_OPTIONS = [3, 5, 10, 20, 50, 0] // 0 = keep every backup
  const DASHBOARD_LAYOUT_KEY = 'univa_dashboard_layout_v1'
  const MAX_CHIPS = 6

  const ICONS = {
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    sliders: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  }
  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  }

  function toast(message) {
    if (window.UI && UI.toast) UI.toast(message)
  }

  function canManage() {
    return Boolean(window.Store) && Store.hasPermission('settings', 'edit')
  }

  function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // ---------------------------------------------------------------- dates
  // Store stamps are local time, 'YYYY-MM-DD HH:MM:SS'.
  function parseStamp(stamp) {
    const d = new Date(String(stamp).replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d
  }

  function formatDate(stamp) {
    const d = parseStamp(stamp)
    return d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : String(stamp)
  }

  function timeAgo(stamp) {
    const d = parseStamp(stamp)
    if (!d) return ''
    const minutes = Math.floor((Date.now() - d.getTime()) / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return minutes + ' min ago'
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago')
    const days = Math.floor(hours / 24)
    return days + (days === 1 ? ' day ago' : ' days ago')
  }

  function formatWhen(date) {
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayDiff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000)
    if (dayDiff <= 0) return 'today at ' + time
    if (dayDiff === 1) return 'tomorrow at ' + time
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' at ' + time
  }

  // ------------------------------------------------------------- settings
  function settings() {
    const saved = Store.get().backupSettings || {}
    return Object.assign({}, DEFAULT_SETTINGS, saved, { excluded: Array.isArray(saved.excluded) ? saved.excluded : [] })
  }

  function saveSettings(patch) {
    Store.setBackupSettings(Object.assign({}, settings(), patch))
  }

  function frequencyOf(current) {
    return FREQUENCIES.find((f) => f.key === current.frequency) || FREQUENCIES[0]
  }

  // Oldest first, the order they were taken in.
  function backups() {
    return Store.listBackups()
  }

  // When the next automatic backup is due: one interval after the latest backup
  // (manual ones count), or now if there isn't one yet.
  function nextDue(current) {
    const list = backups()
    const last = list.length ? parseStamp(list[list.length - 1].createdDate) : null
    return last ? new Date(last.getTime() + frequencyOf(current).hours * 3600000) : new Date()
  }

  // ---------------------------------------------------------------- pages
  function readJson(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key))
      return value == null ? null : value
    } catch (err) {
      return null
    }
  }

  // Widget-dashboard layouts live under their own localStorage keys, one per
  // dashboard scope: 'app-<id>' for an application's own dashboard and
  // 'ems-meter-<id>' for each EMS meter.
  function applicationLayouts(app) {
    const layouts = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || key.indexOf(DASHBOARD_LAYOUT_KEY + '__') !== 0) continue
        const scope = key.slice(DASHBOARD_LAYOUT_KEY.length + 2)
        if (scope !== 'app-' + app.id && !(app.id === 'app_ems' && scope.indexOf('ems-meter') === 0)) continue
        const layout = readJson(key)
        if (layout != null) layouts[scope] = layout
      }
    } catch (err) { /* storage unavailable */ }
    return layouts
  }

  // The collections the Email Tracking application keeps (see shared/store.js).
  const EMAIL_COLLECTIONS = ['emailInbox', 'emailTickets', 'emailReports', 'emailDepartments', 'emailUsers', 'emailFromAddresses', 'emailNotifications', 'emailSms', 'emailSettings', 'emailNotificationSettings', 'emailSmsSettings']

  // Everything one application keeps for itself.
  function applicationPage(store, app) {
    const data = {}
    let count = 0
    const add = (key, rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return
      data[key] = rows
      count += rows.length
    }
    add('applicationRecords', (store.applicationRecords || []).filter((r) => r.appId === app.id))
    // Pages saved before pages were per application have no appId and belong to the Custom App.
    add('notionPages', (store.notionPages || []).filter((p) => (p.appId || 'app_notion') === app.id))
    if (app.id === 'app_ems') {
      add('emsMeters', store.emsMeters)
      add('emsTodReadings', store.emsTodReadings)
      add('emsEnergyData', store.emsEnergyData)
    }
    if (app.id === 'app_cms') add('cmsMachines', store.cmsMachines)
    if (app.id === 'app_email') EMAIL_COLLECTIONS.forEach((key) => add(key, store[key]))
    if (app.id === 'app_forklift') add('forkliftDevices', store.forkliftDevices)
    const layouts = applicationLayouts(app)
    const layoutCount = Object.keys(layouts).length
    if (layoutCount > 0) {
      data.dashboardLayouts = layouts
      count += layoutCount
    }
    return { key: 'app:' + app.id, label: app.name, noun: 'item', data, count }
  }

  // Every page that can go into a backup, grouped like the sidebar. `data` is
  // what the page contributes and `count` how many things that is.
  function catalog() {
    const store = Store.get()
    const apps = store.applications || []
    const list = (key, label, noun, rows) => ({ key, label, noun, data: rows || [], count: (rows || []).length })
    const layout = readJson(DASHBOARD_LAYOUT_KEY)
    const tenant = store.auth && store.auth.tenantId ? (store.tenants || []).find((t) => t.id === store.auth.tenantId) : null
    const rolePermissions = ((tenant || store).rolePermissions) || {}
    return [
      { key: 'dashboard', label: 'Dashboard', pages: [
        { key: 'dashboard', label: 'Dashboard', noun: 'widget', data: { widgets: Array.isArray(layout) ? layout : [] }, count: Array.isArray(layout) ? layout.length : 0 },
      ] },
      { key: 'applications', label: 'Applications', pages: [list('applications', 'All applications', 'application', apps)].concat(apps.map((app) => applicationPage(store, app))) },
      { key: 'devices', label: 'Devices management', pages: [
        list('devices', 'Devices', 'device', store.devices),
        list('deviceProfiles', 'Device profiles', 'profile', store.deviceProfiles),
      ] },
      { key: 'assets', label: 'Assets management', pages: [
        list('assets', 'Assets', 'asset', store.assets),
        list('assetGroups', 'Asset groups', 'group', store.assetGroups),
        list('assetProfiles', 'Asset profiles', 'profile', store.assetProfiles),
      ] },
      { key: 'shifts', label: 'Shift management', pages: [
        list('shifts', 'Shift', 'shift', store.shifts),
        list('shiftSchedules', 'Schedule', 'schedule', store.shiftSchedules),
        list('shiftInstances', 'Instance', 'instance', store.shiftInstances),
      ] },
      { key: 'ruleEngines', label: 'Rule engines', pages: [
        list('ruleEngines', 'Rule engine', 'rule', store.ruleEngines),
        list('ruleEngineExecutions', 'Reports', 'report', store.ruleEngineExecutions),
      ] },
      { key: 'users', label: 'Users & permissions', pages: [
        list('users', 'Users', 'user', store.users),
        list('userGroups', 'User groups', 'group', store.userGroups),
        { key: 'roles', label: 'Roles & permissions', noun: 'role', data: rolePermissions, count: Object.keys(rolePermissions).length },
      ] },
    ]
  }

  function allPages(groups) {
    return groups.reduce((pages, group) => pages.concat(group.pages), [])
  }

  function countText(page) {
    return page.count === 0 ? 'Nothing saved' : plural(page.count, page.noun)
  }

  // ------------------------------------------------------------- snapshot
  // Delete the oldest backups beyond the limit; returns how many went.
  function prune(keep) {
    if (!keep) return 0
    const list = backups()
    const excess = list.length - keep
    if (excess <= 0) return 0
    Store.removeBackups(list.slice(0, excess).map((b) => b.id))
    return excess
  }

  // Backs up the pages chosen in the settings. Returns { backup, pruned }, or
  // null when nothing is chosen or the browser is out of storage.
  function takeBackup(options) {
    const auto = Boolean(options && options.auto)
    const current = settings()
    const selected = allPages(catalog()).filter((page) => current.excluded.indexOf(page.key) === -1)
    if (selected.length === 0) {
      if (!auto) toast('Select at least one page to back up.')
      return null
    }
    const data = {}
    selected.forEach((page) => { data[page.key] = page.data })
    const pages = selected.map((page) => ({ key: page.key, label: page.label, count: page.count }))
    const sizeBytes = new Blob([JSON.stringify(data)]).size
    let backup
    try {
      backup = Store.addBackup({ createdBy: (Store.get().auth || {}).username || 'admin', trigger: auto ? 'auto' : 'manual', pages, sizeBytes, data })
    } catch (err) {
      if (!auto) toast('There is not enough browser storage for another backup. Delete an older one and try again.')
      return null
    }
    return { backup, pruned: prune(current.keep) }
  }

  // Takes the automatic backup if it is on and due. Called by Layout.mount() on
  // every page, and when the Settings page opens.
  function runDue() {
    if (!window.Store || !Store.isLoggedIn || !Store.isLoggedIn() || !canManage()) return null
    const current = settings()
    if (!current.auto || nextDue(current).getTime() > Date.now()) return null
    const result = takeBackup({ auto: true })
    if (result) toast(`Automatic backup taken (${plural(result.backup.pages.length, 'page')}, ${formatSize(result.backup.sizeBytes)}).`)
    return result
  }

  // ------------------------------------------------------------------ SQL
  // The download is a PostgreSQL script: a table for each collection, with its
  // rows as INSERT statements, in one transaction. Column types come from the
  // values: numbers, booleans and text get their own types; nested objects and
  // arrays, and columns that mix types, are JSONB.
  const PAGE_TABLES = {
    devices: 'devices', deviceProfiles: 'device_profiles', applications: 'applications',
    assets: 'assets', assetGroups: 'asset_groups', assetProfiles: 'asset_profiles',
    shifts: 'shifts', shiftSchedules: 'shift_schedules', shiftInstances: 'shift_instances',
    ruleEngines: 'rule_engines', ruleEngineExecutions: 'rule_engine_executions',
    users: 'users', userGroups: 'user_groups',
  }
  const APPLICATION_TABLES = {
    applicationRecords: 'application_records', notionPages: 'notion_pages',
    emsMeters: 'ems_meters', emsTodReadings: 'ems_tod_readings', emsEnergyData: 'ems_energy_data',
    cmsMachines: 'cms_machines',
    emailInbox: 'email_inbox', emailTickets: 'email_tickets', emailReports: 'email_reports', emailDepartments: 'email_departments',
    emailUsers: 'email_users', emailFromAddresses: 'email_from_addresses', emailNotifications: 'email_notifications', emailSms: 'email_sms',
    emailSettings: 'email_settings', emailNotificationSettings: 'email_notification_settings', emailSmsSettings: 'email_sms_settings',
    forkliftDevices: 'forklift_devices',
  }

  function snake(name) {
    return String(name).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'col'
  }

  const quoteIdent = (name) => '"' + String(name).replace(/"/g, '""') + '"'
  const quoteString = (text) => "'" + String(text).replace(/'/g, "''") + "'"
  const oneLine = (text) => String(text).replace(/[\r\n]+/g, ' ')

  function columnType(values) {
    let type = null
    for (const value of values) {
      if (value == null) continue
      const next = typeof value === 'number' ? 'NUMERIC' : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'string' ? 'TEXT' : 'JSONB'
      if (type !== null && type !== next) return 'JSONB'
      type = next
    }
    return type || 'TEXT'
  }

  function sqlLiteral(value, type) {
    if (value == null) return 'NULL'
    if (type === 'JSONB') return quoteString(JSON.stringify(value)) + '::jsonb'
    if (type === 'NUMERIC') return Number.isFinite(value) ? String(value) : 'NULL'
    if (type === 'BOOLEAN') return value ? 'TRUE' : 'FALSE'
    return quoteString(value)
  }

  // The rows of every table a backup holds, in the order they first appear.
  function sqlTables(backup) {
    const tables = []
    const labels = {}
    ;(backup.pages || []).forEach((p) => { labels[p.key] = p.label })
    const add = (name, rows, pageKey) => {
      if (rows.length === 0) return
      let table = tables.find((t) => t.name === name)
      if (!table) {
        table = { name, pages: [], rows: [] }
        tables.push(table)
      }
      const label = labels[pageKey] || pageKey
      if (table.pages.indexOf(label) === -1) table.pages.push(label)
      rows.forEach((row) => table.rows.push(row !== null && typeof row === 'object' && !Array.isArray(row) ? row : { value: row }))
    }
    const data = backup.data || {}
    Object.keys(data).forEach((pageKey) => {
      const value = data[pageKey]
      if (pageKey === 'dashboard') {
        if (Array.isArray(value.widgets) && value.widgets.length) add('dashboard_layouts', [{ scope: 'dashboard', layout: value.widgets }], pageKey)
      } else if (pageKey === 'roles') {
        add('role_permissions', Object.keys(value).map((role) => ({ role, permissions: value[role] })), pageKey)
      } else if (pageKey.indexOf('app:') === 0) {
        Object.keys(value).forEach((key) => {
          if (key === 'dashboardLayouts') add('dashboard_layouts', Object.keys(value[key]).map((scope) => ({ scope, layout: value[key][scope] })), pageKey)
          else if (Array.isArray(value[key])) add(APPLICATION_TABLES[key] || snake(key), value[key], pageKey)
        })
      } else if (Array.isArray(value)) {
        add(PAGE_TABLES[pageKey] || snake(pageKey), value, pageKey)
      }
    })
    return tables
  }

  function tableSql(table) {
    const keys = []
    table.rows.forEach((row) => Object.keys(row).forEach((key) => { if (keys.indexOf(key) === -1) keys.push(key) }))
    const used = {}
    const columns = keys.map((key) => {
      let name = snake(key)
      while (used[name]) name += '_2'
      used[name] = true
      return { key, name, type: columnType(table.rows.map((row) => row[key])) }
    })
    // The first of id / scope / role that is filled in and unique is the primary key.
    const primary = ['id', 'scope', 'role'].map((key) => columns.find((c) => c.key === key)).find((c) => {
      if (!c || (c.type !== 'TEXT' && c.type !== 'NUMERIC')) return false
      const seen = {}
      return table.rows.every((row) => row[c.key] != null && !seen[row[c.key]] && (seen[row[c.key]] = true))
    })
    const create = `CREATE TABLE ${quoteIdent(table.name)} (\n${columns.map((c) => `  ${quoteIdent(c.name)} ${c.type}${c === primary ? ' PRIMARY KEY' : ''}`).join(',\n')}\n);`
    const insert = `INSERT INTO ${quoteIdent(table.name)} (${columns.map((c) => quoteIdent(c.name)).join(', ')}) VALUES\n${table.rows.map((row) => `  (${columns.map((c) => sqlLiteral(row[c.key], c.type)).join(', ')})`).join(',\n')};`
    return `${create}\n\n${insert}`
  }

  function buildSql(backup) {
    const pages = backup.pages || []
    const tables = sqlTables(backup)
    const empty = pages.filter((p) => !p.count).map((p) => p.label)
    const lines = [
      '-- Univa database backup',
      `-- Taken: ${oneLine(backup.createdDate)} by ${oneLine(backup.createdBy)} (${backup.trigger === 'auto' ? 'automatic' : 'manual'})`,
      `-- Pages (${pages.length}): ${pages.map((p) => oneLine(p.label)).join(', ')}`,
    ]
    if (empty.length) lines.push(`-- Nothing saved on: ${empty.map(oneLine).join(', ')}`)
    lines.push('-- PostgreSQL. Restore into an empty database with: psql -f <this file>', '', 'BEGIN;', '')
    tables.forEach((table) => {
      lines.push(`-- ${table.name} (from: ${table.pages.map(oneLine).join(', ')})`, tableSql(table), '')
    })
    lines.push('COMMIT;', '')
    return lines.join('\n')
  }

  function download(backup) {
    const link = document.createElement('a')
    const url = URL.createObjectURL(new Blob([buildSql(backup)], { type: 'application/sql' }))
    link.href = url
    link.download = `univa-backup-${String(backup.createdDate).replace(/[: ]/g, '-')}.sql`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ------------------------------------------------------------ rendering
  function pickerHtml(groups, current) {
    const pages = allPages(groups)
    const selected = pages.filter((p) => current.excluded.indexOf(p.key) === -1).length
    return `
      <section class="bk-section" id="bk-picker">
        <div class="bk-section-head">
          <div>
            <h3 class="bk-section-title">${icon('files')}<span>Pages to back up</span></h3>
            <p class="bk-help">Tick the pages this backup should contain. The same pages are used for automatic backups.</p>
          </div>
          <div class="bk-picker-tools">
            <span class="bk-selected" id="bk-selected-count">${selected} of ${pages.length} selected</span>
            <button type="button" class="bk-link" id="bk-select-all">Select all</button>
            <button type="button" class="bk-link" id="bk-clear">Clear</button>
          </div>
        </div>
        <div class="bk-groups">${groups.map((group) => `
          <fieldset class="bk-group">
            <label class="bk-group-head">
              <input type="checkbox" data-bk-group="${esc(group.key)}" aria-label="All ${esc(group.label)} pages">
              <span>${esc(group.label)}</span>
              <span class="bk-group-count" data-bk-group-count="${esc(group.key)}"></span>
            </label>
            <div class="bk-pages">${group.pages.map((page) => `
              <label class="bk-page">
                <input type="checkbox" data-bk-page="${esc(page.key)}" data-bk-in="${esc(group.key)}"${current.excluded.indexOf(page.key) === -1 ? ' checked' : ''}>
                <span class="bk-page-name">${esc(page.label)}</span>
                <span class="bk-page-count${page.count === 0 ? ' empty' : ''}">${esc(countText(page))}</span>
              </label>`).join('')}
            </div>
          </fieldset>`).join('')}
        </div>
        <p class="bk-note">Credentials, Software OTA and the Data explorer aren't listed: they keep no saved data of their own, and device telemetry belongs to the devices.</p>
      </section>`
  }

  function chipsHtml(backup) {
    const pages = backup.pages || []
    const shown = pages.slice(0, MAX_CHIPS).map((p) => `<span class="bk-chip">${esc(p.label)}</span>`)
    if (pages.length > MAX_CHIPS) {
      const rest = pages.slice(MAX_CHIPS)
      shown.push(`<span class="bk-chip more" title="${esc(rest.map((p) => p.label).join(', '))}">+${rest.length} more</span>`)
    }
    return shown.join('')
  }

  function historyHtml(list) {
    if (list.length === 0) {
      return `
        <div class="bk-empty">
          <span class="bk-empty-icon">${icon('database')}</span>
          <h3>No backups yet</h3>
          <p>Choose the pages above and take your first backup, or turn on automatic backups in Settings.</p>
        </div>`
    }
    return `
      <ul class="bk-list">${list.map((b, i) => {
        const auto = b.trigger === 'auto'
        return `
        <li class="bk-item">
          <span class="bk-item-icon${auto ? ' auto' : ''}">${icon(auto ? 'clock' : 'database')}</span>
          <div>
            <div class="bk-item-title"><span class="bk-item-date">${esc(b.createdDate)}</span>
              <span class="bk-badge${auto ? ' auto' : ''}">${auto ? 'Automatic' : 'Manual'}</span>${i === 0 ? '<span class="bk-badge latest">Latest</span>' : ''}</div>
            <div class="bk-item-meta">${esc(timeAgo(b.createdDate))} &middot; by ${esc(b.createdBy)} &middot; ${plural((b.pages || []).length, 'page')} &middot; ${formatSize(b.sizeBytes || 0)}</div>
            <div class="bk-chips">${chipsHtml(b)}</div>
          </div>
          <div class="bk-item-actions">
            <button type="button" class="bk-download" data-bk-download="${b.id}" title="Download as an SQL file">${icon('download')}<span>Download SQL</span></button>
            <button type="button" class="bk-icon-btn danger" data-bk-delete="${b.id}" aria-label="Delete backup" title="Delete backup">${icon('trash')}</button>
          </div>
        </li>`
      }).join('')}</ul>`
  }

  function backupsPanel(groups, list, current) {
    const total = list.reduce((sum, b) => sum + (b.sizeBytes || 0), 0)
    const newest = list[0]
    return `
      <div class="bk-stats">
        <div class="bk-stat">
          <p class="bk-stat-label">Last backup</p>
          <p class="bk-stat-value" id="bk-stat-last">${newest ? esc(timeAgo(newest.createdDate)) : 'Never'}</p>
          <p class="bk-stat-sub">${newest ? esc(formatDate(newest.createdDate)) : 'Take your first backup'}</p>
        </div>
        <div class="bk-stat">
          <p class="bk-stat-label">Backups</p>
          <p class="bk-stat-value" id="bk-stat-count">${list.length}</p>
          <p class="bk-stat-sub">${current.keep ? 'Keeping the latest ' + current.keep : 'Keeping every backup'}</p>
        </div>
        <div class="bk-stat">
          <p class="bk-stat-label">Storage used</p>
          <p class="bk-stat-value">${formatSize(total)}</p>
          <p class="bk-stat-sub">In this browser</p>
        </div>
      </div>
      ${pickerHtml(groups, current)}
      <h3 class="bk-list-title">Backup history</h3>
      ${historyHtml(list)}`
  }

  function switchHtml(id, on, label) {
    return `<button type="button" role="switch" class="bk-switch" id="${id}" aria-checked="${on}" aria-label="${esc(label)}"></button>`
  }

  function settingsPanel(groups, current) {
    const freq = frequencyOf(current)
    const due = current.auto ? nextDue(current) : null
    const pages = allPages(groups)
    const selected = pages.filter((p) => current.excluded.indexOf(p.key) === -1).length
    return `
      <p class="bk-help">These settings apply to every backup of this workspace.</p>

      <section class="bk-section">
        <h3 class="bk-section-title">${icon('clock')}<span>Automatic backups</span></h3>
        <div class="bk-row">
          <div class="bk-row-text">
            <p class="bk-row-title">Back up automatically</p>
            <p class="bk-row-desc">Takes a backup when the last one is older than the interval you choose. There is no server to run a schedule, so it is checked whenever a page opens.</p>
          </div>
          ${switchHtml('bk-auto', current.auto, 'Back up automatically')}
        </div>
        <div class="bk-row${current.auto ? '' : ' is-off'}">
          <div class="bk-row-text">
            <p class="bk-row-title">How often</p>
            ${due ? `<span class="bk-next" id="bk-next">${icon('clock')}Next backup ${esc(formatWhen(due))}</span>` : '<p class="bk-row-desc">Turn on automatic backups to choose a schedule.</p>'}
          </div>
          <div class="bk-seg${current.auto ? '' : ' is-off'}" role="radiogroup" aria-label="Backup frequency">
            ${FREQUENCIES.map((f) => `<label><input type="radio" name="bk-frequency" value="${f.key}"${f.key === freq.key ? ' checked' : ''}${current.auto ? '' : ' disabled'}><span>${f.label}</span></label>`).join('')}
          </div>
        </div>
        <div class="bk-row">
          <div class="bk-row-text">
            <p class="bk-row-title">Pages included</p>
            <p class="bk-row-desc" id="bk-pages-summary">Automatic backups contain the ${selected} of ${pages.length} pages ticked on the Backups tab.</p>
          </div>
          <button type="button" class="modal-button secondary" id="bk-choose-pages">Choose pages</button>
        </div>
      </section>

      <section class="bk-section">
        <h3 class="bk-section-title">${icon('layers')}<span>Retention</span></h3>
        <div class="bk-row">
          <div class="bk-row-text">
            <p class="bk-row-title">Backups to keep</p>
            <p class="bk-row-desc">When a new backup is taken, the oldest ones beyond this number are deleted. Download a backup first if you want to keep it for good.</p>
          </div>
          <select class="bk-select" id="bk-keep" aria-label="Backups to keep">
            ${KEEP_OPTIONS.map((n) => `<option value="${n}"${n === current.keep ? ' selected' : ''}>${n === 0 ? 'Keep all' : 'Latest ' + n}</option>`).join('')}
          </select>
        </div>
      </section>`
  }

  const page = { host: null, tab: 'backups' }

  function render() {
    const host = page.host
    if (!canManage()) {
      host.innerHTML = `
        <div class="bk-empty bk-empty-wide">
          <span class="bk-empty-icon">${icon('database')}</span>
          <h3>Backups are managed by admins</h3>
          <p>Only owners and admins can take, download or change backups.</p>
        </div>`
      return
    }
    const current = settings()
    const groups = catalog()
    const list = backups().reverse()
    const selectedCount = allPages(groups).filter((p) => current.excluded.indexOf(p.key) === -1).length

    host.innerHTML = `
      <section class="bk-panel" aria-labelledby="bk-title">
        <div class="bk-head">
          <span class="bk-head-icon">${icon('database')}</span>
          <div class="bk-head-text">
            <h2 id="bk-title">Database backup</h2>
            <p class="bk-sub">Whole workspace <span class="bk-status${current.auto ? ' on' : ''}">${current.auto ? 'Automatic &middot; ' + frequencyOf(current).label : 'Automatic backups off'}</span></p>
          </div>
          <button type="button" class="modal-button primary bk-take" id="bk-take"${selectedCount === 0 ? ' disabled title="Select at least one page"' : ''}>${icon('plus')}<span>Take backup now</span></button>
        </div>
        <div class="bk-tabs" role="tablist">
          <button type="button" class="bk-tab" role="tab" data-bk-tab="backups" aria-selected="${page.tab === 'backups'}">${icon('layers')}<span>Backups</span><span class="bk-tab-count">${list.length}</span></button>
          <button type="button" class="bk-tab" role="tab" data-bk-tab="settings" aria-selected="${page.tab === 'settings'}">${icon('sliders')}<span>Settings</span></button>
        </div>
        <div class="bk-body" role="tabpanel">
          ${page.tab === 'settings' ? settingsPanel(groups, current) : backupsPanel(groups, list, current)}
        </div>
      </section>`

    const changed = (patch) => {
      saveSettings(patch)
      toast('Backup settings saved successfully!')
      render()
    }

    host.querySelectorAll('[data-bk-tab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        page.tab = btn.getAttribute('data-bk-tab')
        render()
      }),
    )

    document.getElementById('bk-take').addEventListener('click', () => {
      const result = takeBackup({ auto: false })
      if (!result) return
      const note = result.pruned ? ` The ${result.pruned === 1 ? 'oldest backup was' : result.pruned + ' oldest backups were'} deleted to keep the latest ${current.keep}.` : ''
      toast(`Backup taken (${plural(result.backup.pages.length, 'page')}, ${formatSize(result.backup.sizeBytes)}).${note}`)
      render()
    })

    host.querySelectorAll('[data-bk-download]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const backup = list.find((b) => b.id === btn.getAttribute('data-bk-download'))
        if (backup) download(backup)
      }),
    )
    host.querySelectorAll('[data-bk-delete]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const backup = list.find((b) => b.id === btn.getAttribute('data-bk-delete'))
        if (!backup) return
        UI.confirm({
          message: `Delete the backup taken on <strong>${esc(backup.createdDate)}</strong>? This can't be undone.`,
          onConfirm: () => {
            Store.removeBackup(backup.id)
            toast('Backup deleted successfully!')
            render()
          },
        })
      }),
    )

    // Page picker: the choice is saved as it is made, without redrawing, so
    // the checkbox you are on keeps its focus.
    const pageBoxes = Array.from(host.querySelectorAll('[data-bk-page]'))
    const syncPicker = () => {
      const ticked = pageBoxes.filter((box) => box.checked).length
      const counter = document.getElementById('bk-selected-count')
      if (counter) counter.textContent = `${ticked} of ${pageBoxes.length} selected`
      host.querySelectorAll('[data-bk-group]').forEach((groupBox) => {
        const key = groupBox.getAttribute('data-bk-group')
        const boxes = pageBoxes.filter((box) => box.getAttribute('data-bk-in') === key)
        const on = boxes.filter((box) => box.checked).length
        groupBox.checked = on === boxes.length
        groupBox.indeterminate = on > 0 && on < boxes.length
        const label = host.querySelector(`[data-bk-group-count="${key}"]`)
        if (label) label.textContent = `${on}/${boxes.length}`
      })
      const take = document.getElementById('bk-take')
      take.disabled = ticked === 0
      if (ticked === 0) take.title = 'Select at least one page'
      else take.removeAttribute('title')
    }
    const savePicker = () => {
      saveSettings({ excluded: pageBoxes.filter((box) => !box.checked).map((box) => box.getAttribute('data-bk-page')) })
      syncPicker()
    }
    pageBoxes.forEach((box) => box.addEventListener('change', savePicker))
    host.querySelectorAll('[data-bk-group]').forEach((groupBox) =>
      groupBox.addEventListener('change', () => {
        const key = groupBox.getAttribute('data-bk-group')
        pageBoxes.filter((box) => box.getAttribute('data-bk-in') === key).forEach((box) => { box.checked = groupBox.checked })
        savePicker()
      }),
    )
    const setAll = (checked) => () => {
      pageBoxes.forEach((box) => { box.checked = checked })
      savePicker()
    }
    const on = (id, event, handler) => {
      const node = document.getElementById(id)
      if (node) node.addEventListener(event, handler)
    }
    on('bk-select-all', 'click', setAll(true))
    on('bk-clear', 'click', setAll(false))
    if (pageBoxes.length) syncPicker()

    on('bk-auto', 'click', () => {
      const turningOn = !current.auto
      saveSettings({ auto: turningOn })
      // Turning it on takes the first backup straight away when one is due.
      if (turningOn && runDue()) { /* runDue() already announced it */ } else toast('Backup settings saved successfully!')
      render()
    })
    host.querySelectorAll('input[name="bk-frequency"]').forEach((radio) => radio.addEventListener('change', () => changed({ frequency: radio.value })))
    on('bk-keep', 'change', (e) => changed({ keep: Number(e.target.value) }))
    on('bk-choose-pages', 'click', () => {
      page.tab = 'backups'
      render()
      document.getElementById('bk-picker').scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  window.Backup = {
    // Draws the Settings > Backup page into `host`.
    mountPage(host) {
      page.host = host
      page.tab = 'backups'
      runDue()
      render()
    },
    runDue,
  }
})()
