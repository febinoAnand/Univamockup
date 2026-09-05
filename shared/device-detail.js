/* ==========================================================================
   Univa — static HTML build. Port of src/modules/devices/DeviceDetailPage/**
   — the 6-tab device detail page (Overview/Alerts/Commands/Relations/
   Data publish/Data logs). Self-contained telemetry helpers mirror
   src/modules/devices/deviceFactory.js exactly (same hash/PRNG algorithm
   dashboard.js also uses, kept as its own copy so this page has no
   dependency on dashboard.js).
   ========================================================================== */

function hashString(value) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
function mulberry32(seed) {
  let t = seed
  return function random() {
    t |= 0
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
const BUCKET_MS = 60000
const BYTES_PER_MESSAGE = 76
const RANGE_PRESETS = {
  '5m': { label: 'Last 5 minutes', windowMs: 5 * 60000, stepMs: 15000 },
  '1h': { label: 'Last 1 hour', windowMs: 60 * 60000, stepMs: 60000 },
  '24h': { label: 'Last 24 hours', windowMs: 24 * 60 * 60000, stepMs: 15 * 60000 },
  '7d': { label: 'Last 7 days', windowMs: 7 * 24 * 60 * 60000, stepMs: 60 * 60000 },
}
function telemetryValueAt(deviceId, metricKey, timestampMs, metricConfig) {
  const baseline = metricConfig.baseline
  const amplitude = metricConfig.amplitude
  const dec = metricConfig.decimals == null ? 1 : metricConfig.decimals
  const bucket = Math.floor(timestampMs / BUCKET_MS)
  const rng = mulberry32(hashString(`${deviceId}:${metricKey}:${bucket}`))
  const trend = Math.sin(bucket / 180) * amplitude
  const noise = (rng() - 0.5) * amplitude * 0.15
  return Number(Math.max(0, baseline + trend + noise).toFixed(dec))
}
function generateTelemetrySeries(deviceId, metricKey, metricConfig, rangeKey, now) {
  const preset = RANGE_PRESETS[rangeKey] || RANGE_PRESETS['1h']
  const points = []
  for (let t = now - preset.windowMs; t <= now; t += preset.stepMs) {
    points.push({ timestamp: t, value: telemetryValueAt(deviceId, metricKey, t, metricConfig) })
  }
  return points
}
function estimateMessageCount(device, windowMs) {
  const elapsed = Math.min(windowMs, Date.now() - device.createdAt)
  if (elapsed <= 0) return 0
  return Math.floor(elapsed / BUCKET_MS) * device.metrics.length
}
function estimateBytesSent(device, windowMs) {
  return estimateMessageCount(device, windowMs) * BYTES_PER_MESSAGE
}
function nowStampLocal() {
  const d = new Date()
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/* ------------------------------------------------------------ icons */
const HELP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.4 2.3c-.8.4-1.4 1-1.4 1.9v.3" stroke-linecap="round"/><circle cx="12" cy="16.8" r="0.4" fill="currentColor" stroke="none"/></svg>'
const TRASH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke-linecap="round"/></svg>'
const EDIT_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CHECK_CIRCLE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const COPY_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5 15V6a1 1 0 0 1 1-1h9" stroke-linecap="round"/></svg>'
const EXPAND_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const SEARCH_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg>'
const KEY_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 4l3 3M13 7l2.5 2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CHART_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h16" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 15l4-5 3 3 5-7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const LIST_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke-linecap="round"/></svg>'
const REFRESH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 2l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 11V9a4 4 0 0 1 4-4h14" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 22l-4-4 4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 13v2a4 4 0 0 1-4 4H3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const BOLT_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const MORE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>'
const INFO_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5" stroke-linecap="round"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>'
const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>'
function chevronSvg(expanded, deg) {
  deg = deg == null ? (expanded ? 0 : -90) : (expanded ? deg : 0)
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" style="transform:rotate(${deg}deg);transition:transform 0.15s ease;"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
function sortIconSvg(flipped) {
  return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" class="sort-icon${flipped ? ' flipped' : ''}"><path d="M12 5v14M7 10l5-5 5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

/* ------------------------------------------------------------ state */
let device = null
let activeTab = 'overview'
let bannerDismissed = false

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'commands', label: 'Commands' },
  { key: 'relations', label: 'Relations' },
  { key: 'dataPublish', label: 'Data publish' },
  { key: 'dataLogs', label: 'Data logs' },
]

function refreshDevice() {
  // Hash, not query string — see the comment in device-detail.html.
  const id = window.location.hash.slice(1)
  device = Store.get().devices.find((d) => d.id === id) || null
}

function renderRoot() {
  const root = document.getElementById('device-detail-root')
  if (!device) {
    root.innerHTML = `
      <div class="device-detail-page">
        <p class="device-not-found">This device no longer exists.</p>
        <a href="devices.html" class="text-link">Back to Devices</a>
      </div>`
    return
  }

  root.innerHTML = `
    <div class="device-detail-page">
      <div class="device-detail-header">
        <div>
          <h1 class="device-detail-title">${escapeHtml(device.name)} <span class="device-detail-id">(ID: ${device.endpointId})</span></h1>
          <p class="device-detail-subtitle">360 degree view of your device</p>
        </div>
        <div class="device-actions-menu" id="device-actions-menu">
          <button type="button" class="outline-action-button" id="device-actions-btn">Actions${MORE_SVG}</button>
          <div class="row-menu-dropdown device-actions-dropdown hidden" id="device-actions-dropdown">
            <button type="button" class="row-menu-item" id="device-delete-btn">${TRASH_SVG}Delete device</button>
          </div>
        </div>
      </div>

      ${device.tokenStatus !== 'active' && !bannerDismissed ? `
      <div class="token-info-banner">
        <span class="token-info-banner-icon">${INFO_SVG}</span>
        <span>Learn how to activate the device token.</span>
        <button type="button" class="outline-action-button">Read tutorial</button>
        <button type="button" class="icon-button token-info-banner-close" id="token-banner-close" aria-label="Dismiss">${CLOSE_SVG}</button>
      </div>` : ''}

      <div class="device-detail-tabs" id="device-detail-tabs">
        ${TABS.map((t) => `<button type="button" class="tab-button${activeTab === t.key ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>

      <div class="device-detail-body tab-panel-enter" id="device-detail-body"></div>
    </div>`

  document.getElementById('device-actions-btn').addEventListener('click', function (event) {
    event.stopPropagation()
    document.getElementById('device-actions-dropdown').classList.toggle('hidden')
  })
  document.addEventListener('click', function closeMenu() {
    const dropdown = document.getElementById('device-actions-dropdown')
    if (dropdown) dropdown.classList.add('hidden')
  })
  document.getElementById('device-delete-btn').addEventListener('click', function () {
    document.getElementById('device-actions-dropdown').classList.add('hidden')
    UI.confirm({
      message: `Delete <strong>${escapeHtml(device.name)}</strong>? This can't be undone.`,
      onConfirm: function () {
        Store.deleteDevice(device.id)
        window.location.href = 'devices.html'
      },
    })
  })
  const closeBanner = document.getElementById('token-banner-close')
  if (closeBanner) closeBanner.addEventListener('click', function () { bannerDismissed = true; renderRoot() })

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', function () {
      activeTab = btn.getAttribute('data-tab')
      renderRoot()
    })
  })

  if (typeof Layout !== 'undefined' && Layout.setBreadcrumbs) {
    const activeLabel = (TABS.find((t) => t.key === activeTab) || {}).label || 'Overview'
    Layout.setBreadcrumbs([
      { label: 'Home', href: 'dashboard.html' },
      { label: 'Devices', href: 'devices.html' },
      { label: `Device ${device.endpointId}`, href: 'device-detail.html#' + device.id },
      { label: activeLabel },
    ])
  }

  renderTabBody()
}

