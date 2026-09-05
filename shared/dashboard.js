/* ==========================================================================
   Univa — static HTML build. Port of src/modules/dashboard/** — the
   drag-and-drop widget grid dashboard. Mirrors DashboardPage.jsx,
   DashboardCanvas.jsx, grid/*, widgets/*, WidgetPalette.jsx and
   WidgetSettingsPanel.jsx as closely as vanilla JS allows: same grid math,
   same widget registry/variant catalog, same telemetry algorithm, same
   ApexCharts config (the real app renders charts via react-apexcharts,
   a thin wrapper around the same vanilla ApexCharts library loaded here).
   ========================================================================== */

/* --------------------------------------------------- telemetry algorithm */
/* Exact port of src/modules/devices/deviceFactory.js */

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

const DEFAULT_METRICS = [{ key: 'value', label: 'Value', unit: '', baseline: 50, amplitude: 20, decimals: 1 }]
const BUCKET_MS = 60000

const RANGE_PRESETS = {
  '5m': { label: 'Last 5 minutes', windowMs: 5 * 60000, stepMs: 15000 },
  '1h': { label: 'Last 1 hour', windowMs: 60 * 60000, stepMs: 60000 },
  '24h': { label: 'Last 24 hours', windowMs: 24 * 60 * 60000, stepMs: 15 * 60000 },
  '7d': { label: 'Last 7 days', windowMs: 7 * 24 * 60 * 60000, stepMs: 60 * 60000 },
}

function telemetryValueAt(deviceId, metricKey, timestampMs, metricConfig) {
  const { baseline, amplitude, decimals } = metricConfig
  const dec = decimals == null ? 1 : decimals
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

/* ------------------------------------------------------------- svg arc */

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) }
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

