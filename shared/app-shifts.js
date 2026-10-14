/* ==========================================================================
   Univa — static HTML build. The Shifts tab every application has.

   An application reports against one shift schedule (Shift management ->
   Schedule), kept on the application as bindings.shiftScheduleId. This file
   turns that schedule into the shifts of a date and draws the Shifts tab, so
   PMS and the other template applications (shared/app-runtime.js), EMS, CMS,
   Email Tracking, Forklift Tracking and the Custom App pages all show the
   same thing: which schedule the application uses, the shifts of the chosen
   date and how each one is going, and the week they repeat on.

   An application that has figures by time (output, tickets, hours worked...)
   hands them in as `figures`, and they appear as extra columns, one value for
   each shift:
     figures = { labels: ['Emails', 'Tickets'], measure(from, to) -> ['4', '2'] }
   `from` and `to` are milliseconds; `measure` returns one string per label.

     AppShifts.mount(host, app, { figures })
         a whole tab with its own date and a menu to pick the schedule
         (`figures` may also be a function of the application)
     AppShifts.panelHtml({ app, date, figures, emptyHint, dayOffNote })
         just the tiles and tables, for a host that has its own toolbar;
         emptyHint is markup shown when the application has no schedule,
         dayOffNote is plain text added when the date has no shift
     AppShifts.windows(app, dateIso, { fullDay })
         the shifts of a date as time windows
   ========================================================================== */