function renderTabBody() {
  const body = document.getElementById('device-detail-body')
  if (activeTab === 'overview') renderOverviewTab(body)
  else if (activeTab === 'alerts') renderAlertsTab(body)
  else if (activeTab === 'commands') renderCommandsTab(body)
  else if (activeTab === 'relations') renderRelationsTab(body)
  else if (activeTab === 'dataPublish') renderDataPublishTab(body)
  else if (activeTab === 'dataLogs') renderDataLogsTab(body)
}

/* Generic local (non-auto-dismissing? no — matches shared Toast: 3s auto dismiss) */
function showToast(message) {
  UI.toast(message)
}

/* ============================================================ Overview */

const SERIES_COLORS = ['#7c3aed', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#15803d']
const CHART_WIDTH = 640
const CHART_HEIGHT = 200
const CHART_PADDING = 14
// Series/coords from the last full chart build, reused by hover so it never
// re-fetches data or rebuilds the <svg> — rebuilding it on every mousemove
// would retrigger its fade-in animation, making the chart look like it's
// constantly refreshing.
let telemetryChartCache = null

function computeCoordinates(points) {
  if (points.length === 0) return []
  const values = points.map((p) => p.value)
  const min = Math.min.apply(null, values)
  const max = Math.max.apply(null, values)
  const range = max - min || 1
  const usableWidth = CHART_WIDTH - CHART_PADDING * 2
  const usableHeight = CHART_HEIGHT - CHART_PADDING * 2
  return points.map((point, index) => {
    const x = CHART_PADDING + (points.length === 1 ? usableWidth / 2 : (index / (points.length - 1)) * usableWidth)
    const y = CHART_PADDING + usableHeight - ((point.value - min) / range) * usableHeight
    return { x: x, y: y, value: point.value, timestamp: point.timestamp }
  })
}
function linePath(coords) {
  if (coords.length === 0) return ''
  if (coords.length === 1) return `M ${coords[0].x},${coords[0].y}`
  let path = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`
  for (let i = 1; i < coords.length; i++) {
    path += ` L ${coords[i].x.toFixed(1)},${coords[i].y.toFixed(1)}`
  }
  return path
}
const Y_AXIS_TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1]
function yAxisTicks(points, unit) {
  if (points.length === 0) return []
  const values = points.map((p) => p.value)
  const min = Math.min.apply(null, values)
  const max = Math.max.apply(null, values)
  const range = max - min || 1
  return Y_AXIS_TICK_FRACTIONS.map((fraction) => ({ fraction: fraction, label: `${(max - fraction * range).toFixed(1)}${unit || ''}` }))
}
function xAxisTicks(points, range) {
  if (points.length === 0) return []
  const tickCount = Math.min(5, points.length)
  const step = (points.length - 1) / (tickCount - 1 || 1)
  const formatTs = range === '7d'
    ? (ts) => new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const ticks = []
  for (let tickIndex = 0; tickIndex < tickCount; tickIndex++) {
    const pointIndex = Math.round(tickIndex * step)
    ticks.push({ pointIndex: pointIndex, label: formatTs(points[pointIndex].timestamp) })
  }
  return ticks
}

// Overview tab UI state (kept module-level since only one tab is mounted at a time)
let ov = {
  search: '', searchOpen: false, editingId: null, editingValue: '',
  dataMode: 'telemetry', seriesPanelOpen: false, range: '1h', viewMode: 'chart',
  visibleMetrics: null, hoverIndex: null,
}

function resetOverviewState() {
  ov = {
    search: '', searchOpen: false, editingId: null, editingValue: '',
    dataMode: 'telemetry', seriesPanelOpen: false, range: '1h', viewMode: 'chart',
    visibleMetrics: new Set(device.metrics.map((m) => m.key)), hoverIndex: null,
  }
}

function renderOverviewTab(container) {
  if (!ov.visibleMetrics) resetOverviewState()
  const now = Date.now()
  const query = ov.search.trim().toLowerCase()
  const visibleMetadata = device.metadata.filter((f) => f.key.toLowerCase().includes(query))
  const visibleMetrics = device.metrics.filter((m) => m.key.toLowerCase().includes(query))

  const total = estimateBytesSent(device, now - device.createdAt)
  const bytes24h = estimateBytesSent(device, RANGE_PRESETS['24h'].windowMs)
  const bytes7d = estimateBytesSent(device, RANGE_PRESETS['7d'].windowMs)

  container.innerHTML = `
    <div class="overview-grid">
      <div class="device-panel" id="metadata-panel">
        <div class="device-panel-title-row">
          <h2 class="device-panel-title">${LIST_SVG}Metadata</h2>
          <div class="device-panel-title-actions">
            <button type="button" class="icon-button" aria-label="Expand">${EXPAND_SVG}</button>
            <button type="button" class="icon-button" id="metadata-search-toggle" aria-label="Search metadata">${SEARCH_SVG}</button>
          </div>
        </div>
        ${ov.searchOpen ? `<input type="text" class="metadata-search-input" id="metadata-search-input" placeholder="Search metadata" value="${escapeHtml(ov.search)}" />` : ''}
        <div class="metadata-scroll" id="metadata-scroll">
          ${visibleMetadata.map((field) => `
          <div class="metadata-list-row" data-field-id="${field.id}">
            <span class="metadata-key">${escapeHtml(field.key)}</span>
            ${ov.editingId === field.id ? `
            <span class="metadata-edit-row">
              <input type="text" id="metadata-edit-input" value="${escapeHtml(ov.editingValue)}" autofocus />
              <button type="button" class="text-link" data-save-field="${field.id}">Save</button>
            </span>` : `
            <span class="metadata-value">
              ${escapeHtml(field.value || '—')}
              <div class="row-menu">
                <button type="button" class="row-menu-button" data-menu-toggle>${MORE_SVG}</button>
                <div class="row-menu-dropdown metadata-row-menu-dropdown">
                  <button type="button" class="row-menu-item" data-edit-field="${field.id}">${EDIT_SVG}Edit value</button>
                  <button type="button" class="row-menu-item danger" data-delete-field="${field.id}">${TRASH_SVG}Delete value</button>
                </div>
              </div>
            </span>`}
          </div>`).join('')}
          ${visibleMetrics.map((metric) => `
          <div class="metadata-list-row">
            <span class="metadata-key">${escapeHtml(metric.key)}</span>
            <span class="metadata-value">${telemetryValueAt(device.id, metric.key, now, metric)}${metric.unit}</span>
          </div>`).join('')}
        </div>
        <div class="metadata-add-row">
          <input type="text" placeholder="Key" id="metadata-new-key" />
          <input type="text" placeholder="Value" id="metadata-new-value" />
          <button type="button" class="icon-button" id="metadata-add-btn" aria-label="Add metadata field">+</button>
        </div>
      </div>

      <div class="device-panel">
        <h2 class="device-panel-title">${CHART_SVG}Device statistics</h2>
        <div class="stat-total-row">
          <span class="stat-label">Data sent total</span>
          <span class="stat-value">${total.toLocaleString()} <small>Bytes</small></span>
        </div>
        <div class="stat-box-row">
          <div class="stat-box"><span class="stat-value">${bytes24h.toLocaleString()}</span><span class="stat-label">Bytes, 24 hours</span></div>
          <div class="stat-box"><span class="stat-value">${bytes7d.toLocaleString()}</span><span class="stat-label">Bytes, last 7 days</span></div>
        </div>
      </div>

      <div class="device-panel" id="token-panel">${tokenPanelHtml()}</div>

      <div class="device-panel telemetry-card" id="telemetry-panel">${telemetryPanelHtml()}</div>
    </div>`

  wireMetadataPanelEvents(container)
  wireTokenPanelEvents(container)
  wireTelemetryPanelEvents(container)
}

function wireMetadataPanelEvents(container) {
  const searchToggle = document.getElementById('metadata-search-toggle')
  searchToggle.addEventListener('click', function () { ov.searchOpen = !ov.searchOpen; renderOverviewTab(container) })
  const searchInput = document.getElementById('metadata-search-input')
  if (searchInput) searchInput.addEventListener('input', function (e) { ov.search = e.target.value; renderOverviewTab(container) })

  container.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', function (event) {
      event.stopPropagation()
      const menu = btn.closest('.row-menu')
      const wasOpen = menu.classList.contains('open')
      UI.closeRowMenus(container)
      if (!wasOpen) UI.openRowMenu(btn)
    })
  })
  document.addEventListener('click', function () { UI.closeRowMenus(container) })

  container.querySelectorAll('[data-edit-field]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const fieldId = btn.getAttribute('data-edit-field')
      const field = device.metadata.find((f) => f.id === fieldId)
      ov.editingId = fieldId
      ov.editingValue = field ? field.value : ''
      renderOverviewTab(container)
    })
  })
  container.querySelectorAll('[data-delete-field]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const fieldId = btn.getAttribute('data-delete-field')
      const field = device.metadata.find((f) => f.id === fieldId)
      if (!field) return
      UI.confirm({
        message: `Delete metadata field <strong>${escapeHtml(field.key)}</strong>? This can't be undone.`,
        onConfirm: function () {
          Store.removeMetadataField(device.id, fieldId)
          refreshDevice()
          showToast(`Removed "${field.key}"`)
          renderOverviewTab(container)
        },
      })
    })
  })
  const editInput = document.getElementById('metadata-edit-input')
  if (editInput) {
    editInput.addEventListener('input', function (e) { ov.editingValue = e.target.value })
    editInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') commitMetadataEdit(container) })
  }
  const saveBtn = container.querySelector('[data-save-field]')
  if (saveBtn) saveBtn.addEventListener('click', function () { commitMetadataEdit(container) })

  document.getElementById('metadata-add-btn').addEventListener('click', function () {
    const keyInput = document.getElementById('metadata-new-key')
    const valueInput = document.getElementById('metadata-new-value')
    if (!keyInput.value.trim()) return
    Store.addMetadataField(device.id, keyInput.value.trim(), valueInput.value.trim())
    refreshDevice()
    showToast('Metadata field added')
    renderOverviewTab(container)
  })
}
function commitMetadataEdit(container) {
  const field = device.metadata.find((f) => f.id === ov.editingId)
  if (!field) return
  Store.updateMetadataField(device.id, ov.editingId, ov.editingValue.trim())
  refreshDevice()
  showToast(`Updated "${field.key}"`)
  ov.editingId = null
  renderOverviewTab(container)
}

