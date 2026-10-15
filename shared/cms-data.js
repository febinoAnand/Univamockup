/* ==========================================================================
   Univa — static HTML build. What the CMS cranes were doing over time.

   There is no crane logging here, so the states of a crane are not stored:
   they are made on read, the same way shared/forklift-data.js does for the
   forklifts. The same crane on the same day gives the same segments every
   time. The crane's page (cms-machine-dashboard.html) draws one day of them,
   or one shift of it, and the CMS application's Shifts tab adds them up for
   each shift.

   A segment is { startMin, endMin, state }, state being working, idle, off
   or overload, in minutes from the start of the day (or, for windowSegments,
   from the start of the window).
   ========================================================================== */
(function () {
  const pad = (n) => String(n).padStart(2, '0')

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

  // One day of one crane, deterministic per (machine, day).
  function dayTimeline(machine, dateIso) {
    const rng = mulberry32(hashString(machine.id + ':' + dateIso))
    const segments = []
    let t = 0
    while (t < 1440) {
      const dur = Math.min(1440 - t, 20 + Math.floor(rng() * 160))
      const r = rng()
      let state
      if (!machine.connected) {
        state = r < 0.8 ? 'off' : r < 0.94 ? 'idle' : 'working'
      } else {
        state = r < 0.5 ? 'working' : r < 0.8 ? 'idle' : r < 0.93 ? 'off' : 'overload'
      }
      segments.push({ startMin: t, endMin: t + dur, state })
      t += dur
    }
    return segments
  }

  const isoOf = (ms) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const dayStart = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const nextDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return isoOf(new Date(y, m - 1, d + 1).getTime())
  }

  // The segments inside [from, to) (milliseconds), cut to the window and
  // counted in minutes from its start. A shift can run past midnight, so
  // this reads every day the window touches. For a whole day it is the
  // day's own timeline.
  function windowSegments(machine, from, to) {
    const out = []
    for (let iso = isoOf(from); iso <= isoOf(to - 1); iso = nextDay(iso)) {
      const start = dayStart(iso)
      dayTimeline(machine, iso).forEach((seg) => {
        const s = Math.max(start + seg.startMin * 60000, from)
        const e = Math.min(start + seg.endMin * 60000, to)
        if (e > s) out.push({ startMin: Math.round((s - from) / 60000), endMin: Math.round((e - from) / 60000), state: seg.state })
      })
    }
    return out
  }

  // Minutes in each state inside the window.
  function stateMinutes(machine, from, to) {
    const totals = { working: 0, idle: 0, off: 0, overload: 0 }
    if (to > from) windowSegments(machine, from, to).forEach((seg) => { totals[seg.state] += seg.endMin - seg.startMin })
    return totals
  }

  window.CmsData = { hashString, mulberry32, dayTimeline, windowSegments, stateMinutes }
})()
