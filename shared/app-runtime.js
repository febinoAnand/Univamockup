/* ==========================================================================
   Univa — static HTML build. Generic application runtime.

   Renders ANY template from shared/app-templates.js for an application
   instance (an `applications` record with templateKey + bindings), using
   only platform data:
     - entities    the assets in the bound asset group (+ their devices)
     - telemetry   shared/telemetry.js's DataTable (the single data table)
     - time        the bound shift schedule's shifts (Shift management)
     - user data   Store.applicationRecords (e.g. downtime reasons)

   Nothing in here knows about "production" or "energy" — each view type
   below reads what to show from the template's view definition, so the same
   code draws PMS, Energy monitoring, Crane monitoring, and any template
   added later.
   ========================================================================== */
(function () {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const CHART_ACCENT = '#7c3aed'
  const CHART_COMPARE = '#a8a29e'

  // Per-application UI state survives Application detail's full re-renders.
  const uiState = {}
  let host = null
  let currentAppId = null
  let charts = []
  let refreshTimer = null

  function stateFor(appId) {
    if (!uiState[appId]) uiState[appId] = { view: null, date: localIso(new Date()), shiftId: 'all', entityId: 'all', matrixKpi: null }
    return uiState[appId]
  }

  // ------------------------------------------------------------- helpers
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  }

  function localIso(date) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  function atTime(dateIso, hhmm, addDays) {
    const [y, m, d] = dateIso.split('-').map(Number)
    const [hh, mm] = (hhmm || '00:00').split(':').map(Number)
    return new Date(y, m - 1, d + (addDays || 0), hh, mm, 0, 0).getTime()
  }

  function clock(ms) {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function stamp(ms) {
    const d = new Date(ms)
    return `${localIso(d)} ${clock(ms)}`
  }

  // ------------------------------------------------- formula evaluation
  // Recursive-descent evaluator for + - * / ( ), numbers, and identifiers.
  // Any null/undefined operand or division by zero yields null ("—"), so a
  // KPI that can't be computed yet never shows NaN or Infinity.
  function evalFormula(formula, scope) {
    const tokens = String(formula).match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]/g) || []
    let pos = 0
    const peek = () => tokens[pos]
    const next = () => tokens[pos++]
    function primary() {
      const t = next()
      if (t === '(') {
        const v = expr()
        next()
        return v
      }
      if (t === '-') {
        const v = primary()
        return v == null ? null : -v
      }
      if (/^\d/.test(t)) return Number(t)
      const v = scope[t]
      return typeof v === 'number' && isFinite(v) ? v : null
    }
    function term() {
      let v = primary()
      while (peek() === '*' || peek() === '/') {
        const op = next()
        const r = primary()
        if (v == null || r == null) v = null
        else if (op === '*') v = v * r
        else v = r === 0 ? null : v / r
      }
      return v
    }
    function expr() {
      let v = term()
      while (peek() === '+' || peek() === '-') {
        const op = next()
        const r = term()
        v = v == null || r == null ? null : op === '+' ? v + r : v - r
      }
      return v
    }
    try {
      return expr()
    } catch (err) {
      return null
    }
  }

  function numericOnly(obj) {
    const out = {}
    Object.keys(obj || {}).forEach((k) => {
      const n = Number(obj[k])
      if (obj[k] !== '' && obj[k] != null && !Array.isArray(obj[k]) && isFinite(n)) out[k] = n
    })
    return out
  }

  // ------------------------------------------------------------ binding
  function entitiesFor(app, template) {
    const data = Store.get()
    const bindings = app.bindings || {}
    const assets = bindings.assetIds && bindings.assetIds.length
      ? data.assets.filter((a) => bindings.assetIds.includes(a.id))
      : data.assets.filter((a) => bindings.assetGroup && (a.groupNames || []).includes(bindings.assetGroup))
    return assets.map((asset) => {
      const profile = data.assetProfiles.find((p) => p.name === asset.profileName)
      const attrs = {}
      ;(template.attributes || []).forEach((a) => { attrs[a.key] = a.default })
      ;((profile && profile.attributes) || []).forEach((a) => { if (a.default !== '' && a.default != null) attrs[a.key] = a.default })
      Object.assign(attrs, asset.attributes || {})
      const deviceId = (asset.deviceIds || [])[0] || null
      return { id: asset.id, name: asset.name, asset, deviceId, device: data.devices.find((d) => d.id === deviceId) || null, attrs }
    })
  }

  // Every data point the bound entities' devices report, optionally of one kind.
  function candidateDataPoints(assetGroup, kind) {
    const data = Store.get()
    const byKey = new Map()
    data.assets
      .filter((a) => (a.groupNames || []).includes(assetGroup))
      .forEach((asset) => (asset.deviceIds || []).forEach((deviceId) => {
        const device = data.devices.find((d) => d.id === deviceId)
        const profile = device && data.deviceProfiles.find((p) => p.name === device.profileName)
        ;((profile && profile.dataPoints) || []).forEach((dp) => {
          if (!kind || dp.kind === kind) byKey.set(dp.key, Object.assign({ profileName: profile.name }, dp))
        })
      }))
    return Array.from(byKey.values())
  }

  // Suggests a key for each role: same-kind data points, preferring one
  // whose key or label mentions the role.
  function autoKeyMap(template, assetGroup) {
    const map = {}
    const used = new Set()
    template.roles.forEach((role) => {
      const options = candidateDataPoints(assetGroup, role.kind).filter((dp) => !used.has(dp.key))
      const words = (role.role + ' ' + role.label).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2)
      const pick = options.find((dp) => words.some((w) => (dp.key + ' ' + dp.label).toLowerCase().includes(w))) || (role.required ? options[0] : null)
      if (pick) {
        map[role.role] = pick.key
        used.add(pick.key)
      }
    })
    return map
  }

  function missingRoles(app, template) {
    const keyMap = (app.bindings && app.bindings.keyMap) || {}
    return template.roles.filter((r) => r.required && !keyMap[r.role])
  }

  // The bound schedule's shifts on `dateIso`, as time windows. A shift
  // whose end is at/before its start (or flagged midnightCrossed) ends the
  // next day. No schedule → one full-day window.
  function shiftWindows(app, dateIso) {
    const data = Store.get()
    const schedule = data.shiftSchedules.find((s) => s.id === (app.bindings || {}).shiftScheduleId)
    const day = DAY_NAMES[new Date(atTime(dateIso, '00:00')).getDay()]
    const shifts = schedule ? (schedule.assignments[day] || []).map((id) => data.shifts.find((s) => s.id === id)).filter(Boolean) : []
    if (!shifts.length) return [{ id: 'day', name: 'Full day', from: atTime(dateIso, '00:00'), to: atTime(dateIso, '00:00', 1) }]
    return shifts
      .map((s) => {
        const from = atTime(dateIso, s.startTime)
        let to = atTime(dateIso, s.endTime)
        if (to <= from || s.midnightCrossed) to = atTime(dateIso, s.endTime, 1)
        return { id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, from, to }
      })
      .sort((a, b) => a.from - b.from)
  }

  function selectedWindow(windows, shiftId) {
    const w = windows.find((x) => x.id === shiftId)
    if (w) return w
    return { id: 'all', name: 'All shifts', from: windows[0].from, to: windows[windows.length - 1].to }
  }

  // ----------------------------------------------------------- KPI engine
  function computeEntityKpis(rt, entity, from, to) {
    const keyMap = (rt.app.bindings && rt.app.bindings.keyMap) || {}
    const scope = Object.assign({}, numericOnly(rt.settings), numericOnly(entity.attrs))
    const out = {}
    rt.template.kpis.forEach((k) => {
      let v = null
      if (k.agg === 'minutes') {
        v = DataTable.aggregate({ agg: 'minutes', from, to })
      } else if (k.agg === 'manual') {
        // Application-wise manual data (AppEntries), not device telemetry.
        v = window.AppEntries ? AppEntries.aggregate({ appId: rt.app.id, entityId: entity.id, key: k.manual, from, to }) : null
      } else if (k.agg) {
        const key = keyMap[k.role]
        const role = rt.template.roles.find((r) => r.role === k.role)
        if (key && entity.deviceId) v = DataTable.aggregate({ deviceId: entity.deviceId, key, agg: k.agg, from, to, state: k.state })
        else if (role && !role.required && k.agg === 'delta') v = 0
      } else {
        v = evalFormula(k.formula, Object.assign({}, scope, out))
      }
      out[k.key] = v
    })
    return out
  }

  function combineKpis(rt, perEntity) {
    const out = {}
    const scope = numericOnly(rt.settings)
    rt.template.kpis.forEach((k) => {
      const combine = k.combine || (k.agg ? 'sum' : 'formula')
      if (combine === 'formula') {
        out[k.key] = evalFormula(k.formula, Object.assign({}, scope, out))
        return
      }
      const values = perEntity.map((e) => e[k.key]).filter((v) => typeof v === 'number')
      if (!values.length) out[k.key] = null
      else if (combine === 'avg') out[k.key] = values.reduce((a, b) => a + b, 0) / values.length
      else if (combine === 'max') out[k.key] = Math.max.apply(null, values)
      else out[k.key] = values.reduce((a, b) => a + b, 0)
    })
    return out
  }

  function computeAll(rt, entities, from, to) {
    const perEntity = entities.map((e) => computeEntityKpis(rt, e, from, to))
    return { perEntity, total: combineKpis(rt, perEntity) }
  }

  // A plan-type KPI (e.g. target = plannedMin / 60 × targetPerHour) is
  // normally evaluated on elapsed minutes ("target to date"); hourly
  // reports and charts want the whole slot's plan instead, even for the
  // hour in progress, so re-evaluate it with plannedMin = the slot length.
  function fullSlotTarget(rt, entities, key, from, to) {
    const k = rt.template.kpis.find((x) => x.key === key)
    if (!k || !k.formula) return 0
    return entities
      .map((e) => evalFormula(k.formula, Object.assign({}, numericOnly(rt.settings), numericOnly(e.attrs), { plannedMin: (to - from) / 60000 })))
      .filter((v) => typeof v === 'number')
      .reduce((a, b) => a + b, 0)
  }

  function kpiDef(rt, key) {
    return rt.template.kpis.find((k) => k.key === key) || { key, label: key }
  }

  function formatKpi(rt, key, value, opts) {
    if (value == null || !isFinite(value)) return '—'
    const k = kpiDef(rt, key)
    const unit = k.unit && !(opts && opts.bare) ? ` ${k.unit}` : ''
    switch (k.format) {
      case 'percent': return `${(value * 100).toFixed(1)}%`
      case 'duration': {
        const m = Math.round(value)
        return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
      }
      case 'currency': return `${rt.settings.currency || '₹'}${Math.round(value).toLocaleString()}`
      case 'decimal': return value.toFixed(2) + unit
      case 'int': return Math.round(value).toLocaleString() + unit
      default: return (Math.round(value * 10) / 10).toLocaleString() + unit
    }
  }

  // Green at/above target, amber within 10 points, red below.
  function kpiTone(rt, key, value) {
    const k = kpiDef(rt, key)
    if (value == null || !k.targetSetting) return ''
    const target = Number(rt.settings[k.targetSetting]) / 100
    if (!isFinite(target)) return ''
    return value >= target ? 'good' : value >= target - 0.1 ? 'warn' : 'bad'
  }

  // --------------------------------------------------------- live status
  function latestValues(rt, entity) {
    const row = entity.deviceId ? DataTable.latest(entity.deviceId) : null
    return row ? row.values : null
  }

  function stateBadge(rt, entity, values) {
    const key = ((rt.app.bindings || {}).keyMap || {}).state
    if (!entity.device) return '<span class="rt-state rt-state-unknown" title="No device linked">No device</span>'
    if (!values) return '<span class="rt-state rt-state-down" title="Device offline — no recent messages">Offline</span>'
    if (!key) return '<span class="rt-state rt-state-running" title="Reporting">Online</span>'
    const role = rt.template.roles.find((r) => r.role === 'state') || {}
    const states = role.states || ['running', 'idle', 'down']
    const v = values[key]
    const tone = v === states[0] ? 'running' : v === states[states.length - 1] ? 'down' : 'idle'
    return `<span class="rt-state rt-state-${tone}" title="${esc(key)} = ${esc(v)}">${esc(v)}</span>`
  }

  function dataPointFor(entity, key) {
    return entity.deviceId ? DataTable.dataPointsFor(entity.deviceId).find((dp) => dp.key === key) : null
  }

  // --------------------------------------------------------------- charts
  function destroyCharts() {
    charts.forEach((c) => { try { c.destroy() } catch (err) { /* already gone */ } })
    charts = []
  }

  function renderChart(elId, options) {
    const el = document.getElementById(elId)
    if (!el || typeof ApexCharts === 'undefined') return
    const config = Object.assign({
      dataLabels: { enabled: false },
      grid: { borderColor: '#e7e5e4', strokeDashArray: 3 },
      legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px' },
      tooltip: { theme: 'light' },
    }, options)
    config.chart = Object.assign({ toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit', height: 280 }, options.chart || {})
    const chart = new ApexCharts(el, config)
    chart.render()
    charts.push(chart)
  }

  // ---------------------------------------------------------------- UI bits
  function toolbar(rt, { date = true, shift = false, entity = false, kpiSelect = null }) {
    const s = rt.ui
    const windows = shiftWindows(rt.app, s.date)
    return `
      <div class="rt-toolbar">
        ${date ? `<label class="rt-field"><span>Date</span><input type="date" data-rt="date" value="${s.date}" max="${localIso(new Date())}" /></label>` : ''}
        ${shift ? `<label class="rt-field"><span>Shift</span><select data-rt="shiftId">
          <option value="all"${s.shiftId === 'all' ? ' selected' : ''}>All shifts</option>
          ${windows.filter((w) => w.id !== 'day').map((w) => `<option value="${w.id}"${s.shiftId === w.id ? ' selected' : ''}>${esc(w.name)} (${clock(w.from)}–${clock(w.to)})</option>`).join('')}
        </select></label>` : ''}
        ${entity ? `<label class="rt-field"><span>${esc(rt.template.entity.label)}</span><select data-rt="entityId">
          <option value="all"${s.entityId === 'all' ? ' selected' : ''}>All ${esc(rt.template.entity.plural.toLowerCase())}</option>
          ${rt.entities.map((e) => `<option value="${e.id}"${s.entityId === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}
        </select></label>` : ''}
        ${kpiSelect ? `<label class="rt-field"><span>Metric</span><select data-rt="matrixKpi">
          ${kpiSelect.map((k) => `<option value="${k}"${s.matrixKpi === k ? ' selected' : ''}>${esc(kpiDef(rt, k).label)}</option>`).join('')}
        </select></label>` : ''}
        <span class="rt-toolbar-spacer"></span>
        ${date ? `<button type="button" class="modal-button secondary rt-today-btn" data-rt-today title="Jump to today">Today</button>` : ''}
      </div>`
  }

  function emptyEntities(rt) {
    return `<div class="detail-card"><p class="section-empty">No ${esc(rt.template.entity.plural.toLowerCase())} are bound to this application yet. Pick an asset group in the <strong>Configuration</strong> tab.</p></div>`
  }

  // ================================================================ VIEWS
  const VIEWS = {}

  // ------------------------------------------------------- kpi-overview
  VIEWS['kpi-overview'] = {
    render(rt, view) {
      if (!rt.entities.length) return emptyEntities(rt)
      const windows = shiftWindows(rt.app, rt.ui.date)
      const win = selectedWindow(windows, rt.ui.shiftId)
      const { perEntity, total } = computeAll(rt, rt.entities, win.from, win.to)
      const tiles = view.kpis.map((key) => {
        const k = kpiDef(rt, key)
        const tone = kpiTone(rt, key, total[key])
        const sub = k.targetSetting ? `Target ${rt.settings[k.targetSetting]}%` : k.formula && k.format === 'percent' ? esc(k.formula) : ''
        return `
          <div class="rt-kpi-tile${tone ? ' rt-tone-' + tone : ''}" title="${esc(k.formula || (k.agg ? `${k.agg} of ${k.role || 'window'}` : ''))}">
            <span class="rt-kpi-label">${esc(k.label)}</span>
            <span class="rt-kpi-value">${formatKpi(rt, key, total[key])}</span>
            ${sub ? `<span class="rt-kpi-sub">${sub}</span>` : ''}
          </div>`
      }).join('')

      const cards = rt.entities.map((entity, i) => {
        const kpis = perEntity[i]
        const values = latestValues(rt, entity)
        let pct = null
        if (view.progress) pct = view.progress.of ? (kpis[view.progress.of] ? kpis[view.progress.value] / kpis[view.progress.of] : null) : kpis[view.progress.value]
        const barTone = pct == null ? '' : pct >= 0.95 ? 'good' : pct >= 0.8 ? 'warn' : 'bad'
        const sub = entity.attrs.workCenter || entity.attrs.feeder || entity.asset.location || ''
        return `
          <a class="rt-entity-card" href="asset-detail.html#${entity.id}" title="Open ${esc(entity.name)}">
            <div class="rt-entity-card-head">
              <div><span class="rt-entity-name">${esc(entity.name)}</span>${sub ? `<span class="rt-entity-sub">${esc(sub)}</span>` : ''}</div>
              ${stateBadge(rt, entity, values)}
            </div>
            <div class="rt-entity-stats">
              ${view.cardKpis.map((key) => `<div><span class="rt-kpi-label">${esc(kpiDef(rt, key).label)}</span><strong class="${'rt-tone-text-' + kpiTone(rt, key, kpis[key])}">${formatKpi(rt, key, kpis[key], { bare: true })}</strong></div>`).join('')}
            </div>
            ${view.progress ? `<div class="rt-progress" title="${pct == null ? '—' : (pct * 100).toFixed(1) + '%'}"><div class="rt-progress-fill rt-tone-bg-${barTone}" style="width:${Math.min(100, Math.max(0, (pct || 0) * 100)).toFixed(1)}%"></div></div>` : ''}
          </a>`
      }).join('')

      const chartTitle = `${kpiDef(rt, view.chart.kpi).label} by hour${view.chart.compare ? ` vs ${kpiDef(rt, view.chart.compare).label.toLowerCase()}` : ''}`
      return `
        ${toolbar(rt, { shift: true })}
        <div class="rt-kpi-grid">${tiles}</div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('chart-bar')}</span>${esc(chartTitle)}<span class="rt-card-note">${esc(win.name)} · ${clock(win.from)}–${clock(win.to)}</span></h2>
          <div id="rt-overview-chart" class="rt-chart"></div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg(rt.template.icon)}</span>${esc(rt.template.entity.plural)}<span class="rt-card-note">${rt.entities.length} bound · live status</span></h2>
          <div class="rt-entity-grid">${cards}</div>
        </div>`
    },
    wire(rt, view) {
      if (!rt.entities.length) return
      const windows = shiftWindows(rt.app, rt.ui.date)
      const win = selectedWindow(windows, rt.ui.shiftId)
      const categories = []
      const values = []
      const compare = []
      const now = Date.now()
      for (let t = win.from; t < win.to; t += 3600000) {
        categories.push(clock(t))
        const end = Math.min(t + 3600000, win.to)
        if (view.chart.compare) compare.push(Math.round(fullSlotTarget(rt, rt.entities, view.chart.compare, t, end)))
        if (t > now) {
          values.push(null)
          continue
        }
        const v = computeAll(rt, rt.entities, t, end).total[view.chart.kpi]
        values.push(v == null ? null : Math.round(v * 10) / 10)
      }
      const series = [{ name: kpiDef(rt, view.chart.kpi).label, type: 'column', data: values }]
      if (view.chart.compare) series.push({ name: kpiDef(rt, view.chart.compare).label, type: 'line', data: compare })
      renderChart('rt-overview-chart', {
        series,
        chart: { type: 'line' },
        colors: [CHART_ACCENT, CHART_COMPARE],
        stroke: { width: [0, 2], dashArray: [0, 4] },
        plotOptions: { bar: { columnWidth: '55%', borderRadius: 3 } },
        xaxis: { categories, labels: { style: { fontSize: '11px' } } },
        yaxis: { labels: { formatter: (v) => (v == null ? '' : Math.round(v).toLocaleString()) } },
      })
    },
  }

  // ------------------------------------------------------- shift-matrix
  VIEWS['shift-matrix'] = {
    render(rt, view) {
      if (!rt.entities.length) return emptyEntities(rt)
      if (!rt.ui.matrixKpi || !view.kpis.includes(rt.ui.matrixKpi)) rt.ui.matrixKpi = view.kpis[0]
      const key = rt.ui.matrixKpi
      const windows = shiftWindows(rt.app, rt.ui.date)
      const now = Date.now()
      const cols = windows.map((w) => (w.from > now ? null : computeAll(rt, rt.entities, w.from, w.to)))
      const day = computeAll(rt, rt.entities, windows[0].from, windows[windows.length - 1].to)
      const cell = (res, i) => (res ? formatKpi(rt, key, res.perEntity[i][key]) : '—')
      const rows = rt.entities.map((e, i) => `
        <tr>
          <td class="card-title-cell"><a href="asset-detail.html#${e.id}">${esc(e.name)}</a>${e.attrs.workCenter ? ` <span class="rt-muted">${esc(e.attrs.workCenter)}</span>` : ''}</td>
          ${windows.map((w, c) => `<td data-label="${esc(w.name)}">${cell(cols[c], i)}</td>`).join('')}
          <td data-label="Day total" class="highlight-cell">${formatKpi(rt, key, day.perEntity[i][key])}</td>
        </tr>`).join('')
      return `
        ${toolbar(rt, { kpiSelect: view.kpis })}
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('report')}</span>${esc(kpiDef(rt, key).label)} by ${esc(rt.template.entity.label.toLowerCase())} and shift<span class="rt-card-note">${esc(rt.ui.date)}</span></h2>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>${esc(rt.template.entity.label)}</th>${windows.map((w) => `<th title="${clock(w.from)}–${clock(w.to)}">${esc(w.name)}<span class="rt-th-sub">${clock(w.from)}–${clock(w.to)}</span></th>`).join('')}<th>Day total</th></tr></thead>
              <tbody>
                ${rows}
                <tr class="total-row"><td>Total</td>${windows.map((w, c) => `<td data-label="${esc(w.name)}">${cols[c] ? formatKpi(rt, key, cols[c].total[key]) : '—'}</td>`).join('')}<td data-label="Day total">${formatKpi(rt, key, day.total[key])}</td></tr>
              </tbody>
            </table>
          </div>
        </div>`
    },
    wire() {},
  }

  // ------------------------------------------------ hourly-shift-report
  VIEWS['hourly-shift-report'] = {
    render(rt, view) {
      if (!rt.entities.length) return emptyEntities(rt)
      const entities = rt.ui.entityId === 'all' ? rt.entities : rt.entities.filter((e) => e.id === rt.ui.entityId)
      const windows = shiftWindows(rt.app, rt.ui.date)
      const now = Date.now()
      const valueLabel = kpiDef(rt, view.kpi).label
      const compareLabel = kpiDef(rt, view.compare).label
      const cards = windows.map((w) => {
        let cumulative = 0
        let totalV = 0
        let totalC = 0
        const slots = []
        for (let t = w.from; t < w.to; t += 3600000) {
          const end = Math.min(t + 3600000, w.to)
          if (t > now) {
            slots.push(`<tr class="rt-future-row"><td>${clock(t)} – ${clock(end)}</td><td data-label="${esc(valueLabel)}">—</td><td data-label="${esc(compareLabel)}">—</td><td data-label="Difference">—</td><td data-label="Cumulative">—</td></tr>`)
            continue
          }
          const actual = computeAll(rt, entities, t, end).total[view.kpi] || 0
          const target = Math.round(fullSlotTarget(rt, entities, view.compare, t, end))
          const diff = Math.round(actual) - target
          cumulative += actual
          totalV += actual
          totalC += target
          const live = end > now
          slots.push(`<tr${live ? ' class="rt-live-row"' : ''}><td>${clock(t)} – ${clock(end)}${live ? ' <span class="rt-live-dot" title="In progress"></span>' : ''}</td><td data-label="${esc(valueLabel)}">${formatKpi(rt, view.kpi, actual)}</td><td data-label="${esc(compareLabel)}">${formatKpi(rt, view.compare, target)}</td><td data-label="Difference" class="${diff < 0 ? 'rt-neg' : 'rt-pos'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()}</td><td data-label="Cumulative">${formatKpi(rt, view.kpi, cumulative)}</td></tr>`)
        }
        const diffTotal = Math.round(totalV) - Math.round(totalC)
        return `
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('shift')}</span>${esc(w.name)}<span class="rt-card-note">${clock(w.from)}–${clock(w.to)}${w.from > now ? ' · upcoming' : w.to > now ? ' · in progress' : ''}</span></h2>
            <div class="table-scroll">
              <table class="data-table">
                <thead><tr><th>Time</th><th>${esc(valueLabel)}</th><th>${esc(compareLabel)}</th><th>Difference</th><th>Cumulative</th></tr></thead>
                <tbody>
                  ${slots.join('')}
                  <tr class="total-row"><td>Total</td><td data-label="${esc(valueLabel)}">${formatKpi(rt, view.kpi, totalV)}</td><td data-label="${esc(compareLabel)}">${formatKpi(rt, view.compare, totalC)}</td><td data-label="Difference" class="${diffTotal < 0 ? 'rt-neg' : 'rt-pos'}">${diffTotal > 0 ? '+' : ''}${diffTotal.toLocaleString()}</td><td data-label="Cumulative">—</td></tr>
                </tbody>
              </table>
            </div>
          </div>`
      }).join('')
      return `${toolbar(rt, { entity: true })}${cards}`
    },
    wire() {},
  }


  // ------------------------------------------------------------ event-log
  VIEWS['event-log'] = {
    collect(rt, view) {
      const key = ((rt.app.bindings || {}).keyMap || {})[view.role]
      const windows = shiftWindows(rt.app, rt.ui.date)
      const win = selectedWindow(windows, rt.ui.shiftId)
      const records = (Store.get().applicationRecords || []).filter((r) => r.appId === rt.app.id && r.type === 'event-reason')
      const events = []
      if (key) {
        rt.entities.forEach((entity) => {
          if (!entity.deviceId) return
          DataTable.events({ deviceId: entity.deviceId, key, state: view.state, from: win.from, to: win.to }).forEach((ev) => {
            const rec = records.find((r) => r.key === ev.id)
            events.push(Object.assign(ev, { entity, reason: rec ? rec.data.reason : '' }))
          })
        })
      }
      events.sort((a, b) => b.start - a.start)
      return { events, win, key }
    },
    render(rt, view) {
      if (!rt.entities.length) return emptyEntities(rt)
      const { events, win, key } = this.collect(rt, view)
      const reasons = rt.settings[view.reasonSetting] || []
      const totalMin = events.reduce((a, e) => a + e.minutes, 0)
      const longest = events.reduce((a, e) => Math.max(a, e.minutes), 0)
      const unassigned = events.filter((e) => !e.reason).length
      const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`)
      // Clock time only, unless the event falls on another day (night shift).
      const when = (ms) => (localIso(new Date(ms)) === rt.ui.date ? clock(ms) : stamp(ms))
      const rows = events.map((e) => `
        <tr>
          <td class="card-title-cell"><a href="asset-detail.html#${e.entity.id}">${esc(e.entity.name)}</a></td>
          <td data-label="Start">${when(e.start)}</td>
          <td data-label="End">${e.ongoing ? '<span class="rt-state rt-state-down">Ongoing</span>' : when(e.end)}</td>
          <td data-label="Duration">${fmt(e.minutes)}</td>
          <td data-label="Reason">
            <select class="rt-reason-select${e.reason ? '' : ' rt-unassigned'}" data-reason-event="${esc(e.id)}" data-reason-entity="${e.entity.id}" data-reason-start="${e.start}" data-reason-minutes="${e.minutes}">
              <option value="">Unassigned</option>
              ${reasons.map((r) => `<option${e.reason === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}
            </select>
          </td>
        </tr>`).join('')
      return `
        ${toolbar(rt, { shift: true })}
        <div class="rt-kpi-grid">
          <div class="rt-kpi-tile"><span class="rt-kpi-label">Events</span><span class="rt-kpi-value">${events.length}</span><span class="rt-kpi-sub">${esc(win.name)}</span></div>
          <div class="rt-kpi-tile"><span class="rt-kpi-label">Total ${esc(view.state)} time</span><span class="rt-kpi-value">${fmt(totalMin)}</span></div>
          <div class="rt-kpi-tile"><span class="rt-kpi-label">Longest event</span><span class="rt-kpi-value">${fmt(longest)}</span></div>
          <div class="rt-kpi-tile${unassigned ? ' rt-tone-warn' : ' rt-tone-good'}"><span class="rt-kpi-label">Unassigned reasons</span><span class="rt-kpi-value">${unassigned}</span></div>
        </div>
        <div class="rt-two-col">
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('list')}</span>Events<span class="rt-card-note">${esc(key || 'unmapped')} = "${esc(view.state)}"</span></h2>
            ${events.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>${esc(rt.template.entity.label)}</th><th>Start</th><th>End</th><th>Duration</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="section-empty">No events in this window.</p>'}
          </div>
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('chart-bar')}</span>Minutes by reason</h2>
            <div id="rt-reason-chart" class="rt-chart"></div>
          </div>
        </div>`
    },
    wire(rt, view) {
      document.querySelectorAll('[data-reason-event]').forEach((select) =>
        select.addEventListener('change', () => {
          Store.upsertApplicationRecord(rt.app.id, 'event-reason', select.getAttribute('data-reason-event'), {
            reason: select.value,
            entityId: select.getAttribute('data-reason-entity'),
            start: Number(select.getAttribute('data-reason-start')),
            minutes: Number(select.getAttribute('data-reason-minutes')),
          })
          UI.toast(select.value ? `Reason set to "${select.value}"` : 'Reason cleared')
          rerender()
        }),
      )
      const { events } = this.collect(rt, view)
      const totals = {}
      events.forEach((e) => { totals[e.reason || 'Unassigned'] = (totals[e.reason || 'Unassigned'] || 0) + e.minutes })
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1])
      if (!entries.length) {
        const el = document.getElementById('rt-reason-chart')
        if (el) el.innerHTML = '<p class="section-empty">Nothing to chart.</p>'
        return
      }
      renderChart('rt-reason-chart', {
        series: [{ name: 'Minutes', data: entries.map((e) => e[1]) }],
        chart: { type: 'bar', height: Math.max(180, entries.length * 44) },
        colors: [CHART_ACCENT],
        plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '60%' } },
        xaxis: { categories: entries.map((e) => e[0]) },
      })
    },
  }

  // --------------------------------------------------------- entity-table
  VIEWS['entity-table'] = {
    render(rt, view) {
      if (!rt.entities.length) return emptyEntities(rt)
      const keyMap = (rt.app.bindings || {}).keyMap || {}
      const roles = view.columns.map((r) => rt.template.roles.find((x) => x.role === r)).filter(Boolean)
      const attrs = rt.template.attributes || []
      const rows = rt.entities.map((e) => {
        const values = latestValues(rt, e)
        const roleCells = roles.map((role) => {
          const key = keyMap[role.role]
          if (role.kind === 'state') return `<td data-label="${esc(role.label)}">${stateBadge(rt, e, values)}</td>`
          if (!key || !values) return `<td data-label="${esc(role.label)}">—</td>`
          const dp = dataPointFor(e, key) || {}
          const v = values[key]
          return `<td data-label="${esc(role.label)}">${typeof v === 'number' ? v.toLocaleString() : esc(v)}${dp.unit ? ` <span class="rt-muted">${esc(dp.unit)}</span>` : ''}</td>`
        }).join('')
        return `
          <tr>
            <td class="card-title-cell"><a href="asset-detail.html#${e.id}">${esc(e.name)}</a><span class="rt-entity-sub">${esc(e.asset.location || '')}</span></td>
            ${attrs.map((a) => `<td data-label="${esc(a.label)}">${esc(e.attrs[a.key] ?? '—')}${a.unit && e.attrs[a.key] != null ? ` <span class="rt-muted">${esc(a.unit)}</span>` : ''}</td>`).join('')}
            <td data-label="Device">${e.device ? `<a href="device-detail.html#${e.device.id}">${esc(e.device.name)}</a>` : '<span class="rt-muted">None linked</span>'}</td>
            ${roleCells}
          </tr>`
      }).join('')
      return `
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg(rt.template.icon)}</span>${esc(rt.template.entity.plural)}<span class="rt-card-note">latest message · refreshes every minute</span></h2>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>${esc(rt.template.entity.label)}</th>${attrs.map((a) => `<th>${esc(a.label)}</th>`).join('')}<th>Device</th>${roles.map((r) => `<th>${esc(r.label)}<span class="rt-th-sub">${esc(keyMap[r.role] || 'unmapped')}</span></th>`).join('')}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`
    },
    wire() {},
  }

  // ------------------------------------------------------------ entry-log
  // This application's manual entries (AppEntries → applicationRecords):
  // quick-add row on top, filtered table below. Notion's data-form and
  // data-sheet blocks write to the same records.
  function manualInputHtml(field, attrs) {
    if (field.type === 'select') return `<select ${attrs}><option value="">—</option>${(field.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
    return `<input type="${field.type === 'number' ? 'number' : 'text'}" step="any" ${attrs} placeholder="${esc(field.unit || '')}" />`
  }

  VIEWS['entry-log'] = {
    render(rt) {
      if (!window.AppEntries) return '<p class="section-empty">Manual entries are unavailable on this page.</p>'
      const fields = AppEntries.fields(rt.app.id)
      const from = atTime(rt.ui.date, '00:00')
      const to = atTime(rt.ui.date, '00:00', 1)
      const ids = rt.ui.entityId === 'all' ? null : [rt.ui.entityId]
      const rows = AppEntries.list({ appId: rt.app.id, entityIds: ids, from, to })
      const byId = {}
      rt.entities.forEach((e) => { byId[e.id] = e })
      const summary = fields.filter((f) => f.kind !== 'text').map((f) => {
        const v = AppEntries.aggregate({ appId: rt.app.id, entityIds: ids, key: f.key, from, to })
        return `<div class="rt-kpi-tile"><span class="rt-kpi-label">${esc(f.label)}${f.kind === 'reading' ? ' (avg)' : ''}</span><span class="rt-kpi-value">${v == null ? '—' : (Math.round(v * 100) / 100).toLocaleString()}${f.unit ? ` <small class="rt-muted">${esc(f.unit)}</small>` : ''}</span><span class="rt-kpi-sub">${esc(rt.ui.date)}</span></div>`
      }).join('')
      const tableRows = rows.map((r) => `
        <tr>
          <td data-label="Time" class="dx-ts">${localIso(new Date(r.ts)) === rt.ui.date ? clock(r.ts) : stamp(r.ts)}</td>
          <td data-label="${esc(rt.template.entity.label)}">${byId[r.entityId] ? `<a href="asset-detail.html#${r.entityId}">${esc(byId[r.entityId].name)}</a>` : esc(r.entityId || '—')}</td>
          ${fields.map((f) => `<td data-label="${esc(f.label)}">${r.data[f.key] == null || r.data[f.key] === '' ? '<span class="rt-muted">—</span>' : esc(r.data[f.key])}</td>`).join('')}
          <td data-label="Source"><span class="rt-muted">${(r.key || '').startsWith('sheet:') ? 'Data sheet' : 'Form'} · ${esc(r.enteredBy || '')}</span></td>
          <td class="data-table-menu-col"><button type="button" class="notion-row-del rt-link-btn" data-entry-delete="${r.id}" title="Delete entry" aria-label="Delete entry">&times;</button></td>
        </tr>`).join('')
      return `
        ${toolbar(rt, { entity: true })}
        ${summary ? `<div class="rt-kpi-grid">${summary}</div>` : ''}
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('clipboard')}</span>Add entry<span class="rt-card-note">saved to ${esc(rt.app.name)} only, not the device data table</span></h2>
          ${fields.length && rt.entities.length ? `
          <div class="rt-entry-form">
            <label class="rt-field"><span>${esc(rt.template.entity.label)}</span><select data-entry-entity>${rt.entities.map((e) => `<option value="${e.id}"${rt.ui.entityId === e.id ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
            ${fields.map((f) => `<label class="rt-field"><span>${esc(f.label)}${f.unit ? ` (${esc(f.unit)})` : ''}</span>${manualInputHtml(f, `data-entry-field="${esc(f.key)}"`)}</label>`).join('')}
            <button type="button" class="modal-button primary" data-entry-add>Add entry</button>
          </div>` : `<p class="section-empty">${fields.length ? 'Bind an asset group first.' : 'No manual fields yet. Add some in the Configuration tab.'}</p>`}
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('list')}</span>Entries<span class="rt-card-note">${rows.length} on ${esc(rt.ui.date)}</span></h2>
          ${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Time</th><th>${esc(rt.template.entity.label)}</th>${fields.map((f) => `<th>${esc(f.label)}${f.unit ? `<span class="rt-th-sub">${esc(f.unit)}</span>` : ''}</th>`).join('')}<th>Source</th><th class="data-table-menu-col"></th></tr></thead><tbody>${tableRows}</tbody></table></div>` : '<p class="section-empty">No entries on this date.</p>'}
        </div>`
    },
    wire(rt) {
      document.querySelector('[data-entry-add]')?.addEventListener('click', () => {
        const data = {}
        document.querySelectorAll('[data-entry-field]').forEach((el) => {
          if (el.value === '') return
          const field = AppEntries.field(rt.app.id, el.getAttribute('data-entry-field'))
          data[field.key] = field.type === 'number' ? Number(el.value) : el.value
        })
        if (!Object.keys(data).length) {
          UI.toast('Enter at least one value.')
          return
        }
        const isToday = rt.ui.date === localIso(new Date())
        AppEntries.add({ appId: rt.app.id, entityId: document.querySelector('[data-entry-entity]').value, ts: isToday ? Date.now() : atTime(rt.ui.date, '12:00'), data })
        UI.toast('Entry added')
        rerender()
      })
      document.querySelectorAll('[data-entry-delete]').forEach((btn) =>
        btn.addEventListener('click', () => {
          AppEntries.remove(btn.getAttribute('data-entry-delete'))
          UI.toast('Entry deleted')
          rerender()
        }),
      )
    },
  }

  // -------------------------------------------------------------- bindings
  let bindingsDraft = null
  const MANUAL_KINDS = { number: ['quantity', 'reading'], text: ['text'], select: ['text'] }

  VIEWS.bindings = {
    render(rt) {
      const data = Store.get()
      if (!bindingsDraft || bindingsDraft.appId !== rt.app.id) {
        bindingsDraft = { appId: rt.app.id, bindings: JSON.parse(JSON.stringify(rt.app.bindings || {})), settings: Object.assign({}, rt.settings), manualFields: window.AppEntries ? JSON.parse(JSON.stringify(AppEntries.fields(rt.app.id))) : null }
        bindingsDraft.bindings.keyMap = bindingsDraft.bindings.keyMap || {}
      }
      const b = bindingsDraft.bindings
      const roleRows = rt.template.roles.map((role) => {
        const options = candidateDataPoints(b.assetGroup, role.kind)
        return `
          <tr>
            <td class="card-title-cell">${esc(role.label)}${role.required ? ' <span class="rt-required" title="Required">*</span>' : ''}<span class="rt-entity-sub">role "${esc(role.role)}"</span></td>
            <td data-label="Kind"><span class="rt-kind rt-kind-${role.kind}">${role.kind}</span></td>
            <td data-label="Data point">
              <select data-keymap="${role.role}">
                <option value="">— Not mapped —</option>
                ${options.map((dp) => `<option value="${esc(dp.key)}"${b.keyMap[role.role] === dp.key ? ' selected' : ''}>${esc(dp.key)} · ${esc(dp.label)}${dp.unit ? ' (' + esc(dp.unit) + ')' : ''}</option>`).join('')}
              </select>
              ${options.length ? '' : `<span class="rt-entity-sub">No ${role.kind} data points on the bound devices' profiles.</span>`}
            </td>
          </tr>`
      }).join('')
      const settingFields = (rt.template.settings || []).map((s) => {
        const v = bindingsDraft.settings[s.key]
        const input = s.type === 'list'
          ? `<textarea rows="${Math.max(3, (v || []).length)}" data-setting="${s.key}" data-setting-type="list">${esc((v || []).join('\n'))}</textarea><span class="rt-entity-sub">One per line</span>`
          : `<input type="${s.type === 'number' ? 'number' : 'text'}" data-setting="${s.key}" data-setting-type="${s.type}" value="${esc(v ?? '')}" />`
        return `<div class="modal-field"><label>${esc(s.label)}${s.unit ? ` (${esc(s.unit)})` : ''}</label>${input}</div>`
      }).join('')
      const attrs = rt.template.attributes || []
      const attrRows = rt.entities.map((e) => `
        <tr>
          <td class="card-title-cell">${esc(e.name)}</td>
          ${attrs.map((a) => `<td data-label="${esc(a.label)}"><input class="rt-inline-input" type="${a.type === 'number' ? 'number' : 'text'}" step="any" data-attr-entity="${e.id}" data-attr-key="${a.key}" value="${esc(e.attrs[a.key] ?? '')}" /></td>`).join('')}
        </tr>`).join('')
      const missing = rt.template.roles.filter((r) => r.required && !b.keyMap[r.role])

      return `
        <div class="rt-two-col">
          <div class="detail-card">
            <h2><span class="section-icon">${iconSvg('link')}</span>Bindings</h2>
            <div class="rt-form-grid">
              <div class="modal-field"><label>Asset group (${esc(rt.template.entity.plural.toLowerCase())})</label>
                <select data-binding="assetGroup">
                  <option value="">— Select —</option>
                  ${data.assetGroups.map((g) => `<option${b.assetGroup === g.name ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}
                </select>
              </div>
              <div class="modal-field"><label>Shift schedule</label>
                <select data-binding="shiftScheduleId">
                  <option value="">None (full calendar day)</option>
                  ${data.shiftSchedules.map((s) => `<option value="${s.id}"${b.shiftScheduleId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
                </select>
              </div>
            </div>
            <h3 class="rt-subheading">Data mapping</h3>
            <p class="rt-help">The template asks for data by <em>role</em>. Map each role to the data point key your devices actually send. This is what lets any vendor's device work with this application.</p>
            ${missing.length ? `<div class="rt-banner rt-banner-warn">Required role${missing.length > 1 ? 's' : ''} not mapped: ${missing.map((r) => esc(r.label)).join(', ')}</div>` : ''}
            <div class="table-scroll">
              <table class="data-table"><thead><tr><th>Role</th><th>Kind</th><th>Data point</th></tr></thead><tbody>${roleRows}</tbody></table>
            </div>
            ${settingFields ? `<h3 class="rt-subheading">Settings</h3><div class="rt-form-grid">${settingFields}</div>` : ''}
            ${bindingsDraft.manualFields ? `
            <h3 class="rt-subheading">Manual fields</h3>
            <p class="rt-help">Data people type in for this application, such as scrap, remarks, or a hand-read meter. It is stored with this application only, not in the device data table. Custom App data blocks and the Manual entries tab use these fields. <em>Quantity</em> values are summed, <em>reading</em> values are averaged, and <em>text</em> keeps the latest value.</p>
            <div>${bindingsDraft.manualFields.map((f, i) => `
              <div class="dp-row" style="grid-template-columns: 1fr 1.2fr 0.6fr 0.8fr 0.8fr 1.2fr auto;">
                <div class="modal-field"><label>Key*</label><input type="text" data-mf="${i}" data-mf-field="key" value="${esc(f.key)}" /></div>
                <div class="modal-field"><label>Label</label><input type="text" data-mf="${i}" data-mf-field="label" value="${esc(f.label)}" /></div>
                <div class="modal-field"><label>Unit</label><input type="text" data-mf="${i}" data-mf-field="unit" value="${esc(f.unit || '')}" /></div>
                <div class="modal-field"><label>Type</label><select data-mf="${i}" data-mf-field="type">${['number', 'text', 'select'].map((t) => `<option${f.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
                <div class="modal-field"><label>Kind</label><select data-mf="${i}" data-mf-field="kind">${(MANUAL_KINDS[f.type] || ['text']).map((k) => `<option${f.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
                <div class="modal-field"><label>Options</label><input type="text" data-mf="${i}" data-mf-field="options" value="${esc((f.options || []).join(', '))}" ${f.type === 'select' ? '' : 'disabled'} placeholder="${f.type === 'select' ? 'A, B, C' : 'select only'}" /></div>
                <button type="button" class="dp-remove" data-mf-remove="${i}" aria-label="Remove field" title="Remove field">&times;</button>
              </div>`).join('')}
              <button type="button" class="metadata-add" data-mf-add>+ Add manual field</button>
            </div>` : ''}
            <div class="rt-actions">
              <button type="button" class="modal-button secondary" data-bindings-reset>Discard changes</button>
              <button type="button" class="modal-button primary" data-bindings-save>Save configuration</button>
            </div>
          </div>
          <div>
            <div class="detail-card">
              <h2><span class="section-icon">${iconSvg(rt.template.icon)}</span>Template</h2>
              <div class="rt-template-meta">
                <div><span class="rt-kpi-label">Template</span><strong>${esc(rt.template.name)}</strong></div>
                <div><span class="rt-kpi-label">Version</span><strong>${esc(rt.template.version)}</strong></div>
                <div><span class="rt-kpi-label">Category</span><strong>${esc(rt.template.category)}</strong></div>
                <div><span class="rt-kpi-label">Entity</span><strong>${esc(rt.template.entity.label)}</strong></div>
              </div>
              <p class="rt-help">${esc(rt.template.description)}</p>
              <h3 class="rt-subheading">KPI definitions</h3>
              <ul class="rt-kpi-defs">
                ${rt.template.kpis.map((k) => `<li><strong>${esc(k.label)}</strong><code>${esc(k.formula || `${k.agg}(${k.role || 'window'}${k.state ? ' = ' + k.state : ''})`)}</code></li>`).join('')}
              </ul>
              <details class="rt-json"><summary>Template definition (JSON)</summary><pre>${esc(JSON.stringify(rt.template, null, 2))}</pre></details>
            </div>
          </div>
        </div>
        ${attrs.length ? `
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('profile')}</span>${esc(rt.template.entity.label)} attributes<span class="rt-card-note">stored on each asset</span></h2>
          ${rt.entities.length ? `
          <div class="table-scroll">
            <table class="data-table"><thead><tr><th>${esc(rt.template.entity.label)}</th>${attrs.map((a) => `<th>${esc(a.label)}${a.unit ? `<span class="rt-th-sub">${esc(a.unit)}</span>` : ''}</th>`).join('')}</tr></thead><tbody>${attrRows}</tbody></table>
          </div>
          <div class="rt-actions"><button type="button" class="modal-button primary" data-attrs-save>Save attributes</button></div>` : '<p class="section-empty">Bind an asset group to edit attributes.</p>'}
        </div>` : ''}`
    },
    wire(rt) {
      document.querySelectorAll('[data-binding]').forEach((el) =>
        el.addEventListener('change', () => {
          const key = el.getAttribute('data-binding')
          bindingsDraft.bindings[key] = el.value
          if (key === 'assetGroup') {
            bindingsDraft.bindings.assetIds = []
            bindingsDraft.bindings.keyMap = autoKeyMap(rt.template, el.value)
          }
          rerender()
        }),
      )
      document.querySelectorAll('[data-keymap]').forEach((el) =>
        el.addEventListener('change', () => { bindingsDraft.bindings.keyMap[el.getAttribute('data-keymap')] = el.value }),
      )
      document.querySelectorAll('[data-setting]').forEach((el) =>
        el.addEventListener('input', () => {
          const type = el.getAttribute('data-setting-type')
          const key = el.getAttribute('data-setting')
          bindingsDraft.settings[key] = type === 'list' ? el.value.split('\n').map((s) => s.trim()).filter(Boolean) : type === 'number' ? Number(el.value) : el.value
        }),
      )
      document.querySelectorAll('[data-mf]').forEach((el) =>
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const field = bindingsDraft.manualFields[Number(el.getAttribute('data-mf'))]
          const prop = el.getAttribute('data-mf-field')
          field[prop] = prop === 'options' ? el.value.split(',').map((x) => x.trim()).filter(Boolean) : el.value
          if (prop === 'type') {
            field.kind = MANUAL_KINDS[field.type][0]
            rerender()
          }
        }),
      )
      document.querySelectorAll('[data-mf-remove]').forEach((btn) =>
        btn.addEventListener('click', () => {
          bindingsDraft.manualFields.splice(Number(btn.getAttribute('data-mf-remove')), 1)
          rerender()
        }),
      )
      document.querySelector('[data-mf-add]')?.addEventListener('click', () => {
        bindingsDraft.manualFields.push({ key: '', label: '', unit: '', type: 'number', kind: 'quantity' })
        rerender()
      })
      document.querySelector('[data-bindings-reset]')?.addEventListener('click', () => {
        bindingsDraft = null
        rerender()
      })
      document.querySelector('[data-bindings-save]')?.addEventListener('click', () => {
        const missing = rt.template.roles.filter((r) => r.required && !bindingsDraft.bindings.keyMap[r.role])
        if (bindingsDraft.manualFields) {
          const fields = bindingsDraft.manualFields
            .filter((f) => String(f.key).trim())
            .map((f) => Object.assign({}, f, { key: String(f.key).trim(), label: String(f.label || '').trim() || String(f.key).trim() }))
          if (new Set(fields.map((f) => f.key)).size !== fields.length) {
            UI.toast('Manual field keys must be unique.')
            return
          }
          Store.setApplicationManualFields(rt.app.id, fields)
        }
        Store.updateApplicationBindings(rt.app.id, bindingsDraft.bindings, bindingsDraft.settings)
        bindingsDraft = null
        UI.toast(missing.length ? 'Configuration saved — some required roles are still unmapped.' : 'Configuration saved successfully!')
        if (window.Layout) Layout.setActive('application-' + rt.app.id)
        rerender()
      })
      document.querySelector('[data-attrs-save]')?.addEventListener('click', () => {
        const byEntity = {}
        document.querySelectorAll('[data-attr-entity]').forEach((input) => {
          const id = input.getAttribute('data-attr-entity')
          byEntity[id] = byEntity[id] || {}
          byEntity[id][input.getAttribute('data-attr-key')] = input.type === 'number' ? Number(input.value) : input.value
        })
        Object.entries(byEntity).forEach(([id, attrs]) => Store.updateAssetAttributes(id, attrs))
        UI.toast('Attributes saved successfully!')
        rerender()
      })
    },
  }

  // ============================================================== mount
  function buildContext() {
    const app = Store.get().applications.find((a) => a.id === currentAppId)
    if (!app) return null
    const template = AppTemplates.get(app.templateKey)
    if (!template) return null
    const ui = stateFor(app.id)
    if (!ui.view || !template.views.some((v) => v.key === ui.view)) ui.view = template.views[0].key
    return { app, template, ui, settings: AppTemplates.settingsFor(template, app), entities: entitiesFor(app, template) }
  }

  function rerender() {
    if (!host) return
    const rt = buildContext()
    destroyCharts()
    if (!rt) {
      host.innerHTML = '<div class="detail-card"><p class="section-empty">This application\'s template could not be found.</p></div>'
      return
    }
    const view = rt.template.views.find((v) => v.key === rt.ui.view)
    const missing = missingRoles(rt.app, rt.template)
    const scrollY = window.scrollY
    host.innerHTML = `
      <div class="rt-app">
        <div class="detail-tabs rt-tabs">
          ${rt.template.views.map((v) => `<button type="button" class="detail-tab-button${v.key === view.key ? ' active' : ''}" data-rt-view="${v.key}">${esc(v.label)}</button>`).join('')}
        </div>
        ${missing.length && view.type !== 'bindings' ? `<div class="rt-banner rt-banner-warn">Some required data isn't mapped yet (${missing.map((r) => esc(r.label)).join(', ')}), so related KPIs show "—". <button type="button" class="rt-link-btn" data-rt-view="configuration">Open configuration</button></div>` : ''}
        <div class="rt-view">${VIEWS[view.type] ? VIEWS[view.type].render(rt, view) : `<p class="section-empty">Unknown view type "${esc(view.type)}".</p>`}</div>
      </div>`
    window.scrollTo(0, scrollY)

    host.querySelectorAll('[data-rt-view]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-rt-view')
        rt.ui.view = rt.template.views.some((v) => v.key === target) ? target : rt.template.views[rt.template.views.length - 1].key
        rerender()
      }),
    )
    host.querySelectorAll('[data-rt]').forEach((el) =>
      el.addEventListener('change', () => {
        rt.ui[el.getAttribute('data-rt')] = el.value
        if (el.getAttribute('data-rt') === 'date' && !el.value) rt.ui.date = localIso(new Date())
        rerender()
      }),
    )
    host.querySelector('[data-rt-today]')?.addEventListener('click', () => {
      rt.ui.date = localIso(new Date())
      rerender()
    })
    if (VIEWS[view.type]) VIEWS[view.type].wire(rt, view)
  }

  const AppRuntime = {
    mount(hostEl, app) {
      host = hostEl
      currentAppId = app.id
      if (refreshTimer) clearInterval(refreshTimer)
      // Live views follow the data table; historical dates never change.
      refreshTimer = setInterval(() => {
        if (!host || !document.body.contains(host)) return clearInterval(refreshTimer)
        const ui = stateFor(currentAppId)
        const app = Store.get().applications.find((a) => a.id === currentAppId)
        const template = app && AppTemplates.get(app.templateKey)
        const view = template && template.views.find((v) => v.key === ui.view)
        if (!view || view.type === 'bindings' || ui.date !== localIso(new Date())) return
        if (document.activeElement && host.contains(document.activeElement) && /SELECT|INPUT|TEXTAREA/.test(document.activeElement.tagName)) return
        rerender()
      }, 60000)
      rerender()
    },
    candidateDataPoints,
    autoKeyMap,
    evalFormula,
    // Shared with Notion data blocks (shared/notion-data-blocks.js).
    entitiesFor,
    shiftWindows,
    localIso,
    atTime,
    clock,
  }

  window.AppRuntime = AppRuntime
})()
