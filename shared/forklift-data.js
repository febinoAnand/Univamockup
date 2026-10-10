/* ==========================================================================
   Univa — static HTML build. Forklift telemetry for the Forklift Tracking
   application (forklift-tracking.html).

   In the real system a GPS tracker on each forklift reports to a TCP server
   (Teltonika codec 8E, plus codec 12 messages from the forklift's own
   controller), and every report is a row in the database. There is no tracker
   or server here, so the rows are not stored: they are made on read, the same
   way shared/telemetry.js does. The same forklift on the same day gives the
   same rows every time, one a minute.

   A row, as the React app's models have it:
     GPS  state (1 Inactive, 2 Idle, 3 Active, 4 Alert), ignition, movement,
          speed, distance (km since the last row), latitude, longitude,
          satellites, GSM operator / signal / area
     EXT  speed, distance, battery voltage / amps / power / capacity, watt-hours
   The state follows the tracker's rule (tcpserver.py):
     ignition on and moving     -> Active
     ignition on and not moving -> Idle
     ignition off and still     -> Inactive
     ignition off and moving    -> Alert (pushed or towed)
   ========================================================================== */
(function () {
  const STATES = ['Inactive', 'Idle', 'Active', 'Alert']
  const DAY_MINUTES = 1440
  const BATTERY_WH = 24000
  // The site, in metres from its south-west corner, and where on earth that is.
  const SITE = { lat: 13.0827, lon: 80.2707, width: 520, height: 360 }
  const PLACES = [
    { name: 'Gate', x: 40, y: 40 },
    { name: 'Dock A', x: 90, y: 310 },
    { name: 'Dock B', x: 220, y: 310 },
    { name: 'Aisle 1', x: 110, y: 190 },
    { name: 'Aisle 2', x: 240, y: 190 },
    { name: 'Aisle 3', x: 370, y: 190 },
    { name: 'Rack zone', x: 440, y: 120 },
    { name: 'Charging bay', x: 470, y: 50 },
    { name: 'Yard', x: 300, y: 60 },
    { name: 'Packing', x: 410, y: 310 },
  ]

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

  const pad = (n) => String(n).padStart(2, '0')
  const round = (value, decimals) => { const f = Math.pow(10, decimals); return Math.round(value * f) / f }
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

  function isoOf(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  function dateOf(iso) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  function addDays(iso, days) {
    const date = dateOf(iso)
    date.setDate(date.getDate() + days)
    return isoOf(date)
  }
  function clockOf(minute, second) {
    return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:${pad(second)}`
  }
  // 'HH:MM' (or 'HH:MM:SS') to a minute of the day
  function minuteOf(clock) {
    const [h, m] = String(clock).split(':').map(Number)
    return h * 60 + m
  }
  function metresToLatLon(x, y) {
    return { lat: SITE.lat + y / 111320, lon: SITE.lon + x / (111320 * Math.cos((SITE.lat * Math.PI) / 180)) }
  }

  // The other way: a position on the earth to metres on the site.
  function toSite(lat, lon) {
    return { x: (lon - SITE.lon) * 111320 * Math.cos((SITE.lat * Math.PI) / 180), y: (lat - SITE.lat) * 111320 }
  }

  // What is particular to one tracker, from its id.
  function traits(deviceId) {
    const r = mulberry32(hashString('traits:' + deviceId))
    return {
      workRate: 0.3 + r() * 0.25,
      speedScale: 0.8 + r() * 0.5,
      workDays: r() < 0.25 ? 0.55 : 0.96,
      alertChance: r() < 0.3 ? 0.35 : 0.08,
      wheelFactor: 0.97 + r() * 0.06,
      operator: [40445, 40410, 40486, 40470][Math.floor(r() * 4)],
      area: 5000 + Math.floor(r() * 4000),
      seconds: Math.floor(r() * 60),
      home: 7,
      startCapacity: 90 + Math.floor(r() * 10),
    }
  }

  // The next place to drive to: one of the four nearest to where it is.
  function nextPlace(x, y, rng) {
    const near = PLACES
      .filter((p) => Math.hypot(p.x - x, p.y - y) > 1)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
      .slice(0, 4)
    return near[Math.floor(rng() * near.length)]
  }

  const cache = new Map()

  // Every minute of one day, whole. (Use day() for what has happened so far.)
  function buildDay(deviceId, iso) {
    const key = deviceId + '|' + iso
    if (cache.has(key)) return cache.get(key)
    if (cache.size > 120) cache.clear()
    const t = traits(deviceId)
    const rng = mulberry32(hashString(key))
    const weekday = dateOf(iso).getDay()
    const working = weekday === 0 ? rng() < 0.12 : rng() < t.workDays
    const shiftStart = 6 * 60 + Math.floor(rng() * 50)
    const shiftEnd = (weekday === 6 ? 14 * 60 : 17 * 60) + Math.floor(rng() * (weekday === 6 ? 120 : 240))
    const lunchStart = 12 * 60 + 15 + Math.floor(rng() * 30)
    const lunchEnd = lunchStart + 30 + Math.floor(rng() * 20)
    const alertStart = rng() < t.alertChance ? 60 + Math.floor(rng() * 200) : -1
    const alertEnd = alertStart + 4 + Math.floor(rng() * 6)

    const home = PLACES[t.home]
    let x = home.x
    let y = home.y
    let target = nextPlace(x, y, rng)
    let mode = 'idle'
    let left = 0
    let usedWh = 0
    const capacityAtStart = t.startCapacity
    const samples = []

    for (let m = 0; m < DAY_MINUTES; m++) {
      let state = 1
      const onShift = working && m >= shiftStart && m < shiftEnd && !(m >= lunchStart && m < lunchEnd)
      if (onShift) {
        if (left <= 0) {
          mode = rng() < t.workRate ? 'active' : 'idle'
          left = mode === 'active' ? 3 + Math.floor(rng() * 12) : 1 + Math.floor(rng() * 6)
        }
        left--
        state = mode === 'active' ? 3 : 2
      }
      if (m >= alertStart && m < alertEnd && alertStart >= 0) state = 4

      const ignition = state === 2 || state === 3
      const moving = state === 3 || state === 4
      const speed = state === 3 ? clamp(1.5 + rng() * 8.5 * t.speedScale, 1.5, 14) : state === 4 ? 1 + rng() * 3 : 0
      const wanted = (speed * 1000) / 60
      let moved = 0
      if (wanted > 0) {
        const dx = target.x - x
        const dy = target.y - y
        const far = Math.hypot(dx, dy)
        if (far <= wanted) {
          moved = far
          x = target.x
          y = target.y
          target = nextPlace(x, y, rng)
        } else {
          moved = wanted
          x += (dx / far) * wanted
          y += (dy / far) * wanted
        }
      }
      const where = metresToLatLon(x + (rng() - 0.5) * 3, y + (rng() - 0.5) * 3)

      const amps = state === 3 ? 15 + speed * 3 + rng() * 8 : state === 2 ? 3 + rng() * 3 : state === 4 ? 2 + rng() * 2 : 0
      const capacity = Math.max(10, capacityAtStart - (usedWh / BATTERY_WH) * 100)
      const volts = 52.4 - (100 - capacity) * 0.05 - amps * 0.012
      const power = volts * amps
      usedWh += power / 60

      const second = t.seconds
      samples.push({
        minute: m,
        date: iso,
        time: clockOf(m, second),
        state,
        ignition,
        movement: moving,
        speed: round(speed, 2),
        distance: round(moved / 1000, 3),
        latitude: round(where.lat, 6),
        longitude: round(where.lon, 6),
        satellite: 7 + Math.floor(rng() * 8),
        gsmOperatorCode: t.operator,
        gsmSignal: clamp(4 + Math.round((rng() - 0.5) * 3), 1, 5),
        gsmAreaCode: t.area + Math.floor(x / 260),
        ext: {
          speed: moving ? round(Math.max(0.1, speed * t.wheelFactor + (rng() - 0.5) * 0.4), 2) : 0,
          distance: round((moved / 1000) * t.wheelFactor, 3),
          voltage: round(volts, 2),
          amps: round(amps, 2),
          capacity: Math.round(capacity),
          power: round(power, 2),
          wattHr: round(power / 60, 2),
        },
      })
    }
    cache.set(key, samples)
    return samples
  }

  // The day's rows up to `now` (a whole day for a past day, none for a future one).
  function day(deviceId, iso, now) {
    const clock = now == null ? Date.now() : now
    const today = isoOf(new Date(clock))
    if (iso > today) return []
    const all = buildDay(deviceId, iso)
    if (iso < today) return all
    const nowDate = new Date(clock)
    return all.slice(0, nowDate.getHours() * 60 + nowDate.getMinutes() + 1)
  }

  // A forklift has rows from the day it was registered.
  function forDevice(device, iso, now) {
    const added = String(device.addDate || '').slice(0, 10)
    if (added && iso < added) return []
    return day(device.deviceId, iso, now)
  }

  // Rows of one day between two clock times ('HH:MM'), both included.
  function between(device, iso, from, to, now) {
    const rows = forDevice(device, iso, now)
    const low = from ? minuteOf(from) : 0
    const high = to ? minuteOf(to) : DAY_MINUTES
    return rows.filter((r) => r.minute >= low && r.minute <= high)
  }

  // The newest row there is (looking back a week).
  function latest(device, now) {
    const today = isoOf(new Date(now == null ? Date.now() : now))
    for (let back = 0; back < 7; back++) {
      const rows = forDevice(device, addDays(today, -back), now)
      if (rows.length) return rows[rows.length - 1]
    }
    return null
  }

  // Hours spent in each state: every row is one minute in its state.
  function stateHours(rows) {
    const hours = { Inactive: 0, Idle: 0, Active: 0, Alert: 0 }
    rows.forEach((r) => { hours[STATES[r.state - 1]] += 1 / 60 })
    STATES.forEach((s) => { hours[s] = round(hours[s], 2) })
    return hours
  }

  // Runs of the same state: [{ state, from, to, minutes }] (`to` is the minute after the run).
  function timeline(rows) {
    const runs = []
    rows.forEach((r) => {
      const last = runs[runs.length - 1]
      if (last && last.state === r.state && last.to === r.minute) {
        last.to = r.minute + 1
        last.minutes++
      } else runs.push({ state: r.state, from: r.minute, to: r.minute + 1, minutes: 1 })
    })
    return runs
  }

  function summary(rows) {
    const sum = (list, pick) => round(list.reduce((a, r) => a + pick(r), 0), 2)
    return {
      rows: rows.length,
      gpsDistance: sum(rows, (r) => r.distance),
      extDistance: sum(rows, (r) => r.ext.distance),
      wattHr: sum(rows, (r) => r.ext.wattHr),
      topSpeed: rows.reduce((a, r) => Math.max(a, r.speed), 0),
      hours: stateHours(rows),
    }
  }

  // The last seven days, today included, oldest first.
  function week(device, now) {
    const today = isoOf(new Date(now == null ? Date.now() : now))
    const out = []
    for (let back = 6; back >= 0; back--) {
      const iso = addDays(today, -back)
      const hours = stateHours(forDevice(device, iso, now))
      out.push({ date: iso, weekday: dateOf(iso).toLocaleDateString('en-US', { weekday: 'long' }), hours, total: round(hours.Active + hours.Idle + hours.Inactive + hours.Alert, 2) })
    }
    return out
  }

  // One line a day from `from` to `to` (both included), as the Reports tab shows.
  function report(device, from, to, now) {
    const out = []
    for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
      const rows = forDevice(device, iso, now)
      if (!rows.length) continue
      const s = summary(rows)
      out.push({ date: iso, gpsDistance: s.gpsDistance, extDistance: s.extDistance, wattHr: s.wattHr, hours: s.hours })
    }
    return out
  }

  window.ForkliftData = { STATES, SITE, PLACES, DAY_MINUTES, BATTERY_WH, isoOf, dateOf, addDays, minuteOf, clockOf, toSite, day: forDevice, between, latest, stateHours, timeline, summary, week, report, traits }
})()
