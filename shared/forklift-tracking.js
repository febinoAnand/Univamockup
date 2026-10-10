/* ==========================================================================
   Univa — static HTML build. The built-in Forklift Tracking application
   (forklift-tracking.html). A port of the Forklift_TCP_Live Django app: a GPS
   tracker on each forklift reports its position, speed, ignition and battery,
   and the pages show them live, over time, and as daily reports.

   Tabs: Fleet (the list page), Live (the device dashboard), History, Reports.
   The registered forklifts are in the Store (forkliftDevices); what they report
   is made by shared/forklift-data.js, which also says how the four states
   (Inactive, Idle, Active, Alert) are worked out.

   The tab and the forklift follow the URL hash:
   forklift-tracking.html#app_forklift:live:352093081452251
   ========================================================================== */
(function () {
  const APP_ID = 'app_forklift'
  const PAGE_SIZE = 25
  const MAX_REPORT_DAYS = 93
  const STATES = ForkliftData.STATES
  const STATE_COLORS = { Inactive: '#a8a29e', Idle: '#f59e0b', Active: '#16a34a', Alert: '#dc2626' }
  const TABS = [
    { key: 'fleet', label: 'Fleet', icon: 'truck' },
    { key: 'live', label: 'Live', icon: 'map-pin' },
    { key: 'history', label: 'History', icon: 'clock' },
    { key: 'reports', label: 'Reports', icon: 'report' },
  ]
  const MORE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>'
  const EDIT_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/></svg>'
  const SEARCH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg>'

  let root = null
  let charts = []
  let liveTimer = null
  let liveMinute = null
  const ui = {
    search: '',
    history: { date: '', from: '00:00', to: '23:59', applied: null, gpsPage: 1, extPage: 1 },
    reports: { from: '', to: '', applied: null },
  }

  // ------------------------------------------------------------- helpers
  const esc = (value) => UI.esc(value)
  const $ = (id) => document.getElementById(id)
  const data = () => Store.get()
  const devices = () => data().forkliftDevices
  const getApp = () => data().applications.find((a) => a.id === APP_ID)
  const plural = (n, one, many) => (n === 1 ? one : many || one + 's')
  const todayIso = () => ForkliftData.isoOf(new Date())
  const km = (value) => Number(value).toFixed(2)
  const num = (value, digits) => Number(Number(value).toFixed(digits)).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const hoursText = (h) => `${Math.floor(h)}h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}m`
  const showError = (id, text) => { const el = $(id); el.hidden = !text; el.textContent = text || '' }

  function parseHash() {
    const parts = window.location.hash.slice(1).split(':')
    return { tab: TABS.some((t) => t.key === parts[1]) ? parts[1] : 'fleet', deviceId: parts[2] || '' }
  }
  const currentTab = () => parseHash().tab
  function selectedDevice() {
    const list = devices()
    return list.find((d) => d.deviceId === parseHash().deviceId) || list[0] || null
  }
  function goTo(tab, device) {
    window.location.hash = `${APP_ID}:${tab}` + (tab !== 'fleet' && device ? ':' + device.deviceId : '')
  }

  function statePill(state) {
    const name = STATES[state - 1]
    return `<span class="ft-state ft-state-${name.toLowerCase()}" title="${name}">${name}</span>`
  }

  function tile(label, value, sub, tone) {
    return `<div class="rt-kpi-tile${tone ? ' rt-tone-' + tone : ''}"><span class="rt-kpi-label">${esc(label)}</span><span class="rt-kpi-value">${esc(value)}</span>${sub ? `<span class="rt-kpi-sub">${esc(sub)}</span>` : ''}</div>`
  }

  // ------------------------------------------------------------ graphics
  // A half-circle dial: value out of max.
  function gaugeHtml(value, max, color, label) {
    const length = Math.PI * 80
    const filled = Math.min(1, Math.max(0, value / max)) * length
    return `<svg viewBox="0 0 200 110" class="ft-gauge" role="img" aria-label="${esc(label)}">
      <path d="M20 95 A80 80 0 0 1 180 95" fill="none" stroke="#e7e5e4" stroke-width="16" stroke-linecap="round"/>
      <path d="M20 95 A80 80 0 0 1 180 95" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${length.toFixed(1)}"/>
      <text x="20" y="108" class="ft-gauge-end">0</text><text x="180" y="108" class="ft-gauge-end" text-anchor="end">${max}</text>
    </svg>`
  }

  // A day, or part of one, as a bar of coloured runs (minutes from midnight).
  function timelineHtml(rows, from, to) {
    const span = to - from
    const runs = ForkliftData.timeline(rows)
    const label = (m) => ForkliftData.clockOf(m, 0).slice(0, 5)
    const ticks = []
    for (let m = Math.ceil(from / 180) * 180; m <= to; m += 180) ticks.push(m)
    return `
      <div class="ft-timeline" role="img" aria-label="${esc(runs.length ? runs.map((r) => `${STATES[r.state - 1]} ${label(r.from)} to ${label(r.to)}`).join(', ') : 'No data')}">
        ${runs.map((r) => `<span class="ft-run" style="left:${(((r.from - from) / span) * 100).toFixed(3)}%;width:${((r.minutes / span) * 100).toFixed(3)}%;background:${STATE_COLORS[STATES[r.state - 1]]}" title="${STATES[r.state - 1]}: ${label(r.from)} to ${label(r.to)} (${r.minutes} min)"></span>`).join('')}
      </div>
      <div class="ft-ticks">${ticks.map((m) => `<span style="left:${(((m - from) / span) * 100).toFixed(2)}%">${label(m)}</span>`).join('')}</div>
      <div class="ft-legend">${STATES.map((s) => `<span><i style="background:${STATE_COLORS[s]}"></i>${s}</span>`).join('')}</div>`
  }

  // The site seen from above with the route the forklift took.
  function mapHtml(rows, caption) {
    const S = ForkliftData.SITE
    const sx = (x) => x.toFixed(1)
    const sy = (y) => (S.height - y).toFixed(1)
    const points = rows.map((r) => ForkliftData.toSite(r.latitude, r.longitude))
    const grid = []
    for (let x = 40; x < S.width; x += 40) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${S.height}"/>`)
    for (let y = 40; y < S.height; y += 40) grid.push(`<line x1="0" y1="${y}" x2="${S.width}" y2="${y}"/>`)
    const moved = rows.map((r, i) => (r.movement ? points[i] : null))
    const route = []
    let run = []
    moved.forEach((p) => {
      if (p) run.push(`${sx(p.x)},${sy(p.y)}`)
      else if (run.length) { route.push(run.join(' ')); run = [] }
    })
    if (run.length) route.push(run.join(' '))
    const last = points[points.length - 1]
    const first = points[0]
    return `
      <svg viewBox="0 0 ${S.width} ${S.height}" class="ft-map" role="img" aria-label="${esc(caption)}">
        <rect width="${S.width}" height="${S.height}" fill="#faf8f5"/>
        <g stroke="#ece8e1" stroke-width="1">${grid.join('')}</g>
        ${ForkliftData.PLACES.map((p) => `<g><circle cx="${p.x}" cy="${S.height - p.y}" r="5" fill="#d6d3d1"/><text x="${p.x + 8}" y="${S.height - p.y + 4}" class="ft-map-place">${esc(p.name)}</text></g>`).join('')}
        ${route.map((r) => `<polyline points="${r}" fill="none" stroke="#7c3aed" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>`).join('')}
        ${first ? `<circle class="ft-map-start" cx="${sx(first.x)}" cy="${sy(first.y)}" r="5.5" fill="#fff" stroke="#16a34a" stroke-width="3"/>` : ''}
        ${last ? `<circle class="ft-map-now" cx="${sx(last.x)}" cy="${sy(last.y)}" r="7" fill="${STATE_COLORS[STATES[rows[rows.length - 1].state - 1]]}" stroke="#fff" stroke-width="2.5"/>` : ''}
      </svg>
      <p class="ft-map-note">${rows.length ? `${rows.filter((r) => r.movement).length} of ${rows.length} minutes on the move. Green ring: where it was first seen. Dot: where it is, in the colour of its state.` : 'No position reported.'}</p>`
  }

  // ------------------------------------------------------------- tables
  function pagedTable(key, head, body, page, cellsFor, noPager) {
    const pages = Math.max(1, Math.ceil(body.length / PAGE_SIZE))
    const at = Math.min(Math.max(1, page), pages)
    const start = (at - 1) * PAGE_SIZE
    const shown = body.slice(start, start + PAGE_SIZE)
    const buttons = [`<button type="button" class="page-btn" data-page-of="${key}" data-page="${at - 1}" ${at <= 1 ? 'disabled' : ''}>Previous</button>`]
    if (pages <= 7) for (let n = 1; n <= pages; n++) buttons.push(`<button type="button" class="page-btn${n === at ? ' active' : ''}" data-page-of="${key}" data-page="${n}">${n}</button>`)
    else buttons.push(`<button type="button" class="page-btn active" disabled>${at} / ${pages}</button>`)
    buttons.push(`<button type="button" class="page-btn" data-page-of="${key}" data-page="${at + 1}" ${at >= pages ? 'disabled' : ''}>Next</button>`)
    return `
      <div class="table-scroll">
        <table class="data-table ft-table" data-table="${key}">
          <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${shown.length ? shown.map((row, i) => `<tr>${cellsFor(row, start + i + 1).map((c, n) => `<td data-label="${esc(head[n])}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${head.length}" class="empty-table-note">No data for this period.</td></tr>`}</tbody>
        </table>
      </div>
      ${noPager ? '' : `<div class="ft-pager"><span data-showing>${body.length ? `Showing ${start + 1} to ${Math.min(body.length, start + PAGE_SIZE)} of ${body.length} entries` : 'Showing 0 entries'}</span><span class="pagination" style="padding:0;">${buttons.join('')}</span></div>`}`
  }

  const gpsHead = ['S/NO', 'Date', 'Time', 'Distance (km)', 'Speed (km/h)', 'Latitude', 'Longitude']
  const gpsCells = (r, n) => [n, esc(r.date), esc(r.time), r.distance.toFixed(3), r.speed.toFixed(2), r.latitude.toFixed(6), r.longitude.toFixed(6)]
  const extHead = ['S/NO', 'Date', 'Time', 'Odometer distance (km)', 'Speed (km/h)', 'Watt hr', 'Batt voltage (V)', 'Batt amp (A)', 'Batt power (W)', 'Batt charge (%)']
  const extCells = (r, n) => [n, esc(r.date), esc(r.time), r.ext.distance.toFixed(3), r.ext.speed.toFixed(2), r.ext.wattHr.toFixed(2), r.ext.voltage.toFixed(2), r.ext.amps.toFixed(2), r.ext.power.toFixed(2), r.ext.capacity]

  function chartFor(id, options) {
    const el = $(id)
    if (!el) return
    if (typeof ApexCharts === 'undefined') {
      el.innerHTML = '<p class="ft-chart-empty">The chart library could not be loaded.</p>'
      return
    }
    const chart = new ApexCharts(el, Object.assign({
      chart: { height: 280, toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' },
      dataLabels: { enabled: false },
      grid: { borderColor: '#e7e5e4', strokeDashArray: 3 },
      legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px' },
    }, options, { chart: Object.assign({ height: 280, toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' }, options.chart) }))
    chart.render()
    charts.push(chart)
  }

  function pieChart(id, hours) {
    const total = STATES.reduce((a, s) => a + hours[s], 0)
    const el = $(id)
    if (!total) { el.innerHTML = '<p class="ft-chart-empty">No time recorded.</p>'; return }
    chartFor(id, {
      chart: { type: 'donut', height: 280 },
      series: STATES.map((s) => hours[s]),
      labels: STATES,
      colors: STATES.map((s) => STATE_COLORS[s]),
      legend: { position: 'bottom' },
      tooltip: { y: { formatter: (v) => `${v} h` } },
    })
  }

  // --------------------------------------------------------------- views
  function noForklifts(what) {
    return `<div class="detail-card"><p class="section-empty">There are no forklifts yet, so there is no ${esc(what)} to show. Register one on the Fleet tab.</p></div>`
  }

  function deviceBar(device, extra) {
    return `
      <div class="rt-toolbar ft-toolbar">
        <label class="rt-field"><span>Forklift</span>
          <select id="ft-device" aria-label="Forklift">${devices().map((d) => `<option value="${esc(d.deviceId)}"${d.deviceId === device.deviceId ? ' selected' : ''}>${esc(d.vehicleName)} (${esc(d.deviceId)})</option>`).join('')}</select>
        </label>
        ${extra || ''}
      </div>`
  }

  function wireDeviceBar() {
    const select = $('ft-device')
    if (select) select.addEventListener('change', () => goTo(currentTab(), devices().find((d) => d.deviceId === select.value)))
  }

  // ---- Fleet
  function fleetRows(now) {
    const today = todayIso()
    return devices().map((device) => {
      const rows = ForkliftData.day(device, today, now)
      const last = ForkliftData.latest(device, now)
      const sum = ForkliftData.summary(rows)
      return { device, last, sum, rows }
    })
  }

  const fleetView = {
    render() {
      const now = Date.now()
      const fleet = fleetRows(now)
      const count = (state) => fleet.filter((f) => f.last && f.last.state === state).length
      const query = ui.search.trim().toLowerCase()
      const shown = query ? fleet.filter((f) => [f.device.vehicleName, f.device.deviceId, f.device.vehicleId, f.device.driver, f.device.deviceModel].join(' ').toLowerCase().includes(query)) : fleet
      const distance = fleet.reduce((a, f) => a + f.sum.gpsDistance, 0)
      return `
        <div class="rt-kpi-grid ft-kpi-grid">
          ${tile('Forklifts', fleet.length, 'With a tracker')}
          ${tile('Active now', count(3), 'Ignition on, moving', count(3) ? 'good' : '')}
          ${tile('Idle now', count(2), 'Ignition on, not moving', count(2) ? 'warn' : '')}
          ${tile('Inactive now', count(1), 'Ignition off')}
          ${tile('Alerts now', count(4), 'Moving with ignition off', count(4) ? 'bad' : '')}
          ${tile('Distance today', km(distance) + ' km', 'All forklifts, by GPS')}
        </div>
        <div class="detail-card" data-fleet>
          <h2><span class="section-icon">${iconSvg('truck')}</span>Forklifts
            <span class="et-card-actions"><button type="button" class="solid-action-button et-small-button" id="ft-register">Register forklift</button></span>
          </h2>
          <p class="et-card-note">Each forklift has a GPS tracker. Open one to see where it is, how it is being used and how its battery is doing.</p>
          <div class="et-table-bar"><div class="table-search-wrap">${SEARCH_ICON}<input type="text" id="ft-search" aria-label="Search forklifts" placeholder="Search by name, ID, driver or model" value="${esc(ui.search)}" /></div></div>
          <div class="ft-grid" id="ft-cards">${cardsHtml(shown)}</div>
        </div>`
    },
    wire() {
      $('ft-register').addEventListener('click', () => openForklift(null))
      $('ft-search').addEventListener('input', (event) => {
        ui.search = event.target.value
        const q = ui.search.trim().toLowerCase()
        const fleet = fleetRows(Date.now())
        const shown = q ? fleet.filter((f) => [f.device.vehicleName, f.device.deviceId, f.device.vehicleId, f.device.driver, f.device.deviceModel].join(' ').toLowerCase().includes(q)) : fleet
        $('ft-cards').innerHTML = cardsHtml(shown)
        wireCards()
      })
      wireCards()
    },
  }

  function cardsHtml(fleet) {
    if (!fleet.length) return `<p class="section-empty">${devices().length ? 'No matching forklifts found.' : 'No forklifts yet. Register one to start tracking it.'}</p>`
    return fleet.map(({ device, last, sum }) => `
      <article class="ft-card" data-device="${esc(device.deviceId)}">
        <header>
          <div><h3>${esc(device.vehicleName)}</h3><p>ID ${esc(device.deviceId)}</p></div>
          ${last ? statePill(last.state) : '<span class="ft-state ft-state-nodata">No data</span>'}
          <div class="row-menu">
            <button type="button" class="row-menu-button" data-menu-toggle aria-label="Actions for ${esc(device.vehicleName)}" title="Actions">${MORE_ICON}</button>
            <div class="row-menu-dropdown">
              <button type="button" class="row-menu-item" data-edit="${esc(device.id)}">${EDIT_ICON}Edit</button>
              <button type="button" class="row-menu-item danger" data-delete="${esc(device.id)}">${TRASH_ICON}Delete</button>
            </div>
          </div>
        </header>
        <dl>
          <div><dt>Vehicle ID</dt><dd>${esc(device.vehicleId)}</dd></div>
          <div><dt>Driver</dt><dd>${device.driver ? esc(device.driver) : '<span class="et-muted">None</span>'}</dd></div>
          <div><dt>Tracker</dt><dd>${esc(device.deviceModel)}</dd></div>
          <div><dt>Battery</dt><dd>${last ? last.ext.capacity + '%' : '—'}</dd></div>
          <div><dt>Distance today</dt><dd>${km(sum.gpsDistance)} km</dd></div>
          <div><dt>Active today</dt><dd>${hoursText(sum.hours.Active)}</dd></div>
        </dl>
        <footer>
          <a href="#${APP_ID}:live:${esc(device.deviceId)}">Live</a>
          <a href="#${APP_ID}:history:${esc(device.deviceId)}">History</a>
          <a href="#${APP_ID}:reports:${esc(device.deviceId)}">Reports</a>
        </footer>
      </article>`).join('')
  }

  function wireCards() {
    root.querySelectorAll('.ft-card [data-menu-toggle]').forEach((btn) =>
      btn.addEventListener('click', (event) => {
        event.stopPropagation()
        const menu = btn.closest('.row-menu')
        const wasOpen = menu.classList.contains('open')
        UI.closeRowMenus()
        if (!wasOpen) UI.openRowMenu(btn)
      }),
    )
    root.querySelectorAll('.ft-card [data-edit]').forEach((btn) => btn.addEventListener('click', () => openForklift(btn.getAttribute('data-edit'))))
    root.querySelectorAll('.ft-card [data-delete]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const device = devices().find((d) => d.id === btn.getAttribute('data-delete'))
        if (!device) return
        UI.confirm({
          message: `Delete <strong>${esc(device.vehicleName)}</strong>? Its tracker will no longer be followed. This can't be undone.`,
          onConfirm: () => {
            Store.removeForkliftDevice(device.id)
            UI.toast(`"${device.vehicleName}" deleted successfully!`)
            renderView()
          },
        })
      }),
    )
  }

  // ---- Live
  const liveView = {
    render() {
      const device = selectedDevice()
      if (!device) return noForklifts('live view')
      const now = Date.now()
      const today = todayIso()
      const rows = ForkliftData.day(device, today, now)
      const last = ForkliftData.latest(device, now)
      liveMinute = last ? last.date + last.time.slice(0, 5) : ''
      const sum = ForkliftData.summary(rows)
      const topSpeed = sum.topSpeed
      const parameters = rows.slice(-10).reverse()
      const sinceMidnight = ForkliftData.minuteOf(new Date(now).toTimeString().slice(0, 5)) + 1
      const gsmBars = last ? '▮'.repeat(last.gsmSignal) + '▯'.repeat(5 - last.gsmSignal) : ''
      return `
        ${deviceBar(device, `<span class="rt-toolbar-spacer"></span><a class="outline-action-button et-small-button" href="#${APP_ID}:history:${esc(device.deviceId)}">History</a><a class="outline-action-button et-small-button" href="#${APP_ID}:reports:${esc(device.deviceId)}">Reports</a>`)}
        ${last ? '' : '<div class="rt-banner rt-banner-warn">This forklift has not reported anything yet.</div>'}
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('clock')}</span>Today's status<span class="rt-card-note">${esc(today)}, up to now</span></h2>
          ${timelineHtml(rows, 0, ForkliftData.DAY_MINUTES)}
        </div>
        <div class="ft-two">
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('truck')}</span>Vehicle details</h2>
            <dl class="ft-details" id="ft-details">
              <div><dt>Device ID</dt><dd>${esc(device.deviceId)}</dd></div>
              <div><dt>Vehicle name</dt><dd>${esc(device.vehicleName)}</dd></div>
              <div><dt>Manufacturer</dt><dd>${esc(device.manufacturer || '—')}</dd></div>
              <div><dt>Vehicle ID</dt><dd>${esc(device.vehicleId)}</dd></div>
              <div><dt>Device model</dt><dd>${esc(device.deviceModel)}</dd></div>
              <div><dt>Hardware version</dt><dd>${esc(device.hardwareVersion || '—')}</dd></div>
              <div><dt>Software version</dt><dd>${esc(device.softwareVersion || '—')}</dd></div>
              <div><dt>Driver</dt><dd>${esc(device.driver || '—')}</dd></div>
            </dl>
          </div>
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('gauge')}</span>Live status<span class="rt-card-note" id="ft-last-report">${last ? esc(last.date + ' ' + last.time) : ''}</span></h2>
            <dl class="ft-details" id="ft-live-status">
              <div><dt>Status</dt><dd>${last ? statePill(last.state) : '—'}</dd></div>
              <div><dt>Ignition state</dt><dd id="ft-ignition">${last ? (last.ignition ? 'ON' : 'OFF') : '—'}</dd></div>
              <div><dt>Movement state</dt><dd id="ft-movement">${last ? (last.movement ? 'Moving' : 'Not moving') : '—'}</dd></div>
              <div><dt>GSM operator</dt><dd>${last ? last.gsmOperatorCode : '—'}</dd></div>
              <div><dt>GSM signal</dt><dd title="${last ? last.gsmSignal + ' of 5' : ''}">${last ? `<span class="ft-bars">${gsmBars}</span> ${last.gsmSignal}` : '—'}</dd></div>
              <div><dt>GSM area</dt><dd>${last ? last.gsmAreaCode : '—'}</dd></div>
            </dl>
          </div>
        </div>
        <div class="ft-two">
          <div class="detail-card ft-gauge-card">
            <h2><span class="section-icon">${iconSvg('gauge')}</span>GPS speed</h2>
            ${gaugeHtml(last ? last.speed : 0, 25, '#566573', 'GPS speed')}
            <p class="ft-gauge-value" id="ft-gps-speed">${last ? num(last.speed, 1) : '0.0'} km/h</p>
          </div>
          <div class="detail-card ft-gauge-card">
            <h2><span class="section-icon">${iconSvg('gauge')}</span>EXT speed<span class="rt-card-note">from the forklift's controller</span></h2>
            ${gaugeHtml(last ? last.ext.speed : 0, 25, '#643873', 'EXT speed')}
            <p class="ft-gauge-value" id="ft-ext-speed">${last ? num(last.ext.speed, 1) : '0.0'} km/h</p>
          </div>
        </div>
        <div class="ft-two">
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('map-pin')}</span>Route today</h2>
            ${mapHtml(rows, 'Route of the forklift today')}
          </div>
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('map-pin')}</span>GPS</h2>
            <dl class="ft-details" id="ft-gps">
              <div><dt>Satellites connected</dt><dd>${last ? last.satellite : '—'}</dd></div>
              <div><dt>Longitude</dt><dd>${last ? last.longitude.toFixed(6) : '—'}</dd></div>
              <div><dt>Latitude</dt><dd>${last ? last.latitude.toFixed(6) : '—'}</dd></div>
              <div><dt>Top speed today</dt><dd id="ft-top-speed">${num(topSpeed, 1)} km/h</dd></div>
              <div><dt>Distance today</dt><dd>${km(sum.gpsDistance)} km</dd></div>
              <div><dt>Last report</dt><dd>${last ? esc(last.time) : '—'}</dd></div>
            </dl>
            <h2 class="ft-subhead">Battery</h2>
            ${last ? `
            <div class="ft-battery" id="ft-battery" title="${last.ext.capacity}% charged"><span style="width:${last.ext.capacity}%;background:${last.ext.capacity > 50 ? '#16a34a' : last.ext.capacity > 25 ? '#f59e0b' : '#dc2626'}"></span><b>${last.ext.capacity}%</b></div>
            <dl class="ft-details">
              <div><dt>Battery power</dt><dd id="ft-power">${num(last.ext.power, 0)} W</dd></div>
              <div><dt>Battery voltage</dt><dd>${last.ext.voltage.toFixed(2)} V</dd></div>
              <div><dt>Battery amps</dt><dd>${last.ext.amps.toFixed(2)} A</dd></div>
              <div><dt>Energy used today</dt><dd id="ft-energy">${num(sum.wattHr, 0)} Wh</dd></div>
            </dl>` : '<p class="section-empty">No battery reading yet.</p>'}
          </div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('chart-line')}</span>Speed of the forklift<span class="rt-card-note">last 60 minutes, GPS and controller</span></h2>
          <div id="ft-chart-speed" class="et-chart"></div>
        </div>
        <div class="ft-two">
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('chart-bar')}</span>Utilization hours<span class="rt-card-note">last 7 days</span></h2>
            <div id="ft-chart-week" class="et-chart"></div>
            <div class="table-scroll"><table class="data-table" id="ft-week-table"><thead><tr><th>Day</th><th>Active</th><th>Idle</th><th>Inactive</th><th>Alert</th></tr></thead><tbody>
              ${ForkliftData.week(device, now).map((w) => `<tr><td data-label="Day">${esc(w.weekday)}</td><td data-label="Active">${w.hours.Active.toFixed(2)}</td><td data-label="Idle">${w.hours.Idle.toFixed(2)}</td><td data-label="Inactive">${w.hours.Inactive.toFixed(2)}</td><td data-label="Alert">${w.hours.Alert.toFixed(2)}</td></tr>`).join('')}
            </tbody></table></div>
          </div>
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('chart-pie')}</span>State of the forklift<span class="rt-card-note">hours today</span></h2>
            <div id="ft-chart-pie" class="et-chart"></div>
            <p class="ft-hours" id="ft-hours">${STATES.map((s) => `<span><i style="background:${STATE_COLORS[s]}"></i>${s} ${sum.hours[s].toFixed(2)} h</span>`).join('')}</p>
          </div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('map-pin')}</span>GPS table<span class="rt-card-note">the last 10 reports</span></h2>
          ${pagedTable('live-gps', gpsHead, parameters, 1, gpsCells, true)}
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('battery')}</span>Vehicle parameters<span class="rt-card-note">the last 10 reports</span></h2>
          ${pagedTable('live-ext', extHead, parameters, 1, extCells, true)}
        </div>`
    },
    wire() {
      const device = selectedDevice()
      if (!device) return
      wireDeviceBar()
      const now = Date.now()
      const rows = ForkliftData.day(device, todayIso(), now)
      const recent = rows.slice(-60)
      chartFor('ft-chart-speed', {
        chart: { type: 'line' },
        series: [{ name: 'GPS speed', data: recent.map((r) => r.speed) }, { name: 'EXT speed', data: recent.map((r) => r.ext.speed) }],
        xaxis: { categories: recent.map((r) => r.time.slice(0, 5)), tickAmount: 8, labels: { rotate: 0 } },
        yaxis: { min: 0, max: Math.max(5, Math.ceil(Math.max.apply(null, recent.map((r) => Math.max(r.speed, r.ext.speed)).concat([0])))), tickAmount: 5, labels: { formatter: (v) => Math.round(v) } },
        stroke: { width: 2, curve: 'straight' },
        colors: ['#566573', '#643873'],
      })
      const week = ForkliftData.week(device, now)
      chartFor('ft-chart-week', {
        chart: { type: 'bar', stacked: true },
        series: ['Active', 'Idle', 'Inactive', 'Alert'].map((s) => ({ name: s, data: week.map((w) => w.hours[s]) })),
        xaxis: { categories: week.map((w) => w.weekday.slice(0, 3)) },
        yaxis: { min: 0, max: 24, tickAmount: 4, labels: { formatter: (v) => Math.round(v) } },
        colors: ['Active', 'Idle', 'Inactive', 'Alert'].map((s) => STATE_COLORS[s]),
        plotOptions: { bar: { columnWidth: '55%' } },
      })
      pieChart('ft-chart-pie', ForkliftData.summary(rows).hours)
      // The tracker reports every minute: look for a new one now and then.
      clearInterval(liveTimer)
      liveTimer = setInterval(() => {
        if (currentTab() !== 'live' || !root.contains($('ft-details'))) return clearInterval(liveTimer)
        const newest = ForkliftData.latest(device, Date.now())
        const stamp = newest ? newest.date + newest.time.slice(0, 5) : ''
        if (stamp === liveMinute) return
        if (document.activeElement && root.contains(document.activeElement) && /SELECT|INPUT/.test(document.activeElement.tagName)) return
        renderView()
      }, 5000)
    },
  }

  // ---- History
  const historyView = {
    render() {
      const device = selectedDevice()
      if (!device) return noForklifts('history')
      const h = ui.history
      if (!h.date) h.date = todayIso()
      const a = h.applied || { date: h.date, from: h.from, to: h.to }
      const added = String(device.addDate).slice(0, 10)
      const rows = ForkliftData.between(device, a.date, a.from, a.to)
      const sum = ForkliftData.summary(rows)
      const from = ForkliftData.minuteOf(a.from)
      const to = ForkliftData.minuteOf(a.to) + 1
      const newest = rows.slice().reverse()
      return `
        ${deviceBar(device, `
          <label class="rt-field"><span>Date</span><input type="date" id="ft-date" value="${esc(h.date)}" max="${todayIso()}" /></label>
          <label class="rt-field"><span>From</span><input type="time" id="ft-from" value="${esc(h.from)}" /></label>
          <label class="rt-field"><span>To</span><input type="time" id="ft-to" value="${esc(h.to)}" /></label>
          <button type="button" class="solid-action-button et-small-button ft-show" id="ft-show">Show</button>`)}
        <p class="et-error ft-form-error" id="ft-history-error" hidden></p>
        ${rows.length ? '' : `<div class="rt-banner rt-banner-warn" id="ft-history-empty">${a.date < added ? `This forklift was registered on ${esc(added)}, so there is nothing before then.` : 'This forklift reported nothing in this period.'}</div>`}
        <div class="rt-kpi-grid ft-kpi-grid">
          ${tile('Readings', sum.rows, `${a.from} to ${a.to}, one a minute`)}
          ${tile('GPS distance', km(sum.gpsDistance) + ' km', 'Added up from the reports')}
          ${tile('Odometer distance', km(sum.extDistance) + ' km', "From the forklift's controller")}
          ${tile('Energy used', num(sum.wattHr, 0) + ' Wh', 'Watt-hours')}
          ${tile('Top speed', num(sum.topSpeed, 1) + ' km/h')}
          ${tile('Active', hoursText(sum.hours.Active), 'Ignition on, moving', 'good')}
          ${tile('Idle', hoursText(sum.hours.Idle), 'Ignition on, not moving', 'warn')}
          ${tile('Inactive', hoursText(sum.hours.Inactive), 'Ignition off')}
          ${tile('Alert', hoursText(sum.hours.Alert), 'Moving with ignition off', sum.hours.Alert ? 'bad' : '')}
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('clock')}</span>Status<span class="rt-card-note">${esc(a.date)} · ${esc(a.from)} to ${esc(a.to)}</span></h2>
          ${timelineHtml(rows, from, to)}
        </div>
        <div class="ft-two">
          <div class="detail-card"><h2><span class="section-icon">${iconSvg('map-pin')}</span>Route</h2>${mapHtml(rows, 'Route of the forklift in this period')}</div>
          <div class="detail-card"><h2><span class="section-icon">${iconSvg('chart-pie')}</span>State of the forklift<span class="rt-card-note">hours</span></h2><div id="ft-chart-pie" class="et-chart"></div></div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('map-pin')}</span>GPS table<span class="rt-card-note">newest first</span></h2>
          <div id="ft-gps-table">${pagedTable('hist-gps', gpsHead, newest, h.gpsPage, gpsCells)}</div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('battery')}</span>Vehicle parameters<span class="rt-card-note">newest first</span></h2>
          <div id="ft-ext-table">${pagedTable('hist-ext', extHead, newest, h.extPage, extCells)}</div>
        </div>`
    },
    wire() {
      const device = selectedDevice()
      if (!device) return
      wireDeviceBar()
      const h = ui.history
      const a = h.applied || { date: h.date, from: h.from, to: h.to }
      pieChart('ft-chart-pie', ForkliftData.summary(ForkliftData.between(device, a.date, a.from, a.to)).hours)
      $('ft-show').addEventListener('click', () => {
        const date = $('ft-date').value
        const from = $('ft-from').value || '00:00'
        const to = $('ft-to').value || '23:59'
        const problem = !date ? 'Choose a date.' : date > todayIso() ? 'Choose a date up to today.' : from > to ? 'From must be before To.' : ''
        showError('ft-history-error', problem)
        if (problem) return
        Object.assign(h, { date, from, to, applied: { date, from, to }, gpsPage: 1, extPage: 1 })
        renderView()
      })
      root.querySelectorAll('[data-page-of]').forEach((btn) =>
        btn.addEventListener('click', () => {
          h[btn.getAttribute('data-page-of') === 'hist-gps' ? 'gpsPage' : 'extPage'] = Number(btn.getAttribute('data-page'))
          renderView()
        }),
      )
    },
  }

  // ---- Reports
  function reportTable(device, a) {
    const days = ForkliftData.report(device, a.from, a.to)
    const total = days.reduce((t, d) => ({ gps: t.gps + d.gpsDistance, ext: t.ext + d.extDistance, wh: t.wh + d.wattHr, Active: t.Active + d.hours.Active, Idle: t.Idle + d.hours.Idle, Inactive: t.Inactive + d.hours.Inactive, Alert: t.Alert + d.hours.Alert }), { gps: 0, ext: 0, wh: 0, Active: 0, Idle: 0, Inactive: 0, Alert: 0 })
    return { days, total }
  }
  const REPORT_HEAD = ['Date', 'GPS distance (km)', 'Odometer distance (km)', 'Watt hr', 'Active hours', 'Idle hours', 'Inactive hours', 'Alert hours']
  const reportRow = (d) => [d.date, d.gpsDistance.toFixed(2), d.extDistance.toFixed(2), d.wattHr.toFixed(2), d.hours.Active.toFixed(2), d.hours.Idle.toFixed(2), d.hours.Inactive.toFixed(2), d.hours.Alert.toFixed(2)]

  const reportsView = {
    render() {
      const device = selectedDevice()
      if (!device) return noForklifts('report')
      const r = ui.reports
      if (!r.from) {
        r.to = todayIso()
        r.from = ForkliftData.addDays(r.to, -6)
      }
      const applied = r.applied || { from: r.from, to: r.to }
      const { days, total } = reportTable(device, applied)
      return `
        ${deviceBar(device, `
          <label class="rt-field"><span>From</span><input type="date" id="ft-rfrom" value="${esc(r.from)}" max="${todayIso()}" /></label>
          <label class="rt-field"><span>To</span><input type="date" id="ft-rto" value="${esc(r.to)}" max="${todayIso()}" /></label>
          <button type="button" class="solid-action-button et-small-button ft-show" id="ft-rsearch">Search</button>
          <button type="button" class="outline-action-button et-small-button ft-show" id="ft-rclear">Clear</button>`)}
        <p class="et-error ft-form-error" id="ft-report-error" hidden></p>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('report')}</span>Report<span class="rt-card-note">${esc(device.vehicleName)} · ${esc(applied.from)} to ${esc(applied.to)}</span>
            <span class="et-card-actions"><button type="button" class="outline-action-button et-small-button" id="ft-pdf">Download PDF</button><button type="button" class="outline-action-button et-small-button" id="ft-csv">Download CSV</button></span>
          </h2>
          <p class="et-card-note">One line a day: how far the forklift went by GPS and by its own odometer, the energy it used, and the hours in each state.</p>
          <div class="table-scroll">
            <table class="data-table" id="ft-report-table">
              <thead><tr>${REPORT_HEAD.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
              <tbody>
                ${days.length ? days.map((d) => `<tr data-date="${esc(d.date)}">${reportRow(d).map((c, i) => `<td data-label="${esc(REPORT_HEAD[i])}">${esc(c)}</td>`).join('')}</tr>`).join('') + `<tr class="total-row" id="ft-report-total"><td>Total</td><td>${total.gps.toFixed(2)}</td><td>${total.ext.toFixed(2)}</td><td>${total.wh.toFixed(2)}</td><td>${total.Active.toFixed(2)}</td><td>${total.Idle.toFixed(2)}</td><td>${total.Inactive.toFixed(2)}</td><td>${total.Alert.toFixed(2)}</td></tr>` : `<tr><td colspan="${REPORT_HEAD.length}" class="empty-table-note">No data for these dates.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>`
    },
    wire() {
      const device = selectedDevice()
      if (!device) return
      wireDeviceBar()
      const r = ui.reports
      $('ft-rsearch').addEventListener('click', () => {
        const from = $('ft-rfrom').value
        const to = $('ft-rto').value
        const span = from && to ? (ForkliftData.dateOf(to) - ForkliftData.dateOf(from)) / 86400000 : 0
        const problem = !from || !to ? 'Choose both dates.' : from > to ? 'From must be on or before To.' : to > todayIso() ? 'Choose dates up to today.' : span + 1 > MAX_REPORT_DAYS ? `Choose a range of up to ${MAX_REPORT_DAYS} days.` : ''
        showError('ft-report-error', problem)
        if (problem) return
        Object.assign(r, { from, to, applied: { from, to } })
        renderView()
      })
      $('ft-rclear').addEventListener('click', () => {
        Object.assign(r, { from: '', to: '', applied: null })
        renderView()
      })
      const files = () => {
        const applied = r.applied || { from: r.from, to: r.to }
        const { days, total } = reportTable(device, applied)
        const name = `forklift-report_${Downloads.fileSafe(device.vehicleId) || device.deviceId}_${applied.from}_to_${applied.to}`
        return { days, total, applied, name }
      }
      $('ft-csv').addEventListener('click', () => {
        const { days, name } = files()
        if (!days.length) { UI.toast('There is nothing to download for these dates.'); return }
        const head = ['Date', 'GPS Distance', 'ODOMETER Distance', 'Watt HR', 'Active Hours', 'Inactive Hours', 'Idle Hours', 'Alert Hours']
        const body = days.map((d) => [d.date, d.gpsDistance, d.extDistance, d.wattHr, d.hours.Active, d.hours.Inactive, d.hours.Idle, d.hours.Alert])
        Downloads.downloadCsv(name + '.csv', head, body)
      })
      $('ft-pdf').addEventListener('click', () => {
        const { days, applied, name } = files()
        if (!days.length) { UI.toast('There is nothing to download for these dates.'); return }
        Downloads.downloadPdf(name + '.pdf', REPORT_HEAD, days.map(reportRow), { title: `Forklift report: ${device.vehicleName} (${device.deviceId}), ${applied.from} to ${applied.to}` })
      })
    },
  }

  const VIEWS = { fleet: fleetView, live: liveView, history: historyView, reports: reportsView }

  // -------------------------------------------------------------- dialog
  let editing = null

  function openForklift(id) {
    const device = id ? devices().find((d) => d.id === id) : null
    editing = device ? device.id : null
    $('forklift-title').textContent = device ? 'Edit forklift' : 'Register forklift'
    $('forklift-save').textContent = device ? 'Save changes' : 'Register'
    const fields = { deviceId: 'fk-device-id', vehicleName: 'fk-name', deviceModel: 'fk-model', vehicleId: 'fk-vehicle-id', driver: 'fk-driver', manufacturer: 'fk-manufacturer', hardwareVersion: 'fk-hardware', softwareVersion: 'fk-software' }
    Object.keys(fields).forEach((key) => { $(fields[key]).value = device ? device[key] : '' })
    // The tracker's ID is what its data is filed under: it is set once.
    $('fk-device-id').readOnly = Boolean(device)
    $('fk-device-id').classList.toggle('et-readonly', Boolean(device))
    ;['fk-device-id', 'fk-name', 'fk-model', 'fk-vehicle-id', 'fk-driver', 'fk-manufacturer', 'fk-hardware', 'fk-software'].forEach((f) => showError(f + '-error', ''))
    UI.openModal('forklift-modal')
  }

  const FIELD_RULES = [
    { id: 'fk-device-id', label: 'Device ID', max: 15, required: true },
    { id: 'fk-name', label: 'Vehicle name', max: 20, required: true },
    { id: 'fk-model', label: 'Device model', max: 20, required: true },
    { id: 'fk-vehicle-id', label: 'Vehicle ID', max: 20, required: true },
    { id: 'fk-driver', label: 'Driver', max: 20 },
    { id: 'fk-manufacturer', label: 'Manufacturer', max: 20 },
    { id: 'fk-hardware', label: 'Hardware version', max: 10 },
    { id: 'fk-software', label: 'Software version', max: 10 },
  ]

  function wireDialog() {
    $('forklift-form').addEventListener('submit', (event) => {
      event.preventDefault()
      let bad = false
      FIELD_RULES.forEach((rule) => {
        const value = $(rule.id).value.trim()
        let message = ''
        if (rule.required && !value) message = `${rule.label} is required`
        else if (value.length > rule.max) message = `${rule.label} must be ${rule.max} characters or fewer`
        else if (rule.id === 'fk-device-id' && !/^[A-Za-z0-9]+$/.test(value)) message = 'Use letters and digits only'
        else if (rule.id === 'fk-device-id' && Store.forkliftDeviceIdTaken(value, editing)) message = 'A forklift with this device ID is already registered'
        showError(rule.id + '-error', message)
        if (message) bad = true
      })
      if (bad) return
      const values = { deviceId: $('fk-device-id').value, vehicleName: $('fk-name').value, deviceModel: $('fk-model').value, vehicleId: $('fk-vehicle-id').value, driver: $('fk-driver').value, manufacturer: $('fk-manufacturer').value, hardwareVersion: $('fk-hardware').value, softwareVersion: $('fk-software').value }
      let record
      if (editing) record = Store.updateForkliftDevice(editing, values)
      else record = Store.addForkliftDevice(values)
      UI.closeModal('forklift-modal')
      UI.toast(`"${record.vehicleName}" ${editing ? 'updated' : 'registered'} successfully!`)
      renderView()
    })
  }

  // ---------------------------------------------------------------- page
  function breadcrumbs() {
    const app = getApp()
    return [{ label: 'Home', href: 'dashboard.html' }, { label: 'Applications', href: 'applications.html' }, { label: app ? app.name : 'Forklift Tracking' }]
  }

  function renderView() {
    charts.forEach((c) => { try { c.destroy() } catch (err) { /* already gone */ } })
    charts = []
    clearInterval(liveTimer)
    $('ft-view').innerHTML = VIEWS[currentTab()].render()
    VIEWS[currentTab()].wire()
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
        ${TABS.map((t) => `<button type="button" class="detail-tab-button${t.key === tab ? ' active' : ''}" role="tab" aria-selected="${t.key === tab}" data-ft-tab="${t.key}">${iconSvg(t.icon)}${esc(t.label)}</button>`).join('')}
      </div>
      <div id="ft-view"></div>`
    $('toggle-status-btn').addEventListener('click', () => {
      Store.toggleApplicationStatus(app.id)
      UI.toast(`"${app.name}" status updated successfully!`)
      renderPage()
    })
    root.querySelectorAll('[data-ft-tab]').forEach((btn) => btn.addEventListener('click', () => goTo(btn.getAttribute('data-ft-tab'), selectedDevice())))
    renderView()
  }

  function boot(host) {
    root = host
    wireDialog()
    document.addEventListener('click', () => UI.closeRowMenus())
    window.addEventListener('hashchange', () => {
      const tab = currentTab()
      root.querySelectorAll('[data-ft-tab]').forEach((btn) => {
        const on = btn.getAttribute('data-ft-tab') === tab
        btn.classList.toggle('active', on)
        btn.setAttribute('aria-selected', String(on))
      })
      if ($('ft-view')) renderView()
      else renderPage()
    })
    renderPage()
  }

  window.ForkliftTracking = { boot, breadcrumbs }
})()
