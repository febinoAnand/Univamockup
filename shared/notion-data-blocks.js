/* ==========================================================================
   Univa — static HTML build. Notion data blocks.

   Four block types for notion.html that put live platform data on a page:
     data-cards   live value cards
     data-chart   telemetry chart (manual entries plotted as markers)
     data-sheet   log sheet: telemetry columns fill themselves, manual
                  columns are typed in, formula columns combine both
     data-form    manual entry form + recent entries

   Every block is bound to ONE application (a template app such as PMS):
     - its assets come from the app's bound asset group
     - telemetry columns/cards read the device-data table (DataTable)
     - manual values are the app's own manual fields and are saved as the
       app's records (AppEntries → applicationRecords) — application-wise,
       never into the device-data table.

   notion.html only needs a few hooks: append TYPES to its block list,
   delegate defaults()/render() for these types, and call wire() after
   each render and tick() from its 1-second live-widget interval.
   ========================================================================== */
(function () {
  const TYPES = [
    { type: 'data-cards', label: 'Live value cards' },
    { type: 'data-chart', label: 'Telemetry chart' },
    { type: 'data-sheet', label: 'Data sheet' },
    { type: 'data-form', label: 'Manual entry form' },
  ]
  const TYPE_KEYS = TYPES.map((t) => t.type)
  const ICONS = { 'data-cards': 'gauge', 'data-chart': 'chart-line', 'data-sheet': 'list', 'data-form': 'clipboard' }
  const CHART_COLORS = ['#7c3aed', '#0ea5e9', '#f59e0b', '#16a34a', '#dc2626', '#64748b']
  const CARD_REFRESH_MS = 30000

  const ui = {} // per block id: { configOpen, draft, date, shiftId }
  const charts = {}
  let pageId = null
  let rerenderPage = null
  let lastCardRefresh = Date.now()

  // --------------------------------------------------------------- utils
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  }
  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8)
  }
  function stateOf(blockId) {
    if (!ui[blockId]) ui[blockId] = { configOpen: false, draft: null, date: AppRuntime.localIso(new Date()), shiftId: null }
    return ui[blockId]
  }
  function fmtNum(v, decimals) {
    if (v == null || v === '' || !isFinite(v)) return '—'
    const d = decimals == null ? (Math.abs(v) >= 100 ? 0 : 1) : decimals
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 })
  }
  function fmtMinutes(m) {
    if (m == null) return '—'
    const r = Math.round(m)
    return r >= 60 ? `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, '0')}m` : `${r}m`
  }
  function todayStart() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  // Everything a block needs about its application.
  function appContext(appId) {
    const data = Store.get()
    const app = data.applications.find((a) => a.id === appId)
    const template = app && app.templateKey ? AppTemplates.get(app.templateKey) : null
    if (!app || !template) return null
    const entities = AppRuntime.entitiesFor(app, template)
    const telemetry = AppRuntime.candidateDataPoints((app.bindings || {}).assetGroup)
    return { app, template, entities, telemetry, manual: AppEntries.fields(app.id) }
  }
  function templateApps() {
    return Store.get().applications.filter((a) => a.templateKey && AppTemplates.get(a.templateKey))
  }
  function defaultAppId() {
    const apps = templateApps()
    return apps.length ? apps[0].id : ''
  }
  function keyMeta(ctx, source, key) {
    if (source === 'manual') {
      const f = ctx.manual.find((x) => x.key === key)
      return f ? { key, label: f.label, unit: f.unit, kind: f.kind, type: f.type, options: f.options } : null
    }
    const dp = ctx.telemetry.find((x) => x.key === key)
    return dp ? { key, label: dp.label, unit: dp.unit, kind: dp.kind, states: dp.states, decimals: dp.decimals } : null
  }

  // Aggregations offered per data kind.
  const AGGS = {
    counter: [['today-delta', 'Today total'], ['last', 'Latest reading']],
    gauge: [['last', 'Latest'], ['today-avg', 'Today average'], ['today-max', 'Today max']],
    state: [['last', 'Count in normal state now'], ['today-normal', 'Time in normal state today']],
    quantity: [['today-total', 'Today total']],
    reading: [['today-avg', 'Today average'], ['today-last', 'Today latest']],
    text: [['today-last', 'Today latest']],
  }
  const SHEET_AGGS = {
    counter: [['delta', 'Delta (produced)']],
    gauge: [['avg', 'Average'], ['max', 'Max'], ['min', 'Min'], ['last', 'Last']],
    state: [],
  }
  function sheetAggOptions(meta) {
    if (!meta) return []
    if (meta.kind === 'state') return (meta.states || []).map((st) => ['timeInState:' + st, `Minutes ${st}`])
    return SHEET_AGGS[meta.kind] || [['avg', 'Average']]
  }

  // ------------------------------------------------------------ defaults
  // New blocks start from the first template app and a sensible config
  // derived from its data, so they show something before any setup.
  function defaults(type) {
    const appId = defaultAppId()
    const ctx = appId ? appContext(appId) : null
    const base = { type, appId, title: TYPES.find((t) => t.type === type).label }
    if (!ctx) return Object.assign(base, { cards: [], series: [], columns: [], fields: [] })
    const counter = ctx.telemetry.find((d) => d.kind === 'counter')
    const state = ctx.telemetry.find((d) => d.kind === 'state')
    const gauge = ctx.telemetry.find((d) => d.kind === 'gauge')
    const quantity = ctx.manual.find((f) => f.kind === 'quantity')
    if (type === 'data-cards') {
      const cards = []
      if (counter) cards.push({ id: uid('c'), label: `${counter.label} today`, source: 'telemetry', scope: 'all', key: counter.key, agg: 'today-delta' })
      if (state) cards.push({ id: uid('c'), label: `${ctx.template.entity.plural} ${state.states[0]}`, source: 'telemetry', scope: 'all', key: state.key, agg: 'last' })
      if (gauge) cards.push({ id: uid('c'), label: gauge.label, source: 'telemetry', scope: 'all', key: gauge.key, agg: 'last' })
      if (quantity) cards.push({ id: uid('c'), label: `${quantity.label} today`, source: 'manual', scope: 'all', key: quantity.key, agg: 'today-total' })
      return Object.assign(base, { cards })
    }
    if (type === 'data-chart') {
      const series = gauge ? ctx.entities.slice(0, 2).map((e) => ({ id: uid('s'), assetId: e.id, source: 'telemetry', key: gauge.key })) : []
      return Object.assign(base, { range: 'today', bucket: 'hour', chartType: 'line', series })
    }
    if (type === 'data-sheet') {
      const columns = []
      if (counter) columns.push({ id: 'c1', label: counter.label, source: 'telemetry', key: counter.key, agg: 'delta' })
      if (state) columns.push({ id: 'c2', label: `Min ${state.states[state.states.length - 1]}`, source: 'telemetry', key: state.key, agg: 'timeInState:' + state.states[state.states.length - 1] })
      ctx.manual.forEach((f, i) => columns.push({ id: 'm' + (i + 1), label: f.label, source: 'manual', key: f.key }))
      return Object.assign(base, { rowsMode: 'time', timeUnit: 'hour', assetId: ctx.entities[0] ? ctx.entities[0].id : '', shiftId: 'all', columns })
    }
    return Object.assign(base, { fields: ctx.manual.map((f) => f.key), allowTimestamp: true })
  }

  // ================================================================ CARDS
  function cardValue(ctx, card) {
    const entities = card.scope === 'all' ? ctx.entities : ctx.entities.filter((e) => e.id === card.scope)
    const meta = keyMeta(ctx, card.source, card.key)
    if (!meta || !entities.length) return { text: '—', sub: meta ? '' : 'Field not found' }
    const from = todayStart()
    const to = Date.now()
    const unit = meta.unit ? ` ${meta.unit}` : ''
    if (card.source === 'manual') {
      const v = AppEntries.aggregate({ appId: ctx.app.id, entityIds: entities.map((e) => e.id), key: card.key, from, to, agg: card.agg === 'today-last' ? 'last' : undefined })
      if (meta.kind === 'text' || card.agg === 'today-last') return { text: v == null || v === '' ? '—' : esc(v) + (meta.kind === 'text' ? '' : unit), sub: 'Manual · today' }
      return { text: fmtNum(v) + unit, sub: 'Manual · today' }
    }
    const withDevice = entities.filter((e) => e.deviceId)
    if (meta.kind === 'state') {
      if (card.agg === 'today-normal') {
        const mins = withDevice.map((e) => DataTable.aggregate({ deviceId: e.deviceId, key: card.key, agg: 'timeInState', state: meta.states[0], from, to }) || 0)
        return { text: fmtMinutes(mins.reduce((a, b) => a + b, 0)), sub: `${meta.states[0]} today` }
      }
      const latest = withDevice.map((e) => DataTable.latest(e.deviceId)).filter(Boolean).map((r) => r.values[card.key])
      if (entities.length === 1) return { text: esc(latest[0] || 'offline'), sub: 'Now' }
      return { text: `${latest.filter((v) => v === meta.states[0]).length} / ${entities.length}`, sub: `${meta.states[0]} now` }
    }
    const values = withDevice.map((e) => {
      if (card.agg === 'last') {
        const row = DataTable.latest(e.deviceId)
        return row ? row.values[card.key] : null
      }
      const agg = card.agg === 'today-delta' ? 'delta' : card.agg === 'today-max' ? 'max' : 'avg'
      return DataTable.aggregate({ deviceId: e.deviceId, key: card.key, agg, from, to })
    }).filter((v) => typeof v === 'number')
    if (!values.length) return { text: '—', sub: 'No data' }
    const combined = meta.kind === 'counter' ? values.reduce((a, b) => a + b, 0)
      : card.agg === 'today-max' ? Math.max.apply(null, values)
      : values.reduce((a, b) => a + b, 0) / values.length
    const label = (AGGS[meta.kind] || []).find((a) => a[0] === card.agg)
    return { text: fmtNum(combined, meta.decimals) + unit, sub: `${label ? label[1] : ''}${entities.length > 1 ? ` · ${entities.length} ${ctx.template.entity.plural.toLowerCase()}` : ''}` }
  }

  function cardsHtml(block, ctx) {
    const cards = block.cards || []
    if (!cards.length) return '<p class="section-empty">No cards yet. Open Configure to add some.</p>'
    return `<div class="nd-cards">${cards.map((card) => {
      const v = cardValue(ctx, card)
      const scopeName = card.scope === 'all' ? `All ${ctx.template.entity.plural.toLowerCase()}` : ((ctx.entities.find((e) => e.id === card.scope) || {}).name || '—')
      return `
        <div class="nd-card nd-card-${card.source}" title="${esc(card.source)} · ${esc(card.key)} · ${esc(scopeName)}">
          <span class="nd-card-label">${esc(card.label || card.key)}</span>
          <span class="nd-card-value">${v.text}</span>
          <span class="nd-card-sub">${v.sub ? esc(v.sub) + ' · ' : ''}${esc(scopeName)}</span>
        </div>`
    }).join('')}</div>`
  }

  // ================================================================ CHART
  const RANGES = { '1h': 3600000, '24h': 86400000, today: null, '7d': 7 * 86400000 }
  const BUCKETS = { raw: null, hour: 3600000, day: 86400000 }

  function chartHtml(block) {
    return (block.series || []).length ? `<div class="nd-chart" id="nd-chart-${block.id}"></div>` : '<p class="section-empty">No series yet. Open Configure to add some.</p>'
  }

  function drawChart(block, ctx) {
    const el = document.getElementById('nd-chart-' + block.id)
    if (!el || typeof ApexCharts === 'undefined') return
    if (charts[block.id]) { try { charts[block.id].destroy() } catch (err) { /* gone */ } }
    const to = Date.now()
    const from = block.range === 'today' ? todayStart() : to - (RANGES[block.range] || 86400000)
    const bucketMs = BUCKETS[block.bucket] || null
    const units = []
    const series = (block.series || []).map((s) => {
      const entity = ctx.entities.find((e) => e.id === s.assetId)
      const meta = keyMeta(ctx, s.source, s.key)
      if (!entity || !meta) return null
      const points = s.source === 'manual'
        ? AppEntries.series({ appId: ctx.app.id, entityId: entity.id, key: s.key, from, to, bucketMs: null })
        : entity.deviceId ? DataTable.series({ deviceId: entity.deviceId, key: s.key, from, to, bucketMs }) : []
      const unit = meta.unit || meta.label
      if (!units.includes(unit)) units.push(unit)
      return {
        name: `${entity.name} · ${meta.label}${s.source === 'manual' ? ' (manual)' : ''}`,
        type: s.source === 'manual' ? 'scatter' : block.chartType === 'bar' ? 'column' : 'line',
        data: points.map((p) => [p.ts, p.value == null ? null : Math.round(p.value * 100) / 100]),
        unit,
      }
    }).filter(Boolean)
    if (!series.length) {
      el.innerHTML = '<p class="section-empty">Nothing to plot. Check the series configuration.</p>'
      return
    }
    // One y-axis per unit, so e.g. % load and kg of scrap don't share a scale.
    const yaxis = series.map((s) => {
      const first = series.find((x) => x.unit === s.unit)
      const idx = units.indexOf(s.unit)
      return { seriesName: first.name, show: first === s, opposite: idx % 2 === 1, title: { text: s.unit, style: { fontSize: '11px', fontWeight: 600 } }, labels: { formatter: (v) => (v == null ? '' : fmtNum(v)) } }
    })
    const chart = new ApexCharts(el, {
      chart: { type: 'line', height: 300, toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit', zoom: { enabled: false } },
      series: series.map((s) => ({ name: s.name, type: s.type, data: s.data })),
      colors: CHART_COLORS,
      stroke: { width: series.map((s) => (s.type === 'line' ? 2 : 0)), curve: 'smooth' },
      markers: { size: series.map((s) => (s.type === 'scatter' ? 7 : 0)) },
      dataLabels: { enabled: false },
      xaxis: { type: 'datetime', labels: { datetimeUTC: false, style: { fontSize: '11px' } } },
      yaxis,
      tooltip: { x: { format: 'dd MMM HH:mm' }, shared: false },
      legend: { position: 'top', horizontalAlign: 'left', fontSize: '12px' },
      grid: { borderColor: '#e7e5e4', strokeDashArray: 3 },
    })
    chart.render()
    charts[block.id] = chart
  }

  // ================================================================ SHEET
  function sheetRows(block, ctx) {
    const st = stateOf(block.id)
    const shiftId = st.shiftId || block.shiftId || 'all'
    const windows = AppRuntime.shiftWindows(ctx.app, st.date)
    const chosen = shiftId === 'all' ? windows : windows.filter((w) => w.id === shiftId)
    const span = chosen.length ? { from: chosen[0].from, to: chosen[chosen.length - 1].to } : { from: windows[0].from, to: windows[windows.length - 1].to }
    if (block.rowsMode === 'assets') {
      return ctx.entities.map((e) => ({ entity: e, from: span.from, to: span.to, label: e.name, href: 'asset-detail.html#' + e.id }))
    }
    const entity = ctx.entities.find((e) => e.id === block.assetId)
    if (!entity) return []
    if (block.timeUnit === 'shift') return chosen.filter((w) => w.from <= Date.now()).map((w) => ({ entity, from: w.from, to: w.to, label: `${w.name} · ${AppRuntime.clock(w.from)}–${AppRuntime.clock(w.to)}` }))
    // Time slots stop at the current one — nothing to log for the future.
    const now = Date.now()
    const rows = []
    chosen.forEach((w) => {
      for (let t = w.from; t < w.to && t <= now; t += 3600000) {
        const end = Math.min(t + 3600000, w.to)
        rows.push({ entity, from: t, to: end, label: `${AppRuntime.clock(t)} – ${AppRuntime.clock(end)}` })
      }
    })
    return rows
  }

  function sheetRecordKey(block, row) {
    return `sheet:${block.id}|${row.entity.id}|${row.from}`
  }

  // Computes every cell. Manual cells: `own` is this sheet's record value
  // (what the input shows); `value` is everything entered for that slot,
  // including entries made through a form, which formulas and totals use.
  function sheetModel(block, ctx) {
    const records = AppEntries.list({ appId: ctx.app.id })
    const byKey = {}
    records.forEach((r) => { if (r.key) byKey[r.key] = r })
    const now = Date.now()
    const cols = block.columns || []
    const rows = sheetRows(block, ctx).map((row) => {
      const future = row.from > now
      const own = byKey[sheetRecordKey(block, row)]
      const cells = {}
      const scope = {}
      cols.forEach((col) => {
        let cell = { value: null }
        if (col.source === 'telemetry') {
          const meta = keyMeta(ctx, 'telemetry', col.key)
          if (!future && meta && row.entity.deviceId) {
            const [agg, state] = String(col.agg || '').split(':')
            const v = DataTable.aggregate({ deviceId: row.entity.deviceId, key: col.key, agg: agg || 'avg', state, from: row.from, to: row.to })
            cell = { value: v, text: agg === 'timeInState' ? fmtNum(v, 0) : fmtNum(v, meta.decimals) }
          } else cell = { value: null, text: '—' }
        } else if (col.source === 'manual') {
          const meta = keyMeta(ctx, 'manual', col.key)
          const ownVal = own ? own.data[col.key] : undefined
          const others = meta ? AppEntries.aggregate({ appId: ctx.app.id, entityId: row.entity.id, key: col.key, from: row.from, to: row.to, excludeKeyPrefix: `sheet:${block.id}|` }) : null
          const ownNum = ownVal === undefined || ownVal === '' ? null : Number(ownVal)
          let value = null
          if (meta && meta.kind === 'quantity') value = (ownNum || 0) + (others || 0)
          else if (meta && meta.kind === 'reading') value = ownNum != null ? ownNum : others
          cell = { own: ownVal == null ? '' : ownVal, others: meta && meta.kind === 'quantity' ? (others || null) : others, value, meta }
        }
        cells[col.id] = cell
        if (typeof cell.value === 'number' && isFinite(cell.value)) scope[col.id] = cell.value
        else if (col.source !== 'formula') scope[col.id] = col.source === 'manual' && cell.meta && cell.meta.kind === 'quantity' ? 0 : undefined
      })
      cols.filter((c) => c.source === 'formula').forEach((col) => {
        const v = future ? null : AppRuntime.evalFormula(col.formula || '', scope)
        cells[col.id] = { value: v, text: fmtNum(v) }
        if (v != null) scope[col.id] = v
      })
      return Object.assign({}, row, { cells, future })
    })
    // Totals: sum counters / minutes / quantities, average gauges and
    // readings, re-evaluate formulas on the totals so ratios stay right.
    const totals = {}
    const tScope = {}
    cols.forEach((col) => {
      if (col.source === 'formula') return
      const vals = rows.map((r) => r.cells[col.id].value).filter((v) => typeof v === 'number' && isFinite(v))
      const isAvg = (col.source === 'telemetry' && !/^(delta|timeInState)/.test(col.agg || '')) || (col.source === 'manual' && keyMeta(ctx, 'manual', col.key) && keyMeta(ctx, 'manual', col.key).kind === 'reading')
      const isText = col.source === 'manual' && (!keyMeta(ctx, 'manual', col.key) || keyMeta(ctx, 'manual', col.key).kind === 'text')
      const v = isText || !vals.length ? null : isAvg ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0)
      totals[col.id] = isText ? '' : fmtNum(v)
      if (v != null) tScope[col.id] = v
    })
    cols.filter((c) => c.source === 'formula').forEach((col) => {
      const v = AppRuntime.evalFormula(col.formula || '', tScope)
      totals[col.id] = fmtNum(v)
      if (v != null) tScope[col.id] = v
    })
    return { rows, totals, cols }
  }

  function manualInput(block, row, col, cell) {
    const meta = cell.meta
    const attrs = `data-nd-sheet-input="${block.id}" data-row-entity="${row.entity.id}" data-row-from="${row.from}" data-col-key="${esc(col.key)}"`
    if (!meta) return '<span class="rt-muted">Unknown field</span>'
    const hint = cell.others != null && cell.others !== '' && cell.others !== 0 ? `${meta.kind === 'quantity' ? '+' : ''}${esc(typeof cell.others === 'number' ? fmtNum(cell.others) : cell.others)} from form` : ''
    if (meta.type === 'select') {
      return `<select class="nd-cell-input" ${attrs}><option value=""></option>${(meta.options || []).map((o) => `<option${String(cell.own) === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>${hint ? `<span class="nd-hint">${hint}</span>` : ''}`
    }
    return `<input class="nd-cell-input${meta.type === 'number' ? ' nd-num' : ''}" type="${meta.type === 'number' ? 'number' : 'text'}" step="any" ${attrs} value="${esc(cell.own)}" placeholder="${row.future ? '' : esc(meta.unit || '')}" />${hint ? `<span class="nd-hint">${hint}</span>` : ''}`
  }

  function sheetHtml(block, ctx) {
    const st = stateOf(block.id)
    const cols = block.columns || []
    const windows = AppRuntime.shiftWindows(ctx.app, st.date)
    const shiftId = st.shiftId || block.shiftId || 'all'
    const entity = ctx.entities.find((e) => e.id === block.assetId)
    const controls = `
      <div class="nd-toolbar">
        <label class="rt-field"><span>Date</span><input type="date" data-nd-date="${block.id}" value="${st.date}" max="${AppRuntime.localIso(new Date())}" /></label>
        ${windows.length > 1 || windows[0].id !== 'day' ? `<label class="rt-field"><span>Shift</span><select data-nd-shift="${block.id}"><option value="all">All shifts</option>${windows.filter((w) => w.id !== 'day').map((w) => `<option value="${w.id}"${shiftId === w.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>` : ''}
        <span class="nd-toolbar-note">${block.rowsMode === 'assets' ? `Rows: all ${esc(ctx.template.entity.plural.toLowerCase())}` : `Rows: ${block.timeUnit === 'shift' ? 'shifts' : 'hours'} · ${esc(entity ? entity.name : 'no asset selected')}`}</span>
        <span class="rt-toolbar-spacer"></span>
        <button type="button" class="notion-db-properties-btn" data-nd-csv="${block.id}" title="Download this sheet as CSV">Export CSV</button>
      </div>`
    if (!cols.length) return controls + '<p class="section-empty">No columns yet. Open Configure to add some.</p>'
    const model = sheetModel(block, ctx)
    if (!model.rows.length) return controls + `<p class="section-empty">${entity || block.rowsMode === 'assets' ? 'Nothing to show yet for this date/shift.' : 'No rows. Pick an asset in Configure.'}</p>`
    const head = cols.map((c) => `<th class="nd-th-${c.source}" title="${c.source === 'formula' ? esc(c.formula) : esc(c.source + ' · ' + c.key)}">${esc(c.label)}<span class="rt-th-sub">${c.source === 'formula' ? '= ' + esc(c.formula) : c.source === 'manual' ? 'manual' : esc(c.key)}</span></th>`).join('')
    const body = model.rows.map((row, ri) => `
      <tr class="${row.future ? 'rt-future-row' : row.to > Date.now() ? 'rt-live-row' : ''}">
        <td class="card-title-cell nd-row-label">${row.href ? `<a href="${row.href}">${esc(row.label)}</a>` : esc(row.label)}</td>
        ${cols.map((c) => {
          const cell = row.cells[c.id]
          if (c.source === 'manual') return `<td data-label="${esc(c.label)}" class="nd-td-manual">${manualInput(block, row, c, cell)}</td>`
          return `<td data-label="${esc(c.label)}" class="nd-td-${c.source}" data-nd-out="${block.id}:${ri}:${c.id}">${cell.text}</td>`
        }).join('')}
      </tr>`).join('')
    const foot = `<tr class="total-row"><td>Total</td>${cols.map((c) => `<td data-nd-total="${block.id}:${c.id}">${model.totals[c.id] || ''}</td>`).join('')}</tr>`
    return `${controls}<div class="table-scroll"><table class="data-table nd-sheet"><thead><tr><th>${block.rowsMode === 'assets' ? esc(ctx.template.entity.label) : 'Time'}</th>${head}</tr></thead><tbody>${body}${foot}</tbody></table></div>`
  }

  // After a manual edit, refresh formula + total cells in place so the
  // input the user is typing in (or tabbing to) keeps focus.
  function refreshSheetOutputs(block, ctx) {
    const model = sheetModel(block, ctx)
    model.rows.forEach((row, ri) => {
      model.cols.forEach((c) => {
        const out = document.querySelector(`[data-nd-out="${block.id}:${ri}:${c.id}"]`)
        if (out) out.textContent = row.cells[c.id].text
      })
    })
    model.cols.forEach((c) => {
      const cell = document.querySelector(`[data-nd-total="${block.id}:${c.id}"]`)
      if (cell) cell.textContent = model.totals[c.id] || ''
    })
  }

  function downloadCsv(block, ctx) {
    const model = sheetModel(block, ctx)
    const quote = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const lines = [[block.rowsMode === 'assets' ? ctx.template.entity.label : 'Time'].concat(model.cols.map((c) => c.label)).map(quote).join(',')]
    model.rows.forEach((row) => {
      lines.push([row.label].concat(model.cols.map((c) => {
        const cell = row.cells[c.id]
        return c.source === 'manual' ? cell.own : cell.value == null ? '' : Math.round(cell.value * 100) / 100
      })).map(quote).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(block.title || 'data-sheet').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stateOf(block.id).date}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // ================================================================= FORM
  function recentHtml(block, ctx) {
    const rows = AppEntries.list({ appId: ctx.app.id, limit: 10 })
    if (!rows.length) return '<p class="section-empty">No entries yet.</p>'
    const names = {}
    ctx.entities.forEach((e) => { names[e.id] = e.name })
    return `<ul class="nd-recent">${rows.map((r) => `
      <li>
        <span class="nd-recent-time">${AppRuntime.localIso(new Date(r.ts)) === AppRuntime.localIso(new Date()) ? AppRuntime.clock(r.ts) : AppRuntime.localIso(new Date(r.ts)) + ' ' + AppRuntime.clock(r.ts)}</span>
        <strong>${esc(names[r.entityId] || r.entityId || '—')}</strong>
        <span class="nd-recent-values">${Object.entries(r.data).filter(([, v]) => v !== '' && v != null).map(([k, v]) => {
          const f = ctx.manual.find((x) => x.key === k)
          return `<span class="dx-chip"><b>${esc(f ? f.label : k)}</b>${esc(v)}${f && f.unit ? ' ' + esc(f.unit) : ''}</span>`
        }).join('')}</span>
        <span class="rt-muted">${(r.key || '').startsWith('sheet:') ? 'sheet' : 'form'} · ${esc(r.enteredBy || '')}</span>
        <button type="button" class="notion-block-action-btn" data-nd-entry-delete="${block.id}:${r.id}" title="Delete entry" aria-label="Delete entry">&times;</button>
      </li>`).join('')}</ul>`
  }

  function formHtml(block, ctx) {
    const fields = (block.fields || []).map((k) => ctx.manual.find((f) => f.key === k)).filter(Boolean)
    if (!fields.length) return '<p class="section-empty">No fields selected. Open Configure to choose which of this app\'s manual fields to collect.</p>'
    const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    return `
      <div class="nd-form">
        <label class="rt-field"><span>${esc(ctx.template.entity.label)}</span><select data-nd-form-entity="${block.id}">${ctx.entities.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
        ${block.allowTimestamp ? `<label class="rt-field"><span>When</span><input type="datetime-local" data-nd-form-ts="${block.id}" value="${nowLocal}" /></label>` : ''}
        ${fields.map((f) => `<label class="rt-field"><span>${esc(f.label)}${f.unit ? ` (${esc(f.unit)})` : ''}</span>${
          f.type === 'select'
            ? `<select data-nd-form-field="${block.id}" data-key="${esc(f.key)}"><option value="">—</option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
            : `<input type="${f.type === 'number' ? 'number' : 'text'}" step="any" data-nd-form-field="${block.id}" data-key="${esc(f.key)}" />`
        }</label>`).join('')}
        <button type="button" class="modal-button primary" data-nd-form-submit="${block.id}">Save entry</button>
      </div>
      <p class="nd-subhead">Recent ${esc(ctx.app.name)} entries</p>
      <div data-nd-recent="${block.id}">${recentHtml(block, ctx)}</div>`
  }

  // =============================================================== CONFIG
  function sel(attrs, options, value) {
    return `<select ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`
  }
  function keyOptions(ctx, source, kinds) {
    if (source === 'manual') return ctx.manual.filter((f) => !kinds || kinds.includes(f.kind)).map((f) => [f.key, `${f.label}${f.unit ? ' (' + f.unit + ')' : ''}`])
    return ctx.telemetry.filter((d) => !kinds || kinds.includes(d.kind)).map((d) => [d.key, `${d.key} · ${d.label}`])
  }
  function entityOptions(ctx, withAll) {
    return (withAll ? [['all', `All ${ctx.template.entity.plural.toLowerCase()}`]] : []).concat(ctx.entities.map((e) => [e.id, e.name]))
  }

  function configHtml(block, draft) {
    const ctx = appContext(draft.appId)
    const apps = templateApps()
    const b = block.id
    let body = ''
    if (!ctx) {
      body = '<p class="section-empty">Pick an application.</p>'
    } else if (draft.type === 'data-cards') {
      body = `
        <p class="nd-subhead">Cards</p>
        ${(draft.cards || []).map((c, i) => {
          const meta = keyMeta(ctx, c.source, c.key)
          const aggs = meta ? AGGS[meta.kind] || [] : []
          return `<div class="nd-cfg-row">
            <label class="rt-field"><span>Label</span><input type="text" data-nd-cfg="${b}" data-path="cards.${i}.label" value="${esc(c.label)}" /></label>
            <label class="rt-field"><span>Source</span>${sel(`data-nd-cfg="${b}" data-path="cards.${i}.source" data-restructure`, [['telemetry', 'Telemetry'], ['manual', 'Manual']], c.source)}</label>
            <label class="rt-field"><span>Data</span>${sel(`data-nd-cfg="${b}" data-path="cards.${i}.key" data-restructure`, [['', '—']].concat(keyOptions(ctx, c.source)), c.key)}</label>
            <label class="rt-field"><span>Scope</span>${sel(`data-nd-cfg="${b}" data-path="cards.${i}.scope"`, entityOptions(ctx, true), c.scope)}</label>
            <label class="rt-field"><span>Show</span>${sel(`data-nd-cfg="${b}" data-path="cards.${i}.agg"`, aggs.length ? aggs : [['', '—']], c.agg)}</label>
            <button type="button" class="dp-remove" data-nd-cfg-remove="${b}" data-path="cards.${i}" title="Remove card">&times;</button>
          </div>`
        }).join('')}
        <button type="button" class="metadata-add" data-nd-cfg-add="${b}" data-path="cards">+ Add card</button>`
    } else if (draft.type === 'data-chart') {
      body = `
        <div class="nd-cfg-row">
          <label class="rt-field"><span>Range</span>${sel(`data-nd-cfg="${b}" data-path="range"`, [['1h', 'Last hour'], ['today', 'Today'], ['24h', 'Last 24 hours'], ['7d', 'Last 7 days']], draft.range)}</label>
          <label class="rt-field"><span>Bucket</span>${sel(`data-nd-cfg="${b}" data-path="bucket"`, [['raw', 'Fine (auto)'], ['hour', 'Hourly'], ['day', 'Daily']], draft.bucket)}</label>
          <label class="rt-field"><span>Style</span>${sel(`data-nd-cfg="${b}" data-path="chartType"`, [['line', 'Line'], ['bar', 'Bar']], draft.chartType)}</label>
        </div>
        <p class="nd-subhead">Series</p>
        ${(draft.series || []).map((s, i) => `<div class="nd-cfg-row">
          <label class="rt-field"><span>${esc(ctx.template.entity.label)}</span>${sel(`data-nd-cfg="${b}" data-path="series.${i}.assetId"`, entityOptions(ctx, false), s.assetId)}</label>
          <label class="rt-field"><span>Source</span>${sel(`data-nd-cfg="${b}" data-path="series.${i}.source" data-restructure`, [['telemetry', 'Telemetry'], ['manual', 'Manual (markers)']], s.source)}</label>
          <label class="rt-field"><span>Data</span>${sel(`data-nd-cfg="${b}" data-path="series.${i}.key"`, [['', '—']].concat(keyOptions(ctx, s.source, s.source === 'manual' ? ['quantity', 'reading'] : ['gauge', 'counter'])), s.key)}</label>
          <button type="button" class="dp-remove" data-nd-cfg-remove="${b}" data-path="series.${i}" title="Remove series">&times;</button>
        </div>`).join('')}
        <button type="button" class="metadata-add" data-nd-cfg-add="${b}" data-path="series">+ Add series</button>`
    } else if (draft.type === 'data-sheet') {
      body = `
        <div class="nd-cfg-row">
          <label class="rt-field"><span>Rows</span>${sel(`data-nd-cfg="${b}" data-path="rowsMode" data-restructure`, [['time', 'Time slots for one ' + ctx.template.entity.label.toLowerCase()], ['assets', 'One row per ' + ctx.template.entity.label.toLowerCase()]], draft.rowsMode)}</label>
          ${draft.rowsMode === 'assets' ? '' : `
          <label class="rt-field"><span>Slot</span>${sel(`data-nd-cfg="${b}" data-path="timeUnit"`, [['hour', 'Hourly'], ['shift', 'Per shift']], draft.timeUnit)}</label>
          <label class="rt-field"><span>${esc(ctx.template.entity.label)}</span>${sel(`data-nd-cfg="${b}" data-path="assetId"`, entityOptions(ctx, false), draft.assetId)}</label>`}
        </div>
        <p class="nd-subhead">Columns <span class="rt-muted">· formulas use column ids, e.g. <code>out - rej</code></span></p>
        ${(draft.columns || []).map((c, i) => {
          const meta = c.source === 'telemetry' ? keyMeta(ctx, 'telemetry', c.key) : null
          return `<div class="nd-cfg-row">
            <label class="rt-field nd-narrow"><span>Id</span><input type="text" data-nd-cfg="${b}" data-path="columns.${i}.id" value="${esc(c.id)}" /></label>
            <label class="rt-field"><span>Label</span><input type="text" data-nd-cfg="${b}" data-path="columns.${i}.label" value="${esc(c.label)}" /></label>
            <label class="rt-field"><span>Source</span>${sel(`data-nd-cfg="${b}" data-path="columns.${i}.source" data-restructure`, [['telemetry', 'Telemetry (auto)'], ['manual', 'Manual (typed in)'], ['formula', 'Formula']], c.source)}</label>
            ${c.source === 'formula'
              ? `<label class="rt-field nd-wide"><span>Formula</span><input type="text" data-nd-cfg="${b}" data-path="columns.${i}.formula" value="${esc(c.formula || '')}" placeholder="e.g. out - rej" /></label>`
              : `<label class="rt-field"><span>Data</span>${sel(`data-nd-cfg="${b}" data-path="columns.${i}.key" data-restructure`, [['', '—']].concat(keyOptions(ctx, c.source)), c.key)}</label>
                 ${c.source === 'telemetry' ? `<label class="rt-field"><span>Value</span>${sel(`data-nd-cfg="${b}" data-path="columns.${i}.agg"`, sheetAggOptions(meta).length ? sheetAggOptions(meta) : [['', '—']], c.agg)}</label>` : ''}`}
            <button type="button" class="dp-remove" data-nd-cfg-remove="${b}" data-path="columns.${i}" title="Remove column">&times;</button>
          </div>`
        }).join('')}
        <button type="button" class="metadata-add" data-nd-cfg-add="${b}" data-path="columns">+ Add column</button>`
    } else {
      body = `
        <p class="nd-subhead">Fields to collect <span class="rt-muted">· from ${esc(ctx.app.name)}'s manual fields (edit them in the app's Configuration tab)</span></p>
        <div class="nd-check-grid">${ctx.manual.map((f) => `<label class="modal-checkbox"><input type="checkbox" data-nd-cfg-field="${b}" value="${esc(f.key)}" ${(draft.fields || []).includes(f.key) ? 'checked' : ''} /> ${esc(f.label)}${f.unit ? ` <span class="rt-muted">(${esc(f.unit)})</span>` : ''}</label>`).join('') || '<span class="section-empty">This application has no manual fields.</span>'}</div>
        <label class="modal-checkbox"><input type="checkbox" data-nd-cfg-bool="${b}" data-path="allowTimestamp" ${draft.allowTimestamp ? 'checked' : ''} /> Let users set the time of the entry</label>`
    }
    return `
      <div class="nd-cfg-row">
        <label class="rt-field"><span>Title</span><input type="text" data-nd-cfg="${b}" data-path="title" value="${esc(draft.title || '')}" /></label>
        <label class="rt-field"><span>Application</span>${sel(`data-nd-cfg="${b}" data-path="appId" data-restructure`, [['', '—']].concat(apps.map((a) => [a.id, a.name])), draft.appId)}</label>
      </div>
      ${body}
      <div class="rt-actions">
        <button type="button" class="modal-button secondary" data-nd-cfg-cancel="${b}">Cancel</button>
        <button type="button" class="modal-button primary" data-nd-cfg-save="${b}">Save block</button>
      </div>`
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
  }
  function setPath(obj, path, value) {
    const parts = path.split('.')
    const last = parts.pop()
    const target = parts.reduce((o, k) => o[k], obj)
    target[last] = value
  }

  // Keeps a draft consistent after a structural change (new source, key, app).
  function normalizeDraft(draft) {
    const ctx = appContext(draft.appId)
    if (!ctx) return
    ;(draft.cards || []).forEach((c) => {
      if (!keyOptions(ctx, c.source).some(([k]) => k === c.key)) c.key = (keyOptions(ctx, c.source)[0] || [''])[0]
      const meta = keyMeta(ctx, c.source, c.key)
      const aggs = meta ? AGGS[meta.kind] || [] : []
      if (!aggs.some(([a]) => a === c.agg)) c.agg = aggs[0] ? aggs[0][0] : ''
      if (c.scope !== 'all' && !ctx.entities.some((e) => e.id === c.scope)) c.scope = 'all'
    })
    ;(draft.series || []).forEach((s) => {
      const opts = keyOptions(ctx, s.source, s.source === 'manual' ? ['quantity', 'reading'] : ['gauge', 'counter'])
      if (!opts.some(([k]) => k === s.key)) s.key = (opts[0] || [''])[0]
      if (!ctx.entities.some((e) => e.id === s.assetId)) s.assetId = ctx.entities[0] ? ctx.entities[0].id : ''
    })
    ;(draft.columns || []).forEach((c) => {
      if (c.source === 'formula') return
      if (!keyOptions(ctx, c.source).some(([k]) => k === c.key)) c.key = (keyOptions(ctx, c.source)[0] || [''])[0]
      if (c.source === 'telemetry') {
        const aggs = sheetAggOptions(keyMeta(ctx, 'telemetry', c.key))
        if (!aggs.some(([a]) => a === c.agg)) c.agg = aggs[0] ? aggs[0][0] : ''
      }
    })
    if (draft.type === 'data-sheet' && draft.rowsMode !== 'assets' && !ctx.entities.some((e) => e.id === draft.assetId)) draft.assetId = ctx.entities[0] ? ctx.entities[0].id : ''
    if (draft.type === 'data-form') draft.fields = (draft.fields || []).filter((k) => ctx.manual.some((f) => f.key === k))
  }

  function newListItem(draft, listPath) {
    const ctx = appContext(draft.appId)
    const firstEntity = ctx && ctx.entities[0] ? ctx.entities[0].id : ''
    if (listPath === 'cards') return { id: uid('c'), label: 'New card', source: 'telemetry', scope: 'all', key: '', agg: '' }
    if (listPath === 'series') return { id: uid('s'), assetId: firstEntity, source: 'telemetry', key: '' }
    const n = (draft.columns || []).length + 1
    return { id: 'col' + n, label: 'Column ' + n, source: 'manual', key: '' }
  }

  // ================================================================ BLOCK
  function render(block, dragHandle, actions) {
    const st = stateOf(block.id)
    const ctx = block.appId ? appContext(block.appId) : null
    const empty = !ctx || !((block.cards || block.series || block.columns || block.fields || []).length)
    if (empty && st.draft == null && !st.dismissed) st.configOpen = true
    if (st.configOpen && !st.draft) st.draft = JSON.parse(JSON.stringify(block))
    let content
    if (!ctx) content = '<p class="section-empty">This block isn\'t bound to an application yet.</p>'
    else if (block.type === 'data-cards') content = cardsHtml(block, ctx)
    else if (block.type === 'data-chart') content = chartHtml(block)
    else if (block.type === 'data-sheet') content = sheetHtml(block, ctx)
    else content = formHtml(block, ctx)
    return `
      <div class="notion-block-wrap nd-block" id="notion-block-${block.id}">
        <div class="notion-block notion-block-database nd-head" data-notion-block-id="${block.id}">
          ${dragHandle}
          <span class="nd-title"><span class="nd-title-icon">${iconSvg(ICONS[block.type])}</span>${esc(block.title || TYPES.find((t) => t.type === block.type).label)}</span>
          ${ctx ? `<a class="nd-app-pill" href="application-detail.html#${ctx.app.id}" title="Bound to ${esc(ctx.app.name)}">${iconSvg(ctx.template.icon)}${esc(ctx.app.name)}</a>` : ''}
          <span class="rt-toolbar-spacer"></span>
          <button type="button" class="notion-db-properties-btn${st.configOpen ? ' active' : ''}" data-nd-config-toggle="${block.id}">${iconSvg('gear')}Configure</button>
          ${actions}
        </div>
        ${st.configOpen ? `<div class="nd-config" data-nd-config="${block.id}">${configHtml(block, st.draft)}</div>` : ''}
        <div class="notion-db-content nd-content" data-nd-content="${block.id}">${content}</div>
      </div>`
  }

  function currentBlock(blockId) {
    const page = (Store.get().notionPages || []).find((p) => p.id === pageId)
    return page ? page.blocks.find((b) => b.id === blockId) : null
  }

  function rerenderConfig(blockId) {
    const panel = document.querySelector(`[data-nd-config="${blockId}"]`)
    const block = currentBlock(blockId)
    if (!panel || !block) return
    panel.innerHTML = configHtml(block, stateOf(blockId).draft)
    wireConfig(blockId)
  }

  function wireConfig(blockId) {
    const st = stateOf(blockId)
    const panel = document.querySelector(`[data-nd-config="${blockId}"]`)
    if (!panel) return
    panel.querySelectorAll('[data-nd-cfg]').forEach((el) => {
      const handler = () => {
        setPath(st.draft, el.getAttribute('data-path'), el.value)
        if (el.hasAttribute('data-restructure')) {
          normalizeDraft(st.draft)
          rerenderConfig(blockId)
        }
      }
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler)
    })
    panel.querySelectorAll('[data-nd-cfg-bool]').forEach((el) => el.addEventListener('change', () => setPath(st.draft, el.getAttribute('data-path'), el.checked)))
    panel.querySelectorAll('[data-nd-cfg-field]').forEach((el) =>
      el.addEventListener('change', () => {
        st.draft.fields = Array.from(panel.querySelectorAll('[data-nd-cfg-field]:checked')).map((x) => x.value)
      }),
    )
    panel.querySelectorAll('[data-nd-cfg-add]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const path = btn.getAttribute('data-path')
        st.draft[path] = (st.draft[path] || []).concat([newListItem(st.draft, path)])
        normalizeDraft(st.draft)
        rerenderConfig(blockId)
      }),
    )
    panel.querySelectorAll('[data-nd-cfg-remove]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const [list, idx] = btn.getAttribute('data-path').split('.')
        st.draft[list].splice(Number(idx), 1)
        rerenderConfig(blockId)
      }),
    )
    panel.querySelector('[data-nd-cfg-cancel]')?.addEventListener('click', () => {
      st.configOpen = false
      st.draft = null
      st.dismissed = true
      rerenderPage()
    })
    panel.querySelector('[data-nd-cfg-save]')?.addEventListener('click', () => {
      const draft = st.draft
      normalizeDraft(draft)
      if (draft.type === 'data-sheet') {
        const ids = (draft.columns || []).map((c) => String(c.id).trim())
        if (ids.some((id) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) || new Set(ids).size !== ids.length) {
          UI.toast('Column ids must be unique words (letters, digits, _) so formulas can use them.')
          return
        }
      }
      const patch = JSON.parse(JSON.stringify(draft))
      delete patch.id
      Store.updateNotionBlock(pageId, blockId, patch)
      st.configOpen = false
      st.draft = null
      UI.toast('Block saved')
      rerenderPage()
    })
  }

  // Called by notion.html after every render of the active page.
  function wire(activePageId, rerender) {
    pageId = activePageId
    rerenderPage = rerender
    const page = (Store.get().notionPages || []).find((p) => p.id === pageId)
    if (!page) return
    page.blocks.filter((b) => TYPE_KEYS.includes(b.type)).forEach((block) => {
      const st = stateOf(block.id)
      document.querySelector(`[data-nd-config-toggle="${block.id}"]`)?.addEventListener('click', () => {
        st.configOpen = !st.configOpen
        st.draft = st.configOpen ? JSON.parse(JSON.stringify(block)) : null
        if (!st.configOpen) st.dismissed = true
        rerenderPage()
      })
      if (st.configOpen) wireConfig(block.id)
      const ctx = block.appId ? appContext(block.appId) : null
      if (!ctx) return
      if (block.type === 'data-chart') drawChart(block, ctx)
      if (block.type === 'data-sheet') wireSheet(block, ctx)
      if (block.type === 'data-form') wireForm(block, ctx)
    })
  }

  function wireSheet(block, ctx) {
    const st = stateOf(block.id)
    document.querySelector(`[data-nd-date="${block.id}"]`)?.addEventListener('change', (e) => {
      st.date = e.target.value || AppRuntime.localIso(new Date())
      rerenderPage()
    })
    document.querySelector(`[data-nd-shift="${block.id}"]`)?.addEventListener('change', (e) => {
      st.shiftId = e.target.value
      rerenderPage()
    })
    document.querySelector(`[data-nd-csv="${block.id}"]`)?.addEventListener('click', () => downloadCsv(block, ctx))
    document.querySelectorAll(`[data-nd-sheet-input="${block.id}"]`).forEach((input) =>
      input.addEventListener('change', () => {
        const entityId = input.getAttribute('data-row-entity')
        const from = Number(input.getAttribute('data-row-from'))
        const key = input.getAttribute('data-col-key')
        const field = AppEntries.field(ctx.app.id, key)
        const value = input.value === '' ? '' : field && field.type === 'number' ? Number(input.value) : input.value
        AppEntries.upsert({ appId: ctx.app.id, key: `sheet:${block.id}|${entityId}|${from}`, entityId, ts: from, data: { [key]: value } })
        input.classList.add('nd-saved')
        setTimeout(() => input.classList.remove('nd-saved'), 900)
        refreshSheetOutputs(block, ctx)
      }),
    )
  }

  function wireForm(block, ctx) {
    const refreshRecent = () => {
      const host = document.querySelector(`[data-nd-recent="${block.id}"]`)
      if (host) host.innerHTML = recentHtml(block, ctx)
      wireRecent()
    }
    const wireRecent = () => {
      document.querySelectorAll(`[data-nd-entry-delete^="${block.id}:"]`).forEach((btn) =>
        btn.addEventListener('click', () => {
          AppEntries.remove(btn.getAttribute('data-nd-entry-delete').split(':')[1])
          UI.toast('Entry deleted')
          refreshRecent()
        }),
      )
    }
    wireRecent()
    document.querySelector(`[data-nd-form-submit="${block.id}"]`)?.addEventListener('click', () => {
      const data = {}
      document.querySelectorAll(`[data-nd-form-field="${block.id}"]`).forEach((el) => {
        if (el.value === '') return
        const field = AppEntries.field(ctx.app.id, el.getAttribute('data-key'))
        data[el.getAttribute('data-key')] = field && field.type === 'number' ? Number(el.value) : el.value
      })
      if (!Object.keys(data).length) {
        UI.toast('Enter at least one value.')
        return
      }
      const tsInput = document.querySelector(`[data-nd-form-ts="${block.id}"]`)
      const ts = tsInput && tsInput.value ? new Date(tsInput.value).getTime() : Date.now()
      AppEntries.add({ appId: ctx.app.id, entityId: document.querySelector(`[data-nd-form-entity="${block.id}"]`).value, ts, data })
      document.querySelectorAll(`[data-nd-form-field="${block.id}"]`).forEach((el) => { el.value = '' })
      UI.toast(`Saved to ${ctx.app.name}`)
      refreshRecent()
    })
  }

  // Called every second by notion.html's live-widget interval; cards
  // re-read the data table every CARD_REFRESH_MS without a page re-render.
  function tick() {
    if (Date.now() - lastCardRefresh < CARD_REFRESH_MS) return
    lastCardRefresh = Date.now()
    const page = (Store.get().notionPages || []).find((p) => p.id === pageId)
    if (!page) return
    page.blocks.filter((b) => b.type === 'data-cards').forEach((block) => {
      const host = document.querySelector(`[data-nd-content="${block.id}"]`)
      const ctx = block.appId ? appContext(block.appId) : null
      if (host && ctx) host.innerHTML = cardsHtml(block, ctx)
    })
  }

  window.NotionDataBlocks = {
    types: TYPES,
    isDataBlock: (type) => TYPE_KEYS.includes(type),
    defaults,
    render,
    wire,
    tick,
  }
})()