function tokenPanelHtml() {
  const status = device.tokenStatus
  let note = ''
  if (status === 'unavailable') note = '<p class="token-note">There is no usable token available. You may create one now.</p>'
  else if (status === 'revoked') note = '<p class="token-note">Token revoked. Issue a new token to reconnect this device.</p>'
  else if (status === 'active' || status === 'suspended') note = `<p class="token-note">The token is ${status === 'active' ? 'valid for use' : 'currently suspended'}.</p>`

  let actions = ''
  if (status === 'unavailable') actions = '<button type="button" class="solid-action-button" data-token-action="create">Create</button>'
  else if (status === 'active') actions = '<button type="button" class="outline-action-button" data-token-action="suspend">Suspend</button><button type="button" class="solid-action-button" data-token-action="revoke">Revoke</button>'
  else if (status === 'suspended') actions = '<button type="button" class="outline-action-button" data-token-action="resume">Resume</button><button type="button" class="solid-action-button" data-token-action="revoke">Revoke</button>'
  else if (status === 'revoked') actions = '<button type="button" class="solid-action-button" data-token-action="reissue">Reissue token</button>'

  return `
    <div class="device-panel-title-row">
      <h2 class="device-panel-title">${KEY_SVG}Endpoint Token Status</h2>
      <span class="status-pill status-${status}">${status === 'unavailable' ? 'Unavailable' : status}</span>
    </div>
    ${note}
    ${device.tokenValue ? `<code class="token-value">${escapeHtml(device.tokenValue)}</code>` : ''}
    <div class="token-actions">${actions}</div>`
}
function wireTokenPanelEvents(container) {
  container.querySelectorAll('[data-token-action]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const action = btn.getAttribute('data-token-action')
      if (action === 'create') { Store.activateToken(device.id); showToast('Token created') }
      else if (action === 'suspend') { Store.setTokenStatus(device.id, 'suspended'); showToast('Token suspended') }
      else if (action === 'resume') { Store.setTokenStatus(device.id, 'active'); showToast('Token resumed') }
      else if (action === 'revoke') { Store.setTokenStatus(device.id, 'revoked'); showToast('Token revoked') }
      else if (action === 'reissue') { Store.activateToken(device.id); showToast('New token issued') }
      refreshDevice()
      document.getElementById('token-panel').innerHTML = tokenPanelHtml()
      wireTokenPanelEvents(document.getElementById('token-panel'))
    })
  })
}

function telemetryHoverMarkup(seriesByMetric, visibleSeries, hoverIndex, guideX) {
  let markup = `<line x1="${guideX}" y1="${CHART_PADDING}" x2="${guideX}" y2="${CHART_HEIGHT - CHART_PADDING}" stroke="#d6d3d1" stroke-width="1" stroke-dasharray="3 3"/>`
  visibleSeries.forEach((entry) => {
    const colorIndex = seriesByMetric.indexOf(entry)
    const coord = entry.coords[hoverIndex]
    if (!coord) return
    markup += `<circle cx="${coord.x}" cy="${coord.y}" r="4" fill="${SERIES_COLORS[colorIndex % SERIES_COLORS.length]}" stroke="#ffffff" stroke-width="1.5"/>`
  })
  return markup
}
function telemetryTooltipMarkup(seriesByMetric, visibleSeries, hoverIndex, guideX) {
  return `<div class="chart-tooltip" style="left:${(guideX / CHART_WIDTH) * 100}%">
    <div class="chart-tooltip-time">${new Date(visibleSeries[0].points[hoverIndex].timestamp).toLocaleString()}</div>
    ${visibleSeries.map((entry) => {
      const colorIndex = seriesByMetric.indexOf(entry)
      return `<div class="chart-tooltip-row"><span class="legend-dot" style="background:${SERIES_COLORS[colorIndex % SERIES_COLORS.length]}"></span>${escapeHtml(entry.metric.label)}: <strong>${entry.points[hoverIndex].value}${entry.metric.unit}</strong></div>`
    }).join('')}
  </div>`
}
// Hover-only update: patches the guide line/dots and tooltip in place instead
// of going through rerenderTelemetry(), which would rebuild the <svg> (and
// restart its fade-in animation) on every mousemove.
function updateTelemetryHover() {
  const overlay = document.getElementById('chart-hover-overlay')
  const tooltipSlot = document.getElementById('chart-tooltip-slot')
  if (!overlay || !telemetryChartCache) return
  const seriesByMetric = telemetryChartCache.seriesByMetric
  const visibleSeries = telemetryChartCache.visibleSeries
  const hoverIndex = ov.hoverIndex
  const guideX = hoverIndex !== null && visibleSeries.length > 0 && visibleSeries[0].coords[hoverIndex] ? visibleSeries[0].coords[hoverIndex].x : null
  if (hoverIndex === null || guideX === null) {
    overlay.innerHTML = ''
    if (tooltipSlot) tooltipSlot.innerHTML = ''
    return
  }
  overlay.innerHTML = telemetryHoverMarkup(seriesByMetric, visibleSeries, hoverIndex, guideX)
  if (tooltipSlot) tooltipSlot.innerHTML = telemetryTooltipMarkup(seriesByMetric, visibleSeries, hoverIndex, guideX)
}

