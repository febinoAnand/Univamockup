/* ==========================================================================
   Univa — static HTML build. Per-application database backup.

   Every application page (application-detail.html and notion.html) has a
   "Backup" button that opens a dialog to take a backup of that application,
   see the backups already taken, download one as a JSON file, or delete it.

   A backup is a snapshot of the application's settings plus the data stored
   for it:
     - records             applicationRecords (manual entries, downtime reasons)
     - pages               notionPages (the Custom App workspace)
     - meters, TOD readings, energy data   EMS keeps its own collections
     - machines            CMS keeps its own collection
     - dashboard layouts   widget dashboards saved for the application
   Device telemetry isn't included: it belongs to the devices (device_data),
   not to the application.

   Snapshots are kept in the store (applicationBackups) so the list survives
   page loads and a file can be downloaded again later. Taking and deleting
   a backup needs the Edit permission on the application (role access); the
   button isn't shown without it.
   ========================================================================== */
(function () {
  const MODAL_ID = 'app-backup-modal'
  const LAYOUT_PREFIX = 'univa_dashboard_layout_v1__'

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  }

  function canBackUp(app) {
    return Boolean(app) && !(window.Store && Store.hasPermission && !Store.hasPermission('app:' + app.id, 'edit'))
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // Widget-dashboard layouts live under their own localStorage keys, one per
  // dashboard scope: 'app-<id>' for an application's own dashboard and
  // 'ems-meter-<id>' for each EMS meter.
  function dashboardLayouts(app) {
    const layouts = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || key.indexOf(LAYOUT_PREFIX) !== 0) continue
        const scope = key.slice(LAYOUT_PREFIX.length)
        if (scope !== 'app-' + app.id && !(app.id === 'app_ems' && scope.indexOf('ems-meter') === 0)) continue
        try { layouts[scope] = JSON.parse(localStorage.getItem(key)) } catch (err) { /* unreadable layout: leave it out */ }
      }
    } catch (err) { /* storage unavailable */ }
    return layouts
  }

  // What goes into a backup of this application, plus a per-part summary.
  function collect(app) {
    const store = Store.get()
    const data = { application: app }
    const parts = []
    const add = (key, label, rows) => {
      if (!rows || rows.length === 0) return
      data[key] = rows
      parts.push({ label, count: rows.length })
    }
    add('applicationRecords', 'records', (store.applicationRecords || []).filter((r) => r.appId === app.id))
    // Pages saved before pages were per application have no appId and belong to the Custom App.
    add('notionPages', 'pages', (store.notionPages || []).filter((p) => (p.appId || 'app_notion') === app.id))
    if (app.id === 'app_ems') {
      add('emsMeters', 'meters', store.emsMeters)
      add('emsTodReadings', 'TOD readings', store.emsTodReadings)
      add('emsEnergyData', 'energy data rows', store.emsEnergyData)
    }
    if (app.id === 'app_cms') add('cmsMachines', 'machines', store.cmsMachines)
    const layouts = dashboardLayouts(app)
    const layoutCount = Object.keys(layouts).length
    if (layoutCount > 0) {
      data.dashboardLayouts = layouts
      parts.push({ label: layoutCount === 1 ? 'dashboard layout' : 'dashboard layouts', count: layoutCount })
    }
    return { data, parts }
  }

  function summaryText(backup) {
    return ['settings'].concat((backup.summary || []).map((p) => `${p.count} ${p.label}`)).join(' · ')
  }

  function takeBackup(app) {
    const { data, parts } = collect(app)
    const sizeBytes = new Blob([JSON.stringify(data)]).size
    try {
      return Store.addApplicationBackup({ appId: app.id, appName: app.name, createdBy: (Store.get().auth || {}).username || 'admin', summary: parts, sizeBytes, data })
    } catch (err) {
      UI.toast('There is not enough browser storage for another backup. Delete an older one and try again.')
      return null
    }
  }

  function download(backup) {
    const file = {
      format: 'univa-application-backup',
      version: 1,
      createdDate: backup.createdDate,
      createdBy: backup.createdBy,
      application: { id: backup.appId, name: backup.appName },
      data: backup.data,
    }
    const slug = String(backup.appName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'application'
    const link = document.createElement('a')
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
    link.href = url
    link.download = `${slug}-backup-${String(backup.createdDate).replace(/[: ]/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // The dialog's overlay is created on first use; its content is redrawn
  // whenever the list changes.
  function overlay() {
    let el = document.getElementById(MODAL_ID)
    if (el) return el
    const style = document.createElement('style')
    style.textContent = `
      /* One below .modal-overlay (100) so a confirm dialog opened from here sits on top. */
      #${MODAL_ID} { z-index: 99; }
      #${MODAL_ID} .ab-help { margin: 0 0 1rem; font-size: 0.85rem; line-height: 1.5; color: var(--text-subtle); }
      #${MODAL_ID} .ab-actions { white-space: nowrap; text-align: right; }
      #${MODAL_ID} .ab-actions .modal-button { padding: 0.3rem 0.75rem; font-size: 0.75rem; margin-left: 0.35rem; }`
    document.head.appendChild(style)
    el = document.createElement('div')
    el.className = 'modal-overlay'
    el.id = MODAL_ID
    document.body.appendChild(el)
    return el
  }

  function render(appId) {
    const app = Store.get().applications.find((a) => a.id === appId)
    const el = overlay()
    if (!app) {
      UI.closeModal(MODAL_ID)
      return
    }
    const backups = (Store.get().applicationBackups || []).filter((b) => b.appId === appId).reverse()
    el.innerHTML = `
      <div class="modal-card" style="max-width:760px;">
        <div class="modal-header">
          <h2>Database backup &mdash; ${esc(app.name)}</h2>
          <button type="button" class="modal-close" data-ab-close aria-label="Close" title="Close">&times;</button>
        </div>
        <div class="modal-body">
          <p class="ab-help">A backup is a snapshot of ${esc(app.name)}'s settings and the data stored for it. Download one to keep a copy outside the browser. Device telemetry isn't included, because it belongs to the devices.</p>
          ${backups.length === 0
            ? '<p class="section-empty">No backups yet. Use "Take backup now" to create the first one.</p>'
            : `<div class="table-scroll"><table class="data-table">
                <thead><tr><th>Taken</th><th>By</th><th>Contains</th><th>Size</th><th></th></tr></thead>
                <tbody>${backups.map((b) => `
                  <tr>
                    <td data-label="Taken">${esc(b.createdDate)}</td>
                    <td data-label="By">${esc(b.createdBy)}</td>
                    <td data-label="Contains">${esc(summaryText(b))}</td>
                    <td data-label="Size">${formatSize(b.sizeBytes || 0)}</td>
                    <td class="ab-actions">
                      <button type="button" class="modal-button secondary" data-ab-download="${b.id}">Download</button>
                      <button type="button" class="modal-button danger" data-ab-delete="${b.id}">Delete</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-button secondary" data-ab-close>Close</button>
          <button type="button" class="modal-button primary" id="ab-take">Take backup now</button>
        </div>
      </div>`

    el.querySelectorAll('[data-ab-close]').forEach((btn) => btn.addEventListener('click', () => UI.closeModal(MODAL_ID)))
    document.getElementById('ab-take').addEventListener('click', () => {
      const backup = takeBackup(app)
      if (!backup) return
      UI.toast(`Backup of "${app.name}" taken (${formatSize(backup.sizeBytes)}).`)
      render(appId)
    })
    el.querySelectorAll('[data-ab-download]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const backup = backups.find((b) => b.id === btn.getAttribute('data-ab-download'))
        if (backup) download(backup)
      }),
    )
    el.querySelectorAll('[data-ab-delete]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const backup = backups.find((b) => b.id === btn.getAttribute('data-ab-delete'))
        if (!backup) return
        UI.confirm({
          message: `Delete the backup taken on <strong>${esc(backup.createdDate)}</strong>? This can't be undone.`,
          onConfirm: () => {
            Store.removeApplicationBackup(backup.id)
            UI.toast('Backup deleted successfully!')
            render(appId)
          },
        })
      }),
    )
  }

  function open(appId) {
    render(appId)
    UI.openModal(MODAL_ID)
  }

  window.AppBackup = {
    // The header button, or nothing when the signed-in role can't edit this application.
    buttonHtml(app) {
      return canBackUp(app)
        ? '<button type="button" class="modal-button secondary" id="app-backup-btn" title="Take a database backup of this application">Backup</button>'
        : ''
    },
    // Call after every render of the header, since the button is redrawn with it.
    wire(app) {
      const btn = document.getElementById('app-backup-btn')
      if (btn) btn.addEventListener('click', () => open(app.id))
    },
  }
})()
