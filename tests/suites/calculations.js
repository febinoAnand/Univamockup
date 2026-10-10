// The numbers behind the application pages: the formula evaluator, the
// application templates, manually entered data, the generated device data, shift
// windows, and then the figures a person reads on the PMS and Energy pages.

Tests.suite('calculations', 'Formulas, entries, device data and the figures on screen', async ({ page, BASE, check, skip, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push(`console.error @ ${page.url()}: ${m.text()}`)
  })

  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  // this page loads Store, the templates, entries, device data and the runtime
  await page.goto(BASE + 'notion.html#app_notion')
  await page.waitForTimeout(400)

  // -------------------------------------------------------------- formulas
  section('The formula evaluator')
  const formulas = await page.evaluate(() => {
    const f = (text, scope) => AppRuntime.evalFormula(text, scope || {})
    return {
      add: f('1 + 2'),
      precedence: f('2 + 3 * 4 - 6 / 2'),
      parentheses: f('(1 + 2) * 3'),
      nested: f('((2 + 3) * (4 - 1)) / 5'),
      leftToRight: [f('2 - 3 - 4'), f('8 / 2 / 2')],
      unary: [f('-5 + 2'), f('2 * -3'), f('-(2 + 3)')],
      decimals: f('1.5 * 2'),
      names: f('output * idealCycleSec / 60', { output: 120, idealCycleSec: 30 }),
      unknownName: f('missing + 1', {}),
      nullInput: f('a + 1', { a: null }),
      nullInProduct: f('a * 0', { a: null }),
      divideByZero: [f('5 / 0'), f('5 / (3 - 3)'), f('x / y', { x: 4, y: 0 })],
      zeroOver: f('0 / 5'),
      notNumbers: [f('a + 1', { a: NaN }), f('a + 1', { a: Infinity }), f('a + 1', { a: '5' }), f('a + 1', { a: [] })],
      empty: [f(''), f('   ')],
      spaces: f('  2   *   (  3 + 4 ) '),
      oee: f('availability * performance * quality', { availability: 0.9, performance: 0.8, quality: 0.95 }),
    }
  })
  check('addition, and the order of + - * /', formulas.add === 3 && formulas.precedence === 11, formulas)
  check('brackets, also inside each other', formulas.parentheses === 9 && formulas.nested === 3, formulas)
  check('subtraction and division go left to right', formulas.leftToRight[0] === -5 && formulas.leftToRight[1] === 2, formulas.leftToRight)
  check('a minus sign in front of a number or a bracket', formulas.unary[0] === -3 && formulas.unary[1] === -6 && formulas.unary[2] === -5, formulas.unary)
  check('decimal numbers, names from the scope, and spaces', formulas.decimals === 3 && formulas.names === 60 && formulas.spaces === 14, formulas)
  check('a product of several figures, as OEE is', Math.abs(formulas.oee - 0.684) < 1e-9, formulas.oee)
  check('a name that is not known gives "no value", not NaN', formulas.unknownName === null, formulas.unknownName)
  check('no value in, no value out (even when multiplying by 0)', formulas.nullInput === null && formulas.nullInProduct === null, formulas)
  check('dividing by zero gives "no value", never Infinity', formulas.divideByZero.every((v) => v === null), formulas.divideByZero)
  check('zero divided by something is 0', formulas.zeroOver === 0, formulas.zeroOver)
  check('NaN, Infinity, text and lists in the scope count as "no value"', formulas.notNumbers.every((v) => v === null), formulas.notNumbers)
  check('an empty formula has no value', formulas.empty.every((v) => v === null), formulas.empty)

  // ------------------------------------------------------------- templates
  section('Application templates')
  const templates = await page.evaluate(() => {
    const out = { keys: AppTemplates.list().map((t) => t.key), problems: [], settings: {} }
    const AGG = ['delta', 'avg', 'min', 'max', 'last', 'timeInState', 'minutes', 'manual']
    const FORMATS = ['int', 'number', 'decimal', 'percent', 'duration', 'currency']
    const COMBINE = ['sum', 'avg', 'max', 'formula']
    const VIEW_TYPES = ['kpi-overview', 'shift-matrix', 'hourly-shift-report', 'event-log', 'entity-table', 'entry-log', 'bindings']
    const KINDS = ['counter', 'gauge', 'state']
    AppTemplates.list().forEach((t) => {
      const bad = (why) => out.problems.push(`${t.key}: ${why}`)
      const roles = t.roles.map((r) => r.role)
      const attrs = (t.attributes || []).map((a) => a.key)
      const settings = (t.settings || []).map((s) => s.key)
      const manual = (t.manualFields || []).map((m) => m.key)
      const kpis = t.kpis.map((k) => k.key)
      if (new Set(roles).size !== roles.length) bad('a role is listed twice')
      if (new Set(kpis).size !== kpis.length) bad('a KPI key is used twice')
      if (new Set(manual).size !== manual.length) bad('a manual field key is used twice')
      t.roles.forEach((r) => { if (!KINDS.includes(r.kind)) bad(`role ${r.role} has kind ${r.kind}`) })
      t.roles.filter((r) => r.kind === 'state').forEach((r) => { if (!(r.states || []).length) bad(`state role ${r.role} lists no states`) })
      t.manualFields.forEach((m) => { if (!['quantity', 'reading', 'text'].includes(m.kind)) bad(`manual field ${m.key} has kind ${m.kind}`) })
      t.kpis.forEach((k, i) => {
        if (!k.agg === !k.formula) bad(`${k.key} needs exactly one of agg and formula`)
        if (k.agg && !AGG.includes(k.agg)) bad(`${k.key} uses agg ${k.agg}`)
        if (k.agg && !['minutes', 'manual'].includes(k.agg) && !roles.includes(k.role)) bad(`${k.key} reads role ${k.role}, which the template has not got`)
        if (k.agg === 'timeInState' && !k.state) bad(`${k.key} needs a state`)
        if (k.agg === 'manual' && !manual.includes(k.manual)) bad(`${k.key} reads manual field ${k.manual}, which is not there`)
        if (k.format && !FORMATS.includes(k.format)) bad(`${k.key} has format ${k.format}`)
        if (k.combine && !COMBINE.includes(k.combine)) bad(`${k.key} has combine ${k.combine}`)
        if (k.targetSetting && !settings.includes(k.targetSetting)) bad(`${k.key} targets setting ${k.targetSetting}, which is not there`)
        if (k.formula) {
          const names = k.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []
          names.forEach((name) => {
            const earlier = kpis.slice(0, i)
            if (!earlier.includes(name) && !attrs.includes(name) && !settings.includes(name)) bad(`${k.key}'s formula uses ${name}, which is not an earlier KPI, attribute or setting`)
          })
        }
      })
      t.views.forEach((v) => {
        if (!VIEW_TYPES.includes(v.type)) bad(`view ${v.key} has type ${v.type}`)
        ;[].concat(v.kpis || [], v.cardKpis || [], v.kpi || [], v.compare || [], v.chart ? [v.chart.kpi, v.chart.compare].filter(Boolean) : [], v.progress ? [v.progress.value, v.progress.of].filter(Boolean) : []).forEach((k) => {
          if (!kpis.includes(k)) bad(`view ${v.key} shows KPI ${k}, which is not there`)
        })
        ;(v.columns || []).forEach((c) => { if (!roles.includes(c)) bad(`view ${v.key} has a column for role ${c}, which is not there`) })
        if (v.type === 'event-log') {
          const role = t.roles.find((r) => r.role === v.role)
          if (!role) bad(`view ${v.key} reads role ${v.role}, which is not there`)
          else if (!role.states.includes(v.state)) bad(`view ${v.key} looks for state ${v.state}, which role ${v.role} does not have`)
          if (!settings.includes(v.reasonSetting)) bad(`view ${v.key} takes reasons from setting ${v.reasonSetting}, which is not there`)
        }
      })
      if (new Set(t.views.map((v) => v.key)).size !== t.views.length) bad('a view key is used twice')
      if (t.views[t.views.length - 1].type !== 'bindings') bad('the Configuration view should be the last tab')
      out.settings[t.key] = AppTemplates.settingsFor(t, null)
    })
    out.get = [AppTemplates.get('crane-monitoring') && AppTemplates.get('crane-monitoring').name, AppTemplates.get('nope')]
    const production = AppTemplates.get('production-monitoring')
    out.layered = AppTemplates.settingsFor(production, { settings: { oeeTarget: 90 } })
    out.layeredDoesNotChange = AppTemplates.settingsFor(production, null).oeeTarget
    return out
  })
  check('the three templates are there', same(templates.keys, ['production-monitoring', 'energy-monitoring', 'crane-monitoring']), templates.keys)
  check('every template hangs together: its KPIs, roles, views, columns and settings all exist', templates.problems.length === 0, templates.problems.slice(0, 6))
  check('a template is found by its key, and an unknown key gives nothing', templates.get[0] === 'Crane monitoring' && templates.get[1] === null, templates.get)
  check('settings start from the template\'s defaults', templates.settings['production-monitoring'].oeeTarget === 75 && templates.settings['energy-monitoring'].currency === '₹', templates.settings)
  check('an application\'s own settings win over the defaults, and the defaults stay', templates.layered.oeeTarget === 90 && templates.layered.reasonCodes.length === 6 && templates.layeredDoesNotChange === 75, templates.layered)

  section('The demo applications fit their templates')
  const seeded = await page.evaluate(() => {
    const out = { problems: [] }
    const data = Store.get()
    data.applications.filter((a) => a.templateKey).forEach((app) => {
      const bad = (why) => out.problems.push(`${app.name}: ${why}`)
      const template = AppTemplates.get(app.templateKey)
      if (!template) return bad('its template does not exist')
      const group = (app.bindings || {}).assetGroup
      if (!data.assetGroups.some((g) => g.name === group)) bad(`group ${group} does not exist`)
      if (!data.shiftSchedules.some((s) => s.id === app.bindings.shiftScheduleId)) bad('its shift schedule does not exist')
      const points = AppRuntime.candidateDataPoints(group)
      Object.keys(app.bindings.keyMap || {}).forEach((role) => {
        const spec = template.roles.find((r) => r.role === role)
        if (!spec) return bad(`role ${role} is not in the template`)
        const dp = points.find((p) => p.key === app.bindings.keyMap[role])
        if (!dp) bad(`role ${role} maps to ${app.bindings.keyMap[role]}, which its devices do not report`)
        else if (dp.kind !== spec.kind) bad(`role ${role} wants a ${spec.kind}, but ${dp.key} is a ${dp.kind}`)
      })
      template.roles.filter((r) => r.required).forEach((r) => { if (!(app.bindings.keyMap || {})[r.role]) bad(`required role ${r.role} is not mapped`) })
      const entities = AppRuntime.entitiesFor(app, template)
      if (!entities.length) bad('it has no entities')
      entities.forEach((e) => { if (!e.device) bad(`${e.name} has no device`) })
    })
    out.checked = data.applications.filter((a) => a.templateKey).map((a) => a.name)
    return out
  })
  check('every template-based demo application is mapped to data its devices really report', seeded.checked.length >= 1 && seeded.problems.length === 0, seeded)

  // ---------------------------------------------------------- manual entries
  section('Manual entries')
  const entries = await page.evaluate(() => {
    const out = {}
    const H = 3600000
    const base = Date.UTC(2026, 0, 15, 0, 0, 0)
    const prod = Store.addApplicationFromTemplate({ name: 'Scrap log', templateKey: 'production-monitoring' }).id
    const add = (entityId, hours, data) => AppEntries.add({ appId: prod, entityId, ts: base + hours * H, data })
    add('a5', 1, { scrap_kg: 2, remarks: 'first' })
    add('a5', 1.5, { scrap_kg: 4, remarks: '' })
    add('a5', 2, { scrap_kg: '3.5' })
    add('a6', 3, { scrap_kg: 'abc', remarks: 'second' })
    const last = add('a6', 4, { scrap_kg: 1, remarks: 'third' })

    out.fields = AppEntries.fields(prod).map((f) => f.key)
    out.field = [AppEntries.field(prod, 'scrap_kg').kind, AppEntries.field(prod, 'remarks').kind, AppEntries.field(prod, 'nope')]
    out.unknownApp = AppEntries.fields('nope')
    const q = (more) => AppEntries.aggregate(Object.assign({ appId: prod, key: 'scrap_kg' }, more))
    out.sum = q({})
    out.sumOneEntity = q({ entityId: 'a5' })
    out.sumTwoEntities = q({ entityIds: ['a5', 'a6'] })
    out.window = q({ from: base + 2 * H, to: base + 4 * H })
    out.toIsExclusive = q({ from: base + 1 * H, to: base + 1.5 * H })
    out.fromIsInclusive = q({ from: base + 4 * H })
    out.lastValue = q({ agg: 'last' })
    out.nothingQuantity = AppEntries.aggregate({ appId: prod, key: 'manual_rejects' })
    out.nothingInWindow = q({ from: base + 10 * H })
    out.textLatest = AppEntries.aggregate({ appId: prod, key: 'remarks' })
    out.textLatestOne = AppEntries.aggregate({ appId: prod, key: 'remarks', entityId: 'a5' })
    out.textNone = AppEntries.aggregate({ appId: prod, key: 'operator' })
    out.unknownKeySums = AppEntries.aggregate({ appId: prod, key: 'not_a_field' })

    const all = AppEntries.list({ appId: prod })
    out.newestFirst = all.map((r) => (r.ts - base) / H)
    out.limit = AppEntries.list({ appId: prod, limit: 2 }).map((r) => (r.ts - base) / H)
    out.byEntity = AppEntries.list({ appId: prod, entityIds: ['a6'] }).length
    out.windowRows = AppEntries.list({ appId: prod, from: base + 2 * H, to: base + 4 * H }).map((r) => (r.ts - base) / H)
    out.otherApp = AppEntries.list({ appId: 'app0', from: base, to: base + 5 * H }).length

    out.series = AppEntries.series({ appId: prod, key: 'scrap_kg', from: base, to: base + 5 * H }).map((p) => [(p.ts - base) / H, p.value])
    out.seriesOne = AppEntries.series({ appId: prod, key: 'scrap_kg', entityId: 'a5', from: base, to: base + 5 * H }).length
    out.buckets = AppEntries.series({ appId: prod, key: 'scrap_kg', from: base, to: base + 5 * H, bucketMs: 2 * H }).map((p) => [(p.ts - base) / H, p.value])

    // a reading is averaged, not added up
    const power = Store.addApplicationFromTemplate({ name: 'Meter log', templateKey: 'energy-monitoring' }).id
    ;[[0.5, 100], [1, 300], [2.5, 50], [2.75, '']].forEach(([h, v]) => AppEntries.add({ appId: power, entityId: 'a11', ts: base + h * H, data: { meter_reading_kwh: v } }))
    out.reading = AppEntries.aggregate({ appId: power, key: 'meter_reading_kwh' })
    out.readingNone = AppEntries.aggregate({ appId: power, key: 'meter_reading_kwh', from: base + 20 * H })
    out.readingBuckets = AppEntries.series({ appId: power, key: 'meter_reading_kwh', from: base, to: base + 4 * H, bucketMs: 2 * H }).map((p) => [(p.ts - base) / H, p.value])

    // keyed records are written again, not added again
    AppEntries.upsert({ appId: prod, key: 'sheet:a5:7', entityId: 'a5', ts: base + 6 * H, data: { scrap_kg: 1 } })
    AppEntries.upsert({ appId: prod, key: 'sheet:a5:7', entityId: 'a5', ts: base + 6 * H, data: { scrap_kg: 9, operator: 'Sam' } })
    const sheet = AppEntries.list({ appId: prod }).filter((r) => r.key === 'sheet:a5:7')
    out.upsert = { rows: sheet.length, data: sheet[0] && sheet[0].data }
    out.withoutSheets = AppEntries.list({ appId: prod, excludeKeyPrefix: 'sheet:' }).length
    out.withSheets = AppEntries.list({ appId: prod }).length

    AppEntries.remove(last.id)
    out.afterRemove = AppEntries.list({ appId: prod }).length

    // an application can have its own list of fields
    Store.setApplicationManualFields(prod, [{ key: 'weight', label: 'Weight', kind: 'reading' }])
    out.ownFields = AppEntries.fields(prod).map((f) => f.key)
    out.oldFieldGone = AppEntries.field(prod, 'scrap_kg')
    return out
  })
  check('an application collects the manual fields its template lists', same(entries.fields, ['scrap_kg', 'manual_rejects', 'operator', 'remarks']) && entries.field[0] === 'quantity' && entries.field[1] === 'text' && entries.field[2] === null && same(entries.unknownApp, []), entries)
  check('a quantity is added up; blanks and words that are not numbers are left out', entries.sum === 10.5 && entries.sumOneEntity === 9.5 && entries.sumTwoEntities === 10.5, entries)
  check('a time window includes its start and leaves out its end', entries.window === 3.5 && entries.toIsExclusive === 2 && entries.fromIsInclusive === 1, entries)
  check('"last" gives the latest value, not the total', entries.lastValue === 1, entries.lastValue)
  check('nothing entered counts as 0 for a quantity and as nothing for a text', entries.nothingQuantity === 0 && entries.nothingInWindow === 0 && entries.textNone === null, entries)
  check('a text field gives the latest entry that has some text', entries.textLatest === 'third' && entries.textLatestOne === 'first', entries)
  check('a key that is not a listed field is treated as a quantity', entries.unknownKeySums === 0, entries.unknownKeySums)
  check('entries are listed newest first, and can be limited, filtered by asset and cut to a window', same(entries.newestFirst, [4, 3, 2, 1.5, 1]) && same(entries.limit, [4, 3]) && entries.byEntity === 2 && same(entries.windowRows, [3, 2]), entries)
  check('another application\'s entries are not mixed in', entries.otherApp === 0, entries.otherApp)
  check('the series lists numbers oldest first, per asset if asked', same(entries.series, [[1, 2], [1.5, 4], [2, 3.5], [4, 1]]) && entries.seriesOne === 3, entries.series)
  check('bucketed, a quantity is summed per bucket', same(entries.buckets, [[0, 6], [2, 3.5], [4, 1]]), entries.buckets)
  check('a reading is averaged, ignoring blanks', entries.reading === 150 && entries.readingNone === null, entries)
  check('bucketed, a reading is averaged per bucket', same(entries.readingBuckets, [[0, 200], [2, 50]]), entries.readingBuckets)
  check('a keyed entry written twice stays one entry, with its data merged', entries.upsert.rows === 1 && entries.upsert.data.scrap_kg === 9 && entries.upsert.data.operator === 'Sam' && entries.withSheets === entries.withoutSheets + 1, entries)
  check('an entry can be removed', entries.afterRemove === entries.withSheets - 1, entries)
  check('an application can replace the template\'s fields with its own', same(entries.ownFields, ['weight']) && entries.oldFieldGone === null, entries)

  // ----------------------------------------------------------- device data
  section('Device data')
  const data = await page.evaluate(() => {
    const out = {}
    const MIN = 60000
    const to = Math.floor((Date.now() - 2 * 3600000) / MIN) * MIN
    const from = to - 120 * MIN
    const store = Store.get()
    const reporting = store.devices.filter((d) => d.state !== 'offline')
    const agg = (more) => DataTable.aggregate(Object.assign({ deviceId: 'd6', from, to }, more))

    out.minutes = agg({ agg: 'minutes' })
    out.minutesNoDevice = DataTable.aggregate({ agg: 'minutes', from, to })
    out.determinism = JSON.stringify(DataTable.query({ from: to - 10 * MIN, to, limit: 40 })) === JSON.stringify(DataTable.query({ from: to - 10 * MIN, to, limit: 40 }))
    out.sameAggregate = agg({ key: 'part_count', agg: 'delta' }) === agg({ key: 'part_count', agg: 'delta' })

    // counters
    const mid = from + 45 * MIN
    const d1 = agg({ key: 'part_count', agg: 'delta', to: mid })
    const d2 = agg({ key: 'part_count', agg: 'delta', from: mid })
    const whole = agg({ key: 'part_count', agg: 'delta' })
    out.counter = { whole, split: d1 + d2, bounded: whole > 0 && whole <= 240, integer: Number.isInteger(whole) }
    out.rejects = agg({ key: 'reject_count', agg: 'delta' })
    const energy = DataTable.aggregate({ deviceId: 'd12', key: 'energy_kwh', agg: 'delta', from, to })
    const energyParts = DataTable.aggregate({ deviceId: 'd12', key: 'energy_kwh', agg: 'delta', from, to: mid }) + DataTable.aggregate({ deviceId: 'd12', key: 'energy_kwh', agg: 'delta', from: mid, to })
    out.energy = { energy, drift: Math.abs(energy - energyParts) }
    const meterRows = DataTable.query({ deviceIds: ['d12'], from: to - 6 * MIN, to, limit: 6 }).rows.map((r) => r.values.energy_kwh)
    out.readingsGrow = meterRows.length === 6 && meterRows.every((v, i) => i === 0 || v <= meterRows[i - 1])
    const series = DataTable.series({ deviceId: 'd6', key: 'part_count', from, to, bucketMs: 30 * MIN })
    out.series = { points: series.length, first: series[0] && series[0].ts === from, sum: series.reduce((a, p) => a + p.value, 0), nonNegative: series.every((p) => p.value >= 0) }

    // states
    const states = ['running', 'idle', 'down']
    const inState = states.map((s) => agg({ key: 'run_status', agg: 'timeInState', state: s }))
    out.states = { inState, total: inState.reduce((a, b) => a + b, 0) }
    out.mostlyRunning = inState[0] > inState[2]

    // gauges
    const lo = agg({ key: 'spindle_load', agg: 'min' })
    const hi = agg({ key: 'spindle_load', agg: 'max' })
    const avg = agg({ key: 'spindle_load', agg: 'avg' })
    out.gauge = { lo, avg, hi, ordered: lo <= avg && avg <= hi, inRange: lo >= 0 && hi <= 90 }
    out.last = agg({ key: 'spindle_load', agg: 'last' })
    out.unknownKey = agg({ key: 'nope', agg: 'avg' })
    const gaugeSeries = DataTable.series({ deviceId: 'd6', key: 'spindle_load', from, to, bucketMs: 60 * MIN })
    out.gaugeSeries = gaugeSeries.length === 2 && gaugeSeries.every((p) => p.value >= 0 && p.value <= 90)
    out.stateSeries = DataTable.series({ deviceId: 'd6', key: 'run_status', from, to }).length
    out.unknownSeries = DataTable.series({ deviceId: 'd6', key: 'nope', from, to }).length

    // a device that is offline sends nothing
    out.offline = { rows: DataTable.query({ deviceIds: ['d3'], from, to }).total, latest: DataTable.latest('d3'), delta: DataTable.aggregate({ deviceId: 'd3', key: 'temperature', agg: 'avg', from, to }), events: DataTable.events({ deviceId: 'd3', key: 'run_status', state: 'down', from, to }).length }

    // rows
    const q = DataTable.query({ from: to - 10 * MIN, to, limit: 1000 })
    out.query = { total: q.total, expected: 10 * reporting.length, rows: q.rows.length, distinct: new Set(q.rows.map((r) => r.id)).size }
    const minutesOf = q.rows.map((r) => Number(r.id.split('-').pop()))
    out.newestFirst = minutesOf.every((m, i) => i === 0 || m <= minutesOf[i - 1])
    const p1 = DataTable.query({ from: to - 10 * MIN, to, limit: 25 }).rows.map((r) => r.id)
    const p2 = DataTable.query({ from: to - 10 * MIN, to, limit: 25, offset: 25 }).rows.map((r) => r.id)
    out.pages = { sizes: [p1.length, p2.length], shared: p1.filter((id) => p2.includes(id)).length, continues: q.rows.slice(25, 50).map((r) => r.id).join() === p2.join() }
    out.filters = {
      device: DataTable.query({ deviceIds: ['d6'], from: to - 10 * MIN, to }).total,
      asset: DataTable.query({ assetIds: ['a5'], from: to - 10 * MIN, to }).total,
      assetDevices: Array.from(new Set(DataTable.query({ assetIds: ['a5'], from: to - 10 * MIN, to }).rows.map((r) => r.deviceId))),
      key: DataTable.query({ keyContains: 'part', from: to - 10 * MIN, to }).total,
      keyNone: DataTable.query({ keyContains: 'zzz', from: to - 10 * MIN, to }).total,
    }
    const plc = DataTable.query({ deviceIds: ['d6'], from: to - 3 * MIN, to }).rows[0]
    const vehicle = DataTable.query({ deviceIds: ['d1'], from: to - 3 * MIN, to }).rows[0]
    out.row = { tenant: plc.tenantId, device: plc.deviceId, asset: plc.assetId, profile: plc.profileId, keys: Object.keys(plc.values).sort(), state: states.includes(plc.values.run_status), unassigned: vehicle.assetId, vehicleProfile: vehicle.profileId, vehicleKeys: Object.keys(vehicle.values).sort() }
    const latest = DataTable.latest('d6')
    out.latest = latest && Date.now() - latest.ts < 3 * MIN + 60000
    out.dataPoints = DataTable.dataPointsFor('d6').map((p) => p.key)
    out.dataPointsNone = DataTable.dataPointsFor('nope').length

    // downtime events
    const wideFrom = to - 24 * 60 * MIN
    const events = DataTable.events({ deviceId: 'd6', key: 'run_status', state: 'down', from: wideFrom, to })
    const downMinutes = DataTable.aggregate({ deviceId: 'd6', key: 'run_status', agg: 'timeInState', state: 'down', from: wideFrom, to })
    out.events = {
      count: events.length,
      sum: events.reduce((a, e) => a + e.minutes, 0),
      downMinutes,
      shape: events.every((e) => e.start < e.end && e.minutes === (e.end - e.start) / MIN && e.id.startsWith('d6:') && e.state === 'down' && e.deviceId === 'd6' && e.assetId === 'a5' && e.ongoing === false),
      ordered: events.every((e, i) => i === 0 || e.start >= events[i - 1].end),
    }
    const wideIds = events.map((e) => e.id)
    const narrow = DataTable.events({ deviceId: 'd6', key: 'run_status', state: 'down', from: to - 3 * 60 * MIN, to })
    out.events.stableIds = narrow.every((e) => wideIds.includes(e.id))
    const everyState = states.map((s) => DataTable.events({ deviceId: 'd6', key: 'run_status', state: s, from: wideFrom, to }).reduce((a, e) => a + e.minutes, 0))
    out.events.coversTheDay = everyState.reduce((a, b) => a + b, 0)
    return out
  })
  check('"minutes" is the length of the window, with or without a device', data.minutes === 120 && data.minutesNoDevice === 120, data)
  check('the same question gives the same answer every time', data.determinism && data.sameAggregate, data)
  check('a counter grows over a window; two windows add up to the whole one', data.counter.bounded && data.counter.integer && data.counter.whole === data.counter.split, data.counter)
  check('rejects never outnumber the parts made', data.rejects >= 0 && data.rejects <= data.counter.whole * 0.1, [data.rejects, data.counter.whole])
  check('an energy meter\'s kWh grows with its power, and splits add up', data.energy.energy > 40 && data.energy.energy < 320 && data.energy.drift < 0.05, data.energy)
  check('a counter\'s readings only go up as time goes on', data.readingsGrow, data)
  check('the counter series gives one point per bucket, and adds up to the window\'s total', data.series.points === 4 && data.series.first && data.series.nonNegative && data.series.sum === data.counter.whole, data.series)
  check('the minutes spent in running, idle and down add up to the window', data.states.total === 120 && data.mostlyRunning, data.states)
  check('a gauge\'s lowest, average and highest are in order and inside its range', data.gauge.ordered && data.gauge.inRange, data.gauge)
  check('"last" is a reading within range, and an unknown key gives nothing', data.last >= 0 && data.last <= 90 && data.unknownKey === null, [data.last, data.unknownKey])
  check('a gauge series has an average per bucket; a state or unknown key has no series', data.gaugeSeries && data.stateSeries === 0 && data.unknownSeries === 0, data)
  check('an offline device has no rows, no latest message, no aggregate and no events', data.offline.rows === 0 && data.offline.latest === null && data.offline.delta === null && data.offline.events === 0, data.offline)
  check('a query counts every minute of every reporting device, and lists each row once', data.query.total === data.query.expected && data.query.rows === data.query.expected && data.query.distinct === data.query.expected, data.query)
  check('rows are newest first, and the next page carries on where the last stopped', data.newestFirst && same(data.pages.sizes, [25, 25]) && data.pages.shared === 0 && data.pages.continues, data.pages)
  check('rows can be limited to a device, an asset or a data point name', data.filters.device === 10 && data.filters.asset === 10 && same(data.filters.assetDevices, ['d6']) && data.filters.key === 60 && data.filters.keyNone === 0, data.filters)
  check('a row names its device, asset and profile, and holds the profile\'s data points', data.row.tenant === 'tn_current' && data.row.device === 'd6' && data.row.asset === 'a5' && data.row.profile === 'p4' && same(data.row.keys, ['part_count', 'reject_count', 'run_status', 'spindle_load']) && data.row.state, data.row)
  check('a device that is not on an asset has no asset on its rows', data.row.unassigned === null && data.row.vehicleProfile === 'p1' && same(data.row.vehicleKeys, ['battery', 'speed']), data.row)
  check('the latest message is from the last few minutes', data.latest === true, data)
  check('a device\'s data points come from its profile', same(data.dataPoints, ['part_count', 'reject_count', 'run_status', 'spindle_load']) && data.dataPointsNone === 0, data)
  check('downtime events add up to the minutes spent down', data.events.count > 0 && data.events.sum === data.events.downMinutes, data.events)
  check('each event has a start, an end and a stable id; events do not overlap', data.events.shape && data.events.ordered && data.events.stableIds, data.events)
  check('over a day, the events of all states cover every minute', data.events.coversTheDay === 1440, data.events)

  // ---------------------------------------------------------- shift windows
  section('Shift windows and data mapping')
  const shifts = await page.evaluate(() => {
    const out = {}
    const H = 3600000
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const three = { bindings: { shiftScheduleId: 'ss3' } }
    const windows = AppRuntime.shiftWindows(three, '2026-01-14')
    out.three = windows.map((w) => ({ name: w.name, hours: (w.to - w.from) / H, start: AppRuntime.clock(w.from), end: AppRuntime.clock(w.to), nextDay: AppRuntime.localIso(new Date(w.to)) !== '2026-01-14' }))
    out.contiguous = windows.every((w, i) => i === 0 || w.from === windows[i - 1].to)

    // the same schedule gives a different list on different days
    const standard = { bindings: { shiftScheduleId: 'ss1' } }
    const dayName = (iso) => { const [y, m, d] = iso.split('-').map(Number); return names[new Date(y, m - 1, d).getDay()] }
    const schedule = Store.get().shiftSchedules.find((s) => s.id === 'ss1')
    out.perDay = ['2026-01-12', '2026-01-13', '2026-01-17', '2026-01-18'].map((iso) => [dayName(iso), AppRuntime.shiftWindows(standard, iso).length, schedule.assignments[dayName(iso)].length])

    // no schedule: one window for the whole day
    const none = AppRuntime.shiftWindows({ bindings: {} }, '2026-01-15')
    out.none = { count: none.length, id: none[0].id, hours: (none[0].to - none[0].from) / H, start: AppRuntime.clock(none[0].from) }
    // a schedule with a day off
    const off = Store.addShiftSchedule({ name: 'Weekdays', assignments: { Mon: ['sh1'], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] } })
    const idle = AppRuntime.shiftWindows({ bindings: { shiftScheduleId: off.id } }, '2026-01-13')
    out.dayOff = { count: idle.length, id: idle[0].id }

    // a shift that ends before it starts runs into the next day, even if it is not flagged
    const odd = Store.addShift({ name: 'Odd', startTime: '20:00', endTime: '04:00', midnightCrossed: false })
    const oddSchedule = Store.addShiftSchedule({ name: 'Odd', assignments: { Wed: [odd.id], Mon: [], Tue: [], Thu: [], Fri: [], Sat: [], Sun: [] } })
    const w = AppRuntime.shiftWindows({ bindings: { shiftScheduleId: oddSchedule.id } }, '2026-01-14')[0]
    out.odd = (w.to - w.from) / H

    // suggestions for which data point plays which role
    const production = AppTemplates.get('production-monitoring')
    const energy = AppTemplates.get('energy-monitoring')
    const crane = AppTemplates.get('crane-monitoring')
    out.map = {
      production: AppRuntime.autoKeyMap(production, 'Production line A'),
      energy: AppRuntime.autoKeyMap(energy, 'Utility meters'),
      crane: AppRuntime.autoKeyMap(crane, 'Production line A'),
      nowhere: AppRuntime.autoKeyMap(production, 'No such group'),
      counters: AppRuntime.candidateDataPoints('Production line A', 'counter').map((p) => p.key).sort(),
      states: AppRuntime.candidateDataPoints('Production line A', 'state').map((p) => p.key),
      everything: AppRuntime.candidateDataPoints('Utility meters').map((p) => p.key).sort(),
      noGroup: AppRuntime.candidateDataPoints('No such group').length,
    }
    out.entities = AppRuntime.entitiesFor(Store.get().applications.find((a) => a.id === 'app0'), production).map((e) => ({ name: e.name, device: e.deviceId, target: e.attrs.targetPerHour }))
    return out
  })
  check('a three-shift schedule gives three windows of eight hours, the night one ending the next morning', same(shifts.three.map((w) => [w.name, w.hours, w.start, w.end]), [['Morning shift', 8, '06:00', '14:00'], ['Evening shift', 8, '14:00', '22:00'], ['Night shift', 8, '22:00', '06:00']]) && shifts.three[2].nextDay && !shifts.three[0].nextDay, shifts.three)
  check('the windows follow one another with no gap', shifts.contiguous, shifts)
  check('each day of a schedule gets the shifts assigned to that weekday', shifts.perDay.every(([, got, want]) => got === want) && shifts.perDay.some(([, got]) => got === 1) && shifts.perDay.some(([, got]) => got === 3), shifts.perDay)
  check('with no schedule, the whole day is one window', shifts.none.count === 1 && shifts.none.id === 'day' && shifts.none.hours === 24 && shifts.none.start === '00:00', shifts.none)
  check('a day with no shifts is also one whole-day window', shifts.dayOff.count === 1 && shifts.dayOff.id === 'day', shifts.dayOff)
  check('a shift that ends before it starts runs into the next day', shifts.odd === 8, shifts.odd)
  check('the suggested data point for each role matches the one the demo uses', same(shifts.map.production, { count: 'part_count', rejects: 'reject_count', state: 'run_status', load: 'spindle_load' }), shifts.map.production)
  check('energy roles are suggested from meter data points, and crane roles from state and load', same(shifts.map.energy, { energy: 'energy_kwh', power: 'power_kw', pf: 'pf' }) && shifts.map.crane.state === 'run_status' && shifts.map.crane.load === 'spindle_load', shifts.map)
  check('a group with no devices gives no suggestions and no data points', same(shifts.map.nowhere, {}) && shifts.map.noGroup === 0, shifts.map)
  check('data points can be listed by kind', same(shifts.map.counters, ['part_count', 'reject_count']) && same(shifts.map.states, ['run_status']) && same(shifts.map.everything, ['energy_kwh', 'pf', 'power_kw', 'voltage']), shifts.map)
  check('an application\'s entities are the assets of its group, with their devices and attributes', shifts.entities.length === 6 && shifts.entities.every((e, i) => e.name === 'HSGMI' + (i + 1) && e.device === 'd' + (6 + i)) && same(shifts.entities.map((e) => e.target), [120, 110, 125, 115, 120, 105]), shifts.entities)

  // ---------------------------------------------------- numbers on the pages
  section('Production monitoring: the figures on screen')
  const iso = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 3)
    return AppRuntime.localIso(d)
  })
  const num = (text) => {
    const m = String(text).replace(/,/g, '').match(/-?\d+(\.\d+)?/)
    return m ? Number(m[0]) : null
  }
  const tiles = () => page.$$eval('.rt-view .rt-kpi-tile', (els) => els.map((el) => ({ label: el.querySelector('.rt-kpi-label').textContent.trim(), value: el.querySelector('.rt-kpi-value').textContent.trim() })))
  const tile = (all, label) => (all.find((t) => t.label === label) || {}).value

  await page.goto('about:blank')
  await page.goto(BASE + 'application-detail.html#app0')
  await page.waitForSelector('.rt-app')
  const tabNames = await page.$$eval('.rt-tabs .detail-tab-button', (els) => els.map((el) => el.textContent.trim()))
  check('PMS shows the template\'s tabs', same(tabNames, ['Overview', 'Production', 'Shift report', 'Downtime', 'Machines', 'Manual entries', 'Configuration']), tabNames)

  await page.fill('[data-rt="date"]', iso)
  await page.waitForTimeout(300)
  const overview = await tiles()
  const output = num(tile(overview, 'Output'))
  const target = num(tile(overview, 'Target'))
  const pct = (label) => num(tile(overview, label))
  const hours = await page.evaluate((day) => { const w = AppRuntime.shiftWindows(Store.get().applications.find((a) => a.id === 'app0'), day); return (w[w.length - 1].to - w[0].from) / 3600000 }, iso)
  check('a day in the past shows a figure for every tile', overview.length === 6 && overview.every((t) => /\d/.test(t.value)), overview)
  check('Target is each machine\'s hourly target times the hours of the day, added up', target === Math.round(695 * hours), { target, hours, expected: Math.round(695 * hours) })
  check('Output is a plausible number of parts for six machines', output > 0 && output < 6 * hours * 60 * 2, output)
  check('OEE is availability times performance times quality (to the rounding shown)', Math.abs(pct('OEE') - (pct('Availability') * pct('Performance') * pct('Quality')) / 10000) < 0.5, { oee: pct('OEE'), a: pct('Availability'), p: pct('Performance'), q: pct('Quality') })
  check('every percentage is between 0 and 100 (quality can reach 100, performance may pass it)', ['OEE', 'Availability', 'Quality'].every((l) => pct(l) >= 0 && pct(l) <= 100), overview)

  const cardOutputs = await page.$$eval('.rt-entity-card', (cards) => cards.map((c) => {
    const stats = Array.from(c.querySelectorAll('.rt-entity-stats > div')).map((d) => ({ label: d.querySelector('.rt-kpi-label').textContent.trim(), value: d.querySelector('strong').textContent.trim() }))
    return { name: c.querySelector('.rt-entity-name').textContent.trim(), stats }
  }))
  const cardOutput = (c) => num(c.stats.find((s) => s.label === 'Output').value)
  check('there is a card for each of the six machines', cardOutputs.length === 6 && same(cardOutputs.map((c) => c.name), ['HSGMI1', 'HSGMI2', 'HSGMI3', 'HSGMI4', 'HSGMI5', 'HSGMI6']), cardOutputs.map((c) => c.name))
  check('the machine cards\' outputs add up to the Output tile', cardOutputs.reduce((a, c) => a + cardOutput(c), 0) === output, { cards: cardOutputs.map(cardOutput), output })

  await page.click('[data-rt-view="production"]')
  await page.waitForSelector('.rt-view table.data-table')
  const matrix = await page.$$eval('.rt-view table.data-table tbody tr', (rows) => rows.map((r) => ({ total: r.classList.contains('total-row'), cells: Array.from(r.children).map((c) => c.textContent.trim()) })))
  const header = await page.$$eval('.rt-view table.data-table thead th', (els) => els.map((el) => el.firstChild.textContent.trim()))
  const machines = matrix.filter((r) => !r.total)
  const totalRow = matrix.find((r) => r.total)
  check('the shift table has a column for each shift and for the day', same(header, ['Machine', 'Morning shift', 'Evening shift', 'Night shift', 'Day total']), header)
  check('a machine\'s output over the three shifts adds up to its day total', machines.length === 6 && machines.every((r) => num(r.cells[1]) + num(r.cells[2]) + num(r.cells[3]) === num(r.cells[4])), machines.map((r) => r.cells))
  check('the Total row adds up the machines, shift by shift', [1, 2, 3, 4].every((c) => machines.reduce((a, r) => a + num(r.cells[c]), 0) === num(totalRow.cells[c])), { machines: machines.map((r) => r.cells), total: totalRow.cells })
  check('the day total is the same output as the Overview shows', num(totalRow.cells[4]) === output, { total: totalRow.cells[4], output })
  const fromDevice = await page.evaluate((day) => {
    const app = Store.get().applications.find((a) => a.id === 'app0')
    const w = AppRuntime.shiftWindows(app, day)
    return DataTable.aggregate({ deviceId: 'd6', key: 'part_count', agg: 'delta', from: w[0].from, to: w[w.length - 1].to })
  }, iso)
  check('and a machine\'s day total is the device\'s own counter growth', num(machines[0].cells[4]) === fromDevice, { shown: machines[0].cells[4], device: fromDevice })

  await page.click('[data-rt-view="downtime"]')
  await page.waitForSelector('.rt-view .rt-kpi-tile')
  const downtime = await tiles()
  const eventRows = await page.$$eval('.rt-view table.data-table tbody tr', (rows) => rows.length)
  check('the Downtime tab counts its events and says how many have no reason yet', num(tile(downtime, 'Events')) === eventRows && num(tile(downtime, 'Unassigned reasons')) === eventRows, { downtime, eventRows })
  if (eventRows > 0) {
    await page.selectOption('.rt-reason-select', 'Breakdown')
    await page.waitForSelector('.rt-view .rt-kpi-tile')
    await page.waitForTimeout(150)
    const after = await tiles()
    const saved = await page.evaluate(() => Store.get().applicationRecords.filter((r) => r.type === 'event-reason').map((r) => r.data.reason))
    check('choosing a reason saves it and takes one off the unassigned count', num(tile(after, 'Unassigned reasons')) === eventRows - 1 && same(saved, ['Breakdown']), { saved, after })
  } else {
    skip('choosing a reason for a downtime event', 'there were no downtime events on that day')
  }

  await page.click('[data-rt-view="shift-report"]')
  await page.waitForSelector('.rt-view table.data-table')
  const reports = await page.$$eval('.rt-view .detail-card', (cards) => cards.map((c) => ({ title: c.querySelector('h2').textContent, rows: c.querySelectorAll('tbody tr:not(.total-row)').length, total: Array.from(c.querySelectorAll('tbody tr.total-row td')).map((td) => td.textContent.trim()) })))
  check('the hourly report has a card per shift with an hourly row for each hour', reports.length === 3 && reports.every((r) => r.rows === 8), reports.map((r) => [r.title, r.rows]))
  check('each shift\'s Total row is the total of its hours', reports.every((r) => r.total.length === 5 && /\d/.test(r.total[1])), reports.map((r) => r.total))
  const reportOutput = reports.reduce((a, r) => a + num(r.total[1]), 0)
  check('the three shifts\' totals add up to the day\'s output', reportOutput === output, { reportOutput, output })

  await page.click('[data-rt-view="machines"]')
  await page.waitForSelector('.rt-view table.data-table')
  const machineRows = await page.$$eval('.rt-view table.data-table tbody tr', (rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()))
  check('the Machines tab lists the six machines with their target, cycle time, device and live values', machineRows.length === 6 && machineRows[0].startsWith('HSGMI1') && machineRows[0].includes('120 pcs/h') && machineRows[0].includes('28 s') && machineRows[0].includes('HSGMI1 PLC') && /running|idle|down/.test(machineRows[0]), machineRows[0])

  await page.click('[data-rt-view="configuration"]')
  await page.waitForSelector('[data-bindings-save]')
  check('the Configuration tab shows a row for each data role', (await page.$$eval('[data-keymap]', (els) => els.length)) === 4, 'expected one selector per role: count, rejects, state, load')

  section('Energy monitoring: the figures on screen')
  const meter = await page.evaluate(() => {
    const app = Store.addApplicationFromTemplate({ name: 'Power', templateKey: 'energy-monitoring', bindings: { assetGroup: 'Utility meters', assetIds: [], shiftScheduleId: 'ss3', keyMap: AppRuntime.autoKeyMap(AppTemplates.get('energy-monitoring'), 'Utility meters') } })
    return app.id
  })
  await page.goto('about:blank')
  await page.goto(BASE + 'application-detail.html#' + meter)
  await page.waitForSelector('.rt-app')
  await page.fill('[data-rt="date"]', iso)
  await page.waitForTimeout(300)
  const power = await tiles()
  const energy = num(tile(power, 'Energy'))
  const cost = num(tile(power, 'Cost'))
  const avgPower = num(tile(power, 'Average demand'))
  const peak = num(tile(power, 'Peak demand'))
  const pf = num(tile(power, 'Power factor'))
  check('an energy application shows its five figures', power.length === 5 && power.every((t) => /\d/.test(t.value)), power)
  check('the cost is the energy times the tariff (₹8.50 per kWh on both meters)', Math.abs(cost - energy * 8.5) < 12, { energy, cost })
  check('the peak demand is at least the average demand, and the power factor is between 0 and 1', peak >= avgPower && avgPower > 0 && pf > 0 && pf <= 1, { avgPower, peak, pf })
  check('the energy for a day fits the power drawn (the average kW of the two meters, times 24 hours)', Math.abs(energy - avgPower * 24) / energy < 0.15, { energy, avgPower })
  const meterTabs = await page.$$eval('.rt-tabs .detail-tab-button', (els) => els.map((el) => el.textContent.trim()))
  check('its tabs are the energy template\'s', same(meterTabs, ['Overview', 'Consumption by shift', 'Meters', 'Manual entries', 'Configuration']), meterTabs)

  section('Every tab of every template draws')
  const crane = await page.evaluate(() => Store.addApplicationFromTemplate({ name: 'Cranes', templateKey: 'crane-monitoring', bindings: { assetGroup: 'Production line A', assetIds: [], shiftScheduleId: 'ss3', keyMap: AppRuntime.autoKeyMap(AppTemplates.get('crane-monitoring'), 'Production line A') } }).id)
  const apps = [['app0', 'production-monitoring'], [meter, 'energy-monitoring'], [crane, 'crane-monitoring']]
  for (const [id, key] of apps) {
    await page.goto('about:blank')
    await page.goto(BASE + 'application-detail.html#' + id)
    await page.waitForSelector('.rt-app')
    const views = await page.evaluate((k) => AppTemplates.get(k).views.map((v) => ({ key: v.key, type: v.type })), key)
    const drawn = []
    for (const view of views) {
      await page.click(`[data-rt-view="${view.key}"]`)
      await page.waitForTimeout(120)
      const state = await page.evaluate(() => {
        const host = document.querySelector('.rt-view')
        return { text: host.innerText.trim().length, unknown: /Unknown view type/.test(host.innerText), notFound: /could not be found/.test(document.body.innerText) }
      })
      if (state.text < 20 || state.unknown || state.notFound) drawn.push(`${view.key}: ${JSON.stringify(state)}`)
    }
    check(`${key}: all ${views.length} tabs draw something`, drawn.length === 0, drawn)
  }

  check('no JavaScript errors on any of these pages', errors.length === 0, errors.slice(0, 5))
})