function telemetryPanelHtml() {
  let inner
  if (ov.dataMode === 'analytics') {
    telemetryChartCache = null
    inner = '<div class="telemetry-empty">No analytics configured for this device.</div>'
  } else {
    const seriesByMetric = device.metrics.map((metric) => {
      const points = generateTelemetrySeries(device.id, metric.key, metric, ov.range, Date.now())
      return { metric: metric, points: points, coords: computeCoordinates(points) }
    })
    const visibleSeries = seriesByMetric.filter((entry) => ov.visibleMetrics.has(entry.metric.key))
    const primarySeries = visibleSeries[0]
    const yTicks = primarySeries ? yAxisTicks(primarySeries.points, primarySeries.metric.unit) : []
    const xTicks = primarySeries ? xAxisTicks(primarySeries.points, ov.range) : []
    const hoverIndex = ov.hoverIndex
    const guideX = hoverIndex !== null && visibleSeries.length > 0 && visibleSeries[0].coords[hoverIndex] ? visibleSeries[0].coords[hoverIndex].x : null

    let body
    if (visibleSeries.length === 0) {
      telemetryChartCache = null
      body = '<div class="telemetry-empty">No series selected.</div>'
    } else if (ov.viewMode === 'chart') {
      let gridLines = ''
      ;[0.25, 0.5, 0.75, 1].forEach((fraction) => {
        const y = CHART_PADDING + (CHART_HEIGHT - CHART_PADDING * 2) * fraction
        gridLines += `<line x1="${CHART_PADDING}" y1="${y}" x2="${CHART_WIDTH - CHART_PADDING}" y2="${y}" stroke="#e7e5e4" stroke-width="1"/>`
      })
      let paths = ''
      visibleSeries.forEach((entry) => {
        const colorIndex = seriesByMetric.indexOf(entry)
        const color = SERIES_COLORS[colorIndex % SERIES_COLORS.length]
        paths += `<path fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" d="${linePath(entry.coords)}"/>`
        entry.coords.forEach((c) => {
          paths += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${color}" stroke="#ffffff" stroke-width="1"/>`
        })
      })
      const hoverMarkup = hoverIndex !== null && guideX !== null ? telemetryHoverMarkup(seriesByMetric, visibleSeries, hoverIndex, guideX) : ''
      const tooltipMarkup = hoverIndex !== null && guideX !== null ? telemetryTooltipMarkup(seriesByMetric, visibleSeries, hoverIndex, guideX) : ''
      telemetryChartCache = { seriesByMetric: seriesByMetric, visibleSeries: visibleSeries }
      body = `
        <div class="telemetry-chart-wrap" id="telemetry-chart-wrap">
          <div class="telemetry-chart-body">
            <div class="chart-y-axis">${yTicks.map((t) => `<span>${t.label}</span>`).join('')}</div>
            <div class="chart-plot-col">
              <svg id="telemetry-svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" preserveAspectRatio="none">
                ${gridLines}${paths}<g id="chart-hover-overlay">${hoverMarkup}</g>
              </svg>
              <div class="chart-x-axis">${xTicks.map((t) => `<span>${t.label}</span>`).join('')}</div>
              <div id="chart-tooltip-slot">${tooltipMarkup}</div>
            </div>
          </div>
        </div>`
    } else {
      telemetryChartCache = null
      const rows = visibleSeries[0].points.map((_, i) => i).reverse()
      body = `
        <div class="devices-table-scroll">
          <table class="data-table">
            <thead><tr><th>Timestamp</th>${visibleSeries.map((e) => `<th>${escapeHtml(e.metric.label)} (${e.metric.unit || '—'})</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.map((rowIndex) => `<tr><td>${new Date(visibleSeries[0].points[rowIndex].timestamp).toLocaleString()}</td>${visibleSeries.map((e) => `<td>${e.points[rowIndex].value}${e.metric.unit}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>`
    }

    inner = `
      <div class="telemetry-toolbar">
        <div class="telemetry-toolbar-left">
          <div class="telemetry-view-toggle">
            <button type="button" class="${ov.viewMode === 'chart' ? 'active' : ''}" data-view-mode="chart" aria-label="Chart view">${CHART_SVG}</button>
            <button type="button" class="${ov.viewMode === 'table' ? 'active' : ''}" data-view-mode="table" aria-label="Table view">${LIST_SVG}</button>
          </div>
          <button type="button" class="icon-button" id="telemetry-refresh-btn" aria-label="Refresh">${REFRESH_SVG}</button>
          <select class="telemetry-range-select" id="telemetry-range-select">
            ${Object.keys(RANGE_PRESETS).map((k) => `<option value="${k}" ${k === ov.range ? 'selected' : ''}>${RANGE_PRESETS[k].label}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="series-panel-toggle" id="series-panel-toggle">${chevronSvg(ov.seriesPanelOpen, 90)}Selected ${ov.visibleMetrics.size}/${device.metrics.length} series</button>
      </div>
      ${ov.seriesPanelOpen ? `<div class="telemetry-legend">${seriesByMetric.map((entry, index) => `<button type="button" class="legend-chip${ov.visibleMetrics.has(entry.metric.key) ? '' : ' inactive'}" data-toggle-metric="${escapeHtml(entry.metric.key)}"><span class="legend-dot" style="background:${SERIES_COLORS[index % SERIES_COLORS.length]}"></span>${escapeHtml(entry.metric.label)}</button>`).join('')}</div>` : ''}
      ${body}`
  }

  return `
    <div class="telemetry-mode-tabs">
      <button type="button" class="tab-button${ov.dataMode === 'telemetry' ? ' active' : ''}" data-data-mode="telemetry">Telemetry</button>
      <button type="button" class="tab-button${ov.dataMode === 'analytics' ? ' active' : ''}" data-data-mode="analytics">Analytics</button>
    </div>
    ${inner}`
}

function wireTelemetryPanelEvents(container) {
  const panel = document.getElementById('telemetry-panel')
  function rerenderTelemetry() {
    panel.innerHTML = telemetryPanelHtml()
    wireTelemetryPanelEvents(container)
  }
  panel.querySelectorAll('[data-data-mode]').forEach((btn) => {
    btn.addEventListener('click', function () { ov.dataMode = btn.getAttribute('data-data-mode'); rerenderTelemetry() })
  })
  panel.querySelectorAll('[data-view-mode]').forEach((btn) => {
    btn.addEventListener('click', function () { ov.viewMode = btn.getAttribute('data-view-mode'); rerenderTelemetry() })
  })
  const refreshBtn = document.getElementById('telemetry-refresh-btn')
  if (refreshBtn) refreshBtn.addEventListener('click', function () { showToast('Telemetry refreshed') })
  const rangeSelect = document.getElementById('telemetry-range-select')
  if (rangeSelect) rangeSelect.addEventListener('change', function (e) { ov.range = e.target.value; ov.hoverIndex = null; rerenderTelemetry() })
  const seriesToggle = document.getElementById('series-panel-toggle')
  if (seriesToggle) seriesToggle.addEventListener('click', function () { ov.seriesPanelOpen = !ov.seriesPanelOpen; rerenderTelemetry() })
  panel.querySelectorAll('[data-toggle-metric]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const key = btn.getAttribute('data-toggle-metric')
      if (ov.visibleMetrics.has(key)) ov.visibleMetrics.delete(key)
      else ov.visibleMetrics.add(key)
      rerenderTelemetry()
    })
  })
  const svg = document.getElementById('telemetry-svg')
  if (svg) {
    svg.addEventListener('mousemove', function (event) {
      if (!telemetryChartCache) return
      const visibleSeries = telemetryChartCache.visibleSeries
      if (visibleSeries.length === 0) return
      const count = visibleSeries[0].points.length
      if (count === 0) return
      const rect = svg.getBoundingClientRect()
      const relX = (event.clientX - rect.left) / rect.width
      const dataX = relX * CHART_WIDTH
      const usableWidth = CHART_WIDTH - CHART_PADDING * 2
      const raw = ((dataX - CHART_PADDING) / usableWidth) * (count - 1)
      const nextIndex = Math.max(0, Math.min(count - 1, Math.round(raw)))
      if (nextIndex === ov.hoverIndex) return
      ov.hoverIndex = nextIndex
      updateTelemetryHover()
    })
    const wrap = document.getElementById('telemetry-chart-wrap')
    if (wrap) wrap.addEventListener('mouseleave', function () {
      if (ov.hoverIndex === null) return
      ov.hoverIndex = null
      updateTelemetryHover()
    })
  }
}

/* ============================================================ Alerts */

function renderAlertsTab(container) {
  container.innerHTML = `
    <div class="device-panel">
      <div class="detail-toolbar">
        <h2 class="device-panel-title" style="margin:0;">Alerts</h2>
        <div class="detail-toolbar-actions"><button type="button" class="icon-button" aria-label="Download"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v11M8 11l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      </div>
      ${device.alerts.length === 0 ? '<div class="empty-table-note"><p>No data.</p></div>' : `
      <div class="devices-table-scroll">
        <table class="data-table">
          <thead><tr><th>Alert ID</th><th>Alert type</th><th>Severity level</th><th>Activate reason</th><th>Resolve reason</th><th>State</th><th>Acknowledgement</th><th>Metadata</th><th>Activation metadata</th><th>Resolution metadata</th><th class="data-table-menu-col"></th></tr></thead>
          <tbody>
            ${device.alerts.map((alert) => `
            <tr>
              <td>${alert.id.slice(0, 8)}</td>
              <td>${escapeHtml(alert.alertType)}</td>
              <td><span class="status-pill status-${alert.severity}">${alert.severity}</span></td>
              <td>${escapeHtml(alert.activateReason)}</td>
              <td>${escapeHtml(alert.resolveReason || '—')}</td>
              <td><span class="status-pill status-${alert.state}">${alert.state}</span></td>
              <td>${alert.acknowledgedBy ? `${escapeHtml(alert.acknowledgedBy)} · ${alert.acknowledgedDate}` : '—'}</td>
              <td>${jsonCellHtml(alert.metadata, 'alert-md-' + alert.id)}</td>
              <td>${jsonCellHtml(alert.activationMetadata, 'alert-actmd-' + alert.id)}</td>
              <td>${jsonCellHtml(alert.resolutionMetadata, 'alert-resmd-' + alert.id)}</td>
              <td class="data-table-menu-col">
                <div class="row-menu">
                  <button type="button" class="row-menu-button" data-menu-toggle>${MORE_SVG}</button>
                  <div class="row-menu-dropdown">
                    ${alert.state === 'active' ? `<button type="button" class="row-menu-item" data-ack="${alert.id}">${CHECK_CIRCLE_SVG}Acknowledge</button>` : ''}
                    ${alert.state !== 'resolved' ? `<button type="button" class="row-menu-item" data-resolve="${alert.id}">${CHECK_CIRCLE_SVG}Resolve</button>` : ''}
                  </div>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`

  wireJsonCells(container)
  container.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', function (event) {
      event.stopPropagation()
      const menu = btn.closest('.row-menu')
      const wasOpen = menu.classList.contains('open')
      UI.closeRowMenus(container)
      if (!wasOpen) UI.openRowMenu(btn)
    })
  })
  document.addEventListener('click', function () { UI.closeRowMenus(container) })
  container.querySelectorAll('[data-ack]').forEach((btn) => {
    btn.addEventListener('click', function () {
      Store.acknowledgeAlert(device.id, btn.getAttribute('data-ack'))
      refreshDevice()
      showToast('Alert acknowledged')
      renderAlertsTab(container)
    })
  })
  container.querySelectorAll('[data-resolve]').forEach((btn) => {
    btn.addEventListener('click', function () {
      Store.resolveAlert(device.id, btn.getAttribute('data-resolve'), 'Manually resolved via console')
      refreshDevice()
      showToast('Alert resolved')
      renderAlertsTab(container)
    })
  })
}

