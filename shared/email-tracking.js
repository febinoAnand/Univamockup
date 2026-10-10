/* ==========================================================================
   Univa — static HTML build. The built-in Email Tracking application
   (email-tracking.html). A port of the ifmEmailTracking React app: emails that
   reach a mailbox become tickets, go to the department named in the subject,
   and its people are told by push notification and SMS.

   Tabs: Dashboard, Inbox, Departments, Tickets, Reports, Notifications, SMS
   gateway, Users, Settings. The data lives in the Store (emailInbox,
   emailDepartments, emailTickets, ... see shared/store.js, where the rules
   that turn an email into a ticket are written down) and is not tenant-scoped,
   like EMS and CMS.

   The tab follows the URL hash: email-tracking.html#app_email:inbox.
   ========================================================================== */
(function () {
  const APP_ID = 'app_email'
  const PAGE_SIZE = 10


  const TABS = [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { key: 'inbox', label: 'Inbox', icon: 'mail' },
    { key: 'departments', label: 'Departments', icon: 'group' },
    { key: 'tickets', label: 'Tickets', icon: 'clipboard' },
    { key: 'reports', label: 'Reports', icon: 'report' },
    { key: 'notifications', label: 'Notifications', icon: 'bell' },
    { key: 'sms', label: 'SMS gateway', icon: 'phone' },
    { key: 'users', label: 'Users', icon: 'users' },
    { key: 'settings', label: 'Settings', icon: 'gear' },
  ]

  const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg>'
  const MORE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>'
  const EDIT_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/></svg>'
  const VIEW_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8"/></svg>'
  const KEY_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 18 5M15.5 7.5l2 2M18.5 4.5l2 2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

  const OUTCOME_TEXT = {
    ticket: 'A ticket was made from this email.',
    sender: 'No ticket: the email is not from an active From address.',
    'no-alias': 'No ticket: the subject has no department alias such as [NET].',
    'unknown-alias': 'No ticket: no department has the alias in the subject.',
  }

  let root = null
  let view = null
  let chart = null
  const ui = { page: {}, search: {}, selected: {} }

  // ------------------------------------------------------------- helpers
  const esc = (value) => UI.esc(value)
  const data = () => Store.get()
  const plural = (n, one, many) => (n === 1 ? one : many || one + 's')
  const getApp = () => data().applications.find((a) => a.id === APP_ID)
  const splitStamp = (stamp) => String(stamp || '').split(' ')
  const oneLine = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  const findUser = (id) => data().emailUsers.find((u) => u.id === id)

  function newestFirst(rows, field) {
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => String(b.row[field]).localeCompare(String(a.row[field])) || b.index - a.index)
      .map((item) => item.row)
  }

  function parseHash() {
    const parts = window.location.hash.slice(1).split(':')
    const tab = TABS.some((t) => t.key === parts[1]) ? parts[1] : 'dashboard'
    return { tab }
  }

  function currentTab() {
    return parseHash().tab
  }

  function selection(key) {
    if (!ui.selected[key]) ui.selected[key] = new Set()
    return ui.selected[key]
  }

  function pill(kind, label, title) {
    return `<span class="status-pill status-${kind}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</span>`
  }

  // ------------------------------------------------------------ list card
  // Every table here is one of these: a card with a search box, an optional
  // tick box on each row, a menu on each row, and pages of ten.
  //   key, title, icon, note, buttons [{ act, label, primary }], searchLabel,
  //   rows() every row, text(row) what a search looks in, selectable,
  //   columns(allRows) [{ label, cell(row), nowrap }], rowMenu(row) [{ act, label, danger, icon }],
  //   empty, emptySearch, onButton(act, repaint), onRowAction(act, id, repaint),
  //   wire(body, repaint) for anything else a cell needs.
  function listHtml(cfg) {
    return `
      <div class="detail-card" data-list="${cfg.key}">
        <h2><span class="section-icon">${iconSvg(cfg.icon)}</span>${esc(cfg.title)}
          <span class="et-card-actions">${(cfg.buttons || []).map((b) => `<button type="button" class="${b.primary ? 'solid-action-button' : 'outline-action-button'} et-small-button" data-act="${b.act}">${esc(b.label)}</button>`).join('')}</span>
        </h2>
        ${cfg.note ? `<p class="et-card-note">${cfg.note}</p>` : ''}
        <div class="et-table-bar"><div class="table-search-wrap">${SEARCH_ICON}<input type="text" data-search aria-label="${esc(cfg.searchLabel)}" placeholder="${esc(cfg.searchLabel)}" value="${esc(ui.search[cfg.key] || '')}" /></div></div>
        <div data-list-body></div>
      </div>`
  }

  // The rows the search leaves.
  function visibleRows(cfg) {
    const q = (ui.search[cfg.key] || '').trim().toLowerCase()
    const all = cfg.rows()
    return { all, rows: q ? all.filter((row) => cfg.text(row).toLowerCase().includes(q)) : all, searching: Boolean(q) }
  }

  function rowMenuHtml(items, id) {
    return `<div class="row-menu"><button type="button" class="row-menu-button" data-menu-toggle aria-label="Row actions" title="Row actions">${MORE_ICON}</button><div class="row-menu-dropdown">${items.map((item) => `<button type="button" class="row-menu-item${item.danger ? ' danger' : ''}" data-row-act="${item.act}" data-id="${esc(id)}">${item.icon || ''}${esc(item.label)}</button>`).join('')}</div></div>`
  }

  function pagerHtml(page, pages, total, start) {
    const buttons = []
    buttons.push(`<button type="button" class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>`)
    if (pages <= 7) for (let n = 1; n <= pages; n++) buttons.push(`<button type="button" class="page-btn${n === page ? ' active' : ''}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`)
    else buttons.push(`<button type="button" class="page-btn active" disabled>${page} / ${pages}</button>`)
    buttons.push(`<button type="button" class="page-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>`)
    return `<div class="et-pager"><span data-showing>${total ? `Showing ${start + 1} to ${Math.min(total, start + PAGE_SIZE)} of ${total} ${plural(total, 'entry', 'entries')}` : 'Showing 0 entries'}</span><span class="pagination" style="padding:0;">${buttons.join('')}</span></div>`
  }

  function paintList(cfg, body) {
    const { all, rows, searching } = visibleRows(cfg)
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    const page = Math.min(Math.max(1, ui.page[cfg.key] || 1), pages)
    ui.page[cfg.key] = page
    const start = (page - 1) * PAGE_SIZE
    const shown = rows.slice(start, start + PAGE_SIZE)
    const selected = selection(cfg.key)
    const present = new Set(all.map((row) => row.id))
    selected.forEach((id) => { if (!present.has(id)) selected.delete(id) })
    const allTicked = rows.length > 0 && rows.every((row) => selected.has(row.id))
    const columns = cfg.columns(all)
    const span = columns.length + 1 + (cfg.selectable ? 1 : 0) + (cfg.rowMenu ? 1 : 0)

    body.innerHTML = `
      ${selected.size ? `<p class="et-selected-note">${selected.size} selected</p>` : ''}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            ${cfg.selectable ? `<th class="et-num"><input type="checkbox" class="et-check" data-select-all aria-label="Select all" ${allTicked ? 'checked' : ''} /></th>` : ''}
            <th class="et-num">Sl.No</th>
            ${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}
            ${cfg.rowMenu ? '<th class="data-table-menu-col"></th>' : ''}
          </tr></thead>
          <tbody>
            ${shown.length
              ? shown.map((row, i) => `
            <tr data-id="${esc(row.id)}">
              ${cfg.selectable ? `<td class="et-num"><input type="checkbox" class="et-check" data-select-row="${esc(row.id)}" aria-label="Select row ${start + i + 1}" ${selected.has(row.id) ? 'checked' : ''} /></td>` : ''}
              <td class="et-num" data-label="Sl.No">${start + i + 1}</td>
              ${columns.map((c) => `<td data-label="${esc(c.label)}"${c.nowrap || c.className ? ` class="${[c.nowrap ? 'et-nowrap' : '', c.className || ''].join(' ').trim()}"` : ''}>${c.cell(row)}</td>`).join('')}
              ${cfg.rowMenu ? `<td class="data-table-menu-col">${rowMenuHtml(cfg.rowMenu(row), row.id)}</td>` : ''}
            </tr>`).join('')
              : `<tr><td colspan="${span}" class="empty-table-note">${esc(searching ? cfg.emptySearch : cfg.empty)}</td></tr>`}
          </tbody>
        </table>
      </div>
      ${pagerHtml(page, pages, rows.length, start)}`

    const repaint = () => paintList(cfg, body)
    const selectAll = body.querySelector('[data-select-all]')
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        if (selectAll.checked) rows.forEach((row) => selected.add(row.id))
        else rows.forEach((row) => selected.delete(row.id))
        repaint()
      })
    }
    body.querySelectorAll('[data-select-row]').forEach((box) =>
      box.addEventListener('change', () => {
        const id = box.getAttribute('data-select-row')
        if (box.checked) selected.add(id)
        else selected.delete(id)
        repaint()
      }),
    )
    body.querySelectorAll('[data-page]').forEach((btn) =>
      btn.addEventListener('click', () => {
        ui.page[cfg.key] = Number(btn.getAttribute('data-page'))
        repaint()
      }),
    )
    body.querySelectorAll('[data-menu-toggle]').forEach((btn) =>
      btn.addEventListener('click', (event) => {
        event.stopPropagation()
        const menu = btn.closest('.row-menu')
        const wasOpen = menu.classList.contains('open')
        UI.closeRowMenus()
        if (!wasOpen) UI.openRowMenu(btn)
      }),
    )
    body.querySelectorAll('[data-row-act]').forEach((btn) =>
      btn.addEventListener('click', () => cfg.onRowAction(btn.getAttribute('data-row-act'), btn.getAttribute('data-id'), repaint)),
    )
    if (cfg.wire) cfg.wire(body, repaint)
  }

  function mountList(cfg) {
    const card = root.querySelector(`[data-list="${cfg.key}"]`)
    const body = card.querySelector('[data-list-body]')
    const repaint = () => paintList(cfg, body)
    card.querySelector('[data-search]').addEventListener('input', (event) => {
      ui.search[cfg.key] = event.target.value
      ui.page[cfg.key] = 1
      repaint()
    })
    card.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => cfg.onButton(btn.getAttribute('data-act'), repaint)))
    repaint()
    return repaint
  }

  // Asks, then removes rows (by id) and says so.
  function deleteRows(cfg, ids, noun, repaint, label) {
    if (!ids.length) {
      UI.toast(`Select at least one ${noun} first.`)
      return
    }
    UI.confirm({
      message: ids.length === 1 && label ? `Delete <strong>${esc(label)}</strong>? This can't be undone.` : `Delete <strong>${ids.length} ${esc(plural(ids.length, noun))}</strong>? This can't be undone.`,
      onConfirm: () => {
        cfg.remove(ids)
        selection(cfg.key).clear()
        UI.toast(ids.length === 1 && label ? `"${label}" deleted successfully!` : `${ids.length} ${plural(ids.length, noun)} deleted successfully!`)
        repaint()
        if (cfg.afterDelete) cfg.afterDelete()
      },
    })
  }

  // The "Delete selected" and per-row Delete of most lists.
  function standardDelete(cfg, noun, labelOf) {
    cfg.onButton = (act, repaint) => {
      if (act === 'delete') deleteRows(cfg, Array.from(selection(cfg.key)), noun, repaint)
      else if (cfg.onOtherButton) cfg.onOtherButton(act, repaint)
    }
    cfg.onRowAction = (act, id, repaint) => {
      if (act === 'delete') {
        const row = cfg.rows().find((r) => r.id === id)
        deleteRows(cfg, [id], noun, repaint, row ? labelOf(row) : '')
      } else if (cfg.onOtherRowAction) cfg.onOtherRowAction(act, id, repaint)
    }
    return cfg
  }

  const DELETE_ITEM = { act: 'delete', label: 'Delete', danger: true, icon: TRASH_ICON }

  // ------------------------------------------------------- list configs
  function inboxConfig() {
    const cfg = {
      key: 'inbox', title: 'E-mail box', icon: 'mail',
      note: 'Every email that reaches the mailbox. One from an active From address with a department alias in its subject, such as <strong>[NET]</strong>, also becomes a ticket.',
      buttons: [{ act: 'receive', label: 'Receive test email' }, { act: 'delete', label: 'Delete selected' }],
      searchLabel: 'Search by subject, message, sender or date-time',
      rows: () => newestFirst(data().emailInbox, 'receivedDate'),
      text: (e) => [e.subject, e.message, e.fromEmail, e.receivedDate].join(' '),
      selectable: true,
      columns: () => [
        { label: 'Date', nowrap: true, cell: (e) => esc(splitStamp(e.receivedDate)[0]) },
        { label: 'Time', nowrap: true, cell: (e) => esc(splitStamp(e.receivedDate)[1]) },
        { label: 'From', cell: (e) => esc(e.fromEmail) },
        { label: 'Subject', className: 'et-subject', cell: (e) => esc(e.subject) },
        { label: 'Message', cell: (e) => `<button type="button" class="et-link-cell et-clip" data-open="${esc(e.id)}" title="Click to view the full email">${esc(oneLine(e.message))}</button>` },
        { label: 'Ticket', cell: (e) => (e.outcome === 'ticket' ? pill('ticket', 'Ticket', OUTCOME_TEXT.ticket) : pill('ignored', 'No ticket', OUTCOME_TEXT[e.outcome] || '')) },
      ],
      rowMenu: () => [{ act: 'open', label: 'View', icon: VIEW_ICON }, DELETE_ITEM],
      empty: 'The inbox is empty.', emptySearch: 'No matching emails found.',
      remove: (ids) => Store.removeEmailInbox(ids),
      wire: (body) => body.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openInboxEmail(btn.getAttribute('data-open')))),
    }
    standardDelete(cfg, 'email', (e) => e.subject)
    cfg.onOtherButton = () => openReceive()
    cfg.onOtherRowAction = (act, id) => { if (act === 'open') openInboxEmail(id) }
    return cfg
  }

  function departmentsConfig() {
    const cfg = {
      key: 'departments', title: 'Departments', icon: 'group',
      note: 'An email is sent to a department by its alias in the subject, for example <strong>[NET] Link down</strong>.',
      buttons: [{ act: 'create', label: 'Create', primary: true }, { act: 'delete', label: 'Delete selected' }],
      searchLabel: 'Search by alias, department or user',
      rows: () => data().emailDepartments.slice().reverse(),
      text: (d) => [d.alias, d.department, d.userIds.map((id) => (findUser(id) || {}).username).join(' ')].join(' '),
      selectable: true,
      columns: () => [
        { label: 'Department alias', cell: (d) => `<strong>${esc(d.alias)}</strong>` },
        { label: 'Department', cell: (d) => esc(d.department) },
        { label: 'Users', cell: (d) => { const names = d.userIds.map((id) => findUser(id)).filter(Boolean).map((u) => u.username); return names.length ? `<span class="et-chip-list">${names.map((n) => `<span class="et-chip">${esc(n)}</span>`).join('')}</span>` : '<span class="et-muted">No users</span>' } },
      ],
      rowMenu: () => [{ act: 'edit', label: 'Edit', icon: EDIT_ICON }, DELETE_ITEM],
      empty: 'No departments yet. Create one to start routing emails.', emptySearch: 'No matching departments found.',
      remove: (ids) => Store.removeEmailDepartments(ids),
    }
    standardDelete(cfg, 'department', (d) => d.alias)
    cfg.onOtherButton = () => openDepartment(null)
    cfg.onOtherRowAction = (act, id) => { if (act === 'edit') openDepartment(id) }
    return cfg
  }

  // A ticket's own fields (from the "Key: value" lines of its email) are its columns.
  function ticketFieldKeys(tickets) {
    const keys = []
    tickets.forEach((t) => Object.keys(t.fields || {}).forEach((key) => { if (!keys.includes(key)) keys.push(key) }))
    return keys
  }

  function ticketsConfig() {
    const cfg = {
      key: 'tickets', title: 'Tickets', icon: 'clipboard',
      note: 'Made from the emails that were sent to a department. The columns after Department are the fields found in the emails.',
      buttons: [{ act: 'delete', label: 'Delete selected' }, { act: 'pdf', label: 'Download as PDF' }, { act: 'csv', label: 'Download as CSV' }],
      searchLabel: 'Search by ticket name, department, field or date',
      rows: () => newestFirst(data().emailTickets, 'receivedDate'),
      text: (t) => [t.ticketName, t.department, t.receivedDate].concat(Object.keys(t.fields || {}).map((k) => t.fields[k])).join(' '),
      selectable: true,
      columns: (all) => [
        { label: 'Date-Time', nowrap: true, cell: (t) => esc(t.receivedDate) },
        { label: 'Ticket name', cell: (t) => esc(t.ticketName) },
        { label: 'Department', cell: (t) => esc(t.department) },
      ].concat(ticketFieldKeys(all).map((key) => ({ label: key, cell: (t) => esc((t.fields || {})[key]) }))),
      empty: 'No tickets yet.', emptySearch: 'No matching tickets found.',
      remove: (ids) => Store.removeEmailTickets(ids),
    }
    standardDelete(cfg, 'ticket', (t) => t.ticketName)
    cfg.rowMenu = () => [DELETE_ITEM]
    // What a download holds: the rows the search leaves, in the order shown.
    const table = () => {
      const { rows } = visibleRows(cfg)
      const keys = ticketFieldKeys(cfg.rows())
      const head = ['Sl.No', 'Date-Time', 'Ticket name', 'Department'].concat(keys)
      return { head, body: rows.map((t, i) => [i + 1, t.receivedDate, t.ticketName, t.department].concat(keys.map((k) => (t.fields || {})[k] || ''))) }
    }
    cfg.onOtherButton = (act) => {
      const name = 'tickets' + (Downloads.fileSafe(ui.search.tickets) ? '_' + Downloads.fileSafe(ui.search.tickets) : '')
      const { head, body } = table()
      if (!body.length) { UI.toast('There are no tickets to download.'); return }
      if (act === 'csv') Downloads.downloadCsv(name + '.csv', head, body)
      else Downloads.downloadPdf(name + '.pdf', head, body.map((row) => row.map(String)))
    }
    return cfg
  }

  function reportsConfig() {
    const cfg = {
      key: 'reports', title: 'Report', icon: 'report',
      note: 'One line for each ticket sent on: what it said, which department and who was told.',
      buttons: [{ act: 'delete', label: 'Delete selected' }, { act: 'pdf', label: 'Download as PDF' }, { act: 'csv', label: 'Download as CSV' }],
      searchLabel: 'Search by date, time, message, department or user',
      rows: () => newestFirst(data().emailReports, 'sentDate'),
      text: (r) => [r.sentDate, r.message, r.department].concat(r.sendToUsers || []).join(' '),
      selectable: true,
      columns: () => [
        { label: 'Date', nowrap: true, cell: (r) => esc(splitStamp(r.sentDate)[0]) },
        { label: 'Time', nowrap: true, cell: (r) => esc(splitStamp(r.sentDate)[1]) },
        { label: 'Message', cell: (r) => esc(r.message) },
        { label: 'Department', cell: (r) => esc(r.department) },
        { label: 'Send to user', cell: (r) => ((r.sendToUsers || []).length ? `<span class="et-chip-list">${r.sendToUsers.map((n) => `<span class="et-chip">${esc(n)}</span>`).join('')}</span>` : '<span class="et-muted">Nobody was active</span>') },
      ],
      rowMenu: () => [DELETE_ITEM],
      empty: 'No reports yet.', emptySearch: 'No matching reports found.',
      remove: (ids) => Store.removeEmailReports(ids),
    }
    standardDelete(cfg, 'report', (r) => r.message)
    const table = () => {
      const { rows } = visibleRows(cfg)
      const head = ['Sl.No', 'Date', 'Time', 'Message', 'Department', 'Send to user']
      return { head, body: rows.map((r, i) => [i + 1, splitStamp(r.sentDate)[0], splitStamp(r.sentDate)[1], r.message, r.department, (r.sendToUsers || []).join(', ')]) }
    }
    cfg.onOtherButton = (act) => {
      const { head, body } = table()
      if (!body.length) { UI.toast('There are no reports to download.'); return }
      if (act === 'csv') Downloads.downloadCsv('tickets_report.csv', head, body)
      else Downloads.downloadPdf('tickets_report.pdf', head, body.map((row) => row.map(String)))
    }
    return cfg
  }

  function notificationsConfig() {
    const cfg = {
      key: 'notifications', title: 'Notifications sent', icon: 'bell',
      note: 'The push notifications sent when a ticket was made, and whether each one was delivered.',
      buttons: [{ act: 'delete', label: 'Delete selected' }],
      searchLabel: 'Search by title, message, user or status',
      rows: () => newestFirst(data().emailNotifications, 'sentDate'),
      text: (n) => [n.sentDate, n.title, n.message, n.sendToUser, n.deliveryStatus].join(' '),
      selectable: true,
      columns: () => [
        { label: 'Date', nowrap: true, cell: (n) => esc(splitStamp(n.sentDate)[0]) },
        { label: 'Time', nowrap: true, cell: (n) => esc(splitStamp(n.sentDate)[1]) },
        { label: 'Title', cell: (n) => esc(n.title) },
        { label: 'Message', cell: (n) => esc(n.message) },
        { label: 'User', cell: (n) => esc(n.sendToUser) },
        { label: 'Delivery status', cell: (n) => pill(n.deliveryStatus === 'delivered' ? 'delivered' : n.deliveryStatus === 'failed' ? 'failed' : 'pending', n.deliveryStatus) },
      ],
      rowMenu: () => [DELETE_ITEM],
      empty: 'No notifications have been sent.', emptySearch: 'No matching notifications found.',
      remove: (ids) => Store.removeEmailNotifications(ids),
    }
    return standardDelete(cfg, 'notification', (n) => n.title)
  }

  function smsConfig() {
    const cfg = {
      key: 'sms', title: 'Text messages sent', icon: 'phone',
      note: 'The text messages sent when a ticket was made. A message to a number without its country code is reported as failed.',
      buttons: [{ act: 'delete', label: 'Delete selected' }],
      searchLabel: 'Search by number, message or status',
      rows: () => newestFirst(data().emailSms, 'sentDate'),
      text: (s) => [s.sentDate, s.toNumber, s.fromNumber, s.message, s.delivered ? 'delivered' : 'failed'].join(' '),
      selectable: true,
      columns: () => [
        { label: 'Date', nowrap: true, cell: (s) => esc(splitStamp(s.sentDate)[0]) },
        { label: 'Time', nowrap: true, cell: (s) => esc(splitStamp(s.sentDate)[1]) },
        { label: 'To number', nowrap: true, cell: (s) => esc(s.toNumber) },
        { label: 'From number', nowrap: true, cell: (s) => esc(s.fromNumber) },
        { label: 'Message', cell: (s) => esc(s.message) },
        { label: 'Delivery status', cell: (s) => pill(s.delivered ? 'delivered' : 'failed', s.delivered ? 'Delivered' : 'Failed') },
      ],
      rowMenu: () => [DELETE_ITEM],
      empty: 'No text messages have been sent.', emptySearch: 'No matching text messages found.',
      remove: (ids) => Store.removeEmailSms(ids),
    }
    return standardDelete(cfg, 'text message', (s) => s.message)
  }

  function usersConfig() {
    const cfg = {
      key: 'users', title: 'User list', icon: 'users',
      note: 'The people who are told about tickets, on their phones. They are not Univa users.',
      buttons: [{ act: 'add', label: 'Add user', primary: true }, { act: 'delete', label: 'Delete selected' }],
      searchLabel: 'Search by user, designation, mobile no or device ID',
      rows: () => data().emailUsers.slice().reverse(),
      text: (u) => [u.username, u.email, u.designation, u.mobileNo, u.deviceId].join(' '),
      selectable: true,
      columns: () => [
        { label: 'Ext user', cell: (u) => `<strong>${esc(u.username)}</strong>${u.email ? `<div class="rt-kpi-sub">${esc(u.email)}</div>` : ''}` },
        { label: 'Designation', cell: (u) => esc(u.designation || '—') },
        { label: 'Mobile no', nowrap: true, cell: (u) => esc(u.mobileNo || '—') },
        { label: 'Device ID', cell: (u) => (u.deviceId ? esc(u.deviceId) : '<span class="et-muted">None</span>') },
        { label: 'Active status', cell: (u) => pill(u.active ? 'active' : 'inactive', u.active ? 'Active' : 'Inactive') },
        { label: 'Expiry time', nowrap: true, cell: (u) => esc(u.expiryTime || '—') },
      ],
      rowMenu: () => [{ act: 'edit', label: 'Edit', icon: EDIT_ICON }, { act: 'password', label: 'Update password', icon: KEY_ICON }, { act: 'delete', label: 'Delete', danger: true, icon: TRASH_ICON }],
      empty: 'No users yet.', emptySearch: 'No matching users found.',
      remove: (ids) => Store.removeEmailUsers(ids),
    }
    standardDelete(cfg, 'user', (u) => u.username)
    cfg.onOtherButton = () => openUser(null)
    cfg.onOtherRowAction = (act, id) => {
      if (act === 'edit') openUser(id)
      else if (act === 'password') openPassword(id)
    }
    return cfg
  }

  function fromAddressesConfig() {
    const cfg = {
      key: 'from', title: 'From e-mail', icon: 'mail',
      note: 'Only mail from an active address can become a ticket.',
      buttons: [{ act: 'add', label: 'Add email', primary: true }],
      searchLabel: 'Search email',
      rows: () => data().emailFromAddresses.slice().reverse(),
      text: (a) => a.email,
      selectable: false,
      columns: () => [
        { label: 'Email', cell: (a) => esc(a.email) },
        { label: 'Active state', cell: (a) => `<label class="et-switch" title="Change the address to active or inactive"><input type="checkbox" data-toggle-from="${esc(a.id)}" aria-label="${esc(a.email)} active" ${a.active ? 'checked' : ''} /><span></span></label>` },
      ],
      rowMenu: () => [DELETE_ITEM],
      empty: 'No emails available', emptySearch: 'No emails available',
      remove: (ids) => ids.forEach((id) => Store.removeEmailFromAddress(id)),
      wire: (body, repaint) => body.querySelectorAll('[data-toggle-from]').forEach((box) =>
        box.addEventListener('change', () => {
          Store.toggleEmailFromAddress(box.getAttribute('data-toggle-from'))
          UI.toast('Email updated successfully!')
          repaint()
        }),
      ),
    }
    standardDelete(cfg, 'email', (a) => a.email)
    cfg.onOtherButton = () => openFromAddress()
    return cfg
  }

  // --------------------------------------------------------------- views
  function tile(label, value, sub, tone) {
    return `<div class="rt-kpi-tile${tone ? ' rt-tone-' + tone : ''}"><span class="rt-kpi-label">${esc(label)}</span><span class="rt-kpi-value">${esc(value)}</span>${sub ? `<span class="rt-kpi-sub">${esc(sub)}</span>` : ''}</div>`
  }

  function ticketsPerDepartment() {
    const d = data()
    const counts = new Map()
    d.emailDepartments.forEach((dep) => counts.set(dep.department, 0))
    d.emailTickets.forEach((t) => counts.set(t.department, (counts.get(t.department) || 0) + 1))
    return Array.from(counts.entries()).map(([department, count]) => ({ department, count }))
  }

  const dashboardView = {
    render() {
      const d = data()
      const active = d.emailUsers.filter((u) => u.active).length
      const inactive = d.emailUsers.length - active
      return `
        <div class="rt-kpi-grid et-kpi-grid">
          ${tile('Total users', d.emailUsers.length, 'People who are told about tickets')}
          ${tile('Active users', active, 'Notified when a ticket arrives', 'good')}
          ${tile('Inactive users', inactive, 'Skipped when a ticket arrives', inactive ? 'bad' : '')}
          ${tile('Departments', d.emailDepartments.length, 'Where tickets are sent')}
          ${tile('Total inbox', d.emailInbox.length, 'Emails received')}
          ${tile('Total tickets', d.emailTickets.length, 'Made from those emails')}
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('chart-bar')}</span>Ticket analysis<span class="rt-card-note">Tickets per department</span></h2>
          <div id="et-chart" class="et-chart"></div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('users')}</span>All users<span class="rt-card-note">${d.emailUsers.length} in all</span></h2>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>User</th><th>Designation</th><th>Mobile no</th><th>Active state</th></tr></thead>
              <tbody>
                ${d.emailUsers.length
                  ? d.emailUsers.map((u) => `<tr><td class="card-title-cell"><strong>${esc(u.username)}</strong><div class="rt-kpi-sub">${esc(u.email)}</div></td><td data-label="Designation">${esc(u.designation || 'N/A')}</td><td data-label="Mobile no">${esc(u.mobileNo || 'N/A')}</td><td data-label="Active state">${pill(u.active ? 'active' : 'inactive', u.active ? 'Active' : 'Inactive')}</td></tr>`).join('')
                  : '<tr><td colspan="4" class="empty-table-note">No users yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`
    },
    wire() {
      const el = document.getElementById('et-chart')
      const series = ticketsPerDepartment()
      if (typeof ApexCharts === 'undefined' || !series.length) {
        el.innerHTML = series.length
          ? `<ul>${series.map((s) => `<li>${esc(s.department)}: ${s.count}</li>`).join('')}</ul>`
          : '<p class="et-chart-empty">No departments yet.</p>'
        return
      }
      chart = new ApexCharts(el, {
        chart: { type: 'bar', height: 280, toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' },
        series: [{ name: 'Tickets', data: series.map((s) => s.count) }],
        xaxis: { categories: series.map((s) => s.department) },
        yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v) => Math.round(v) } },
        colors: ['#7c3aed'],
        plotOptions: { bar: { columnWidth: '45%', borderRadius: 3 } },
        dataLabels: { enabled: true },
        grid: { borderColor: '#e7e5e4', strokeDashArray: 3 },
      })
      chart.render()
    },
  }

  function listView(makeConfig) {
    let cfg = null
    return {
      render() { cfg = makeConfig(); return listHtml(cfg) },
      wire() { mountList(cfg) },
    }
  }

  function notificationsView() {
    let cfg = null
    return {
      render() {
        cfg = notificationsConfig()
        const row = data().emailNotificationSettings[0] || {}
        return `${listHtml(cfg)}
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('gear')}</span>Notification settings</h2>
            <form id="push-form" class="et-form-grid" novalidate>
              <label for="push-app">Application ID</label>
              <div><input id="push-app" type="text" value="${esc(row.applicationId || '')}" autocomplete="off" /><p class="et-hint">The application the push notifications are sent through.</p><p class="et-error" id="push-error" hidden></p></div>
              <div class="et-form-actions"><button type="submit" class="solid-action-button">Update</button></div>
            </form>
          </div>`
      },
      wire() {
        mountList(cfg)
        document.getElementById('push-form').addEventListener('submit', (event) => {
          event.preventDefault()
          const value = document.getElementById('push-app').value.trim()
          const error = document.getElementById('push-error')
          error.hidden = Boolean(value)
          error.textContent = value ? '' : 'Application ID is required'
          if (!value) return
          Store.updateEmailNotificationSettings({ applicationId: value })
          UI.toast('Settings updated successfully!')
        })
      },
    }
  }

  function smsView() {
    let cfg = null
    return {
      render() {
        cfg = smsConfig()
        const row = data().emailSmsSettings[0] || {}
        return `${listHtml(cfg)}
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('gear')}</span>SMS gateway settings</h2>
            <form id="sms-form" class="et-form-grid" novalidate>
              <label for="sms-sid">SID</label>
              <div><input id="sms-sid" type="text" value="${esc(row.sid || '')}" autocomplete="off" /><p class="et-error" id="sms-sid-error" hidden></p></div>
              <label for="sms-token">Auth token</label>
              <div><div class="et-input-eye"><input id="sms-token" type="password" value="${esc(row.authToken || '')}" autocomplete="off" /><button type="button" id="sms-token-eye" aria-label="Show auth token" title="Show auth token">${UI.EYE_ICON}</button></div><p class="et-error" id="sms-token-error" hidden></p></div>
              <label for="sms-from">From number</label>
              <div><input id="sms-from" type="text" value="${esc(row.fromNumber || '')}" placeholder="+1 555 010 0100" autocomplete="off" /><p class="et-hint">The number the texts come from.</p></div>
              <span class="et-label">Is active</span>
              <div><label class="et-switch" title="Send text messages"><input type="checkbox" id="sms-active" aria-label="Is active" ${row.isActive ? 'checked' : ''} /><span></span></label></div>
              <div class="et-form-actions"><button type="submit" class="solid-action-button">Update</button></div>
            </form>
          </div>`
      },
      wire() {
        mountList(cfg)
        UI.wireShowHideToggle('sms-token', 'sms-token-eye')
        document.getElementById('sms-form').addEventListener('submit', (event) => {
          event.preventDefault()
          const sid = document.getElementById('sms-sid').value.trim()
          const token = document.getElementById('sms-token').value.trim()
          const show = (id, text) => { const el = document.getElementById(id); el.hidden = !text; el.textContent = text }
          show('sms-sid-error', sid ? '' : 'SID is required')
          show('sms-token-error', token ? '' : 'Auth token is required')
          if (!sid || !token) return
          Store.updateEmailSmsSettings({ sid, authToken: token, fromNumber: document.getElementById('sms-from').value, isActive: document.getElementById('sms-active').checked })
          UI.toast('Settings updated successfully!')
        })
      },
    }
  }

  // The mailbox the app checks, as the React app validates it.
  function validateMailbox(values) {
    const errors = {}
    const { host, port, username, password, checkInterval } = values
    if (!host) errors.host = 'Host is required'
    else if (host.length > 200) errors.host = 'Host must be less than 200 characters'
    if (port === '') errors.port = 'Port is required'
    else if (!/^\d+$/.test(port) || Number(port) > 65535) errors.port = 'Port must be a number between 0 to 65535'
    if (!username) errors.username = 'Username is required'
    else if (username.length > 50) errors.username = 'Username must be less than 50 characters'
    if (!password) errors.password = 'Password is required'
    else if (password.length > 50) errors.password = 'Password must be less than 50 characters'
    if (checkInterval !== '' && (!/^\d+$/.test(checkInterval) || Number(checkInterval) > 3600)) errors.checkInterval = 'Check Interval must be a number between 0 to 3600'
    return errors
  }

  function settingsView() {
    let cfg = null
    return {
      render() {
        cfg = fromAddressesConfig()
        const row = data().emailSettings[0] || {}
        const field = (id, label, input) => `<label for="${id}">${label}</label><div>${input}<p class="et-error" id="${id}-error" hidden></p></div>`
        return `
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('gear')}</span>SMTP settings</h2>
            <p class="et-card-note">The mailbox the app checks for new emails.</p>
            <form id="mailbox-form" class="et-form-grid" novalidate>
              ${field('mb-host', 'Host', `<input id="mb-host" type="text" value="${esc(row.host || '')}" autocomplete="off" />`)}
              ${field('mb-port', 'Port', `<input id="mb-port" type="text" value="${esc(row.port == null ? '' : row.port)}" autocomplete="off" />`)}
              ${field('mb-username', 'Username', `<input id="mb-username" type="text" value="${esc(row.username || '')}" autocomplete="off" />`)}
              ${field('mb-password', 'Password', `<div class="et-input-eye"><input id="mb-password" type="password" value="${esc(row.password || '')}" autocomplete="off" /><button type="button" id="mb-password-eye" aria-label="Show password" title="Show password">${UI.EYE_ICON}</button></div>`)}
              <span class="et-label">Check status</span>
              <div class="et-radio-row">
                <label><input type="radio" name="mb-status" value="true" ${row.checkStatus ? 'checked' : ''} /> Enable</label>
                <label><input type="radio" name="mb-status" value="false" ${row.checkStatus ? '' : 'checked'} /> Disable</label>
              </div>
              ${field('mb-interval', 'Check interval', `<input id="mb-interval" type="text" value="${esc(row.checkInterval == null ? '' : row.checkInterval)}" autocomplete="off" /><p class="et-hint">Seconds between checks, 0 to 3600.</p>`)}
              <div class="et-form-actions"><button type="submit" class="solid-action-button">Update</button></div>
            </form>
          </div>
          ${listHtml(cfg)}`
      },
      wire() {
        mountList(cfg)
        UI.wireShowHideToggle('mb-password', 'mb-password-eye')
        document.getElementById('mailbox-form').addEventListener('submit', (event) => {
          event.preventDefault()
          const values = {
            host: document.getElementById('mb-host').value.trim(),
            port: document.getElementById('mb-port').value.trim(),
            username: document.getElementById('mb-username').value.trim(),
            password: document.getElementById('mb-password').value,
            checkInterval: document.getElementById('mb-interval').value.trim(),
          }
          const errors = validateMailbox(values)
          ;['host', 'port', 'username', 'password', 'interval'].forEach((name) => {
            const el = document.getElementById('mb-' + name + '-error')
            const message = errors[name === 'interval' ? 'checkInterval' : name] || ''
            el.hidden = !message
            el.textContent = message
          })
          if (Object.keys(errors).length) return
          Store.updateEmailSettings({ host: values.host, port: values.port, username: values.username, password: values.password, checkStatus: document.querySelector('input[name="mb-status"]:checked').value === 'true', checkInterval: values.checkInterval })
          UI.toast('Settings updated successfully!')
        })
      },
    }
  }

  const VIEWS = {
    dashboard: dashboardView,
    inbox: listView(inboxConfig),
    departments: listView(departmentsConfig),
    tickets: listView(ticketsConfig),
    reports: listView(reportsConfig),
    notifications: notificationsView(),
    sms: smsView(),
    users: listView(usersConfig),
    settings: settingsView(),
  }

  // -------------------------------------------------------------- dialogs
  const $ = (id) => document.getElementById(id)
  const showError = (id, text) => { const el = $(id); el.hidden = !text; el.textContent = text || '' }
  let editingDepartment = null
  let editingUser = null
  let passwordUser = null

  function openInboxEmail(id) {
    const email = data().emailInbox.find((e) => e.id === id)
    if (!email) return
    const ticket = email.ticketId ? data().emailTickets.find((t) => t.id === email.ticketId) : null
    const outcome = email.outcome === 'ticket' && !ticket ? 'The ticket made from this email has been deleted.' : OUTCOME_TEXT[email.outcome] || ''
    $('inbox-detail').innerHTML = `
      <dl style="margin:0 0 1rem;">
        <div class="et-detail-row"><dt>From email</dt><dd>${esc(email.fromEmail)}</dd></div>
        <div class="et-detail-row"><dt>To email</dt><dd>${esc(email.toEmail)}</dd></div>
        <div class="et-detail-row"><dt>Subject</dt><dd>${esc(email.subject)}</dd></div>
        <div class="et-detail-row"><dt>Date-time</dt><dd>${esc(email.receivedDate)}</dd></div>
        <div class="et-detail-row"><dt>Ticket</dt><dd>${esc(outcome)}</dd></div>
      </dl>
      <pre class="et-message-box" id="inbox-message">${esc(email.message)}</pre>`
    UI.openModal('inbox-modal')
  }

  function openReceive() {
    const addresses = data().emailFromAddresses
    const first = addresses.find((a) => a.active) || addresses[0]
    $('receive-from').innerHTML = addresses.map((a) => `<option value="${esc(a.email)}"${first && a.id === first.id ? ' selected' : ''}>${esc(a.email)}${a.active ? '' : ' (inactive)'}</option>`).join('')
      + '<option value="customer@example.test">customer@example.test (not a From address)</option>'
    const alias = (data().emailDepartments[0] || {}).alias
    $('receive-subject').value = alias ? `[${alias}] Test email` : 'Test email'
    $('receive-message').value = 'Customer: Test customer\nPriority: Medium\nIssue: Something to look at'
    showError('receive-error', '')
    UI.openModal('receive-modal')
  }

  function receiveOutcomeText(result) {
    const alias = (/\[([A-Za-z0-9_-]+)\]/.exec(result.email.subject) || [])[1]
    if (result.outcome === 'ticket') {
      return result.notified
        ? `Email received. A ticket was made and ${result.notified} ${plural(result.notified, 'person', 'people')} told.`
        : 'Email received. A ticket was made, but nobody in the department is active to be told.'
    }
    if (result.outcome === 'sender') return 'Email received, but no ticket: the sender is not an active From address.'
    if (result.outcome === 'no-alias') return 'Email received, but no ticket: the subject has no department such as [NET].'
    return `Email received, but no ticket: no department has the alias "${alias}".`
  }

  function renderUsersChecklist(selectedIds) {
    $('dep-users-list').innerHTML = data().emailUsers.map((u) => `
      <label class="modal-checkbox"><input type="checkbox" data-user-id="${esc(u.id)}" ${selectedIds.includes(u.id) ? 'checked' : ''} />${esc(u.username)}${u.designation ? ` · ${esc(u.designation)}` : ''}${u.active ? '' : ' (inactive)'}</label>`).join('') || '<p class="section-empty">There are no users yet. Add some on the Users tab.</p>'
    $('dep-users-search').value = ''
  }

  function openDepartment(id) {
    const department = id ? data().emailDepartments.find((d) => d.id === id) : null
    editingDepartment = department ? department.id : null
    $('department-title').textContent = department ? 'Update department' : 'Create department'
    $('department-save').textContent = department ? 'Save changes' : 'Create'
    $('dep-alias').value = department ? department.alias : ''
    $('dep-name').value = department ? department.department : ''
    showError('dep-alias-error', '')
    showError('dep-name-error', '')
    renderUsersChecklist(department ? department.userIds : [])
    UI.openModal('department-modal')
  }

  function toLocalInput(stamp) {
    return stamp ? String(stamp).slice(0, 16).replace(' ', 'T') : ''
  }
  function fromLocalInput(value) {
    return value ? value.replace('T', ' ') + ':00' : ''
  }

  function openUser(id) {
    const user = id ? data().emailUsers.find((u) => u.id === id) : null
    editingUser = user ? user.id : null
    $('user-title').textContent = user ? 'Edit user' : 'Add user'
    $('user-save').textContent = user ? 'Save changes' : 'Add user'
    const fill = { 'eu-username': user ? user.username : '', 'eu-email': user ? user.email : '', 'eu-designation': user ? user.designation : '', 'eu-mobile': user ? user.mobileNo : '', 'eu-device': user ? user.deviceId : '' }
    Object.keys(fill).forEach((key) => { $(key).value = fill[key] })
    // The name and email are what the person registered with; they are not changed here.
    ;['eu-username', 'eu-email'].forEach((key) => { $(key).readOnly = Boolean(user); $(key).classList.toggle('et-readonly', Boolean(user)) })
    $('eu-expiry').value = toLocalInput(user ? user.expiryTime : '')
    $('eu-active').checked = user ? user.active : true
    showError('eu-username-error', '')
    showError('eu-email-error', '')
    UI.openModal('user-modal')
  }

  function openPassword(id) {
    const user = data().emailUsers.find((u) => u.id === id)
    if (!user) return
    passwordUser = user.id
    $('pw-user').value = user.username
    $('pw-new').value = ''
    $('pw-confirm').value = ''
    $('pw-requirements').innerHTML = UI.passwordRequirementsHtml('')
    showError('pw-error', '')
    UI.openModal('password-modal')
  }

  function openFromAddress() {
    $('from-email').value = ''
    showError('from-error', '')
    UI.openModal('from-modal')
  }

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function wireDialogs() {
    $('receive-form').addEventListener('submit', (event) => {
      event.preventDefault()
      const subject = $('receive-subject').value.trim()
      if (!subject) { showError('receive-error', 'Subject is required'); return }
      const result = Store.receiveEmail({ fromEmail: $('receive-from').value, subject, message: $('receive-message').value })
      UI.closeModal('receive-modal')
      UI.toast(receiveOutcomeText(result))
      ui.page.inbox = 1
      if (currentTab() === 'inbox') renderView()
    })

    $('dep-users-search').addEventListener('input', (event) => {
      const term = event.target.value.trim().toLowerCase()
      $('dep-users-list').querySelectorAll('.modal-checkbox').forEach((label) => { label.style.display = !term || label.textContent.toLowerCase().includes(term) ? '' : 'none' })
    })
    $('department-form').addEventListener('submit', (event) => {
      event.preventDefault()
      const alias = $('dep-alias').value.trim()
      const name = $('dep-name').value.trim()
      const userIds = Array.from($('dep-users-list').querySelectorAll('input[data-user-id]:checked')).map((box) => box.getAttribute('data-user-id'))
      showError('dep-alias-error', !alias ? 'Department alias is required' : !/^[A-Za-z0-9_-]+$/.test(alias) ? 'Use letters, digits, - and _ only' : Store.emailAliasTaken(alias, editingDepartment) ? 'Another department already has this alias' : '')
      showError('dep-name-error', name ? '' : 'Department is required')
      if (!$('dep-alias-error').hidden || !$('dep-name-error').hidden) return
      if (editingDepartment) Store.updateEmailDepartment(editingDepartment, { alias, department: name, userIds })
      else Store.addEmailDepartment({ alias, department: name, userIds })
      UI.closeModal('department-modal')
      UI.toast(`"${alias}" department ${editingDepartment ? 'updated' : 'created'} successfully!`)
      renderView()
    })

    $('user-form').addEventListener('submit', (event) => {
      event.preventDefault()
      const username = $('eu-username').value.trim()
      const email = $('eu-email').value.trim()
      showError('eu-username-error', !username ? 'User name is required' : data().emailUsers.some((u) => u.id !== editingUser && u.username.toLowerCase() === username.toLowerCase()) ? 'Another user already has this name' : '')
      showError('eu-email-error', email && !EMAIL_PATTERN.test(email) ? 'Enter a valid email address' : '')
      if (!$('eu-username-error').hidden || !$('eu-email-error').hidden) return
      const values = { username, email, designation: $('eu-designation').value.trim(), mobileNo: $('eu-mobile').value.trim(), deviceId: $('eu-device').value.trim(), expiryTime: fromLocalInput($('eu-expiry').value), active: $('eu-active').checked }
      if (editingUser) Store.updateEmailUser(editingUser, values)
      else Store.addEmailUser(values)
      UI.closeModal('user-modal')
      UI.toast(`"${username}" ${editingUser ? 'updated' : 'added'} successfully!`)
      renderView()
    })

    $('pw-new').addEventListener('input', () => { $('pw-requirements').innerHTML = UI.passwordRequirementsHtml($('pw-new').value) })
    $('password-form').addEventListener('submit', (event) => {
      event.preventDefault()
      const next = $('pw-new').value
      const user = data().emailUsers.find((u) => u.id === passwordUser)
      showError('pw-error', !UI.allPasswordRequirementsMet(next) ? 'The new password does not meet every requirement' : next !== $('pw-confirm').value ? 'The two passwords do not match' : '')
      if (!$('pw-error').hidden || !user) return
      $('pw-new').value = ''
      $('pw-confirm').value = ''
      UI.closeModal('password-modal')
      UI.toast(`Password updated for "${user.username}".`)
    })

    $('from-form').addEventListener('submit', (event) => {
      event.preventDefault()
      const email = $('from-email').value.trim()
      const taken = data().emailFromAddresses.some((a) => a.email.toLowerCase() === email.toLowerCase())
      showError('from-error', !email ? 'Input value is empty. No email added.' : !EMAIL_PATTERN.test(email) ? 'Enter a valid email address' : taken ? 'That address is already in the list' : '')
      if (!$('from-error').hidden) return
      Store.addEmailFromAddress(email)
      UI.closeModal('from-modal')
      UI.toast('Email added successfully!')
      renderView()
    })
  }

  // ---------------------------------------------------------------- page
  function breadcrumbs() {
    const app = getApp()
    return [{ label: 'Home', href: 'dashboard.html' }, { label: 'Applications', href: 'applications.html' }, { label: app ? app.name : 'Email Tracking' }]
  }

  function renderView() {
    if (chart) {
      try { chart.destroy() } catch (err) { /* already gone */ }
      chart = null
    }
    view = VIEWS[currentTab()]
    $('et-view').innerHTML = view.render()
    view.wire()
  }

  function renderPage() {
    const app = getApp()
    if (!app) {
      root.innerHTML = `
        <div class="not-found-block">
          <h2>Application not found</h2>
          <p>It may have been deleted, or it isn't enabled for your organization.</p>
          <a class="detail-back-link" href="applications.html">Back to Applications</a>
        </div>`
      return
    }
    document.title = `${app.name} — Univa`
    const tab = currentTab()
    root.innerHTML = `
      <a class="detail-back-link" href="applications.html">&larr; Back to Applications</a>
      <div class="page-header">
        <div>
          <h1 class="page-title">${esc(app.name)} <span class="default-profile-badge" title="Built-in default application">Default</span></h1>
          <p class="page-subtitle">${esc(app.description || 'No description provided.')}</p>
        </div>
        <div class="page-header-actions">
          <span class="status-pill status-${esc(app.status)}" title="${esc(app.status)}">${esc(app.status)}</span>
          <button type="button" class="modal-button secondary" id="toggle-status-btn">${app.status === 'active' ? 'Suspend' : 'Activate'}</button>
          <a class="modal-button secondary" href="application-detail.html#${esc(app.id)}">Manage</a>
        </div>
      </div>
      <div class="detail-tabs" role="tablist">
        ${TABS.map((t) => `<button type="button" class="detail-tab-button${t.key === tab ? ' active' : ''}" role="tab" aria-selected="${t.key === tab}" data-et-tab="${t.key}">${iconSvg(t.icon)}${esc(t.label)}</button>`).join('')}
      </div>
      <div id="et-view"></div>`
    $('toggle-status-btn').addEventListener('click', () => {
      Store.toggleApplicationStatus(app.id)
      UI.toast(`"${app.name}" status updated successfully!`)
      renderPage()
    })
    root.querySelectorAll('[data-et-tab]').forEach((btn) =>
      btn.addEventListener('click', () => { window.location.hash = `${APP_ID}:${btn.getAttribute('data-et-tab')}` }),
    )
    renderView()
  }

  function boot(host) {
    root = host
    wireDialogs()
    document.addEventListener('click', () => UI.closeRowMenus())
    // A click on a tab changes only the hash, so the page has to follow it.
    window.addEventListener('hashchange', () => {
      const tab = currentTab()
      root.querySelectorAll('[data-et-tab]').forEach((btn) => {
        const on = btn.getAttribute('data-et-tab') === tab
        btn.classList.toggle('active', on)
        btn.setAttribute('aria-selected', String(on))
      })
      if (root.querySelector('#et-view')) renderView()
      else renderPage()
    })
    renderPage()
  }

  window.EmailTracking = { boot, breadcrumbs }
})()