function clampPercent(value, max) {
  if (!max) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

/* ------------------------------------------------------------ grid math */
/* Exact port of src/modules/dashboard/grid/gridUtils.js */

const GRID_COLS = 12
const ROW_HEIGHT = 74
const MARGIN = [14, 14]

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function hasCollision(rects, rect) {
  return rects.some((other) => rectsOverlap(rect, other))
}

function compactWidgets(widgetList, cols) {
  cols = cols || GRID_COLS
  const sorted = [...widgetList].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
  const placedRects = []
  return sorted.map((widget) => {
    const w = Math.min(widget.layout.w, cols)
    const h = widget.layout.h
    const x = Math.max(0, Math.min(cols - w, widget.layout.x))
    let y = 0
    while (hasCollision(placedRects, { x, y, w, h })) {
      y += 1
    }
    placedRects.push({ x, y, w, h })
    return Object.assign({}, widget, { layout: Object.assign({}, widget.layout, { x, y, w }) })
  })
}

function gridCellSize(containerWidth, cols, marginX) {
  cols = cols || GRID_COLS
  marginX = marginX == null ? MARGIN[0] : marginX
  return Math.max(1, (containerWidth - marginX * (cols - 1)) / cols)
}

function gridHeight(widgetList) {
  if (widgetList.length === 0) return 0
  const bottom = Math.max(...widgetList.map((widget) => widget.layout.y + widget.layout.h))
  return bottom * (ROW_HEIGHT + MARGIN[1])
}

const CARD_HEADER_HEIGHT = 42
const CARD_BODY_PADDING_Y = 24
const CARD_BODY_PADDING_X = 29

function widgetContentSize(layout, colWidth) {
  const outerWidth = layout.w * colWidth + (layout.w - 1) * MARGIN[0]
  const outerHeight = layout.h * ROW_HEIGHT + (layout.h - 1) * MARGIN[1]
  return {
    width: Math.max(20, outerWidth - CARD_BODY_PADDING_X),
    height: Math.max(20, outerHeight - CARD_HEADER_HEIGHT - CARD_BODY_PADDING_Y),
  }
}

/* ------------------------------------------------------- variant tables */
/* Exact port of src/modules/dashboard/widgets/variants/*.js */

const GAUGE_VARIANTS = [
  { id: 'speedometer', label: 'Speedometer' },
  { id: 'arc', label: 'Arc' },
  { id: 'ring', label: 'Ring' },
  { id: 'radial-full', label: 'Radial (full)' },
  { id: 'radial-half', label: 'Radial (half)' },
  { id: 'bar-horizontal', label: 'Bar (horizontal)' },
  { id: 'bar-vertical', label: 'Bar (vertical)' },
  { id: 'digital', label: 'Digital readout' },
  { id: 'led', label: 'LED segments' },
  { id: 'badge', label: 'Badge' },
]

const CHART_VARIANTS = [
  { id: 'line', label: 'Line', apexType: 'line' },
  { id: 'area', label: 'Area', apexType: 'area' },
  { id: 'bar-horizontal', label: 'Bar (horizontal)', apexType: 'bar', horizontal: true },
  { id: 'column', label: 'Column', apexType: 'bar', horizontal: false },
  { id: 'donut', label: 'Donut', apexType: 'donut' },
  { id: 'pie', label: 'Pie', apexType: 'pie' },
  { id: 'polarArea', label: 'Polar area', apexType: 'polarArea' },
  { id: 'radialBar', label: 'Radial bar', apexType: 'radialBar' },
  { id: 'radar', label: 'Radar', apexType: 'radar' },
  { id: 'scatter', label: 'Scatter', apexType: 'scatter' },
  { id: 'bubble', label: 'Bubble', apexType: 'bubble' },
  { id: 'heatmap', label: 'Heatmap', apexType: 'heatmap' },
  { id: 'combo', label: 'Combo (line + column)', apexType: 'line' },
]

const METRIC_VARIANTS = [
  { id: 'big-number', label: 'Big number' },
  { id: 'icon-leading', label: 'Icon leading' },
  { id: 'with-trend', label: 'With trend' },
  { id: 'gradient-card', label: 'Gradient card' },
  { id: 'pill-badge', label: 'Pill badge' },
  { id: 'bordered-box', label: 'Bordered box' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'label-top', label: 'Label on top' },
  { id: 'split-unit', label: 'Split unit' },
  { id: 'ring-accent', label: 'Ring accent' },
]

const TABLE_VARIANTS = [
  { id: 'basic', label: 'Basic' },
  { id: 'striped', label: 'Striped rows' },
  { id: 'bordered', label: 'Bordered cells' },
  { id: 'compact', label: 'Compact' },
  { id: 'card-rows', label: 'Card rows' },
  { id: 'dark-header', label: 'Dark header' },
  { id: 'status-badges', label: 'Status badges' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'numbered', label: 'Numbered rows' },
  { id: 'hover-highlight', label: 'Hover highlight' },
]

const STATUS_LIST_VARIANTS = [
  { id: 'dot-list', label: 'Dot list' },
  { id: 'badge-list', label: 'Badge list' },
  { id: 'icon-list', label: 'Icon list' },
  { id: 'card-grid', label: 'Card grid' },
  { id: 'avatar-list', label: 'Avatar list' },
  { id: 'progress-rows', label: 'Progress rows' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'table-style', label: 'Table style' },
  { id: 'compact-chips', label: 'Compact chips' },
  { id: 'minimal-text', label: 'Minimal text' },
]

const PROGRESS_VARIANTS = [
  { id: 'ring', label: 'Ring' },
  { id: 'semi-ring', label: 'Semi ring' },
  { id: 'linear-bar', label: 'Linear bar' },
  { id: 'vertical-bar', label: 'Vertical bar' },
  { id: 'stepped', label: 'Stepped' },
  { id: 'dial', label: 'Dial' },
  { id: 'concentric', label: 'Concentric' },
  { id: 'liquid-fill', label: 'Liquid fill' },
  { id: 'badge-percent', label: 'Badge percent' },
  { id: 'checklist', label: 'Checklist' },
]

const EXTRA_VARIANTS = [
  { id: 'sparkline', label: 'Sparkline', layout: { w: 3, h: 2, minW: 2, minH: 2 } },
  { id: 'comparison', label: 'Comparison', layout: { w: 3, h: 2, minW: 2, minH: 2 } },
  { id: 'clock', label: 'Clock', layout: { w: 2, h: 2, minW: 2, minH: 2 } },
  { id: 'note', label: 'Note', layout: { w: 3, h: 3, minW: 2, minH: 2 } },
  { id: 'alert-feed', label: 'Alert feed', layout: { w: 3, h: 4, minW: 2, minH: 3 } },
  { id: 'kpi-grid', label: 'KPI grid', layout: { w: 4, h: 3, minW: 3, minH: 2 } },
  { id: 'task-list', label: 'Task list', layout: { w: 3, h: 4, minW: 2, minH: 3 } },
  { id: 'leaderboard', label: 'Leaderboard', layout: { w: 3, h: 4, minW: 2, minH: 3 } },
  { id: 'health-score', label: 'Health score', layout: { w: 2, h: 3, minW: 2, minH: 2 } },
  { id: 'network-status', label: 'Network status', layout: { w: 4, h: 2, minW: 3, minH: 2 } },
  { id: 'weather', label: 'Weather', layout: { w: 2, h: 2, minW: 2, minH: 2 } },
]

const VARIANT_FAMILIES = {
  gauge: GAUGE_VARIANTS,
  chart: CHART_VARIANTS,
  metric: METRIC_VARIANTS,
  table: TABLE_VARIANTS,
  'status-list': STATUS_LIST_VARIANTS,
  progress: PROGRESS_VARIANTS,
  extra: EXTRA_VARIANTS,
}

function getVariantMeta(family, variantId) {
  return (VARIANT_FAMILIES[family] || []).find((v) => v.id === variantId) || null
}

/* ------------------------------------------------------- widget registry */
/* Exact port of src/modules/dashboard/widgets/widgetRegistry.js */

const GAUGE_LAYOUT = { w: 2, h: 3, minW: 2, minH: 3 }
const CHART_LAYOUT = { w: 4, h: 4, minW: 3, minH: 3 }
const METRIC_LAYOUT = { w: 2, h: 2, minW: 2, minH: 2 }
const TABLE_LAYOUT = { w: 6, h: 5, minW: 4, minH: 3 }
const STATUS_LIST_LAYOUT = { w: 3, h: 5, minW: 2, minH: 3 }
const PROGRESS_LAYOUT = { w: 2, h: 3, minW: 2, minH: 3 }
const EXTRA_LAYOUT = { w: 3, h: 3, minW: 2, minH: 2 }

function gaugeEntry(type, label, description, unit, max) {
  return {
    type, label, icon: 'gauge', description, variantFamily: 'gauge', defaultVariant: 'speedometer',
    defaultTitle: label, defaultLayout: GAUGE_LAYOUT, defaultSettings: { unit, max },
    defaultDataSource: { deviceId: null, metricKey: 'value' },
  }
}
function chartEntry(type, label, description) {
  return {
    type, label, icon: 'chart', description, variantFamily: 'chart', defaultVariant: 'line',
    defaultTitle: label, defaultLayout: CHART_LAYOUT, defaultSettings: {},
    defaultDataSource: { deviceId: null, metricKey: 'value', range: '1h' },
  }
}
function tableEntry(type, label, description, tableKind) {
  return {
    type, label, icon: 'table', description, variantFamily: 'table', defaultVariant: 'basic',
    defaultTitle: label, defaultLayout: TABLE_LAYOUT, defaultSettings: {}, defaultDataSource: { table: tableKind },
  }
}

const widgetRegistry = {
  'temperature-gauge': gaugeEntry('temperature-gauge', 'Temperature gauge', 'Live temperature reading for a device.', '°C', 60),
  'humidity-gauge': gaugeEntry('humidity-gauge', 'Humidity gauge', 'Relative humidity reading for a device.', '%', 100),
  'battery-gauge': gaugeEntry('battery-gauge', 'Battery gauge', 'Battery level for a device.', '%', 100),
  'signal-gauge': gaugeEntry('signal-gauge', 'Signal gauge', 'Connectivity signal strength.', '%', 100),
  'cpu-gauge': gaugeEntry('cpu-gauge', 'CPU gauge', 'Processor load on a device.', '%', 100),
  'memory-gauge': gaugeEntry('memory-gauge', 'Memory gauge', 'Memory usage on a device.', '%', 100),
  'pressure-gauge': gaugeEntry('pressure-gauge', 'Pressure gauge', 'Ambient pressure reading.', 'hPa', 1100),
  'co2-gauge': gaugeEntry('co2-gauge', 'CO2 gauge', 'CO2 concentration reading.', 'ppm', 2000),
  'uptime-gauge': gaugeEntry('uptime-gauge', 'Uptime gauge', 'Rolling uptime percentage.', '%', 100),
  'message-rate-gauge': gaugeEntry('message-rate-gauge', 'Message rate gauge', 'Inbound message rate.', 'msg/min', 120),

  'trend-chart': chartEntry('trend-chart', 'Telemetry trend', 'Time series for a device metric.'),
  'uptime-chart': chartEntry('uptime-chart', 'Uptime chart', 'Uptime percentage over time.'),
  'message-rate-chart': chartEntry('message-rate-chart', 'Message rate chart', 'Message throughput over time.'),
  'battery-chart': chartEntry('battery-chart', 'Battery chart', 'Battery drain/charge over time.'),
  'temperature-chart': chartEntry('temperature-chart', 'Temperature chart', 'Temperature over time.'),
  'humidity-chart': chartEntry('humidity-chart', 'Humidity chart', 'Humidity over time.'),
  'alarm-chart': chartEntry('alarm-chart', 'Alarm chart', 'Active alerts across devices.'),
  'rule-execution-chart': chartEntry('rule-execution-chart', 'Rule engine executions chart', 'Rule engine outcomes over time.'),
  'asset-count-chart': chartEntry('asset-count-chart', 'Asset status chart', 'Assets grouped by status.'),
  'device-status-chart': chartEntry('device-status-chart', 'Device status chart', 'Devices grouped by connectivity.'),
  'load-chart': chartEntry('load-chart', 'Load chart', 'Utilization/load over time.'),
  'comparison-chart': chartEntry('comparison-chart', 'Comparison chart', 'Two devices compared over time.'),
  'actual-vs-target-chart': chartEntry('actual-vs-target-chart', 'Actual vs target chart', 'Metric against a target line.'),

  metric: {
    type: 'metric', label: 'Metric card', icon: 'metric', description: 'A single live value with optional trend.',
    variantFamily: 'metric', defaultVariant: 'big-number', defaultTitle: 'Metric', defaultLayout: METRIC_LAYOUT,
    defaultSettings: {}, defaultDataSource: { deviceId: null, metricKey: 'value' },
  },

  table: tableEntry('table', 'Readings table', 'Latest telemetry readings for a device.', 'readings'),
  'alarm-log-table': tableEntry('alarm-log-table', 'Alarm log table', 'Alerts raised across all devices.', 'alarms'),
  'rule-engine-log-table': tableEntry('rule-engine-log-table', 'Rule engine log table', 'Recent rule engine executions.', 'executions'),
  'device-list-table': tableEntry('device-list-table', 'Device list table', 'All devices and their status.', 'devices'),
  'asset-list-table': tableEntry('asset-list-table', 'Asset list table', 'All assets and their status.', 'assets'),
  'command-log-table': tableEntry('command-log-table', 'Command log table', 'Recent commands sent to devices.', 'commands'),

  'status-list': {
    type: 'status-list', label: 'Device status list', icon: 'list', description: 'Connectivity status for every device.',
    variantFamily: 'status-list', defaultVariant: 'dot-list', defaultTitle: 'Device status', defaultLayout: STATUS_LIST_LAYOUT,
    defaultSettings: {}, defaultDataSource: {},
  },

  progress: {
    type: 'progress', label: 'Progress', icon: 'progress', description: 'A metric shown as progress toward its max value.',
    variantFamily: 'progress', defaultVariant: 'ring', defaultTitle: 'Progress', defaultLayout: PROGRESS_LAYOUT,
    defaultSettings: { max: 100 }, defaultDataSource: { deviceId: null, metricKey: 'value' },
  },

  'more-widgets': {
    type: 'more-widgets', label: 'More widgets', icon: 'kpi', description: 'Sparklines, clocks, notes, alert feeds, and other small widgets.',
    variantFamily: 'extra', defaultVariant: 'sparkline', defaultTitle: 'Widget', defaultLayout: EXTRA_LAYOUT,
    defaultSettings: {}, defaultDataSource: { deviceId: null, metricKey: 'value' },
  },
}

const CROSSED_FAMILIES = new Set(['gauge', 'chart', 'table'])

const CATEGORY_BY_FAMILY = {
  gauge: 'Gauges', chart: 'Charts', table: 'Tables', metric: 'Cards & lists',
  'status-list': 'Cards & lists', progress: 'Cards & lists', extra: 'More widgets',
}
const CATEGORY_ORDER = ['Gauges', 'Charts', 'Tables', 'Cards & lists', 'More widgets']

function buildCatalog() {
  const tiles = []
  Object.values(widgetRegistry).forEach((meta) => {
    const variants = VARIANT_FAMILIES[meta.variantFamily] || []
    const category = CATEGORY_BY_FAMILY[meta.variantFamily] || 'More widgets'
    if (CROSSED_FAMILIES.has(meta.variantFamily)) {
      tiles.push({ key: meta.type, type: meta.type, label: meta.label, description: meta.description, icon: meta.icon, category, hasStyles: true, variants, defaultVariant: meta.defaultVariant })
    } else {
      variants.forEach((variant) => {
        tiles.push({ key: `${meta.type}::${variant.id}`, type: meta.type, label: variants.length > 1 ? `${meta.label} · ${variant.label}` : meta.label, description: meta.description, icon: meta.icon, category, hasStyles: false, variantId: variant.id })
      })
    }
  })
  return tiles
}

/* ------------------------------------------------------- default layout */
/* Exact port of src/modules/dashboard/useDashboardLayout.js */

const DASHBOARD_STORAGE_KEY = 'univa_dashboard_layout_v1'
const SELECTED_DEVICE_STORAGE_KEY = 'univa_dashboard_device_id'
const NEW_WIDGET_SORT_Y = 9999
let widgetIdCounter = 0

function fromRegistry(type, x, y, id, variant, overrides) {
  overrides = overrides || {}
  const meta = widgetRegistry[type]
  const chosenVariant = variant || meta.defaultVariant
  const variantMeta = getVariantMeta(meta.variantFamily, chosenVariant)
  const layout = overrides.layout ? Object.assign({}, meta.defaultLayout, overrides.layout) : (variantMeta && variantMeta.layout) || meta.defaultLayout
  return {
    id, type, title: overrides.title || meta.defaultTitle, variant: chosenVariant,
    layout: { x, y, w: layout.w, h: layout.h, minW: layout.minW, minH: layout.minH },
    settings: Object.assign({}, meta.defaultSettings, overrides.settings),
    dataSource: Object.assign({}, meta.defaultDataSource, overrides.dataSource),
    fields: overrides.fields || [], headerStyle: overrides.headerStyle || {},
  }
}

function buildDefaultWidgetsRaw() {
  return [
    fromRegistry('temperature-gauge', 0, 0, 'widget-temperature-gauge-default'),
    fromRegistry('battery-gauge', 2, 0, 'widget-battery-gauge-default'),
    fromRegistry('cpu-gauge', 4, 0, 'widget-cpu-gauge-default'),
    fromRegistry('memory-gauge', 6, 0, 'widget-memory-gauge-default'),
    fromRegistry('signal-gauge', 8, 0, 'widget-signal-gauge-default'),
    fromRegistry('uptime-gauge', 10, 0, 'widget-uptime-gauge-default'),
    fromRegistry('humidity-gauge', 0, 3, 'widget-humidity-gauge-default'),
    fromRegistry('pressure-gauge', 2, 3, 'widget-pressure-gauge-default'),
    fromRegistry('co2-gauge', 4, 3, 'widget-co2-gauge-default'),
    fromRegistry('message-rate-gauge', 6, 3, 'widget-message-rate-gauge-default'),
    fromRegistry('metric', 8, 3, 'widget-metric-devices-default', 'big-number', { title: 'Active devices', dataSource: { stat: 'device-count' }, layout: { w: 2, h: 3 } }),
    fromRegistry('metric', 10, 3, 'widget-metric-alerts-default', 'with-trend', { title: 'Active alerts', dataSource: { stat: 'active-alert-count' }, layout: { w: 2, h: 3 } }),
    fromRegistry('progress', 0, 6, 'widget-progress-default', 'ring', { title: 'Storage used', layout: { w: 2, h: 3 } }),
    fromRegistry('status-list', 2, 6, 'widget-status-list-default', undefined, { layout: { w: 2, h: 3 } }),
    fromRegistry('device-list-table', 4, 6, 'widget-device-table-default', undefined, { layout: { w: 4, h: 3 } }),
    fromRegistry('asset-list-table', 8, 6, 'widget-asset-table-default', undefined, { layout: { w: 4, h: 3 } }),
    fromRegistry('command-log-table', 0, 9, 'widget-command-log-default', undefined, { layout: { w: 6, h: 3 } }),
    fromRegistry('table', 6, 9, 'widget-readings-table-default', undefined, { layout: { w: 6, h: 3 } }),
    fromRegistry('alarm-log-table', 0, 12, 'widget-alarm-log-default', undefined, { layout: { w: 6, h: 3 } }),
    fromRegistry('rule-engine-log-table', 6, 12, 'widget-rule-engine-log-default', undefined, { layout: { w: 6, h: 3 } }),
    fromRegistry('trend-chart', 0, 15, 'widget-trend-chart-default', 'line', { title: 'Telemetry trend', layout: { w: 6, h: 4 } }),
    fromRegistry('uptime-chart', 6, 15, 'widget-uptime-chart-default', 'area', { layout: { w: 6, h: 4 } }),
    fromRegistry('message-rate-chart', 0, 19, 'widget-message-rate-chart-default', 'area', { layout: { w: 6, h: 4 } }),
    fromRegistry('battery-chart', 6, 19, 'widget-battery-chart-default', 'column', { layout: { w: 6, h: 4 } }),
    fromRegistry('temperature-chart', 0, 23, 'widget-temperature-chart-default', 'line', { layout: { w: 6, h: 4 } }),
    fromRegistry('humidity-chart', 6, 23, 'widget-humidity-chart-default', 'bar-horizontal', { layout: { w: 6, h: 4 } }),
    fromRegistry('alarm-chart', 0, 27, 'widget-alarm-chart-default', 'donut', { layout: { w: 6, h: 4 } }),
    fromRegistry('rule-execution-chart', 6, 27, 'widget-rule-execution-chart-default', 'pie', { layout: { w: 6, h: 4 } }),
    fromRegistry('asset-count-chart', 0, 31, 'widget-asset-count-chart-default', 'polarArea', { layout: { w: 6, h: 4 } }),
    fromRegistry('device-status-chart', 6, 31, 'widget-device-status-chart-default', 'radialBar', { layout: { w: 6, h: 4 } }),
    fromRegistry('load-chart', 0, 35, 'widget-load-chart-default', 'area', { layout: { w: 6, h: 4 } }),
    fromRegistry('comparison-chart', 6, 35, 'widget-comparison-chart-default', 'line', { layout: { w: 6, h: 4 } }),
    fromRegistry('actual-vs-target-chart', 0, 39, 'widget-actual-vs-target-chart-default', 'line', { layout: { w: 6, h: 4 } }),
    fromRegistry('more-widgets', 6, 39, 'widget-comparison-extra-default', 'comparison', { title: 'Device comparison', layout: { w: 3, h: 4 } }),
    fromRegistry('more-widgets', 9, 39, 'widget-note-default', 'note', { title: 'Note', layout: { w: 3, h: 4 } }),
    fromRegistry('more-widgets', 0, 43, 'widget-sparkline-default', 'sparkline', { title: 'Recent values', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 4, 43, 'widget-clock-default', 'clock', { title: 'Clock', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 8, 43, 'widget-alert-feed-default', 'alert-feed', { title: 'Recent alerts', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 0, 46, 'widget-kpi-grid-default', 'kpi-grid', { title: 'KPI grid', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 4, 46, 'widget-task-list-default', 'task-list', { title: 'Task list', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 8, 46, 'widget-leaderboard-default', 'leaderboard', { title: 'Leaderboard', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 0, 49, 'widget-health-score-default', 'health-score', { title: 'Fleet health', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 4, 49, 'widget-network-status-default', 'network-status', { title: 'Network status', layout: { w: 4, h: 3 } }),
    fromRegistry('more-widgets', 8, 49, 'widget-weather-default', 'weather', { title: 'Weather', layout: { w: 4, h: 3 } }),
  ]
}

function getDefaultWidgets() {
  return compactWidgets(buildDefaultWidgetsRaw(), GRID_COLS)
}

function loadLayoutFromStorage() {
  try {
    const raw = localStorage.getItem(DASHBOARD_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch (err) {
    return null
  }
}
function saveLayoutToStorage(list) {
  try { localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(list)) } catch (err) { /* unavailable */ }
}

/* ---------------------------------------------------------- data hooks */
/* Plain-function port of src/modules/dashboard/widgets/dataHooks.js */

function getDevices() { return Store.get().devices || [] }
function getAssets() { return Store.get().assets || [] }
function getRuleEngines() { return Store.get().ruleEngines || [] }
function getRuleEngineExecutions() { return Store.get().ruleEngineExecutions || [] }

function resolveMetric(device, metricKey) {
  const metrics = device && device.metrics && device.metrics.length ? device.metrics : DEFAULT_METRICS
  return metrics.find((m) => m.key === metricKey) || metrics[0]
}

const EXAMPLE_DEVICE_ID = 'example-device'
const EXAMPLE_METRIC = DEFAULT_METRICS[0]

function findDevice(deviceId) {
  if (!deviceId) return null
  return getDevices().find((d) => d.id === deviceId) || null
}

function widgetValue(device, metricKey, salt) {
  const deviceId = (device && device.id) || EXAMPLE_DEVICE_ID
  const metric = device ? resolveMetric(device, metricKey) : EXAMPLE_METRIC
  const seedKey = salt ? `${metric.key}::${salt}` : metric.key
  const value = telemetryValueAt(deviceId, seedKey, Date.now(), metric)
  return { value, unit: metric.unit, label: metric.label, metric }
}

function widgetSeries(device, metricKey, range, salt) {
  const deviceId = (device && device.id) || EXAMPLE_DEVICE_ID
  const metric = device ? resolveMetric(device, metricKey) : EXAMPLE_METRIC
  const rangeKey = RANGE_PRESETS[range] ? range : '1h'
  const seedKey = salt ? `${metric.key}::${salt}` : metric.key
  const points = generateTelemetrySeries(deviceId, seedKey, metric, rangeKey, Date.now())
  return { points, unit: metric.unit, label: metric.label, metric }
}

function statValue(stat) {
  if (!stat) return null
  const devices = getDevices()
  const assets = getAssets()
  const ruleEngines = getRuleEngines()
  const activeAlertCount = devices.reduce((sum, d) => sum + ((d.alerts || []).filter((a) => a.state === 'active').length), 0)
  const STAT_VALUES = {
    'device-count': { value: devices.length, unit: '', label: 'Devices' },
    'active-alert-count': { value: activeAlertCount, unit: '', label: 'Active alerts' },
    'asset-count': { value: assets.length, unit: '', label: 'Assets' },
    'rule-engine-count': { value: ruleEngines.length, unit: '', label: 'Rule engines' },
  }
  return STAT_VALUES[stat] || { value: 0, unit: '', label: stat }
}

function connectivitySnapshot(deviceId, now) {
  now = now || Date.now()
  if (!deviceId) return { online: false, uptimePct: 0 }
  const bucket = Math.floor(now / 30000)
  const seed = `${deviceId}:${bucket}`
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const roll = (hash >>> 0) / 4294967296
  const online = roll > 0.12
  const uptimePct = Math.round(82 + roll * 18)
  return { online, uptimePct }
}

function buildDeviceRows(devices) {
  return devices.map((d) => ({ id: d.id, name: d.name, application: d.applicationName || d.profileName, status: d.state, activeAlerts: (d.alerts || []).filter((a) => a.state === 'active').length, createdDate: d.createdDate }))
}
function buildAssetRows(assets) {
  return assets.map((a) => ({ id: a.id, name: a.name, groups: (a.groupNames && a.groupNames.join(', ')) || '—', profile: a.profileName, status: a.status, location: a.location }))
}
function buildAlarmRows(devices) {
  const rows = []
  devices.forEach((device) => {
    (device.alerts || []).forEach((alert) => {
      rows.push({ id: alert.id, device: device.name, alertType: alert.alertType, severity: alert.severity, state: alert.state, createdDate: alert.createdDate })
    })
  })
  return rows.sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1))
}
function buildCommandRows(devices) {
  const rows = []
  devices.forEach((device) => {
    (device.commands || []).forEach((command) => {
      rows.push({ id: command.id, device: device.name, name: command.name, status: command.status, createdDate: command.createdDate })
    })
  })
  return rows.sort((a, b) => (a.createdDate < b.createdDate ? 1 : -1))
}
function buildExecutionRows(executions) {
  return executions.map((e) => ({ id: e.id, ruleEngine: e.ruleEngineName, triggeredAt: e.triggeredAt, triggerType: e.triggerType, action: e.actionType, outcome: e.outcome }))
}

/* -------------------------------------------------------------- icons */

const WIDGET_ICON_SVG = {
  gauge: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 16a8 8 0 1 1 16 0" stroke-linecap="round"/><path d="M12 16 16 9" stroke-linecap="round"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V4M4 20h16" stroke-linecap="round"/><path d="M7 16l3.5-5 3 3L18 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  metric: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7.5 15V10M12 15v-3M16.5 15V8" stroke-linecap="round"/></svg>',
  table: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M9.5 4.5v15" stroke-linecap="round"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12" stroke-linecap="round"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>',
  progress: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8" stroke-opacity="0.3"/><path d="M12 4a8 8 0 0 1 6.9 4" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4.5h14v15H5z"/><path d="M8 9h8M8 13h8M8 17h5" stroke-linecap="round"/></svg>',
  alert: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 21 19H3L12 3.5Z" stroke-linejoin="round"/><path d="M12 10v4" stroke-linecap="round"/><circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none"/></svg>',
  kpi: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/></svg>',
  task: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6.5l1.5 1.5L9 5.5M5 13l1.5 1.5L9 12M5 19.5l1.5 1.5L9 18.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 6.5h7M12 13h7M12 19.5h7" stroke-linecap="round"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5h8v5a4 4 0 0 1-8 0V5Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" stroke-linecap="round"/><path d="M12 14v3M9 20.5h6M10 17.5h4v3h-4z" stroke-linecap="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-9.3-8.9C1.2 8 3 5 6.2 5c1.9 0 3.3 1 4.8 2.7 1.5-1.7 2.9-2.7 4.8-2.7 3.2 0 5 3 3.5 6.1C19 15.6 12 20 12 20Z" stroke-linejoin="round"/></svg>',
  network: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="4" cy="12" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="20" cy="18" r="2"/><path d="M6 12h4l4-6h4M10 12l4 6h4" stroke-linecap="round"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 17.5a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.2 8a3.8 3.8 0 0 1 .8 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sparkline: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 14l4-3 3 4 4-8 4 3 3-5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  compare: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v16M6 8l-3 4 3 4M18 8l3 4-3 4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}
function widgetIconSvg(name) { return WIDGET_ICON_SVG[name] || WIDGET_ICON_SVG.gauge }

const GEAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7 16 16M8 8 6.3 6.3" stroke-linecap="round"/></svg>'
const TRASH_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7M6 7l1 13.2A1.8 1.8 0 0 0 8.8 22h6.4a1.8 1.8 0 0 0 1.8-1.8L18 7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const MOVE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18M6 7l-3 5 3 5M18 7l3 5-3 5M7 6l5-3 5 3M7 18l5 3 5-3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const DRAG_HANDLE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="8" cy="6" r="1.4"/><circle cx="16" cy="6" r="1.4"/><circle cx="8" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/><circle cx="8" cy="18" r="1.4"/><circle cx="16" cy="18" r="1.4"/></svg>'
const PLUS_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>'
const CLOSE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>'
const BACK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const SEARCH_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg>'
function caretSvg(expanded) {
  return `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" class="caret-icon${expanded ? ' expanded' : ''}"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/* ============================================================
   Widget content renderers — one per family, switching on variant.
   Each returns { html, mount(el) } where mount() is optional and
   wires up anything that needs a live DOM node (charts, textareas).
   ============================================================ */

const ZONE_COLORS = [{ limit: 60, color: '#16a34a' }, { limit: 85, color: '#d97706' }, { limit: 101, color: '#dc2626' }]
function zoneColor(pct) { return (ZONE_COLORS.find((z) => pct <= z.limit) || ZONE_COLORS[ZONE_COLORS.length - 1]).color }

function gaugeArcSvg(pct, color, sweep, thickness, inner) {
  sweep = sweep || 270
  thickness = thickness || 10
  const start = -sweep / 2
  const end = sweep / 2
  const valueAngle = start + (sweep * pct) / 100
  return `<svg viewBox="0 0 120 90" class="gauge-svg"><path d="${describeArc(60, 60, 46, start, end)}" fill="none" stroke="#e7e5e4" stroke-width="${thickness}" stroke-linecap="round"/><path d="${describeArc(60, 60, 46, start, valueAngle)}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round"/>${inner || ''}</svg>`
}
function gaugeNeedleSvg(pct, sweep) {
  sweep = sweep || 270
  const start = -sweep / 2
  const angleDeg = start + (sweep * pct) / 100
  return `<g transform="rotate(${angleDeg} 60 60)"><line x1="60" y1="60" x2="60" y2="24" stroke="#1c1917" stroke-width="2.4" stroke-linecap="round"/><circle cx="60" cy="60" r="4" fill="#1c1917"/></g>`
}

function renderGaugeContent(config) {
  const variant = config.variant
  const settings = config.settings || {}
  const device = findDevice(config.dataSource && config.dataSource.deviceId)
  const reading = widgetValue(device, config.dataSource && config.dataSource.metricKey, config.type)
  const max = settings.max || 100
  const pct = clampPercent(reading.value, max)
  const color = zoneColor(pct)
  const unit = settings.unit || reading.unit
  const value = reading.value
  const label = escapeHtml(reading.label)

  switch (variant) {
    case 'arc':
      return `<div class="gauge-widget gauge-arc">${gaugeArcSvg(pct, color, 180, 12)}<div class="gauge-value gauge-value-arc">${value}<span class="gauge-unit">${unit}</span></div></div>`
    case 'ring':
      return `<div class="gauge-widget gauge-ring"><svg viewBox="0 0 36 36" class="gauge-ring-svg"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#e7e5e4" stroke-width="3.4"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="${(pct / 100) * 97.4} 97.4" transform="rotate(-90 18 18)"/></svg><div class="gauge-ring-center"><span class="gauge-value">${value}</span><span class="gauge-unit">${unit}</span></div></div>`
    case 'radial-full':
      return `<div class="gauge-widget gauge-radial"><svg viewBox="0 0 120 120" class="gauge-svg"><circle cx="60" cy="60" r="46" fill="none" stroke="#e7e5e4" stroke-width="11"/><circle cx="60" cy="60" r="46" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(pct / 100) * 289} 289" transform="rotate(-90 60 60)"/></svg><div class="gauge-value gauge-value-arc">${pct.toFixed(0)}%</div><div class="gauge-label">${label}</div></div>`
    case 'radial-half':
      return `<div class="gauge-widget gauge-radial gauge-radial-half">${gaugeArcSvg(pct, color, 180, 11)}<div class="gauge-value gauge-value-arc">${pct.toFixed(0)}%</div><div class="gauge-label">${label}</div></div>`
    case 'bar-horizontal':
      return `<div class="gauge-widget gauge-bar-horizontal"><div class="gauge-bar-track"><div class="gauge-bar-fill" style="width:${pct}%;background:${color}"></div></div><div class="gauge-bar-readout"><span class="gauge-value">${value}</span><span class="gauge-unit">${unit}</span></div></div>`
    case 'bar-vertical':
      return `<div class="gauge-widget gauge-bar-vertical"><div class="gauge-bar-vertical-track"><div class="gauge-bar-vertical-fill" style="height:${pct}%;background:${color}"></div></div><div class="gauge-bar-readout"><span class="gauge-value">${value}</span><span class="gauge-unit">${unit}</span></div></div>`
    case 'digital':
      return `<div class="gauge-widget gauge-digital"><div class="gauge-digital-readout" style="color:${color}">${value}<span class="gauge-unit">${unit}</span></div><div class="gauge-label">${label}</div></div>`
    case 'led': {
      const segments = 20
      const lit = Math.round((pct / 100) * segments)
      let strip = ''
      for (let i = 0; i < segments; i++) strip += `<span class="gauge-led-segment${i < lit ? ' lit' : ''}"${i < lit ? ` style="background:${color}"` : ''}></span>`
      return `<div class="gauge-widget gauge-led"><div class="gauge-led-strip">${strip}</div><div class="gauge-value">${value}<span class="gauge-unit">${unit}</span></div></div>`
    }
    case 'badge':
      return `<div class="gauge-widget gauge-badge"><span class="gauge-badge-pill" style="background:${color}1a;color:${color}">${value}${unit}</span><div class="gauge-label">${label}</div></div>`
    case 'speedometer':
    default:
      return `<div class="gauge-widget gauge-speedometer">${gaugeArcSvg(pct, color, 270, 9, gaugeNeedleSvg(pct, 270))}<div class="gauge-value">${value}<span class="gauge-unit">${unit}</span></div><div class="gauge-label">${label}</div></div>`
  }
}

const METRIC_MODIFIER_CLASS = {
  'big-number': 'metric-big-number', 'icon-leading': 'metric-icon-leading', 'with-trend': 'metric-with-trend',
  'gradient-card': 'metric-gradient-card', 'pill-badge': 'metric-pill-badge', 'bordered-box': 'metric-bordered-box',
  minimal: 'metric-minimal', 'label-top': 'metric-label-top',
}
function renderMetricContent(config) {
  const variant = config.variant
  const settings = config.settings || {}
  if (config.fields && config.fields.length > 0) return ''
  const stat = config.dataSource && config.dataSource.stat
  let reading
  if (stat) {
    const s = statValue(stat)
    reading = { value: s.value, unit: s.unit, label: s.label }
  } else {
    const device = findDevice(config.dataSource && config.dataSource.deviceId)
    reading = widgetValue(device, config.dataSource && config.dataSource.metricKey, config.type)
  }
  const value = reading.value
  const unit = reading.unit
  const label = escapeHtml(reading.label)
  const trendUp = Math.sin(Date.now() / 60000 + value) > 0

  if (variant === 'split-unit') {
    return `<div class="metric-widget metric-split-unit"><span class="metric-split-value">${value}</span><span class="metric-split-unit-label">${settings.unit || unit}</span><div class="metric-caption">${label}</div></div>`
  }
  if (variant === 'ring-accent') {
    const pct = clampPercent(value, settings.max || 100)
    return `<div class="metric-widget metric-ring-accent"><svg viewBox="0 0 36 36" class="metric-ring-svg"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#e7e5e4" stroke-width="3"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(pct / 100) * 97.4} 97.4" transform="rotate(-90 18 18)"/></svg><div class="metric-ring-center"><span class="metric-value">${value}</span><span class="metric-unit">${unit}</span></div><div class="metric-caption">${label}</div></div>`
  }

  const modifier = METRIC_MODIFIER_CLASS[variant] || 'metric-big-number'
  let html = `<div class="metric-widget ${modifier}">`
  if (variant === 'icon-leading') html += `<span class="metric-icon-wrap">${widgetIconSvg('metric')}</span>`
  html += '<div class="metric-body">'
  if (variant === 'label-top') html += `<div class="metric-caption metric-caption-top">${label}</div>`
  html += `<div class="metric-value-row"><span class="metric-value">${value}</span><span class="metric-unit">${unit}</span></div>`
  if (variant !== 'label-top') html += `<div class="metric-caption">${label}</div>`
  if (variant === 'with-trend') {
    html += `<span class="metric-trend${trendUp ? ' up' : ' down'}">${trendUp ? '▲' : '▼'} ${Math.abs(value % 7).toFixed(1)}%</span>`
  }
  html += '</div></div>'
  return html
}

function renderProgressContent(config) {
  const variant = config.variant
  const settings = config.settings || {}
  const device = findDevice(config.dataSource && config.dataSource.deviceId)
  const reading = widgetValue(device, config.dataSource && config.dataSource.metricKey, config.type)
  const max = settings.max || 100
  const pct = clampPercent(reading.value, max)
  const label = escapeHtml(reading.label)

  if (variant === 'ring' || variant === 'semi-ring' || variant === 'dial') {
    const sweep = variant === 'semi-ring' ? 180 : variant === 'dial' ? 270 : 360
    const start = -sweep / 2
    const end = start + (sweep * pct) / 100
    let svg
    if (sweep === 360) {
      svg = `<circle cx="60" cy="60" r="48" fill="none" stroke="#e7e5e4" stroke-width="10"/><circle cx="60" cy="60" r="48" fill="none" stroke="#7c3aed" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(pct / 100) * 301.6} 301.6" transform="rotate(-90 60 60)"/>`
    } else {
      svg = `<path d="${describeArc(60, 60, 48, start, start + sweep)}" fill="none" stroke="#e7e5e4" stroke-width="10" stroke-linecap="round"/><path d="${describeArc(60, 60, 48, start, end)}" fill="none" stroke="#7c3aed" stroke-width="10" stroke-linecap="round"/>`
    }
    return `<div class="progress-widget progress-ring"><svg viewBox="0 0 120 120" class="progress-ring-svg">${svg}</svg><div class="progress-ring-center"><span class="progress-value">${pct.toFixed(0)}%</span><span class="progress-caption">${label}</span></div></div>`
  }
  if (variant === 'linear-bar') {
    return `<div class="progress-widget progress-linear"><div class="progress-linear-head"><span>${label}</span><span>${reading.value}${reading.unit}</span></div><div class="progress-linear-track"><div class="progress-linear-fill" style="width:${pct}%"></div></div></div>`
  }
  if (variant === 'vertical-bar') {
    return `<div class="progress-widget progress-vertical"><div class="progress-vertical-track"><div class="progress-vertical-fill" style="height:${pct}%"></div></div><span class="progress-value">${pct.toFixed(0)}%</span></div>`
  }
  if (variant === 'stepped') {
    const steps = 10
    const filled = Math.round((pct / 100) * steps)
    let track = ''
    for (let i = 0; i < steps; i++) track += `<span class="progress-step${i < filled ? ' filled' : ''}"></span>`
    return `<div class="progress-widget progress-stepped"><div class="progress-stepped-track">${track}</div><span class="progress-value">${pct.toFixed(0)}%</span></div>`
  }
  if (variant === 'concentric') {
    const secondaryPct = pct * 0.65
    return `<div class="progress-widget progress-concentric"><svg viewBox="0 0 120 120" class="progress-ring-svg"><circle cx="60" cy="60" r="50" fill="none" stroke="#e7e5e4" stroke-width="7"/><circle cx="60" cy="60" r="50" fill="none" stroke="#7c3aed" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(pct / 100) * 314} 314" transform="rotate(-90 60 60)"/><circle cx="60" cy="60" r="36" fill="none" stroke="#e7e5e4" stroke-width="7"/><circle cx="60" cy="60" r="36" fill="none" stroke="#16a34a" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(secondaryPct / 100) * 226} 226" transform="rotate(-90 60 60)"/></svg><div class="progress-ring-center"><span class="progress-value">${pct.toFixed(0)}%</span></div></div>`
  }
  if (variant === 'liquid-fill') {
    return `<div class="progress-widget progress-liquid"><div class="progress-liquid-shell"><div class="progress-liquid-fill" style="height:${pct}%"></div><span class="progress-liquid-value">${pct.toFixed(0)}%</span></div></div>`
  }
  if (variant === 'checklist') {
    const steps = 10
    const done = Math.round((pct / 100) * steps)
    let boxes = ''
    for (let i = 0; i < steps; i++) boxes += `<span class="progress-checkbox${i < done ? ' checked' : ''}">${i < done ? '✓' : ''}</span>`
    return `<div class="progress-widget progress-checklist">${boxes}<div class="progress-caption">${pct.toFixed(0)}% of ${label}</div></div>`
  }
  return `<div class="progress-widget progress-badge-percent"><span class="progress-badge">${pct.toFixed(0)}%</span><div class="progress-caption">${label}</div></div>`
}

function initials(name) {
  return String(name).split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}
function renderStatusListContent(config) {
  const variant = config.variant
  const devices = getDevices()
  if (devices.length === 0) return '<div class="widget-empty-note">No devices yet.</div>'
  const rows = devices.map((device) => {
    const snap = connectivitySnapshot(device.id)
    const activeAlerts = (device.alerts || []).filter((a) => a.state === 'active').length
    return { id: device.id, name: escapeHtml(device.name), online: snap.online, uptimePct: snap.uptimePct, activeAlerts }
  })

  if (variant === 'card-grid') {
    return `<div class="status-list-widget status-card-grid">${rows.map((r) => `<div class="status-card"><span class="status-dot${r.online ? ' online' : ' offline'}"></span><span class="status-card-name">${r.name}</span><span class="status-card-uptime">${r.uptimePct}% up</span></div>`).join('')}</div>`
  }
  if (variant === 'avatar-list') {
    return `<ul class="status-list-widget status-avatar-list">${rows.map((r) => `<li><span class="status-avatar">${initials(r.name)}</span><span class="status-row-name">${r.name}</span><span class="status-dot${r.online ? ' online' : ' offline'}"></span></li>`).join('')}</ul>`
  }
  if (variant === 'progress-rows') {
    return `<ul class="status-list-widget status-progress-rows">${rows.map((r) => `<li><div class="status-progress-head"><span>${r.name}</span><span>${r.uptimePct}%</span></div><div class="status-progress-track"><div class="status-progress-fill" style="width:${r.uptimePct}%;background:${r.online ? '#16a34a' : '#dc2626'}"></div></div></li>`).join('')}</ul>`
  }
  if (variant === 'timeline') {
    return `<ul class="status-list-widget status-timeline">${rows.map((r) => `<li><span class="status-dot${r.online ? ' online' : ' offline'}"></span><div class="status-timeline-body"><span class="status-row-name">${r.name}</span><span class="status-timeline-meta">${r.online ? 'Connected' : 'Disconnected'} · ${r.activeAlerts} alerts</span></div></li>`).join('')}</ul>`
  }
  if (variant === 'table-style') {
    return `<table class="status-list-widget status-table"><thead><tr><th>Device</th><th>Status</th><th>Alerts</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.name}</td><td><span class="status-dot${r.online ? ' online' : ' offline'}"></span> ${r.online ? 'Online' : 'Offline'}</td><td>${r.activeAlerts}</td></tr>`).join('')}</tbody></table>`
  }
  if (variant === 'compact-chips') {
    return `<div class="status-list-widget status-compact-chips">${rows.map((r) => `<span class="status-chip${r.online ? ' online' : ' offline'}">${r.name}</span>`).join('')}</div>`
  }
  if (variant === 'minimal-text') {
    return `<ul class="status-list-widget status-minimal-text">${rows.map((r) => `<li>${r.name} — ${r.online ? 'online' : 'offline'}</li>`).join('')}</ul>`
  }
  if (variant === 'icon-list') {
    return `<ul class="status-list-widget status-icon-list">${rows.map((r) => `<li><span class="status-icon-badge${r.online ? ' online' : ' offline'}">${r.online ? '✓' : '!'}</span><span class="status-row-name">${r.name}</span></li>`).join('')}</ul>`
  }
  if (variant === 'badge-list') {
    return `<ul class="status-list-widget status-badge-list">${rows.map((r) => `<li><span class="status-row-name">${r.name}</span><span class="status-badge${r.online ? ' online' : ' offline'}">${r.online ? 'Online' : 'Offline'}</span></li>`).join('')}</ul>`
  }
  return `<ul class="status-list-widget status-dot-list">${rows.map((r) => `<li><span class="status-dot${r.online ? ' online' : ' offline'}"></span><span class="status-row-name">${r.name}</span><span class="status-row-meta">${r.activeAlerts} alerts</span></li>`).join('')}</ul>`
}

const TABLE_MODIFIER_CLASS = { basic: '', striped: 'table-striped', bordered: 'table-bordered', compact: 'table-compact', 'dark-header': 'table-dark-header', minimal: 'table-minimal', 'hover-highlight': 'table-hover-highlight' }
const TABLE_STATUS_COLORS = { operational: '#16a34a', online: '#16a34a', active: '#16a34a', delivered: '#16a34a', success: '#16a34a', maintenance: '#d97706', pending: '#d97706', warning: '#d97706', offline: '#dc2626', failed: '#dc2626', critical: '#dc2626', resolved: '#78716c', acknowledged: '#7c3aed' }
function tableStatusColor(value) { return TABLE_STATUS_COLORS[String(value).toLowerCase()] || '#78716c' }

function tableData(dataSource) {
  const devices = getDevices()
  const assets = getAssets()
  const executions = getRuleEngineExecutions()
  const table = dataSource && dataSource.table
  if (table === 'alarms') return { columns: ['Device', 'Alert', 'Severity', 'State', 'Date'], rows: buildAlarmRows(devices).map((r) => [r.device, r.alertType, r.severity, r.state, r.createdDate]) }
  if (table === 'executions') return { columns: ['Rule engine', 'Triggered at', 'Trigger', 'Action', 'Outcome'], rows: buildExecutionRows(executions).map((r) => [r.ruleEngine, r.triggeredAt, r.triggerType, r.action, r.outcome]) }
  if (table === 'devices') return { columns: ['Device', 'Application', 'Status', 'Active alerts', 'Created'], rows: buildDeviceRows(devices).map((r) => [r.name, r.application, r.status, r.activeAlerts, r.createdDate]) }
  if (table === 'assets') return { columns: ['Asset', 'Groups', 'Profile', 'Status', 'Location'], rows: buildAssetRows(assets).map((r) => [r.name, r.groups, r.profile, r.status, r.location]) }
  if (table === 'commands') return { columns: ['Device', 'Command', 'Status', 'Date'], rows: buildCommandRows(devices).map((r) => [r.device, r.name, r.status, r.createdDate]) }
  const device = findDevice(dataSource && dataSource.deviceId)
  const deviceId = (device && device.id) || 'example-device'
  const metrics = device && device.metrics && device.metrics.length ? device.metrics : DEFAULT_METRICS
  const rows = metrics.map((metric) => [metric.label, telemetryValueAt(deviceId, metric.key, Date.now(), resolveMetric(device, metric.key) || metric), metric.unit])
  return { columns: ['Metric', 'Value', 'Unit'], rows }
}

function renderTableContent(config) {
  const variant = config.variant
  const data = tableData(config.dataSource)
  const columns = data.columns
  const rows = data.rows
  let statusColumnIndex = columns.indexOf('Status')
  if (statusColumnIndex === -1) statusColumnIndex = columns.findIndex((c) => ['Outcome', 'Severity', 'State'].includes(c))
  if (rows.length === 0) return '<div class="widget-empty-note">No data yet.</div>'

  if (variant === 'card-rows') {
    return `<div class="table-widget table-card-rows">${rows.map((row) => `<div class="table-card-row">${row.map((cell, i) => `<div class="table-card-cell"><span class="table-card-label">${escapeHtml(columns[i])}</span><span class="table-card-value">${escapeHtml(cell)}</span></div>`).join('')}</div>`).join('')}</div>`
  }
  const modifier = TABLE_MODIFIER_CLASS[variant] || ''
  let head = '<tr>'
  if (variant === 'numbered') head += '<th>#</th>'
  head += columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>'
  const body = rows.map((row, rowIndex) => {
    let tr = '<tr>'
    if (variant === 'numbered') tr += `<td>${rowIndex + 1}</td>`
    tr += row.map((cell, cellIndex) => {
      if (variant === 'status-badges' && cellIndex === statusColumnIndex) {
        const c = tableStatusColor(cell)
        return `<td><span class="table-status-pill" style="background:${c}1a;color:${c}">${escapeHtml(cell)}</span></td>`
      }
      return `<td>${escapeHtml(cell)}</td>`
    }).join('')
    return tr + '</tr>'
  }).join('')
  return `<div class="table-widget-scroll"><table class="table-widget-table ${modifier}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`
}

/* ---- extra widgets ---- */

function renderExtraContent(config) {
  const device = findDevice(config.dataSource && config.dataSource.deviceId)
  switch (config.variant) {
    case 'sparkline': {
      const series = widgetSeries(device, config.dataSource && config.dataSource.metricKey, '1h')
      if (series.points.length === 0) return '<div class="widget-empty-note">No telemetry yet.</div>'
      const values = series.points.map((p) => p.value)
      const min = Math.min.apply(null, values)
      const max = Math.max.apply(null, values)
      const range = max - min || 1
      const coords = values.map((v, i) => {
        const x = (i / (values.length - 1 || 1)) * 100
        const y = 32 - ((v - min) / range) * 28 - 2
        return `${x},${y}`
      })
      const last = values[values.length - 1]
      return `<div class="extra-widget extra-sparkline"><svg viewBox="0 0 100 32" preserveAspectRatio="none" class="sparkline-svg"><polyline points="${coords.join(' ')}" fill="none" stroke="#7c3aed" stroke-width="2"/></svg><div class="sparkline-readout">${last}${series.unit} <span class="sparkline-label">${escapeHtml(series.label)}</span></div></div>`
    }
    case 'comparison': {
      const devices = getDevices()
      const other = devices.find((d) => d.id !== (device && device.id))
      const a = widgetValue(device, config.dataSource && config.dataSource.metricKey, 'compare-a')
      const b = widgetValue(other, config.dataSource && config.dataSource.metricKey, 'compare-b')
      const delta = a.value - b.value
      return `<div class="extra-widget extra-comparison"><div class="comparison-side"><span class="comparison-name">${escapeHtml((device && device.name) || 'Device A')}</span><span class="comparison-value">${a.value}${a.unit}</span></div><div class="comparison-delta${delta >= 0 ? ' up' : ' down'}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}</div><div class="comparison-side"><span class="comparison-name">${escapeHtml((other && other.name) || 'Device B')}</span><span class="comparison-value">${b.value}${b.unit}</span></div></div>`
    }
    case 'clock': {
      const now = new Date()
      return `<div class="extra-widget extra-clock"><span class="clock-time">${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span class="clock-date">${now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>`
    }
    case 'note': {
      const text = (config.settings && config.settings.text) || ''
      return `<textarea class="extra-widget extra-note" placeholder="Write a note…">${escapeHtml(text)}</textarea>`
    }
    case 'alert-feed': {
      const rows = buildAlarmRows(getDevices()).slice(0, 6)
      if (rows.length === 0) return '<div class="widget-empty-note">No alerts yet.</div>'
      return `<ul class="extra-widget extra-alert-feed">${rows.map((r) => `<li class="alert-feed-item severity-${r.severity}"><span class="alert-feed-title">${escapeHtml(r.alertType)}</span><span class="alert-feed-meta">${escapeHtml(r.device)} · ${r.createdDate}</span></li>`).join('')}</ul>`
    }
    case 'kpi-grid': {
      const devices = getDevices()
      const assets = getAssets()
      const ruleEngines = getRuleEngines()
      const activeAlerts = devices.reduce((sum, d) => sum + (d.alerts || []).filter((a) => a.state === 'active').length, 0)
      const tiles = [{ label: 'Devices', value: devices.length }, { label: 'Active alerts', value: activeAlerts }, { label: 'Assets', value: assets.length }, { label: 'Rule engines', value: ruleEngines.length }]
      return `<div class="extra-widget extra-kpi-grid">${tiles.map((t) => `<div class="kpi-tile"><span class="kpi-value">${t.value}</span><span class="kpi-label">${t.label}</span></div>`).join('')}</div>`
    }
    case 'task-list': {
      const tasks = (config.settings && config.settings.tasks) || [
        { id: 't1', label: 'Review overnight alerts', done: false },
        { id: 't2', label: 'Check device firmware versions', done: false },
        { id: 't3', label: 'Confirm rule engine executions', done: false },
      ]
      return `<ul class="extra-task-list">${tasks.map((t) => `<li data-task-id="${t.id}"><span class="task-checkbox${t.done ? ' checked' : ''}">${t.done ? '✓' : ''}</span><span class="task-label${t.done ? ' done' : ''}">${escapeHtml(t.label)}</span></li>`).join('')}</ul>`
    }
    case 'leaderboard': {
      const devices = getDevices()
      const ranked = devices.map((d) => {
        const metric = resolveMetric(d)
        return { id: d.id, name: d.name, value: telemetryValueAt(d.id, metric.key, Date.now(), metric), unit: metric.unit }
      }).sort((a, b) => b.value - a.value).slice(0, 5)
      if (ranked.length === 0) return '<div class="widget-empty-note">No devices yet.</div>'
      return `<ol class="extra-leaderboard">${ranked.map((r, i) => `<li><span class="leaderboard-rank">${i + 1}</span><span class="leaderboard-name">${escapeHtml(r.name)}</span><span class="leaderboard-value">${r.value}${r.unit}</span></li>`).join('')}</ol>`
    }
    case 'health-score': {
      const devices = getDevices()
      if (devices.length === 0) return '<div class="widget-empty-note">No devices yet.</div>'
      const onlineCount = devices.filter((d) => connectivitySnapshot(d.id).online).length
      const activeAlerts = devices.reduce((sum, d) => sum + (d.alerts || []).filter((a) => a.state === 'active').length, 0)
      const onlineRatio = onlineCount / devices.length
      const score = Math.round(Math.max(0, Math.min(100, onlineRatio * 100 - activeAlerts * 4)))
      const color = score > 80 ? '#16a34a' : score > 50 ? '#d97706' : '#dc2626'
      return `<div class="extra-widget extra-health-score"><svg viewBox="0 0 100 100" class="health-score-svg"><circle cx="50" cy="50" r="42" fill="none" stroke="#e7e5e4" stroke-width="8"/><circle cx="50" cy="50" r="42" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(score / 100) * 264} 264" transform="rotate(-90 50 50)"/></svg><div class="health-score-center"><span class="health-score-value" style="color:${color}">${score}</span><span class="health-score-label">Health</span></div></div>`
    }
    case 'network-status': {
      const sample = getDevices().slice(0, 6)
      if (sample.length === 0) return '<div class="widget-empty-note">No devices yet.</div>'
      return `<div class="extra-widget extra-network-status"><span class="network-hub"></span>${sample.map((d) => {
        const online = connectivitySnapshot(d.id).online
        return `<div class="network-node"><span class="network-line"></span><span class="network-dot${online ? ' online' : ''}" title="${escapeHtml(d.name)}"></span></div>`
      }).join('')}</div>`
    }
    case 'weather':
    default: {
      const day = new Date().getDate()
      const conditions = ['Clear', 'Partly cloudy', 'Overcast', 'Light rain', 'Windy']
      const condition = conditions[day % conditions.length]
      const temp = 18 + (day % 12)
      return `<div class="extra-widget extra-weather"><span class="weather-icon">${widgetIconSvg('cloud')}</span><span class="weather-temp">${temp}°C</span><span class="weather-condition">${condition}</span></div>`
    }
  }
}

/* ---- chart widget (ApexCharts) ---- */

const CHART_PALETTE = ['#7c3aed', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2']
const CHART_LABEL_ONLY_TYPES = new Set(['pie', 'donut', 'polarArea', 'radialBar'])
const CHART_CATEGORICAL_TYPES = new Set(['alarm-chart', 'rule-execution-chart', 'asset-count-chart', 'device-status-chart'])
const CHART_BUCKETED_TYPES = new Set(['pie', 'donut', 'polarArea', 'radialBar', 'heatmap'])

function categoricalCounts(type) {
  const devices = getDevices()
  const assets = getAssets()
  const executions = getRuleEngineExecutions()
  if (type === 'asset-count-chart') {
    const counts = {}
    assets.forEach((a) => { counts[a.status] = (counts[a.status] || 0) + 1 })
    return { categories: Object.keys(counts), values: Object.values(counts) }
  }
  if (type === 'device-status-chart') {
    let online = 0, offline = 0
    devices.forEach((d) => { if (connectivitySnapshot(d.id).online) online += 1; else offline += 1 })
    return { categories: ['Online', 'Offline'], values: [online, offline] }
  }
  if (type === 'rule-execution-chart') {
    const counts = {}
    executions.forEach((e) => { counts[e.outcome] = (counts[e.outcome] || 0) + 1 })
    return { categories: Object.keys(counts), values: Object.values(counts) }
  }
  const counts = {}
  devices.forEach((d) => (d.alerts || []).forEach((a) => { counts[a.severity] = (counts[a.severity] || 0) + 1 }))
  return { categories: Object.keys(counts), values: Object.values(counts) }
}
function quartileBuckets(points) {
  if (points.length === 0) return { categories: [], values: [] }
  const bucketSize = Math.max(1, Math.ceil(points.length / 4))
  const categories = [], values = []
  for (let i = 0; i < points.length; i += bucketSize) {
    const slice = points.slice(i, i + bucketSize)
    const avg = slice.reduce((sum, p) => sum + p.value, 0) / slice.length
    categories.push(`Q${categories.length + 1}`)
    values.push(Number(avg.toFixed(1)))
  }
  return { categories, values }
}
function downsample(categories, values, maxPoints) {
  if (categories.length <= maxPoints) return { categories, values }
  const step = Math.ceil(categories.length / maxPoints)
  const sc = [], sv = []
  for (let i = 0; i < categories.length; i += step) { sc.push(categories[i]); sv.push(values[i]) }
  return { categories: sc, values: sv }
}
function movingAverage(values, windowSize) {
  windowSize = windowSize || 3
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - windowSize + 1), index + 1)
    return Number((slice.reduce((s, v) => s + v, 0) / slice.length).toFixed(2))
  })
}
function chartBaseOptions(categories, unit) {
  return {
    chart: { toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' },
    colors: CHART_PALETTE, stroke: { curve: 'smooth', width: 2.5 }, legend: { show: false }, dataLabels: { enabled: false }, markers: { size: 0 },
    xaxis: { categories: categories, tickAmount: categories.length > 8 ? 8 : undefined, labels: { style: { fontSize: '10px' } } },
    yaxis: { labels: { formatter: (value) => `${value}${unit || ''}` } }, tooltip: { theme: 'light' },
  }
}
function buildApexConfig(apexType, horizontal, categories, values, title, unit) {
  if (apexType === 'heatmap') {
    return { type: 'heatmap', series: [{ name: title || 'Series', data: categories.map((c, i) => ({ x: c, y: values[i] })) }], options: { chart: { toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' }, colors: CHART_PALETTE, tooltip: { theme: 'light' } } }
  }
  if (CHART_LABEL_ONLY_TYPES.has(apexType)) {
    return { type: apexType, series: values, options: { chart: { toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' }, colors: CHART_PALETTE, labels: categories, legend: { show: true, fontSize: '11px' }, dataLabels: { enabled: apexType !== 'radialBar' }, tooltip: { theme: 'light' } } }
  }
  if (apexType === 'scatter' || apexType === 'bubble') {
    const data = values.map((v, i) => (apexType === 'bubble' ? [i, v, Math.max(4, v)] : [i, v]))
    return { type: apexType, series: [{ name: title, data: data }], options: Object.assign(chartBaseOptions([], unit), { xaxis: { labels: { show: false } } }) }
  }
  if (apexType === 'combo') {
    return {
      type: 'line', series: [{ name: title, type: 'column', data: values }, { name: `${title} (avg)`, type: 'line', data: movingAverage(values) }],
      options: Object.assign(chartBaseOptions(categories, unit), { legend: { show: true, fontSize: '11px' }, stroke: { curve: 'smooth', width: [0, 2.5] } }),
    }
  }
  const options = Object.assign(chartBaseOptions(categories, unit), { plotOptions: { bar: { horizontal: Boolean(horizontal) } } })
  if (apexType === 'area') options.fill = { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.05 } }
  return { type: apexType, series: [{ name: title, data: values }], options: options }
}

const chartInstances = {}

function renderChartContent(config, hostId) {
  const variantMeta = getVariantMeta('chart', config.variant) || { apexType: 'line' }
  const apexType = config.variant === 'combo' ? 'combo' : variantMeta.apexType
  const isCategorical = CHART_CATEGORICAL_TYPES.has(config.type)
  const device = findDevice(config.dataSource && config.dataSource.deviceId)

  let categories = [], values = [], unit = ''
  if (isCategorical) {
    const counts = categoricalCounts(config.type)
    categories = counts.categories
    values = counts.values
  } else {
    const series = widgetSeries(device, config.dataSource && config.dataSource.metricKey, config.dataSource && config.dataSource.range, config.type)
    if (series.points.length === 0) return { html: '<div class="widget-empty-note">No telemetry yet.</div>' }
    unit = series.unit
    if (CHART_BUCKETED_TYPES.has(apexType)) {
      const buckets = quartileBuckets(series.points)
      categories = buckets.categories; values = buckets.values
    } else {
      categories = series.points.map((p) => new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      values = series.points.map((p) => p.value)
    }
  }
  if (apexType === 'radar') {
    const sampled = downsample(categories, values, 10)
    categories = sampled.categories; values = sampled.values
  }
  if (categories.length === 0) return { html: '<div class="widget-empty-note">No data yet.</div>' }

  const rendered = buildApexConfig(apexType, variantMeta.horizontal, categories, values, config.title, unit)
  return {
    html: `<div class="chart-widget"><div id="${hostId}" style="width:100%;height:100%;"></div></div>`,
    mount: function (bodyEl) {
      if (chartInstances[hostId]) { try { chartInstances[hostId].destroy() } catch (e) {} delete chartInstances[hostId] }
      const host = bodyEl.querySelector('#' + hostId)
      if (!host || typeof ApexCharts === 'undefined') return
      const rect = bodyEl.getBoundingClientRect()
      const width = Math.max(20, Math.round(rect.width - 4))
      const height = Math.max(20, Math.round(rect.height - 4))
      const options = Object.assign({}, rendered.options, { series: rendered.series, chart: Object.assign({}, rendered.options.chart, { type: rendered.type, width: width, height: height }) })
      const chart = new ApexCharts(host, options)
      chart.render()
      chartInstances[hostId] = chart
    },
  }
}

/* ============================================================
   Content dispatch — one entry point per widget family.
   ============================================================ */

function renderWidgetContent(config) {
  const meta = widgetRegistry[config.type]
  if (!meta) return { html: '<div class="widget-empty-note">Unknown widget type.</div>' }
  switch (meta.variantFamily) {
    case 'gauge': return { html: renderGaugeContent(config) }
    case 'chart': return renderChartContent(config, 'chart-host-' + config.id)
    case 'metric': return { html: renderMetricContent(config) }
    case 'table': return { html: renderTableContent(config) }
    case 'status-list': return { html: renderStatusListContent(config) }
    case 'progress': return { html: renderProgressContent(config) }
    case 'extra': return { html: renderExtraContent(config), mount: wireExtraWidgetEvents }
    default: return { html: '<div class="widget-empty-note">Unknown widget type.</div>' }
  }
}

function wireExtraWidgetEvents(bodyEl, config) {
  const note = bodyEl.querySelector('.extra-note')
  if (note) {
    note.addEventListener('blur', function () {
      updateWidgetSettings(config.id, { text: note.value })
    })
  }
  bodyEl.querySelectorAll('.extra-task-list li').forEach((li) => {
    li.addEventListener('click', function () {
      const taskId = li.getAttribute('data-task-id')
      const tasks = (config.settings && config.settings.tasks) || [
        { id: 't1', label: 'Review overnight alerts', done: false },
        { id: 't2', label: 'Check device firmware versions', done: false },
        { id: 't3', label: 'Confirm rule engine executions', done: false },
      ]
      updateWidgetSettings(config.id, { tasks: tasks.map((t) => (t.id === taskId ? Object.assign({}, t, { done: !t.done }) : t)) })
      refreshWidgetBody(config.id)
    })
  })
}

/* refresh cadence, matching each widget's real useTick interval */
function widgetRefreshMs(config) {
  const meta = widgetRegistry[config.type]
  if (!meta) return 0
  switch (meta.variantFamily) {
    case 'gauge': case 'metric': case 'progress': return 4000
    case 'status-list': return 6000
    case 'table': return 8000
    case 'chart': return 120000
    case 'extra':
      switch (config.variant) {
        case 'clock': return 1000
        case 'comparison': return 4000
        case 'sparkline': return 120000
        case 'alert-feed': return 8000
        case 'leaderboard': return 10000
        case 'health-score': return 8000
        case 'network-status': return 6000
        default: return 0
      }
    default: return 0
  }
}

/* ============================================================
   State + persistence
   ============================================================ */

let widgets = []
let selectedDeviceId = ''
let settingsWidgetId = null
let colWidth = 0
const lastRefresh = {}

function loadSelectedDevice() {
  try { return localStorage.getItem(SELECTED_DEVICE_STORAGE_KEY) || '' } catch (e) { return '' }
}
function saveSelectedDevice(id) {
  try { localStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, id) } catch (e) { /* unavailable */ }
}

function initDashboardState() {
  widgets = loadLayoutFromStorage() || getDefaultWidgets()
  selectedDeviceId = loadSelectedDevice()
  const devices = getDevices()
  if (devices.length > 0 && !devices.some((d) => d.id === selectedDeviceId)) {
    selectedDeviceId = devices[0].id
    saveSelectedDevice(selectedDeviceId)
  }
}

function setWidgets(next) {
  widgets = next
  saveLayoutToStorage(widgets)
  renderDashboard()
}

function addWidget(type, variantId, position) {
  widgetIdCounter += 1
  const id = 'widget-' + type + '-' + Date.now() + '-' + widgetIdCounter
  const widget = fromRegistry(type, position ? position.x : 0, position ? position.y : NEW_WIDGET_SORT_Y, id, variantId)
  setWidgets(compactWidgets(widgets.concat([widget]), GRID_COLS))
}
function removeWidget(id) {
  setWidgets(widgets.filter((w) => w.id !== id))
}
function moveWidget(id, position) {
  setWidgets(compactWidgets(widgets.map((w) => (w.id === id ? Object.assign({}, w, { layout: Object.assign({}, w.layout, { x: position.x, y: position.y }) }) : w)), GRID_COLS))
}
function resizeWidget(id, size) {
  setWidgets(compactWidgets(widgets.map((w) => (w.id === id ? Object.assign({}, w, { layout: Object.assign({}, w.layout, { w: size.w, h: size.h }) }) : w)), GRID_COLS))
}
function updateWidgetSettings(id, patch) {
  widgets = widgets.map((w) => (w.id === id ? Object.assign({}, w, { settings: Object.assign({}, w.settings, patch) }) : w))
  saveLayoutToStorage(widgets)
}
function updateWidgetFields(id, fields) {
  widgets = widgets.map((w) => (w.id === id ? Object.assign({}, w, { fields: fields }) : w))
  saveLayoutToStorage(widgets)
  renderDashboard()
}
function saveWidgetSettings(id, patch) {
  setWidgets(compactWidgets(widgets.map((w) => (w.id === id ? Object.assign({}, w, patch) : w)), GRID_COLS))
  settingsWidgetId = null
}
function resetToDefault() {
  setWidgets(getDefaultWidgets())
}

/* ============================================================
   Rendering — toolbar, canvas, grid items, widget card chrome
   ============================================================ */

function renderToolbar() {
  const devices = getDevices()
  const count = widgets.length
  document.getElementById('dashboard-toolbar').innerHTML = `
    <div class="dashboard-toolbar-left">
      <h1 class="dashboard-title">Dashboard</h1>
      <span class="dashboard-widget-count">${count} widget${count === 1 ? '' : 's'}</span>
    </div>
    <div class="dashboard-toolbar-right">
      <label class="dashboard-device-select">
        Device
        <select id="dashboard-device-select" ${devices.length === 0 ? 'disabled' : ''}>
          ${devices.length === 0 ? '<option value="">No devices yet</option>' : devices.map((d) => `<option value="${d.id}" ${d.id === selectedDeviceId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="dashboard-reset-button" id="dashboard-reset-btn">Reset to default</button>
    </div>`

  document.getElementById('dashboard-device-select').addEventListener('change', function (event) {
    selectedDeviceId = event.target.value
    saveSelectedDevice(selectedDeviceId)
    renderDashboard()
  })
  document.getElementById('dashboard-reset-btn').addEventListener('click', resetToDefault)
}

function effectiveDataSource(config) {
  if (!config.dataSource || config.dataSource.deviceId) return config.dataSource
  return Object.assign({}, config.dataSource, { deviceId: selectedDeviceId })
}

function widgetCardHtml(config) {
  const headerStyle = config.headerStyle || {}
  const headerBg = headerStyle.background ? `background:${headerStyle.background};` : ''
  const headerColor = headerStyle.color ? `color:${headerStyle.color};` : ''
  const headerSize = headerStyle.fontSize ? `font-size:${headerStyle.fontSize}px;` : ''
  const headerWeight = headerStyle.bold ? 'font-weight:700;' : ''
  return `
    <div class="widget-card" data-widget-card="${config.id}">
      <div class="widget-card-header" style="${headerBg}">
        <span class="widget-card-title" style="${headerColor}${headerSize}${headerWeight}">${escapeHtml(config.title)}</span>
        <div class="widget-card-actions">
          <button type="button" class="widget-card-icon-button" data-action="toggle-fields" aria-label="Edit field positions" title="Drag fields to reposition">${MOVE_SVG}</button>
          <button type="button" class="widget-card-icon-button" data-action="open-settings" aria-label="Widget settings">${GEAR_SVG}</button>
          <button type="button" class="widget-card-icon-button danger" data-action="remove" aria-label="Remove widget">${TRASH_SVG}</button>
        </div>
      </div>
      <div class="widget-card-body" data-widget-body="${config.id}"></div>
    </div>`
}

function renderFieldsLayerHtml(config, editMode) {
  const fields = config.fields || []
  if (!editMode && fields.length === 0) return ''
  let html = `<div class="custom-fields-layer${editMode ? ' custom-fields-layer-active' : ''}" data-fields-layer="${config.id}">`
  if (fields.length === 0 && editMode) html += '<div class="custom-fields-empty-hint">No fields yet — add one below, then drag it into place.</div>'
  fields.forEach((field) => {
    const style = `left:${field.x}px;top:${field.y}px;${field.color ? `color:${field.color};` : ''}${field.fontSize ? `font-size:${field.fontSize}px;` : ''}${field.fontWeight ? `font-weight:${field.fontWeight};` : ''}`
    html += `<div class="custom-field${editMode ? ' custom-field-editable' : ''}" style="${style}" data-field-id="${field.id}">${fieldReadingHtml(field)}${editMode ? '<button type="button" class="custom-field-remove" data-remove-field aria-label="Remove field">×</button>' : ''}</div>`
  })
  if (editMode) html += '<button type="button" class="custom-field-add" data-add-field>+ Add field</button>'
  html += '</div>'
  return html
}
function fieldReadingHtml(field) {
  const display = field.display || 'both'
  let reading
  if (field.stat) reading = statValue(field.stat)
  else reading = widgetValue(findDevice(field.deviceId), field.metricKey, 'field:' + field.id)
  if (display === 'value') return `<span>${reading.value}${reading.unit}</span>`
  if (display === 'label') return `<span>${escapeHtml(field.label || reading.label)}</span>`
  return `<span>${field.label ? escapeHtml(field.label) + ': ' : ''}${reading.value}${reading.unit}</span>`
}

const fieldsEditMode = {}

function wireWidgetCardEvents(cardEl, config) {
  cardEl.querySelector('[data-action="open-settings"]').addEventListener('click', function () { openWidgetSettings(config.id) })
  cardEl.querySelector('[data-action="remove"]').addEventListener('click', function () {
    UI.confirm({
      message: `Remove <strong>${escapeHtml(config.title)}</strong> from the dashboard?`,
      onConfirm: function () { removeWidget(config.id) },
    })
  })
  const toggleBtn = cardEl.querySelector('[data-action="toggle-fields"]')
  toggleBtn.classList.toggle('active', Boolean(fieldsEditMode[config.id]))
  toggleBtn.addEventListener('click', function () {
    fieldsEditMode[config.id] = !fieldsEditMode[config.id]
    refreshWidgetBody(config.id)
  })
}

function wireFieldsLayerEvents(layerEl, config) {
  layerEl.querySelectorAll('[data-field-id]').forEach((fieldEl) => {
    const fieldId = fieldEl.getAttribute('data-field-id')
    fieldEl.addEventListener('mousedown', function (event) {
      if (!fieldsEditMode[config.id]) return
      if (event.target.closest('[data-remove-field]')) return
      event.preventDefault()
      event.stopPropagation()
      const bounds = layerEl.getBoundingClientRect()
      const field = (config.fields || []).find((f) => f.id === fieldId)
      if (!field) return
      const startX = event.clientX, startY = event.clientY, startFX = field.x, startFY = field.y

      function handleMove(moveEvent) {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        const nextX = Math.max(0, Math.min(bounds.width - 24, startFX + dx))
        const nextY = Math.max(0, Math.min(bounds.height - 20, startFY + dy))
        fieldEl.style.left = nextX + 'px'
        fieldEl.style.top = nextY + 'px'
        fieldEl.__pending = { x: nextX, y: nextY }
      }
      function handleUp() {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        if (fieldEl.__pending) {
          const updated = (config.fields || []).map((f) => (f.id === fieldId ? Object.assign({}, f, fieldEl.__pending) : f))
          updateWidgetFields(config.id, updated)
        }
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    })
    const removeBtn = fieldEl.querySelector('[data-remove-field]')
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        updateWidgetFields(config.id, (config.fields || []).filter((f) => f.id !== fieldId))
      })
    }
  })
  const addBtn = layerEl.querySelector('[data-add-field]')
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      const fields = config.fields || []
      updateWidgetFields(config.id, fields.concat([createField(fields.length)]))
    })
  }
}

let fieldIdCounter = 0
function createField(index) {
  fieldIdCounter += 1
  return { id: 'field-' + Date.now() + '-' + fieldIdCounter, deviceId: '', metricKey: 'value', label: '', color: '#1e293b', fontSize: 14, fontWeight: 'normal', x: 12 + (index % 4) * 20, y: 12 + (index % 4) * 20 }
}

function refreshWidgetBody(id) {
  const config = widgets.find((w) => w.id === id)
  if (!config) return
  const bodyEl = document.querySelector('[data-widget-body="' + id + '"]')
  if (!bodyEl) return
  const liveConfig = Object.assign({}, config, { dataSource: effectiveDataSource(config) })
  const result = renderWidgetContent(liveConfig)
  bodyEl.innerHTML = result.html + renderFieldsLayerHtml(config, Boolean(fieldsEditMode[id]))
  if (result.mount) result.mount(bodyEl, liveConfig)
  const layerEl = bodyEl.querySelector('[data-fields-layer]')
  if (layerEl) wireFieldsLayerEvents(layerEl, config)
  lastRefresh[id] = Date.now()
}

function tickWidgets() {
  const now = Date.now()
  widgets.forEach((config) => {
    const ms = widgetRefreshMs(config)
    if (ms <= 0) return
    const last = lastRefresh[config.id] || 0
    if (now - last >= ms) refreshWidgetBody(config.id)
  })
}
setInterval(tickWidgets, 500)

function attachGridItemHandlers(el, config) {
  const cellW = colWidth + MARGIN[0]
  const cellH = ROW_HEIGHT + MARGIN[1]

  el.querySelector('.widget-drag-handle').addEventListener('mousedown', function (event) {
    event.preventDefault()
    const layout = config.layout
    const startLeft = layout.x * cellW
    const startTop = layout.y * cellH
    const startX = event.clientX, startY = event.clientY
    el.classList.add('grid-item-active')

    function handleMove(moveEvent) {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      el.style.left = (startLeft + dx) + 'px'
      el.style.top = Math.max(0, startTop + dy) + 'px'
    }
    function handleUp(upEvent) {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      el.classList.remove('grid-item-active')
      const dx = upEvent.clientX - startX
      const dy = upEvent.clientY - startY
      const newX = Math.round((startLeft + dx) / cellW)
      const newY = Math.max(0, Math.round((startTop + dy) / cellH))
      const clampedX = Math.max(0, Math.min(GRID_COLS - layout.w, newX))
      moveWidget(config.id, { x: clampedX, y: newY })
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  })

  el.querySelector('.widget-resize-handle').addEventListener('mousedown', function (event) {
    event.preventDefault()
    event.stopPropagation()
    const layout = config.layout
    const startWidth = layout.w * colWidth + (layout.w - 1) * MARGIN[0]
    const startHeight = layout.h * ROW_HEIGHT + (layout.h - 1) * MARGIN[1]
    const startX = event.clientX, startY = event.clientY
    el.classList.add('grid-item-active')

    function handleMove(moveEvent) {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      el.style.width = Math.max(colWidth, startWidth + dx) + 'px'
      el.style.height = Math.max(ROW_HEIGHT, startHeight + dy) + 'px'
    }
    function handleUp(upEvent) {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      el.classList.remove('grid-item-active')
      const dx = upEvent.clientX - startX
      const dy = upEvent.clientY - startY
      const rawW = Math.round((startWidth + dx + MARGIN[0]) / cellW)
      const rawH = Math.round((startHeight + dy + MARGIN[1]) / cellH)
      const newW = Math.max(layout.minW || 1, Math.min(GRID_COLS - layout.x, rawW))
      const newH = Math.max(layout.minH || 1, rawH)
      resizeWidget(config.id, { w: newW, h: newH })
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  })
}

function renderCanvas() {
  const canvas = document.getElementById('dashboard-canvas')
  if (widgets.length === 0) {
    canvas.innerHTML = '<div class="dashboard-canvas-empty">Drag a widget here, or use the + button to add one from the library.</div>'
    return
  }
  const containerWidth = canvas.getBoundingClientRect().width
  colWidth = gridCellSize(containerWidth, GRID_COLS, MARGIN[0])
  const cellW = colWidth + MARGIN[0]
  const cellH = ROW_HEIGHT + MARGIN[1]

  let html = `<div class="dashboard-grid" style="height:${gridHeight(widgets)}px;">`
  widgets.forEach((config) => {
    const layout = config.layout
    const left = layout.x * cellW
    const top = layout.y * cellH
    const width = layout.w * colWidth + (layout.w - 1) * MARGIN[0]
    const height = layout.h * ROW_HEIGHT + (layout.h - 1) * MARGIN[1]
    html += `<div class="grid-item" data-grid-item="${config.id}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;">
      <button type="button" class="widget-drag-handle" aria-label="Move widget">${DRAG_HANDLE_SVG}</button>
      <div class="grid-item-body">${widgetCardHtml(config)}</div>
      <button type="button" class="widget-resize-handle" aria-label="Resize widget"></button>
    </div>`
  })
  html += '</div>'
  canvas.innerHTML = html

  widgets.forEach((config) => {
    const el = canvas.querySelector('[data-grid-item="' + config.id + '"]')
    attachGridItemHandlers(el, config)
    const cardEl = el.querySelector('[data-widget-card]')
    wireWidgetCardEvents(cardEl, config)
    refreshWidgetBody(config.id)
  })
}

function renderDashboard() {
  renderToolbar()
  renderCanvas()
}

/* ============================================================
   Widget settings modal
   ============================================================ */

function openWidgetSettings(id) {
  const config = widgets.find((w) => w.id === id)
  if (!config) return
  settingsWidgetId = id
  const meta = widgetRegistry[config.type]
  const variants = VARIANT_FAMILIES[meta.variantFamily] || []
  const supportsDevice = meta.defaultDataSource && ('deviceId' in meta.defaultDataSource)
  const supportsRange = meta.variantFamily === 'chart'
  const devices = getDevices()
  const deviceId = (config.dataSource && config.dataSource.deviceId) || ''
  const selectedDevice = devices.find((d) => d.id === deviceId)
  const availableMetrics = selectedDevice && selectedDevice.metrics && selectedDevice.metrics.length ? selectedDevice.metrics : DEFAULT_METRICS
  const headerStyle = config.headerStyle || {}

  document.getElementById('widget-settings-body').innerHTML = `
    <form id="widget-settings-form">
      <div class="section">
        <button type="button" class="section-header" data-toggle-section="details">${caretSvg(true)}<span class="section-title">Details</span></button>
        <div class="section-body" data-section-body="details">
          <div class="modal-field"><label for="ws-title">Title</label><input id="ws-title" type="text" value="${escapeHtml(config.title)}" required /></div>
          ${variants.length > 1 ? `<div class="modal-field"><label for="ws-variant">${meta.variantFamily === 'extra' ? 'Widget' : 'Style'}</label><select id="ws-variant">${variants.map((v) => `<option value="${v.id}" ${v.id === config.variant ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>` : ''}
          ${supportsDevice ? `<div class="modal-field"><label for="ws-device">Device</label><select id="ws-device"><option value="">Use dashboard selection</option>${devices.map((d) => `<option value="${d.id}" ${d.id === deviceId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select></div>` : ''}
          ${supportsDevice ? `<div class="modal-field"><label for="ws-metric">Metric</label><select id="ws-metric">${availableMetrics.map((m) => `<option value="${m.key}" ${m.key === (config.dataSource && config.dataSource.metricKey) ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div>` : ''}
          ${supportsRange ? `<div class="modal-field"><label for="ws-range">Time range</label><select id="ws-range">${Object.keys(RANGE_PRESETS).map((k) => `<option value="${k}" ${k === ((config.dataSource && config.dataSource.range) || '1h') ? 'selected' : ''}>${RANGE_PRESETS[k].label}</option>`).join('')}</select></div>` : ''}
          <div class="modal-field-row">
            <div class="modal-field"><label for="ws-width">Width (columns)</label><input id="ws-width" type="number" min="${config.layout.minW || 1}" max="12" value="${config.layout.w}" /></div>
            <div class="modal-field"><label for="ws-height">Height (rows)</label><input id="ws-height" type="number" min="${config.layout.minH || 1}" max="20" value="${config.layout.h}" /></div>
          </div>
        </div>
      </div>

      <div class="section">
        <button type="button" class="section-header" data-toggle-section="header-style">${caretSvg(false)}<span class="section-title">Header style</span></button>
        <div class="section-body hidden" data-section-body="header-style">
          <div class="modal-field-row">
            <label class="field-editor-color">Background<input type="color" id="ws-header-bg" value="${headerStyle.background || '#f5f3ff'}" /></label>
            <label class="field-editor-color">Text color<input type="color" id="ws-header-color" value="${headerStyle.color || '#1c1917'}" /></label>
          </div>
          <div class="modal-field-row">
            <div class="modal-field"><label for="ws-header-size">Text size</label><input id="ws-header-size" type="number" min="10" max="28" value="${headerStyle.fontSize || 14}" /></div>
            <label class="modal-field header-bold-toggle"><span>Bold</span><input type="checkbox" id="ws-header-bold" ${(headerStyle.bold == null ? true : headerStyle.bold) ? 'checked' : ''} /></label>
          </div>
        </div>
      </div>

      <div class="section">
        <button type="button" class="section-header" data-toggle-section="fields">${caretSvg((config.fields || []).length > 0)}<span class="section-title">Fields (${(config.fields || []).length})</span></button>
        <div class="section-body${(config.fields || []).length > 0 ? '' : ' hidden'}" data-section-body="fields">
          <p class="modal-hint">Add any number of extra data fields to this widget. Drag them to position them once added, using the move icon on the widget card.</p>
          <div id="ws-fields-list"></div>
          <button type="button" class="modal-button secondary field-editor-add" id="ws-add-field">+ Add field</button>
        </div>
      </div>
    </form>`

  let draftFields = (config.fields || []).map((f) => Object.assign({}, f))
  function renderFieldsList() {
    document.getElementById('ws-fields-list').innerHTML = draftFields.map((field) => {
      const fieldDevice = devices.find((d) => d.id === field.deviceId)
      const fieldMetrics = fieldDevice && fieldDevice.metrics && fieldDevice.metrics.length ? fieldDevice.metrics : DEFAULT_METRICS
      return `
      <div class="field-editor-row" data-field-row="${field.id}">
        <div class="field-editor-grid">
          <select data-field-device aria-label="Field device"><option value="">No device</option>${devices.map((d) => `<option value="${d.id}" ${d.id === field.deviceId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}</select>
          <select data-field-metric aria-label="Field metric">${fieldMetrics.map((m) => `<option value="${m.key}" ${m.key === field.metricKey ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
          <input type="text" data-field-label placeholder="Label" value="${escapeHtml(field.label || '')}" aria-label="Field label" />
        </div>
        <div class="field-editor-grid field-editor-style-grid">
          <label class="field-editor-color">Color<input type="color" data-field-color value="${field.color || '#1e293b'}" /></label>
          <label class="field-editor-number">Size<input type="number" data-field-size min="8" max="72" value="${field.fontSize || 14}" /></label>
          <select data-field-weight aria-label="Field weight"><option value="normal" ${field.fontWeight === 'normal' ? 'selected' : ''}>Normal</option><option value="600" ${field.fontWeight === '600' ? 'selected' : ''}>Semibold</option><option value="700" ${field.fontWeight === '700' ? 'selected' : ''}>Bold</option></select>
          <button type="button" class="field-editor-remove" data-field-remove>Remove</button>
        </div>
      </div>`
    }).join('')

    document.querySelectorAll('[data-field-row]').forEach((row) => {
      const fieldId = row.getAttribute('data-field-row')
      const field = draftFields.find((f) => f.id === fieldId)
      row.querySelector('[data-field-device]').addEventListener('change', (e) => { field.deviceId = e.target.value; renderFieldsList() })
      row.querySelector('[data-field-metric]').addEventListener('change', (e) => { field.metricKey = e.target.value })
      row.querySelector('[data-field-label]').addEventListener('input', (e) => { field.label = e.target.value })
      row.querySelector('[data-field-color]').addEventListener('input', (e) => { field.color = e.target.value })
      row.querySelector('[data-field-size]').addEventListener('input', (e) => { field.fontSize = Number(e.target.value) || field.fontSize })
      row.querySelector('[data-field-weight]').addEventListener('change', (e) => { field.fontWeight = e.target.value })
      row.querySelector('[data-field-remove]').addEventListener('click', () => { draftFields = draftFields.filter((f) => f.id !== fieldId); renderFieldsList() })
    })
  }
  renderFieldsList()
  document.getElementById('ws-add-field').addEventListener('click', function () {
    draftFields.push(createField(draftFields.length))
    renderFieldsList()
  })

  document.querySelectorAll('[data-toggle-section]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const key = btn.getAttribute('data-toggle-section')
      const body = document.querySelector('[data-section-body="' + key + '"]')
      const nowHidden = body.classList.toggle('hidden')
      btn.querySelector('.caret-icon').classList.toggle('expanded', !nowHidden)
    })
  })

  const variantSelect = document.getElementById('ws-variant')
  if (variantSelect) {
    variantSelect.addEventListener('change', function () {
      if (meta.variantFamily === 'extra') {
        const newVariantMeta = getVariantMeta('extra', variantSelect.value)
        if (newVariantMeta) document.getElementById('ws-title').value = newVariantMeta.label
      }
    })
  }

  document.getElementById('widget-settings-form').addEventListener('submit', function (event) {
    event.preventDefault()
    const variant = variantSelect ? variantSelect.value : config.variant
    const variantMeta = getVariantMeta(meta.variantFamily, variant)
    const minW = (variantMeta && variantMeta.layout && variantMeta.layout.minW) || config.layout.minW || 1
    const minH = (variantMeta && variantMeta.layout && variantMeta.layout.minH) || config.layout.minH || 1
    const width = Number(document.getElementById('ws-width').value) || minW
    const height = Number(document.getElementById('ws-height').value) || minH
    const nextDataSource = Object.assign({}, config.dataSource)
    if (supportsDevice) {
      const deviceSelect = document.getElementById('ws-device')
      const metricSelect = document.getElementById('ws-metric')
      nextDataSource.deviceId = deviceSelect.value || null
      nextDataSource.metricKey = metricSelect.value
    }
    if (supportsRange) nextDataSource.range = document.getElementById('ws-range').value

    saveWidgetSettings(config.id, {
      title: document.getElementById('ws-title').value,
      variant: variant,
      layout: Object.assign({}, config.layout, { w: Math.max(minW, width), h: Math.max(minH, height), minW: minW, minH: minH }),
      dataSource: nextDataSource,
      fields: draftFields,
      headerStyle: {
        background: document.getElementById('ws-header-bg').value,
        color: document.getElementById('ws-header-color').value,
        fontSize: Number(document.getElementById('ws-header-size').value) || 14,
        bold: document.getElementById('ws-header-bold').checked,
      },
    })
    UI.closeModal('widget-settings-modal')
  })

  UI.openModal('widget-settings-modal')
}

/* ============================================================
   Widget palette (FAB + drawer)
   ============================================================ */

function initWidgetPalette() {
  const fab = document.getElementById('widget-palette-fab')
  const backdrop = document.getElementById('widget-palette-backdrop')
  const drawer = document.getElementById('widget-palette-drawer')
  const closeBtn = document.getElementById('widget-palette-close')
  const searchWrap = document.getElementById('widget-palette-search')
  const searchInput = document.getElementById('widget-palette-search-input')
  const headerTitle = document.getElementById('widget-palette-header-title')
  const body = document.getElementById('widget-palette-body')
  const catalog = buildCatalog()
  let drillTile = null

  function openDrawer() { backdrop.classList.add('open'); drawer.classList.add('open') }
  function closeDrawer() { backdrop.classList.remove('open'); drawer.classList.remove('open'); drillTile = null; renderPaletteBody() }

  function renderPaletteHeader() {
    if (drillTile) {
      headerTitle.innerHTML = `<button type="button" class="widget-palette-back" id="widget-palette-back-btn">${BACK_SVG} ${escapeHtml(drillTile.label)}</button>`
      document.getElementById('widget-palette-back-btn').addEventListener('click', function () { drillTile = null; renderPaletteHeader(); renderPaletteBody() })
      searchWrap.classList.add('hidden')
    } else {
      headerTitle.innerHTML = '<span class="widget-palette-title">Widget library</span>'
      searchWrap.classList.remove('hidden')
    }
  }

  function renderPaletteBody() {
    if (drillTile) {
      body.innerHTML = `<div class="widget-style-grid">${drillTile.variants.map((v) => `<button type="button" class="widget-style-tile" data-add-variant="${v.id}">${v.label}</button>`).join('')}</div>`
      body.querySelectorAll('[data-add-variant]').forEach((btn) => {
        btn.addEventListener('click', function () {
          addWidget(drillTile.type, btn.getAttribute('data-add-variant'))
          drillTile = null
          closeDrawer()
        })
      })
      return
    }
    const query = (searchInput.value || '').trim().toLowerCase()
    const filtered = query ? catalog.filter((t) => t.label.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)) : catalog
    const grouped = new Map()
    filtered.forEach((tile) => {
      if (!grouped.has(tile.category)) grouped.set(tile.category, [])
      grouped.get(tile.category).push(tile)
    })
    const sections = CATEGORY_ORDER.filter((c) => grouped.has(c))
    if (sections.length === 0) {
      body.innerHTML = `<div class="widget-palette-empty">No widgets match "${escapeHtml(searchInput.value)}".</div>`
      return
    }
    body.innerHTML = sections.map((category) => {
      const tiles = grouped.get(category)
      return `<div class="widget-palette-section"><div class="widget-palette-section-title">${category}</div><div class="widget-tile-grid">${tiles.map((tile) => `
        <button type="button" class="widget-tile" data-tile-key="${tile.key}">
          <span class="widget-tile-icon">${widgetIconSvg(tile.icon)}</span>
          <span class="widget-tile-label">${escapeHtml(tile.label)}</span>
          ${tile.hasStyles ? `<span class="widget-tile-styles-badge">${tile.variants.length} styles</span>` : ''}
        </button>`).join('')}</div></div>`
    }).join('')
    body.querySelectorAll('[data-tile-key]').forEach((btn) => {
      const tile = filtered.find((t) => t.key === btn.getAttribute('data-tile-key'))
      btn.addEventListener('click', function () {
        if (tile.hasStyles) { drillTile = tile; renderPaletteHeader(); renderPaletteBody() }
        else { addWidget(tile.type, tile.variantId); closeDrawer() }
      })
    })
  }

  fab.addEventListener('click', openDrawer)
  backdrop.addEventListener('click', closeDrawer)
  closeBtn.addEventListener('click', closeDrawer)
  searchInput.addEventListener('input', renderPaletteBody)
  renderPaletteHeader()
  renderPaletteBody()
}

/* ============================================================
   Boot
   ============================================================ */

function bootDashboard() {
  initDashboardState()
  renderDashboard()
  initWidgetPalette()
  window.addEventListener('resize', function () {
    if (widgets.length > 0) renderCanvas()
  })
}