function jsonCellHtml(value, key) {
  if (!value) return '<span class="metadata-key">—</span>'
  return `<div><button type="button" class="text-link" data-json-toggle="${key}">▸ JSON</button><pre class="json-cell-pre hidden" data-json-body="${key}">${escapeHtml(value)}</pre></div>`
}
function wireJsonCells(container) {
  container.querySelectorAll('[data-json-toggle]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const key = btn.getAttribute('data-json-toggle')
      const body = container.querySelector('[data-json-body="' + key + '"]')
      const nowHidden = body.classList.toggle('hidden')
      btn.textContent = (nowHidden ? '▸' : '▾') + ' JSON'
    })
  })
}

/* ============================================================ Commands */

let cmd = { configuration: 'custom', commandType: '', bodyOpen: true, commandBody: '{}', executionType: 'async', retention: 1, retentionUnit: 'minutes', bodyError: '', search: '', sort: { key: null, direction: 'asc' } }
function resetCommandsState() { cmd = { configuration: 'custom', commandType: '', bodyOpen: true, commandBody: '{}', executionType: 'async', retention: 1, retentionUnit: 'minutes', bodyError: '', search: '', sort: { key: null, direction: 'asc' } } }

function compareValues(a, b, direction) {
  const result = String(a == null ? '' : a).localeCompare(String(b == null ? '' : b))
  return direction === 'asc' ? result : -result
}