(function () {
  const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  // Date.getDay() counts from Sunday.
  const JS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const esc = (value) => UI.esc(value)

  // ------------------------------------------------------------- time
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

  function spanText(ms) {
    const m = Math.round(ms / 60000)
    return m % 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m / 60}h`
  }

  // ---------------------------------------------------------- schedule
  // The schedule an application uses, or null: none chosen, or the one it
  // names has since been deleted.
  function scheduleFor(app) {
    const id = app && app.bindings && app.bindings.shiftScheduleId
    return (id && Store.get().shiftSchedules.find((s) => s.id === id)) || null
  }

  // The schedule's shifts on `dateIso` as time windows, earliest first. A
  // shift whose end is at/before its start (or flagged midnightCrossed) ends
  // the next day. A day with no shift, or no schedule, gives no windows, or
  // with `fullDay` one window for the whole calendar day.
  function windows(app, dateIso, opts) {
    const data = Store.get()
    const schedule = scheduleFor(app)
    const day = JS_DAYS[new Date(atTime(dateIso, '00:00')).getDay()]
    const shifts = schedule ? (schedule.assignments[day] || []).map((id) => data.shifts.find((s) => s.id === id)).filter(Boolean) : []
    if (!shifts.length) return opts && opts.fullDay ? [{ id: 'day', name: 'Full day', from: atTime(dateIso, '00:00'), to: atTime(dateIso, '00:00', 1) }] : []
    return shifts
      .map((s) => {
        const from = atTime(dateIso, s.startTime)
        let to = atTime(dateIso, s.endTime)
        if (to <= from || s.midnightCrossed) to = atTime(dateIso, s.endTime, 1)
        return { id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, from, to }
      })
      .sort((a, b) => a.from - b.from)
  }

  // Hours the windows cover between them; overlapping shifts count once.
  function coveredMs(list) {
    let total = 0
    let end = -Infinity
    list.slice().sort((a, b) => a.from - b.from).forEach((w) => {
      total += Math.max(0, w.to - Math.max(w.from, end))
      end = Math.max(end, w.to)
    })
    return total
  }

  // ------------------------------------------------------------- panel
  function panelHtml(ctx) {
    const data = Store.get()
    const schedule = scheduleFor(ctx.app)
    if (!schedule) {
      return `<div class="detail-card"><p class="section-empty">${ctx.emptyHint || 'No shift schedule is bound to this application.'}</p></div>`
    }
    const date = ctx.date
    const now = Date.now()
    const list = windows(ctx.app, date)
    const nextMidnight = atTime(date, '00:00', 1)
    const figures = ctx.figures && (ctx.figures.labels || []).length ? ctx.figures : null
    const cells = (values) => (figures ? figures.labels.map((label, i) => `<td data-label="${esc(label)}">${values ? esc(values[i]) : '—'}</td>`).join('') : '')

    const rows = list.map((w) => {
      const state = w.to <= now ? ['completed', 'Completed'] : w.from <= now ? ['active', 'In progress'] : ['upcoming', 'Upcoming']
      return `
          <tr>
            <td class="card-title-cell">${esc(w.name)}</td>
            <td data-label="Time">${clock(w.from)}–${clock(w.to)}${w.to > nextMidnight ? ' <span class="rt-muted">next day</span>' : ''}</td>
            <td data-label="Length">${spanText(w.to - w.from)}</td>
            <td data-label="Status"><span class="status-pill status-${state[0]}">${state[1]}</span></td>
            ${cells(figures && w.from <= now ? figures.measure(w.from, w.to) : null)}
          </tr>`
    }).join('')
    const dayRow = figures && list.length > 1
      ? `<tr class="total-row"><td>Whole day</td><td data-label="Time">${clock(list[0].from)}–${clock(list[list.length - 1].to)}</td><td data-label="Length">${spanText(coveredMs(list))}</td><td data-label="Status">—</td>${cells(figures.measure(list[0].from, list[list.length - 1].to))}</tr>`
      : ''

    const selectedDay = WEEK_DAYS[(new Date(atTime(date, '00:00')).getDay() + 6) % 7]
    const week = WEEK_DAYS.map((d) => {
      const shifts = (schedule.assignments[d] || []).map((id) => data.shifts.find((s) => s.id === id)).filter(Boolean)
      return `
          <tr${d === selectedDay ? ' class="rt-current-row"' : ''}>
            <td class="card-title-cell">${d}${d === selectedDay ? ' <span class="rt-muted">· selected date</span>' : ''}</td>
            <td data-label="Shifts">${shifts.length ? shifts.map((s) => `<div>${esc(s.name)} <span class="rt-muted">${esc(s.startTime)}–${esc(s.endTime)}</span></div>`).join('') : '<span class="rt-muted">Day off</span>'}</td>
          </tr>`
    }).join('')

    return `
        <div class="rt-kpi-grid">
          <div class="rt-kpi-tile"><span class="rt-kpi-label">Schedule</span><span class="rt-kpi-value">${esc(schedule.name)}</span>${schedule.description ? `<span class="rt-kpi-sub">${esc(schedule.description)}</span>` : ''}</div>
          <div class="rt-kpi-tile"><span class="rt-kpi-label">Shifts</span><span class="rt-kpi-value">${list.length}</span><span class="rt-kpi-sub">${esc(selectedDay)} ${esc(date)}</span></div>
          <div class="rt-kpi-tile"><span class="rt-kpi-label">Hours covered</span><span class="rt-kpi-value">${list.length ? spanText(coveredMs(list)) : '—'}</span></div>
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('shift')}</span>Shifts on ${esc(date)}<span class="rt-card-note">${esc(schedule.name)}</span></h2>
          ${list.length ? `<div class="table-scroll"><table class="data-table">
            <thead><tr><th>Shift</th><th>Time</th><th>Length</th><th>Status</th>${figures ? figures.labels.map((label) => `<th>${esc(label)}</th>`).join('') : ''}</tr></thead>
            <tbody>${rows}${dayRow}</tbody>
          </table></div>` : `<p class="section-empty">The schedule has no shift on ${esc(selectedDay)}.${ctx.dayOffNote ? ' ' + esc(ctx.dayOffNote) : ''}</p>`}
        </div>
        <div class="detail-card">
          <h2><span class="section-icon">${iconSvg('calendar')}</span>Weekly schedule<span class="rt-card-note"><a href="shift-schedules.html">Edit schedules</a> · <a href="shift-management.html">Manage shifts</a></span></h2>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Day</th><th>Shifts</th></tr></thead><tbody>${week}</tbody></table></div>
        </div>`
  }

  // --------------------------------------------------------- whole tab
  // Each application's chosen date, kept while the page is open so a tab
  // switch (which draws the tab again) does not jump back to today.
  const dates = {}

  function mount(host, app, opts) {
    const appId = app.id
    const options = opts || {}

    function paint() {
      const current = Store.get().applications.find((a) => a.id === appId)
      if (!current) return
      if (!dates[appId]) dates[appId] = localIso(new Date())
      const date = dates[appId]
      const chosen = scheduleFor(current)
      const figures = typeof options.figures === 'function' ? options.figures(current) : options.figures
      host.innerHTML = `
        <div class="rt-app">
          <div class="rt-toolbar">
            <label class="rt-field"><span>Date</span><input type="date" data-shifts="date" value="${esc(date)}" max="${localIso(new Date())}" /></label>
            <label class="rt-field"><span>Shift schedule</span><select data-shifts="schedule">
              <option value="">None</option>
              ${Store.get().shiftSchedules.map((s) => `<option value="${esc(s.id)}"${chosen && chosen.id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
            </select></label>
            <span class="rt-toolbar-spacer"></span>
            <button type="button" class="modal-button secondary rt-today-btn" data-shifts-today title="Jump to today">Today</button>
          </div>
          ${panelHtml({ app: current, date, figures, emptyHint: 'No shift schedule is bound to this application. Choose one in <strong>Shift schedule</strong> above to see its shifts.' })}
        </div>`
      host.querySelector('[data-shifts="date"]').addEventListener('change', (e) => {
        dates[appId] = e.target.value || localIso(new Date())
        paint()
      })
      host.querySelector('[data-shifts="schedule"]').addEventListener('change', (e) => {
        Store.setApplicationShiftSchedule(appId, e.target.value)
        const picked = scheduleFor(Store.get().applications.find((a) => a.id === appId))
        UI.toast(picked ? `Shift schedule set to "${picked.name}"` : 'Shift schedule cleared')
        paint()
      })
      host.querySelector('[data-shifts-today]').addEventListener('click', () => {
        dates[appId] = localIso(new Date())
        paint()
      })
    }

    // Statuses (upcoming, in progress, completed) follow the clock, so an
    // open tab on today draws itself again each minute, as the template
    // applications' tabs do.
    clearInterval(host.shiftsTimer)
    host.shiftsTimer = setInterval(() => {
      if (!document.body.contains(host)) return clearInterval(host.shiftsTimer)
      if (dates[appId] !== localIso(new Date())) return
      if (document.activeElement && host.contains(document.activeElement) && /SELECT|INPUT|TEXTAREA/.test(document.activeElement.tagName)) return
      paint()
    }, 60000)
    paint()
    return { refresh: paint }
  }

  window.AppShifts = { mount, panelHtml, windows, scheduleFor, localIso, atTime, clock, WEEK_DAYS }
})()
