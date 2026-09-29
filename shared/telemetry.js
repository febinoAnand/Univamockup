/* ==========================================================================
   Univa — static HTML build. The single device-data table.

   Every message a device sends lands as ONE row in ONE table, whatever the
   device or application:

     { id, ts, tenantId, deviceId, assetId, profileId,
       values: { part_count: 15320, run_status: "running", spindle_load: 61.2 } }

   The keys inside `values` are the data points the device's profile
   declares (see DEVICE_PROFILES_SEED in store.js), so a new kind of device
   or a new application never needs a schema change — see
   docs/data-model.md for the backend mapping (a Timescale hypertable with a
   JSONB `values` column).

   There's no backend here, so rows aren't stored: they're generated
   deterministically on read (same device + minute → same row, every
   reload), using the same hash + mulberry32 algorithm as
   shared/dashboard.js's telemetryValueAt() so gauge values match what
   Device detail charts. The public DataTable API is shaped like the future
   REST endpoints (query / aggregate / events / latest) so pages written
   against it only swap the implementation for fetch() calls later.
   ========================================================================== */
(function () {
  const MINUTE_MS = 60000
  const STATE_BLOCK_MIN = 15
  const TENANT_ID = 'tn_current'
  const COUNTER_EPOCH = new Date(2026, 0, 1).getTime()

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

  function rand(key) {
    return mulberry32(hashString(key))()
  }

  function round(value, decimals) {
    const f = Math.pow(10, decimals == null ? 1 : decimals)
    return Math.round(value * f) / f
  }

  // ------------------------------------------------------------ context
  // Store.get() parses localStorage, so it's cached briefly and every
  // device's resolved profile/data points are memoised against it.
  let snapshot = null
  let snapshotAt = 0
  let contexts = new Map()

  function data() {
    if (!snapshot || Date.now() - snapshotAt > 1000) {
      snapshot = Store.get()
      snapshotAt = Date.now()
      contexts = new Map()
    }
    return snapshot
  }

  function contextFor(deviceId) {
    const store = data()
    if (contexts.has(deviceId)) return contexts.get(deviceId)
    const device = store.devices.find((d) => d.id === deviceId)
    if (!device) return null
    const profile = store.deviceProfiles.find((p) => p.name === device.profileName) || null
    const dataPoints = (profile && profile.dataPoints) || []
    const dpByKey = {}
    dataPoints.forEach((dp) => { dpByKey[dp.key] = dp })
    const asset = store.assets.find((a) => (a.deviceIds || []).includes(deviceId)) || null
    const ctx = {
      id: deviceId, device, profile, dataPoints, dpByKey, asset,
      stateDp: dataPoints.find((dp) => dp.kind === 'state' && (dp.states || []).length) || null,
      reliability: 0.6 + rand(`${deviceId}:reliability`) * 0.8,
    }
    contexts.set(deviceId, ctx)
    return ctx
  }

  // ------------------------------------------------------ value generators
  function stateAt(ctx, minute) {
    const dp = ctx.stateDp
    if (!dp) return null
    const states = dp.states
    const sim = dp.sim || {}
    const block = Math.floor(minute / STATE_BLOCK_MIN)
    // A fault starts on a block with probability downProb / avg length and
    // lasts 1–4 blocks (15–60 min), so downtime arrives as realistic events
    // instead of isolated 15-minute blips.
    const downStartP = ((sim.downProb ?? 0.05) * ctx.reliability) / 2.5
    for (let back = 0; back < 4; back++) {
      const b = block - back
      if (rand(`${ctx.id}:${dp.key}:start:${b}`) < downStartP && 1 + Math.floor(rand(`${ctx.id}:${dp.key}:len:${b}`) * 4) > back) {
        return states[states.length - 1]
      }
    }
    if (states.length > 2 && rand(`${ctx.id}:${dp.key}:${block}`) < (sim.idleProb ?? 0.05)) return states[1]
    return states[0]
  }

  // stateAt() is hit for every minute of every counter; a block's state is
  // the same for all 15 of its minutes, so memoise per block.
  const stateCache = new Map()
  function cachedStateAt(ctx, minute) {
    if (!ctx.stateDp) return null
    const cacheKey = `${ctx.id}|${ctx.stateDp.key}|${Math.floor(minute / STATE_BLOCK_MIN)}`
    if (stateCache.has(cacheKey)) return stateCache.get(cacheKey)
    if (stateCache.size > 50000) stateCache.clear()
    const value = stateAt(ctx, minute)
    stateCache.set(cacheKey, value)
    return value
  }

  function rawGauge(ctx, dp, minute) {
    const min = typeof dp.min === 'number' ? dp.min : 0
    const max = typeof dp.max === 'number' ? dp.max : 100
    const baseline = (min + max) / 2
    const amplitude = ((max - min) / 2) * 0.8
    const rng = mulberry32(hashString(`${ctx.id}:${dp.key}:${minute}`))
    // Per-device phase so machines on the same line don't trace identical
    // curves (dashboard.js's single-device widgets don't need this).
    const phase = hashString(`${ctx.id}:${dp.key}:phase`) % 1131
    const trend = Math.sin((minute + phase) / 180) * amplitude
    const noise = (rng() - 0.5) * amplitude * 0.15
    return Math.max(0, baseline + trend + noise)
  }

  // A machine that's down reads ~0 load; idle reads a small fraction.
  function gaugeAt(ctx, dp, minute) {
    let value = rawGauge(ctx, dp, minute)
    const state = cachedStateAt(ctx, minute)
    if (state != null && state !== ctx.stateDp.states[0]) {
      const isFault = state === ctx.stateDp.states[ctx.stateDp.states.length - 1]
      value = isFault ? 0 : value * 0.12
    }
    return round(value, dp.decimals)
  }

  function counterIncrement(ctx, dp, minute) {
    const sim = dp.sim || { rate: 1 }
    if (sim.fromGauge) {
      const gauge = ctx.dpByKey[sim.fromGauge]
      return gauge ? gaugeAt(ctx, gauge, minute) / (sim.divisor || 60) : 0
    }
    if (sim.fractionOf) {
      const parent = ctx.dpByKey[sim.fractionOf]
      if (!parent) return 0
      const dayStart = localDayStartMinute(minute)
      const parentPrefix = dayPrefix(ctx, parent, dayStart)
      const n = Math.round(parentPrefix[minute - dayStart + 1] - parentPrefix[minute - dayStart])
      let k = 0
      for (let i = 0; i < n; i++) if (rand(`${ctx.id}:${dp.key}:${minute}:${i}`) < (sim.ratio ?? 0.02)) k++
      return k
    }
    const state = cachedStateAt(ctx, minute)
    if (state != null && state !== ctx.stateDp.states[0]) return 0
    const perf = 0.82 + 0.16 * rand(`${ctx.id}:perf:${Math.floor(minute / 60)}`)
    const expected = (sim.rate ?? 1) * perf
    const base = Math.floor(expected)
    return base + (rand(`${ctx.id}:${dp.key}:${minute}`) < expected - base ? 1 : 0)
  }

  // Upper bound of one day's counter growth — used as the per-day lifetime
  // offset so raw counter readings keep increasing across midnight.
  function counterNominalPerDay(ctx, dp) {
    const sim = dp.sim || { rate: 1 }
    if (sim.fromGauge) {
      const gauge = ctx.dpByKey[sim.fromGauge]
      return gauge ? ((gauge.max ?? 100) / (sim.divisor || 60)) * 1440 : 0
    }
    if (sim.fractionOf) {
      const parent = ctx.dpByKey[sim.fractionOf]
      return parent ? Math.ceil(counterNominalPerDay(ctx, parent) * Math.min(1, (sim.ratio ?? 0.02) * 3)) : 0
    }
    return Math.ceil((sim.rate ?? 1) * 1440)
  }

  function localDayStartMinute(minute) {
    const d = new Date(minute * MINUTE_MS)
    d.setHours(0, 0, 0, 0)
    return Math.round(d.getTime() / MINUTE_MS)
  }

  // Prefix sums of a counter's per-minute increments for one local day.
  const prefixCache = new Map()
  function dayPrefix(ctx, dp, dayStart) {
    const cacheKey = `${ctx.id}|${dp.key}|${dayStart}`
    let arr = prefixCache.get(cacheKey)
    if (arr) return arr
    const length = localDayStartMinute(dayStart + 1500) - dayStart // 1380–1500 around DST changes
    arr = new Float64Array(length + 1)
    for (let i = 0; i < length; i++) arr[i + 1] = arr[i] + counterIncrement(ctx, dp, dayStart + i)
    if (prefixCache.size > 400) prefixCache.clear()
    prefixCache.set(cacheKey, arr)
    return arr
  }

  // Sum of increments over minutes [fromMin, toMin).
  function counterDelta(ctx, dp, fromMin, toMin) {
    let total = 0
    let cursor = fromMin
    while (cursor < toMin) {
      const dayStart = localDayStartMinute(cursor)
      const arr = dayPrefix(ctx, dp, dayStart)
      const dayEnd = dayStart + arr.length - 1
      const end = Math.min(toMin, dayEnd)
      total += arr[end - dayStart] - arr[cursor - dayStart]
      cursor = end
    }
    return total
  }

  function counterReading(ctx, dp, minute) {
    const dayStart = localDayStartMinute(minute)
    const arr = dayPrefix(ctx, dp, dayStart)
    const daysSinceEpoch = Math.max(0, Math.round((dayStart * MINUTE_MS - COUNTER_EPOCH) / 86400000))
    // Per-device starting offset so two meters never read the same total.
    const installOffset = (hashString(`${ctx.id}:${dp.key}:install`) % 1000) * counterNominalPerDay(ctx, dp) * 0.1
    return round(installOffset + daysSinceEpoch * counterNominalPerDay(ctx, dp) + arr[minute - dayStart + 1], dp.decimals ?? 0)
  }

  function valueAt(ctx, dp, minute) {
    if (dp.kind === 'state') return cachedStateAt(ctx, minute)
    if (dp.kind === 'counter') return counterReading(ctx, dp, minute)
    return gaugeAt(ctx, dp, minute)
  }

  function valuesAt(ctx, minute) {
    const values = {}
    ctx.dataPoints.forEach((dp) => { values[dp.key] = valueAt(ctx, dp, minute) })
    return values
  }

  // Offline devices stop reporting, so they contribute no rows.
  function isReporting(ctx) {
    return ctx && ctx.device.state !== 'offline'
  }

  function nowMinute() {
    return Math.floor(Date.now() / MINUTE_MS)
  }

  function clampWindow(from, to) {
    const fromMin = Math.ceil(from / MINUTE_MS)
    const toMin = Math.min(Math.floor(to / MINUTE_MS), nowMinute() + 1)
    return { fromMin, toMin: Math.max(fromMin, toMin) }
  }

  function buildRow(ctx, minute) {
    const offsetMs = (hashString(ctx.id) % 60) * 1000
    return {
      id: `${ctx.id}-${minute}`,
      ts: minute * MINUTE_MS + offsetMs,
      tenantId: TENANT_ID,
      deviceId: ctx.id,
      assetId: ctx.asset ? ctx.asset.id : null,
      profileId: ctx.profile ? ctx.profile.id : null,
      values: valuesAt(ctx, minute),
    }
  }

  // Walks STATE_BLOCK_MIN blocks and merges runs of the matching state.
  // Each event keeps its true start (even when it began before the window)
  // so its id is stable across every view that shows it.
  function stateEvents(ctx, state, fromMin, toMin) {
    if (!ctx || !ctx.stateDp) return []
    const events = []
    let blockStart = Math.floor(fromMin / STATE_BLOCK_MIN) * STATE_BLOCK_MIN
    let current = null
    for (; blockStart < toMin; blockStart += STATE_BLOCK_MIN) {
      const matches = cachedStateAt(ctx, blockStart) === state
      if (matches && !current) {
        let trueStart = blockStart
        for (let guard = 0; guard < 96 && cachedStateAt(ctx, trueStart - STATE_BLOCK_MIN) === state; guard++) trueStart -= STATE_BLOCK_MIN
        current = { trueStart }
      } else if (!matches && current) {
        events.push(Object.assign(current, { trueEnd: blockStart }))
        current = null
      }
    }
    if (current) {
      let trueEnd = blockStart
      for (let guard = 0; guard < 96 && cachedStateAt(ctx, trueEnd) === state; guard++) trueEnd += STATE_BLOCK_MIN
      events.push(Object.assign(current, { trueEnd }))
    }
    const now = nowMinute()
    return events.map((e) => {
      const start = Math.max(e.trueStart, fromMin)
      const end = Math.min(e.trueEnd, toMin)
      return {
        id: `${ctx.id}:${e.trueStart}`,
        deviceId: ctx.id,
        assetId: ctx.asset ? ctx.asset.id : null,
        state,
        start: start * MINUTE_MS,
        end: end * MINUTE_MS,
        minutes: end - start,
        ongoing: e.trueEnd > now,
      }
    }).filter((e) => e.minutes > 0)
  }

  const DataTable = {
    MESSAGE_INTERVAL_MS: MINUTE_MS,
    TENANT_ID,

    dataPointsFor(deviceId) {
      const ctx = contextFor(deviceId)
      return ctx ? ctx.dataPoints : []
    },

    // GET /device-data?deviceIds=&assetIds=&from=&to=&key=&offset=&limit=
    // Newest first. Only the requested page is generated, so a 7-day range
    // over every device costs the same as a 5-minute one.
    query({ deviceIds, assetIds, from, to, keyContains, offset = 0, limit = 25 } = {}) {
      const store = data()
      let devices = store.devices.map((d) => contextFor(d.id)).filter(isReporting)
      if (deviceIds && deviceIds.length) devices = devices.filter((c) => deviceIds.includes(c.id))
      if (assetIds && assetIds.length) devices = devices.filter((c) => c.asset && assetIds.includes(c.asset.id))
      const term = (keyContains || '').trim().toLowerCase()
      if (term) devices = devices.filter((c) => c.dataPoints.some((dp) => dp.key.toLowerCase().includes(term)))
      const { fromMin, toMin } = clampWindow(from ?? Date.now() - 3600000, to ?? Date.now())
      const minutes = toMin - fromMin
      const total = minutes * devices.length
      const rows = []
      for (let i = offset; i < Math.min(total, offset + limit); i++) {
        const minute = toMin - 1 - Math.floor(i / devices.length)
        rows.push(buildRow(devices[i % devices.length], minute))
      }
      return { rows, total }
    },

    latest(deviceId) {
      const ctx = contextFor(deviceId)
      if (!isReporting(ctx)) return null
      return buildRow(ctx, nowMinute())
    },

    // GET /device-data/aggregate — one number for one device + key + window.
    //   delta        counter growth over the window
    //   avg|min|max  gauge statistics
    //   last         latest value in the window
    //   timeInState  minutes the state key spent at `state`
    //   minutes      elapsed (reporting) minutes in the window
    aggregate({ deviceId, key, agg, from, to, state }) {
      const ctx = contextFor(deviceId)
      const { fromMin, toMin } = clampWindow(from, to)
      if (agg === 'minutes') return toMin - fromMin
      if (!isReporting(ctx)) return null
      const dp = ctx.dpByKey[key]
      if (!dp) return null
      if (toMin <= fromMin) return agg === 'last' ? null : 0
      if (agg === 'delta') return round(counterDelta(ctx, dp, fromMin, toMin), dp.decimals ?? 0)
      if (agg === 'last') return valueAt(ctx, dp, toMin - 1)
      if (agg === 'timeInState') {
        let total = 0
        let blockStart = Math.floor(fromMin / STATE_BLOCK_MIN) * STATE_BLOCK_MIN
        for (; blockStart < toMin; blockStart += STATE_BLOCK_MIN) {
          if (cachedStateAt(ctx, blockStart) !== state) continue
          total += Math.min(toMin, blockStart + STATE_BLOCK_MIN) - Math.max(fromMin, blockStart)
        }
        return total
      }
      const step = Math.max(1, Math.ceil((toMin - fromMin) / 720))
      let sum = 0
      let count = 0
      let min = Infinity
      let max = -Infinity
      for (let m = fromMin; m < toMin; m += step) {
        const v = gaugeAt(ctx, dp, m)
        sum += v
        count++
        if (v < min) min = v
        if (v > max) max = v
      }
      if (agg === 'min') return min
      if (agg === 'max') return max
      return round(sum / count, dp.decimals)
    },

    // GET /device-data/series — one point per bucket: avg for gauges,
    // delta for counters. `bucketMs` omitted → at most ~240 points.
    series({ deviceId, key, from, to, bucketMs }) {
      const ctx = contextFor(deviceId)
      if (!isReporting(ctx) || !ctx.dpByKey[key] || ctx.dpByKey[key].kind === 'state') return []
      const dp = ctx.dpByKey[key]
      const end = Math.min(to, Date.now())
      const step = bucketMs || Math.max(MINUTE_MS, Math.ceil((end - from) / 240 / MINUTE_MS) * MINUTE_MS)
      const agg = dp.kind === 'counter' ? 'delta' : 'avg'
      const points = []
      for (let t = from; t < end; t += step) {
        points.push({ ts: t, value: DataTable.aggregate({ deviceId, key, agg, from: t, to: Math.min(t + step, end) }) })
      }
      return points
    },

    // GET /device-data/events — periods a state key spent at `state`.
    events({ deviceId, key, state, from, to }) {
      const ctx = contextFor(deviceId)
      if (!isReporting(ctx) || !ctx.dpByKey[key]) return []
      const { fromMin, toMin } = clampWindow(from, to)
      return stateEvents(Object.assign({}, ctx, { stateDp: ctx.dpByKey[key] }), state, fromMin, toMin)
    },
  }

  window.DataTable = DataTable
})()