function renderCommandsTab(container) {
  resetCommandsState()
  container.innerHTML = `
    <div class="commands-grid">
      <div class="device-panel">
        <h2 class="device-panel-title">Command execution</h2>
        <form id="command-form">
          <div class="radio-field-group">
            <span class="radio-field-label">Configuration</span>
            <label class="radio-option"><input type="radio" name="cfg" ${cmd.configuration === 'custom' ? 'checked' : ''} value="custom" /> Custom schema</label>
            <label class="radio-option"><input type="radio" name="cfg" ${cmd.configuration === 'application' ? 'checked' : ''} value="application" /> Application configuration</label>
          </div>
          <div class="modal-field">
            <label for="commandType">Command type*</label>
            <input id="commandType" type="text" list="command-type-options" required />
            <datalist id="command-type-options">${device.commandNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>
          </div>
          <div class="collapsible-field">
            <button type="button" class="collapsible-field-header" id="command-body-toggle">${chevronSvg(cmd.bodyOpen)}Command body JSON*</button>
            <textarea rows="5" id="commandBody">${escapeHtml(cmd.commandBody)}</textarea>
          </div>
          <p class="token-note hidden" id="command-body-error" style="color:#dc2626;"></p>
          <div class="radio-field-group">
            <span class="radio-field-label">Execution type</span>
            <label class="radio-option"><input type="radio" name="exec" checked value="async" /> Asynchronous</label>
            <label class="radio-option"><input type="radio" name="exec" value="sync" /> Synchronous</label>
          </div>
          <div class="modal-field">
            <label for="retention">Maximum command retention for delivery</label>
            <div class="retention-row">
              <input id="retention" type="number" min="1" value="1" />
              <select id="retentionUnit"><option value="minutes">minutes</option><option value="hours">hours</option></select>
            </div>
          </div>
          <button type="submit" class="solid-action-button" style="margin-top:0.75rem;">Run</button>
        </form>
      </div>

      <div class="device-panel">
        <h2 class="device-panel-title">Commands history</h2>
        <div class="detail-toolbar">
          <div class="table-search-wrap"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg><input type="text" id="commands-search" placeholder="Search" /></div>
          <label class="group-by-select">Group by<select><option value=""></option></select></label>
        </div>
        <div id="commands-table-host"></div>
      </div>
    </div>`

  const bodyTextarea = document.getElementById('commandBody')
  if (!cmd.bodyOpen) bodyTextarea.classList.add('hidden')

  document.getElementById('command-body-toggle').addEventListener('click', function () {
    cmd.bodyOpen = !cmd.bodyOpen
    bodyTextarea.classList.toggle('hidden', !cmd.bodyOpen)
    this.innerHTML = chevronSvg(cmd.bodyOpen) + 'Command body JSON*'
  })

  document.getElementById('command-form').addEventListener('submit', function (event) {
    event.preventDefault()
    const commandType = document.getElementById('commandType').value.trim()
    if (!commandType) return
    const body = bodyTextarea.value
    try {
      if (body.trim()) JSON.parse(body)
      document.getElementById('command-body-error').classList.add('hidden')
    } catch (e) {
      const errEl = document.getElementById('command-body-error')
      errEl.textContent = 'Command body must be valid JSON.'
      errEl.classList.remove('hidden')
      return
    }
    const executionType = document.querySelector('input[name="exec"]:checked').value
    Store.sendCommand(device.id, { name: commandType, params: body, executionType: executionType })
    refreshDevice()
    showToast(`"${commandType}" command sent`)
    renderCommandsHistory()
  })

  document.getElementById('commands-search').addEventListener('input', function (e) { cmd.search = e.target.value; renderCommandsHistory() })

  renderCommandsHistory()
}

function renderCommandsHistory() {
  const host = document.getElementById('commands-table-host')
  if (!host) return
  const query = cmd.search.trim().toLowerCase()
  let list = query ? device.commands.filter((c) => c.name.toLowerCase().includes(query)) : device.commands.slice()
  if (cmd.sort.key) list = list.sort((a, b) => compareValues(a[cmd.sort.key], b[cmd.sort.key], cmd.sort.direction))

  if (list.length === 0) {
    host.innerHTML = '<div class="empty-table-note"><p>No data.</p></div>'
    return
  }
  function sortHeader(label, key) {
    const active = cmd.sort.key === key
    return `<button type="button" class="th-sort-button" data-sort-key="${key}">${label}${sortIconSvg(active && cmd.sort.direction === 'desc')}</button>`
  }
  host.innerHTML = `
    <div class="devices-table-scroll">
      <table class="data-table">
        <thead><tr>
          <th>${sortHeader('Command type', 'name')}</th>
          <th>${sortHeader('Status', 'status')}</th>
          <th>${sortHeader('Status code', 'statusCode')}</th>
          <th>Reason phrase</th>
          <th>Request &amp; response payload</th>
          <th>${sortHeader('Created', 'createdDate')}</th>
          <th>${sortHeader('Updated', 'updatedDate')}</th>
        </tr></thead>
        <tbody>
          ${list.map((c) => `
          <tr>
            <td>${escapeHtml(c.name)}</td>
            <td><span class="status-pill status-${c.status}">${c.status}</span></td>
            <td>${c.statusCode == null ? '—' : c.statusCode}</td>
            <td>${escapeHtml(c.reasonPhrase)}</td>
            <td><span class="payload-preview">${escapeHtml(c.params)}${c.responsePayload ? ' → ' + escapeHtml(c.responsePayload) : ''}</span></td>
            <td>${c.createdDate}</td>
            <td>${c.updatedDate}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`
  host.querySelectorAll('[data-sort-key]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const key = btn.getAttribute('data-sort-key')
      cmd.sort = cmd.sort.key === key ? { key: key, direction: cmd.sort.direction === 'asc' ? 'desc' : 'asc' } : { key: key, direction: 'asc' }
      renderCommandsHistory()
    })
  })
}

/* ============================================================ Relations */

function renderRelationsTab(container) {
  const parent = device.relations.find((r) => r.type === 'parent')
  const children = device.relations.filter((r) => r.type === 'child')
  const allDevices = Store.get().devices
  const parentOptions = allDevices.filter((item) => item.id !== device.id && !children.some((c) => c.relatedDeviceId === item.id))
  const childCandidates = allDevices.filter((item) => item.id !== device.id && item.id !== (parent && parent.relatedDeviceId) && !children.some((c) => c.relatedDeviceId === item.id))

  function endpointFieldHtml(value, options, key) {
    return `
      <div class="relation-box" data-relation-box="${key}">
        <button type="button" class="relation-box-remove" data-remove-relation="${key}" aria-label="Remove relation">${TRASH_SVG}</button>
        <label class="relation-box-label">Endpoint ID<span class="relation-required">*</span><span class="help-icon" title="Select the related device by endpoint ID">${HELP_SVG}</span></label>
        <div class="relation-box-field">
          <select data-relation-select="${key}">
            <option value="" disabled ${!value ? 'selected' : ''}>Select endpoint…</option>
            ${options.map((o) => `<option value="${o.id}" ${o.id === value ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
          </select>
          <button type="button" class="icon-button" data-copy-relation="${key}" aria-label="Copy endpoint id" ${!value ? 'disabled' : ''}>${COPY_SVG}</button>
        </div>
      </div>`
  }

  container.innerHTML = `
    <div class="relations-grid">
      <div class="device-panel">
        <div class="device-panel-title-row"><h2 class="device-panel-title">Asset - Device relations</h2><div class="device-panel-title-actions"><button type="button" class="icon-button" aria-label="Expand">${EXPAND_SVG}</button></div></div>
        <p class="token-note">Relation between current device application and asset type is not configured. It is not possible to define parent asset.</p>
      </div>

      <div class="device-panel">
        <div class="device-panel-title-row"><h2 class="device-panel-title">Device - Device relations</h2><div class="device-panel-title-actions"><button type="button" class="icon-button" aria-label="Expand">${EXPAND_SVG}</button></div></div>

        <div class="relations-section">
          <span class="relations-section-title">${chevronSvg(true, 0)} Parent</span>
          ${parent ? endpointFieldHtml(parent.relatedDeviceId, parentOptions, 'parent') : '<button type="button" class="dashed-add-button" id="add-parent-btn" ' + (parentOptions.length === 0 ? 'disabled' : '') + '>+ Add parent</button>'}
        </div>

        <div class="relations-section">
          <span class="relations-section-title">${chevronSvg(true, 0)} Children</span>
          <div id="children-list">${children.map((c) => endpointFieldHtml(c.relatedDeviceId, childCandidates.concat(allDevices.filter((d) => d.id === c.relatedDeviceId)), 'child-' + c.id)).join('')}</div>
          <button type="button" class="dashed-add-button" id="add-child-btn" ${childCandidates.length === 0 ? 'disabled' : ''}>+ Add children</button>
        </div>
      </div>
    </div>`

  const addParentBtn = document.getElementById('add-parent-btn')
  if (addParentBtn) {
    addParentBtn.addEventListener('click', function () {
      const section = addParentBtn.parentElement
      section.innerHTML = section.innerHTML.replace(addParentBtn.outerHTML, '')
      section.insertAdjacentHTML('beforeend', endpointFieldHtml('', parentOptions, 'parent'))
      wireRelationBox('parent', null)
    })
  }
  document.querySelectorAll('[data-relation-box="parent"]').forEach(() => wireRelationBox('parent', parent))
  children.forEach((c) => wireRelationBox('child-' + c.id, c))

  document.getElementById('add-child-btn').addEventListener('click', function () {
    const list = document.getElementById('children-list')
    list.insertAdjacentHTML('beforeend', endpointFieldHtml('', childCandidates, 'child-new'))
    wireRelationBox('child-new', null)
    document.getElementById('add-child-btn').classList.add('hidden')
  })

  function wireRelationBox(key, relation) {
    const box = container.querySelector('[data-relation-box="' + key + '"]')
    if (!box) return
    const select = box.querySelector('[data-relation-select]')
    select.addEventListener('change', function () {
      const target = allDevices.find((d) => d.id === select.value)
      if (!target) return
      if (key === 'parent') {
        Store.addRelation(device.id, { relatedDeviceId: target.id, relatedDeviceName: target.name, type: 'parent' })
        showToast(`"${target.name}" set as parent`)
      } else {
        if (relation) Store.removeRelation(device.id, relation.id)
        Store.addRelation(device.id, { relatedDeviceId: target.id, relatedDeviceName: target.name, type: 'child' })
        showToast(`"${target.name}" added as child`)
      }
      refreshDevice()
      renderRelationsTab(container)
    })
    box.querySelector('[data-copy-relation]').addEventListener('click', function () {
      if (!relation) return
      navigator.clipboard && navigator.clipboard.writeText(relation.relatedDeviceId)
      showToast('Endpoint ID copied successfully!')
    })
    box.querySelector('[data-remove-relation]').addEventListener('click', function () {
      if (!relation) { renderRelationsTab(container); return }
      if (key === 'parent') {
        UI.confirm({
          message: "Remove the parent relation? This can't be undone.",
          onConfirm: function () { Store.removeRelation(device.id, relation.id); refreshDevice(); showToast('Parent relation removed'); renderRelationsTab(container) },
        })
      } else {
        UI.confirm({
          message: `Remove <strong>${escapeHtml(relation.relatedDeviceName)}</strong> as a child? This can't be undone.`,
          onConfirm: function () { Store.removeRelation(device.id, relation.id); refreshDevice(); showToast(`Removed "${relation.relatedDeviceName}"`); renderRelationsTab(container) },
        })
      }
    })
  }
}

/* ============================================================ Data publish */

let pub = { protocol: 'mqtt', payloadMode: 'single', codeTab: 'mosquitto', deviceToken: '' }
const MQTT_TABS = ['mosquitto', 'Request/Response', 'Python']
const HTTP_TABS = ['CURL (Bash)', 'CURL (CMD)', 'Python', 'Node.js', 'Go']

function renderDataPublishTab(container) {
  pub = { protocol: 'mqtt', payloadMode: 'single', codeTab: MQTT_TABS[0], deviceToken: '' }
  renderDataPublishBody(container)
}

function renderDataPublishBody(container) {
  const mqttHost = 'mqtt.monitoring.pro'
  const httpHost = 'cloud.monitoring.pro'
  const connectionUrl = pub.protocol === 'mqtt' ? `mqtt://${mqttHost}` : `https://${httpHost}/kpc`
  const pubTopic = `cm1/${device.appVersionName}/dcx/<token>/json/[<request ID>]`
  const statusTopic = `cm1/${device.appVersionName}/dcx/<token>/json[/<request ID>]/status`
  const errorTopic = `cm1/${device.appVersionName}/dcx/<token>/json[/<request ID>]/error`
  const httpPath = `kp1/${device.appVersionName}/dcx/<token>/json`
  const httpUrl = `https://${httpHost}/kpc/${httpPath}`
  const examplePayload = {}
  device.metrics.forEach((m) => { examplePayload[m.key] = m.baseline })
  const exampleJson = JSON.stringify(examplePayload, null, 2)
  const codeTabs = pub.protocol === 'mqtt' ? MQTT_TABS : HTTP_TABS

  let codeBlock = ''
  if (pub.protocol === 'mqtt' && pub.codeTab === 'mosquitto') codeBlock = `mosquitto_pub -h ${mqttHost} -p 1883 -t '${pubTopic}' -m '${JSON.stringify(examplePayload)}'`
  else if (pub.protocol === 'mqtt' && pub.codeTab === 'Request/Response') codeBlock = `PUB ${pubTopic}\nSUB ${statusTopic}\nSUB ${errorTopic}`
  else if (pub.protocol === 'mqtt' && pub.codeTab === 'Python') codeBlock = `import paho.mqtt.publish as publish\npublish.single("${pubTopic}", payload='${JSON.stringify(examplePayload)}', hostname="${mqttHost}")`
  else if (pub.protocol === 'http' && pub.codeTab === 'CURL (Bash)') codeBlock = `curl -X POST "${httpUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(examplePayload)}'`
  else if (pub.protocol === 'http' && pub.codeTab === 'CURL (CMD)') codeBlock = `curl -X POST "${httpUrl}" -H "Content-Type: application/json" -d "${JSON.stringify(examplePayload).replace(/"/g, '\\"')}"`
  else if (pub.protocol === 'http' && pub.codeTab === 'Python') codeBlock = `import requests\n\nrequests.post(\n    "${httpUrl}",\n    json=${JSON.stringify(examplePayload)},\n)`
  else if (pub.protocol === 'http' && pub.codeTab === 'Node.js') codeBlock = `await fetch("${httpUrl}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(examplePayload)}),\n})`
  else if (pub.protocol === 'http' && pub.codeTab === 'Go') codeBlock = `resp, err := http.Post(\n    "${httpUrl}",\n    "application/json",\n    bytes.NewBuffer([]byte(\`${JSON.stringify(examplePayload)}\`)),\n)`

  container.innerHTML = `
    <div class="device-panel">
      <div class="publish-top-row">
        <div class="radio-field-group" style="margin-bottom:0;">
          <label class="radio-option"><input type="radio" name="protocol" ${pub.protocol === 'mqtt' ? 'checked' : ''} data-protocol="mqtt" /> MQTT</label>
          <label class="radio-option"><input type="radio" name="protocol" ${pub.protocol === 'http' ? 'checked' : ''} data-protocol="http" /> HTTP</label>
          <span class="metadata-key"><strong>Connection url:</strong> ${connectionUrl}</span>
          <button type="button" class="icon-button" id="copy-connection-url" aria-label="Copy connection url">${COPY_SVG}</button>
        </div>
      </div>

      <div class="publish-actions-row">
        <button type="button" class="outline-action-button" id="send-sample-btn">${BOLT_SVG}Send data samples</button>
        ${pub.protocol === 'http' ? `<div class="publish-actions-right"><input type="text" class="device-token-input" id="device-token-input" placeholder="Device token" value="${escapeHtml(pub.deviceToken)}" /><button type="button" class="solid-action-button" id="send-request-btn">Send request</button></div>` : ''}
      </div>

      ${pub.protocol === 'mqtt' ? `<div class="topic-row" style="margin-top:1rem;"><span class="topic-badge topic-pub">PUB</span><code>${escapeHtml(pubTopic)}</code><button type="button" class="icon-button" data-copy="${escapeHtml(pubTopic)}::Publish topic" aria-label="Copy publish topic">${COPY_SVG}</button></div>`
        : `<div class="topic-row" style="margin-top:1rem;"><span class="topic-badge topic-post">POST</span><code>${escapeHtml(httpPath)}</code><button type="button" class="icon-button" data-copy="${escapeHtml(httpPath)}::Request path" aria-label="Copy request path">${COPY_SVG}</button></div>`}

      <p class="token-note" style="margin-top:1rem;">Publish telemetry data to the platform in JSON format. Supports single and batched messages sent as an array. ${pub.protocol === 'mqtt' ? 'When used with MQTT, optionally specify the request ID to subscribe on the status or error topic to get the operation result.' : 'When used over HTTP, the response body carries the operation status directly.'}</p>

      <div class="radio-field-group">
        <label class="radio-option"><input type="radio" name="payloadMode" ${pub.payloadMode === 'single' ? 'checked' : ''} data-payload-mode="single" /> Single data sample</label>
        <label class="radio-option"><input type="radio" name="payloadMode" ${pub.payloadMode === 'batched' ? 'checked' : ''} data-payload-mode="batched" /> Batched payload</label>
      </div>

      <p class="publish-subheading">Example payload:</p>
      <pre class="json-code-block">${escapeHtml(pub.payloadMode === 'single' ? exampleJson : `[\n${exampleJson}\n]`)}</pre>

      ${pub.protocol === 'mqtt' ? `
      <p class="publish-subheading" style="margin-top:1rem;">Subscribe status / error topics:</p>
      <div class="topic-row"><span class="topic-badge topic-sub">SUB</span><code>${escapeHtml(statusTopic)}</code><button type="button" class="icon-button" data-copy="${escapeHtml(statusTopic)}::Status topic" aria-label="Copy status topic">${COPY_SVG}</button></div>
      <div class="topic-row"><span class="topic-badge topic-sub">SUB</span><code>${escapeHtml(errorTopic)}</code><button type="button" class="icon-button" data-copy="${escapeHtml(errorTopic)}::Error topic" aria-label="Copy error topic">${COPY_SVG}</button></div>` : ''}

      <p class="publish-subheading" style="margin-top:1rem;">Code example</p>
      <div class="code-example-tabs">${codeTabs.map((t) => `<button type="button" class="tab-button${pub.codeTab === t ? ' active' : ''}" data-code-tab="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>
      <pre class="json-code-block">${escapeHtml(codeBlock)}</pre>
    </div>`

  container.querySelectorAll('[data-protocol]').forEach((el) => {
    el.addEventListener('change', function () {
      pub.protocol = el.getAttribute('data-protocol')
      pub.codeTab = pub.protocol === 'mqtt' ? MQTT_TABS[0] : HTTP_TABS[0]
      renderDataPublishBody(container)
    })
  })
  container.querySelectorAll('[data-payload-mode]').forEach((el) => {
    el.addEventListener('change', function () { pub.payloadMode = el.getAttribute('data-payload-mode'); renderDataPublishBody(container) })
  })
  container.querySelectorAll('[data-code-tab]').forEach((btn) => {
    btn.addEventListener('click', function () { pub.codeTab = btn.getAttribute('data-code-tab'); renderDataPublishBody(container) })
  })
  document.getElementById('copy-connection-url').addEventListener('click', function () {
    navigator.clipboard && navigator.clipboard.writeText(connectionUrl)
    showToast('Connection URL copied successfully!')
  })
  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const parts = btn.getAttribute('data-copy').split('::')
      navigator.clipboard && navigator.clipboard.writeText(parts[0])
      showToast(`${parts[1]} copied successfully!`)
    })
  })
  document.getElementById('send-sample-btn').addEventListener('click', function () {
    Store.sendDataSample(device.id)
    refreshDevice()
    showToast('Sample data sent and recorded')
  })
  const tokenInput = document.getElementById('device-token-input')
  if (tokenInput) tokenInput.addEventListener('input', function (e) { pub.deviceToken = e.target.value })
  const sendRequestBtn = document.getElementById('send-request-btn')
  if (sendRequestBtn) {
    sendRequestBtn.addEventListener('click', function () {
      Store.sendDataSample(device.id)
      refreshDevice()
      showToast('Request sent and recorded')
    })
  }
}

/* ============================================================ Data logs */

function renderDataLogsTab(container) {
  container.innerHTML = `
    <div class="device-panel">
      ${device.logs.length === 0 ? '<div class="empty-table-note"><p>No data.</p><p>Send data samples from the Data publish tab to see logs here.</p></div>' : `
      <div class="devices-table-scroll">
        <table class="data-table">
          <thead><tr><th>Correlation ID</th><th>Feature</th><th>Request ID</th><th>Direction</th><th>Resource path</th><th>Status code</th><th>Payload</th><th>Additional metadata</th><th>Created at</th></tr></thead>
          <tbody>
            ${device.logs.map((log) => `
            <tr>
              <td>${escapeHtml(log.correlationId)}</td>
              <td>${escapeHtml(log.feature)}</td>
              <td>${escapeHtml(log.requestId)}</td>
              <td><span class="direction-badge direction-${log.direction === 'inbound' ? 'up' : 'down'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="transform:rotate(${log.direction === 'outbound' ? -45 : 135}deg)"><path d="M12 19V5M6 11l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg> ${log.direction === 'inbound' ? 'INBOUND' : 'OUTBOUND'}</span></td>
              <td>${escapeHtml(log.resourcePath)}</td>
              <td>${log.statusCode == null ? '—' : log.statusCode}</td>
              <td>${jsonCellHtml(log.payload, 'log-payload-' + log.id)}</td>
              <td>${jsonCellHtml(log.additionalMetadata, 'log-meta-' + log.id)}</td>
              <td>${log.createdAt}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`
  wireJsonCells(container)
}

/* ============================================================ Boot */

function bootDeviceDetail() {
  refreshDevice()
  renderRoot()
}
