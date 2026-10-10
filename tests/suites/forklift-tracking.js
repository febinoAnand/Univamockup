// The built-in Forklift Tracking application (forklift-tracking.html): the
// readings the trackers make (shared/forklift-data.js) and the rules that turn
// them into a state, hours and distances, then every tab of the page used as a
// person would: Fleet, Live, History and Reports.

Tests.suite('forklift-tracking', 'Forklift Tracking application', async ({ page, BASE, check, skip, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const IMEI = ['352093081452251', '352093081452269', '352093081452277', '352093081452285', '352093081452293']
  const open = async (url, wait) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForSelector(wait || '#ft-view, .not-found-block')
    await page.waitForTimeout(150)
  }
  const fresh = async (url, wait) => {
    await page.goto(BASE + 'login.html')
    await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
    if (url) await open(url, wait)
  }
  const store = (fn, arg) => page.evaluate(fn, arg)
  const toast = async () => {
    await page.waitForSelector('.device-toast-message')
    return page.textContent('.device-toast-message')
  }
  const visible = (selector) => page.locator(selector).isVisible()
  const errorText = async (id) => ((await page.locator('#' + id).isVisible()) ? page.textContent('#' + id) : '')
  const confirmYes = async () => {
    await page.waitForSelector('#confirm-dialog-confirm')
    await page.click('#confirm-dialog-confirm')
  }
  const hoursText = (h) => `${Math.floor(h)}h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}m`
  const parseCsv = (text) => text.split('\n').map((line) => {
    const cells = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false; else cell += c }
      else if (c === '"') quoted = true
      else if (c === ',') { cells.push(cell); cell = '' }
      else cell += c
    }
    cells.push(cell)
    return cells
  })
  const tileOf = async (label) => page.evaluate((l) => { const t = Array.from(document.querySelectorAll('.rt-kpi-tile')).find((el) => el.querySelector('.rt-kpi-label').textContent.trim() === l); return t ? t.querySelector('.rt-kpi-value').textContent.trim() : null }, label)
  const tableRows = (selector) => page.$$eval(selector + ' tbody tr', (trs) => trs.map((tr) => Array.from(tr.children).map((td) => td.textContent.replace(/\s+/g, ' ').trim())))

  // ================================================================ the data
  section('What the trackers report')
  await fresh('forklift-tracking.html#app_forklift')
  const NOW = [2026, 9, 10, 15, 30, 0]
  const facts = await store(({ moment, ids }) => {
    const [IMEI0, IMEI1, IMEI2, IMEI3] = ids
    const F = ForkliftData
    const now = new Date(...moment).getTime()
    const added = '2026-09-01 10:00:00'
    const dev = { deviceId: IMEI0, addDate: added }
    const out = {}
    const past = F.day(dev, '2026-10-09', now)
    out.past = { rows: past.length, minutes: past.every((r, i) => r.minute === i), times: past.every((r, i) => i === 0 || r.time > past[i - 1].time), dates: past.every((r) => r.date === '2026-10-09') }
    const today = F.day(dev, '2026-10-10', now)
    out.today = { rows: today.length, last: today[today.length - 1].time.slice(0, 5) }
    out.future = F.day(dev, '2026-10-11', now).length
    out.beforeAdded = [F.day(dev, '2026-08-31', now).length, F.day(dev, '2026-09-01', now).length]
    out.same = JSON.stringify(F.day(dev, '2026-10-08', now)) === JSON.stringify(F.day({ deviceId: IMEI0, addDate: added }, '2026-10-08', now))
    out.differs = [JSON.stringify(F.day(dev, '2026-10-08', now)) !== JSON.stringify(F.day(dev, '2026-10-07', now)), JSON.stringify(F.day(dev, '2026-10-08', now)) !== JSON.stringify(F.day({ deviceId: IMEI1, addDate: added }, '2026-10-08', now))]

    // go through a good many days of several trackers
    const problems = []
    const seen = { states: new Set(), speeds: [], capacityRose: 0, drained: 0 }
    ;[IMEI0, IMEI1, IMEI2, IMEI3].forEach((id) => {
      for (let d = 1; d <= 14; d++) {
        const iso = F.addDays('2026-10-09', -d)
        const rows = F.day({ deviceId: id, addDate: '2026-01-01 00:00:00' }, iso, now)
        let capacity = 101
        rows.forEach((r) => {
          const tag = `${id} ${iso} ${r.time}`
          const expected = r.ignition ? (r.movement ? 3 : 2) : (r.movement ? 4 : 1)
          if (r.state !== expected) problems.push(`${tag}: state ${r.state} but ignition ${r.ignition} movement ${r.movement}`)
          seen.states.add(r.state)
          if (r.state <= 2 && r.speed !== 0) problems.push(`${tag}: speed ${r.speed} while not moving`)
          if (r.state === 3 && (r.speed < 1.5 || r.speed > 14.01)) problems.push(`${tag}: active speed ${r.speed}`)
          if (r.state === 4 && (r.speed < 1 || r.speed > 4.01 || r.ignition)) problems.push(`${tag}: alert row`)
          if (r.distance < 0 || (!r.movement && r.distance !== 0)) problems.push(`${tag}: distance ${r.distance}`)
          if (r.distance > r.speed / 60 + 0.0006) problems.push(`${tag}: moved ${r.distance} km at ${r.speed} km/h in a minute`)
          const at = F.toSite(r.latitude, r.longitude)
          if (at.x < -6 || at.x > F.SITE.width + 6 || at.y < -6 || at.y > F.SITE.height + 6) problems.push(`${tag}: off the site (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`)
          if (!r.movement && r.ext.speed !== 0) problems.push(`${tag}: ext speed ${r.ext.speed} while not moving`)
          if (r.movement && (r.ext.speed <= 0 || Math.abs(r.ext.speed - r.speed) > r.speed * 0.1 + 0.3)) problems.push(`${tag}: ext speed ${r.ext.speed} vs ${r.speed}`)
          if (Math.abs(r.ext.distance - r.distance) > r.distance * 0.07 + 0.0011) problems.push(`${tag}: ext distance ${r.ext.distance} vs ${r.distance}`)
          if (r.state === 1 && (r.ext.amps !== 0 || r.ext.power !== 0 || r.ext.wattHr !== 0)) problems.push(`${tag}: drawing power while inactive`)
          if (Math.abs(r.ext.power - r.ext.voltage * r.ext.amps) > 0.7) problems.push(`${tag}: power ${r.ext.power} is not ${r.ext.voltage} x ${r.ext.amps} (to the rounding)`)
          if (Math.abs(r.ext.wattHr - r.ext.power / 60) > 0.011) problems.push(`${tag}: watt-hours ${r.ext.wattHr}`)
          if (r.ext.voltage < 44 || r.ext.voltage > 53) problems.push(`${tag}: voltage ${r.ext.voltage}`)
          if (r.ext.capacity < 10 || r.ext.capacity > 100) problems.push(`${tag}: capacity ${r.ext.capacity}`)
          if (r.ext.capacity > capacity) seen.capacityRose++
          capacity = r.ext.capacity
          if (r.gsmSignal < 1 || r.gsmSignal > 5 || ![40445, 40410, 40486, 40470].includes(r.gsmOperatorCode) || r.satellite < 7 || r.satellite > 14) problems.push(`${tag}: gsm / satellites`)
        })
        if (rows.length && rows[rows.length - 1].ext.capacity < rows[0].ext.capacity) seen.drained++
      }
    })
    out.problems = problems.slice(0, 5)
    out.problemCount = problems.length
    out.states = Array.from(seen.states).sort()
    out.capacityRose = seen.capacityRose
    out.drained = seen.drained
    return out
  }, { moment: NOW, ids: IMEI })
  check('a past day has a reading for every minute, in order, with its own date', facts.past.rows === 1440 && facts.past.minutes && facts.past.times && facts.past.dates, facts.past)
  check('today has readings up to the minute it is, and a day to come has none', facts.today.rows === 15 * 60 + 30 + 1 && facts.today.last === '15:30' && facts.future === 0, [facts.today, facts.future])
  check('a forklift has nothing from before the day it was registered', facts.beforeAdded[0] === 0 && facts.beforeAdded[1] === 1440, facts.beforeAdded)
  check('the same forklift on the same day gives the same readings every time', facts.same)
  check('another day, or another forklift, gives different ones', facts.differs[0] && facts.differs[1], facts.differs)
  check(`56 forklift-days of readings all follow the rules (state from ignition and movement, speeds, distance, position on site, battery, GSM) [${facts.problemCount} problems]`, facts.problemCount === 0, facts.problems)
  check('all four states turn up over those days, and the battery never gains charge during a day', same(facts.states, [1, 2, 3, 4]) && facts.capacityRose === 0 && facts.drained > 10, facts)

  const maths = await store(({ moment, ids }) => {
    const [IMEI0] = ids
    const F = ForkliftData
    const now = new Date(...moment).getTime()
    const dev = { deviceId: IMEI0, addDate: '2026-09-01 10:00:00' }
    const rows = F.day(dev, '2026-10-09', now)
    const hours = F.stateHours(rows)
    const runs = F.timeline(rows)
    const sum = F.summary(rows)
    const week = F.week(dev, now)
    const report = F.report(dev, '2026-10-05', '2026-10-09', now)
    const half = F.between(dev, '2026-10-09', '08:00', '12:00', now)
    const noDevice = { deviceId: IMEI0, addDate: '2026-10-12 00:00:00' }
    return {
      hours,
      hoursTotal: Math.round((hours.Inactive + hours.Idle + hours.Active + hours.Alert) * 100) / 100,
      hoursByCount: STATES_OF(rows),
      runs: { minutes: runs.reduce((a, r) => a + r.minutes, 0), contiguous: runs.every((r, i) => i === 0 || r.from === runs[i - 1].to), alternating: runs.every((r, i) => i === 0 || r.state !== runs[i - 1].state), first: runs[0].from, end: runs[runs.length - 1].to },
      sum: { distance: Math.round(rows.reduce((a, r) => a + r.distance, 0) * 100) / 100, shown: sum.gpsDistance, top: Math.max.apply(null, rows.map((r) => r.speed)), shownTop: sum.topSpeed, wh: Math.round(rows.reduce((a, r) => a + r.ext.wattHr, 0) * 100) / 100, shownWh: sum.wattHr, ext: Math.round(rows.reduce((a, r) => a + r.ext.distance, 0) * 100) / 100, shownExt: sum.extDistance },
      week: week.map((w) => [w.date, w.weekday]),
      weekHours: week.every((w) => Math.abs(w.total - (w.date === F.isoOf(new Date(now)) ? w.total : 24)) < 0.05),
      report: report.map((r) => [r.date, r.gpsDistance === F.summary(F.day(dev, r.date, now)).gpsDistance, r.hours.Active === F.stateHours(F.day(dev, r.date, now)).Active]),
      reportEmpty: [F.report(dev, '2026-10-09', '2026-10-05', now).length, F.report(noDevice, '2026-10-01', '2026-10-10', now).length],
      half: { rows: half.length, first: half[0].time.slice(0, 5), last: half[half.length - 1].time.slice(0, 5) },
      latest: [F.latest(dev, now).time.slice(0, 5), F.latest(noDevice, now), F.latest(dev, new Date(2026, 7, 31, 9, 0, 0).getTime()), F.latest(dev, new Date(2026, 8, 1, 9, 0, 0).getTime()).date],
    }
    function STATES_OF(list) { const out = { Inactive: 0, Idle: 0, Active: 0, Alert: 0 }; list.forEach((r) => { out[F.STATES[r.state - 1]] += 1 }); Object.keys(out).forEach((k) => { out[k] = Math.round((out[k] / 60) * 100) / 100 }); return out }
  }, { moment: NOW, ids: IMEI })
  check('the hours in each state add up to the 24 hours of the day', Math.abs(maths.hoursTotal - 24) < 0.05, maths.hoursTotal)
  check('each reading counts as one minute in its state', same(maths.hoursByCount, maths.hours), [maths.hoursByCount, maths.hours])
  check('the timeline is the same day in runs of one state: no gaps, no two next to each other alike', maths.runs.minutes === 1440 && maths.runs.contiguous && maths.runs.alternating && maths.runs.first === 0 && maths.runs.end === 1440, maths.runs)
  check('the summary adds the readings up: distances, top speed, energy', Math.abs(maths.sum.distance - maths.sum.shown) < 0.02 && maths.sum.top === maths.sum.shownTop && Math.abs(maths.sum.wh - maths.sum.shownWh) < 0.5 && Math.abs(maths.sum.ext - maths.sum.shownExt) < 0.02, maths.sum)
  check('the week is seven days ending today, each named for its weekday', maths.week.length === 7 && maths.week[6][0] === '2026-10-10' && maths.week[0][0] === '2026-10-04' && maths.week[6][1] === 'Saturday' && maths.week[0][1] === 'Sunday', maths.week)
  check('a whole past day in the week is 24 hours', maths.weekHours)
  check('a report has a line for each day with readings, matching that day\'s summary', maths.report.length === 5 && maths.report.every((r) => r[1] && r[2]) && same(maths.report.map((r) => r[0]), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']), maths.report)
  check('a report with the dates the wrong way round, or from before the forklift existed, is empty', same(maths.reportEmpty, [0, 0]), maths.reportEmpty)
  check('a window of the day gives its minutes, both ends included', maths.half.rows === 241 && maths.half.first === '08:00' && maths.half.last === '12:00', maths.half)
  check('the latest reading is the newest; there is none before the forklift was registered, and the day it was registered counts from midnight', maths.latest[0] === '15:30' && maths.latest[1] === null && maths.latest[2] === null && maths.latest[3] === '2026-09-01', maths.latest)

  // ======================================================== the registered
  section('Registering forklifts')
  const reg = await store(() => {
    const out = {}
    const seed = Store.get().forkliftDevices
    out.seed = { count: seed.length, ids: seed.map((d) => d.deviceId), unique: new Set(seed.map((d) => d.deviceId)).size, long: seed.every((d) => d.deviceId.length <= 15 && /^\d+$/.test(d.deviceId)), dates: seed.map((d) => d.addDate.slice(0, 10)) }
    out.taken = [Store.forkliftDeviceIdTaken('352093081452251'), Store.forkliftDeviceIdTaken(' 352093081452251 ', 'fk1'), Store.forkliftDeviceIdTaken('abc'), Store.forkliftDeviceIdTaken('')]
    const added = Store.addForkliftDevice({ deviceId: ' ABC123 ', vehicleName: ' Test truck ', deviceModel: 'FMB1', vehicleId: 'T-1', driver: ' Sam ', manufacturer: 'X', hardwareVersion: '1', softwareVersion: '2' })
    out.added = { id: added.id.startsWith('fk-'), deviceId: added.deviceId, name: added.vehicleName, driver: added.driver, date: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(added.addDate) }
    out.takenNow = [Store.forkliftDeviceIdTaken('abc123'), Store.forkliftDeviceIdTaken('ABC123', added.id)]
    const before = Store.get().forkliftDevices.find((d) => d.id === added.id).addDate
    Store.updateForkliftDevice(added.id, { deviceId: 'CHANGED', addDate: '2000-01-01 00:00:00', vehicleName: ' Renamed ', driver: '', unknown: 1 })
    const upd = Store.get().forkliftDevices.find((d) => d.id === added.id)
    out.updated = { deviceId: upd.deviceId, addDate: upd.addDate === before, name: upd.vehicleName, driver: upd.driver, model: upd.deviceModel, extra: 'unknown' in upd }
    Store.removeForkliftDevice(added.id)
    out.removed = !Store.get().forkliftDevices.some((d) => d.id === added.id) && Store.get().forkliftDevices.length === 5
    out.app = Store.get().applications.find((a) => a.id === 'app_forklift')
    return out
  })
  check('five forklifts are registered, each with its own 15-digit tracker ID', reg.seed.count === 5 && same(reg.seed.ids, IMEI) && reg.seed.unique === 5 && reg.seed.long, reg.seed)
  check('they were registered at different times, one of them only four days ago', reg.seed.dates[3] > reg.seed.dates[0] && new Set(reg.seed.dates).size >= 3, reg.seed.dates)
  check('a device ID is taken whatever the case and spaces, except by the forklift itself', same(reg.taken, [true, false, false, false]) && same(reg.takenNow, [true, false]), [reg.taken, reg.takenNow])
  check('a forklift is added with its details trimmed and the date it was registered', reg.added.id && reg.added.deviceId === 'ABC123' && reg.added.name === 'Test truck' && reg.added.driver === 'Sam' && reg.added.date, reg.added)
  check('editing changes the details but never the tracker ID or the date registered', reg.updated.deviceId === 'ABC123' && reg.updated.addDate && reg.updated.name === 'Renamed' && reg.updated.driver === '' && reg.updated.model === 'FMB1' && !reg.updated.extra, reg.updated)
  check('a forklift can be removed', reg.removed)
  check('the application is a built-in default with the truck icon', reg.app && reg.app.isDefault && reg.app.icon === 'truck' && reg.app.name === 'Forklift Tracking', reg.app)

  // ============================================================ the page
  section('Where it appears')
  await fresh('applications.html', '#tbody tr')
  const row = await page.evaluate(() => { const tr = Array.from(document.querySelectorAll('#tbody tr')).find((r) => r.textContent.includes('Forklift Tracking')); return tr && tr.getAttribute('data-open') })
  check('the Applications list has it, and it opens its own page', row === 'forklift-tracking.html#app_forklift', row)
  await page.click('.sidebar-child-link[href="forklift-tracking.html#app_forklift"]')
  await page.waitForURL(/forklift-tracking\.html/)
  await page.waitForSelector('#ft-view')
  check('the sidebar entry opens it, highlighted, with the page named for the application', same(await page.$$eval('.sidebar .active', (els) => els.map((el) => el.textContent.trim())), ['Forklift Tracking']) && (await page.title()) === 'Forklift Tracking — Univa' && (await visible('.default-profile-badge')))
  check('the breadcrumbs lead back through Applications', same(await page.$$eval('.top-bar-breadcrumbs > *:not(.breadcrumb-separator)', (els) => els.map((el) => el.textContent.trim())), ['Home', 'Applications', 'Forklift Tracking']))
  check('Manage leads to the application\'s own page, and the status can be changed', (await page.getAttribute('a.modal-button', 'href')) === 'application-detail.html#app_forklift')
  await page.click('#toggle-status-btn')
  check('Suspend suspends it and says so', (await page.textContent('.page-header .status-pill')) === 'suspended' && (await toast()).includes('status updated'))
  await page.click('#toggle-status-btn')
  const tabs = await page.$$eval('[data-ft-tab]', (els) => els.map((el) => [el.getAttribute('data-ft-tab'), el.textContent.trim()]))
  check('there are four tabs, and Fleet shows first', same(tabs, [['fleet', 'Fleet'], ['live', 'Live'], ['history', 'History'], ['reports', 'Reports']]) && same(await page.$$eval('[data-ft-tab].active', (els) => els.map((el) => el.getAttribute('data-ft-tab'))), ['fleet']))
  await page.click('[data-ft-tab="live"]')
  await page.waitForSelector('#ft-details')
  check('a tab\'s button opens it and puts it, and the forklift, in the address', /#app_forklift:live:352093081452251$/.test(page.url()) && (await page.getAttribute('[data-ft-tab="live"]', 'aria-selected')) === 'true', page.url())
  await page.selectOption('#ft-device', IMEI[2])
  await page.waitForTimeout(150)
  check('choosing another forklift changes the address and what is shown', /#app_forklift:live:352093081452277$/.test(page.url()) && (await page.textContent('#ft-details')).includes('Reach truck 03'))
  await page.click('[data-ft-tab="history"]')
  await page.waitForSelector('#ft-show')
  check('and the forklift stays chosen when the tab changes', /#app_forklift:history:352093081452277$/.test(page.url()) && (await page.inputValue('#ft-device')) === IMEI[2])
  await open('forklift-tracking.html#app_forklift:reports:' + IMEI[4])
  check('an address with a tab and a forklift opens both', (await page.inputValue('#ft-device')) === IMEI[4] && (await page.locator('#ft-report-table').count()) === 1)
  await open('forklift-tracking.html#app_forklift:live:999')
  check('a forklift that is not there falls back to the first', (await page.inputValue('#ft-device')) === IMEI[0])
  await open('forklift-tracking.html#app_forklift:nonsense')
  check('a tab that is not there opens the Fleet', (await page.locator('#ft-cards').count()) === 1)

  // ============================================================== fleet
  section('Fleet')
  await fresh('forklift-tracking.html#app_forklift')
  const fleet = await store(() => {
    const now = Date.now()
    const today = ForkliftData.isoOf(new Date(now))
    return Store.get().forkliftDevices.map((d) => {
      const last = ForkliftData.latest(d, now)
      const s = ForkliftData.summary(ForkliftData.day(d, today, now))
      return { id: d.deviceId, name: d.vehicleName, state: last ? ForkliftData.STATES[last.state - 1] : null, battery: last ? last.ext.capacity : null, distance: s.gpsDistance, active: s.hours.Active }
    })
  })
  const cards = await page.$$eval('.ft-card', (els) => els.map((el) => ({ id: el.getAttribute('data-device'), name: el.querySelector('h3').textContent.trim(), state: el.querySelector('.ft-state').textContent.trim(), text: el.textContent.replace(/\s+/g, ' '), facts: Object.fromEntries(Array.from(el.querySelectorAll('dl > div')).map((d) => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()])) })))
  check('there is a card for each forklift with its name and tracker ID', same(cards.map((c) => c.id), IMEI) && same(cards.map((c) => c.name), ['Forklift 01', 'Forklift 02', 'Reach truck 03', 'Pallet truck 04', 'Forklift 05']) && cards[0].text.includes('ID 352093081452251'), cards.map((c) => c.id))
  check('each shows the state it is in now', cards.every((c, i) => c.state === (fleet[i].state || 'No data')), [cards.map((c) => c.state), fleet.map((f) => f.state)])
  check('each shows its battery, distance and active time today', cards.every((c, i) => c.facts.Battery === (fleet[i].battery === null ? '—' : fleet[i].battery + '%') && c.facts['Distance today'] === `${fleet[i].distance.toFixed(2)} km` && c.facts['Active today'] === hoursText(fleet[i].active)), cards.map((c) => c.facts))
  check('the forklift with no driver says so', cards[4].facts.Driver === 'None' && cards[0].facts.Driver === 'Ravi Kumar')
  const count = (state) => fleet.filter((f) => f.state === state).length
  check('the figures above count the forklifts in each state now', (await tileOf('Forklifts')) === '5' && (await tileOf('Active now')) === String(count('Active')) && (await tileOf('Idle now')) === String(count('Idle')) && (await tileOf('Inactive now')) === String(count('Inactive')) && (await tileOf('Alerts now')) === String(count('Alert')), fleet.map((f) => f.state))
  check('and the distance today is all the forklifts added up', (await tileOf('Distance today')) === fleet.reduce((a, f) => a + f.distance, 0).toFixed(2) + ' km', await tileOf('Distance today'))
  check('each card links to its live view, history and reports', same(await page.$$eval('.ft-card:first-child footer a', (as) => as.map((a) => a.getAttribute('href'))), ['#app_forklift:live:352093081452251', '#app_forklift:history:352093081452251', '#app_forklift:reports:352093081452251']))

  await page.fill('#ft-search', 'REACH')
  check('a search finds a forklift by name, in any case', same(await page.$$eval('.ft-card', (els) => els.map((el) => el.getAttribute('data-device'))), [IMEI[2]]))
  await page.fill('#ft-search', 'meena')
  check('by driver', same(await page.$$eval('.ft-card', (els) => els.map((el) => el.getAttribute('data-device'))), [IMEI[3]]))
  await page.fill('#ft-search', '2305')
  check('by vehicle ID', same(await page.$$eval('.ft-card', (els) => els.map((el) => el.getAttribute('data-device'))), [IMEI[4]]))
  await page.fill('#ft-search', 'FMC130')
  check('by tracker model', same(await page.$$eval('.ft-card', (els) => els.map((el) => el.getAttribute('data-device'))), [IMEI[3]]))
  await page.fill('#ft-search', 'zzz')
  check('and says so when there is none', (await page.textContent('#ft-cards')).includes('No matching forklifts found.'))
  await page.fill('#ft-search', '')

  section('Registering, editing and deleting')
  await page.click('#ft-register')
  await page.waitForSelector('#forklift-modal.open')
  check('Register opens an empty form', (await page.textContent('#forklift-title')) === 'Register forklift' && (await page.inputValue('#fk-device-id')) === '' && (await page.getAttribute('#fk-device-id', 'readonly')) === null)
  await page.click('#forklift-save')
  check('the four required fields are asked for', (await errorText('fk-device-id-error')) === 'Device ID is required' && (await errorText('fk-name-error')) === 'Vehicle name is required' && (await errorText('fk-model-error')) === 'Device model is required' && (await errorText('fk-vehicle-id-error')) === 'Vehicle ID is required' && (await page.evaluate(() => document.getElementById('forklift-modal').classList.contains('open'))))
  await page.fill('#fk-device-id', '3520 930')
  await page.fill('#fk-name', 'N'.repeat(21))
  await page.fill('#fk-model', 'M')
  await page.fill('#fk-vehicle-id', 'V')
  await page.fill('#fk-hardware', 'H'.repeat(11))
  await page.click('#forklift-save')
  check('a device ID with a space is refused, and names and versions have a length limit', (await errorText('fk-device-id-error')) === 'Use letters and digits only' && (await errorText('fk-name-error')) === 'Vehicle name must be 20 characters or fewer' && (await errorText('fk-hardware-error')) === 'Hardware version must be 10 characters or fewer')
  await page.fill('#fk-device-id', '1234567890123456')
  await page.click('#forklift-save')
  check('so is one of 16 characters', (await errorText('fk-device-id-error')) === 'Device ID must be 15 characters or fewer')
  await page.fill('#fk-device-id', IMEI[1].toLowerCase())
  await page.click('#forklift-save')
  check('and one that is already registered', (await errorText('fk-device-id-error')) === 'A forklift with this device ID is already registered')
  await page.fill('#fk-device-id', 'TEST000000001')
  await page.fill('#fk-name', 'Test truck 06')
  await page.fill('#fk-hardware', '01')
  await page.fill('#fk-software', '02.01')
  await page.fill('#fk-manufacturer', 'Teltonika')
  await page.fill('#fk-driver', 'Pat')
  await page.click('#forklift-save')
  const added = await store(() => Store.get().forkliftDevices.find((d) => d.deviceId === 'TEST000000001'))
  check('a good one is registered with everything entered, and says so', added && added.vehicleName === 'Test truck 06' && added.vehicleId === 'V' && added.driver === 'Pat' && added.softwareVersion === '02.01' && (await toast()) === '"Test truck 06" registered successfully!', added)
  check('its card is there, among the others', (await page.locator('.ft-card[data-device="TEST000000001"]').count()) === 1 && (await page.locator('.ft-card').count()) === 6)

  await page.click('.ft-card[data-device="TEST000000001"] [data-menu-toggle]')
  await page.click('.ft-card[data-device="TEST000000001"] [data-edit]')
  await page.waitForSelector('#forklift-modal.open')
  check('Edit fills the form in, with the tracker ID read-only', (await page.textContent('#forklift-title')) === 'Edit forklift' && (await page.inputValue('#fk-name')) === 'Test truck 06' && (await page.getAttribute('#fk-device-id', 'readonly')) !== null && (await page.textContent('#forklift-save')) === 'Save changes')
  await page.fill('#fk-name', 'Test truck 06b')
  await page.fill('#fk-driver', '')
  await page.click('#forklift-save')
  check('the changes are saved, and a driver can be taken away', same(await store(() => { const d = Store.get().forkliftDevices.find((x) => x.deviceId === 'TEST000000001'); return [d.vehicleName, d.driver] }), ['Test truck 06b', '']) && (await toast()) === '"Test truck 06b" updated successfully!')
  await page.click('.ft-card[data-device="TEST000000001"] [data-menu-toggle]')
  await page.click('.ft-card[data-device="TEST000000001"] [data-delete]')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('Delete asks first, naming the forklift', (await page.textContent('.confirm-dialog-message')).includes('Test truck 06b'))
  await page.click('#confirm-dialog-cancel')
  check('Cancel keeps it', (await page.locator('.ft-card').count()) === 6)
  await page.click('.ft-card[data-device="TEST000000001"] [data-menu-toggle]')
  await page.click('.ft-card[data-device="TEST000000001"] [data-delete]')
  await confirmYes()
  check('and then removes it', (await page.locator('.ft-card').count()) === 5 && (await toast()) === '"Test truck 06b" deleted successfully!')

  // =============================================================== live
  section('Live')
  await fresh('forklift-tracking.html#app_forklift:live:' + IMEI[0], '#ft-details')
  const live = await store(() => {
    const now = Date.now()
    const d = Store.get().forkliftDevices[0]
    const today = ForkliftData.isoOf(new Date(now))
    const rows = ForkliftData.day(d, today, now)
    const last = ForkliftData.latest(d, now)
    const s = ForkliftData.summary(rows)
    return { last, runs: ForkliftData.timeline(rows).length, moving: rows.filter((r) => r.movement).length, count: rows.length, top: s.topSpeed, wh: s.wattHr, distance: s.gpsDistance, hours: s.hours, today, newest: rows.slice(-10).reverse().map((r) => r.time), week: ForkliftData.week(d, now), name: d.vehicleName, state: ForkliftData.STATES[last.state - 1] }
  })
  check('the vehicle details are the forklift\'s own', same(await page.$$eval('#ft-details div', (els) => els.map((el) => [el.querySelector('dt').textContent, el.querySelector('dd').textContent])), [['Device ID', IMEI[0]], ['Vehicle name', 'Forklift 01'], ['Manufacturer', 'Teltonika'], ['Vehicle ID', 'FL-2301'], ['Device model', 'FMB920'], ['Hardware version', '07'], ['Software version', '03.28.07'], ['Driver', 'Ravi Kumar']]))
  const status = await page.$$eval('#ft-live-status div', (els) => els.map((el) => [el.querySelector('dt').textContent, el.querySelector('dd').textContent.replace(/\s+/g, ' ').trim()]))
  check('the live status says the state, ignition, movement and the GSM operator, signal and area as last reported', status[0][1] === live.state && status[1][1] === (live.last.ignition ? 'ON' : 'OFF') && status[2][1] === (live.last.movement ? 'Moving' : 'Not moving') && status[3][1] === String(live.last.gsmOperatorCode) && status[4][1].endsWith(String(live.last.gsmSignal)) && status[5][1] === String(live.last.gsmAreaCode), status)
  check('the speed dials say the GPS speed and the forklift\'s own', (await page.textContent('#ft-gps-speed')) === `${live.last.speed.toFixed(1)} km/h` && (await page.textContent('#ft-ext-speed')) === `${live.last.ext.speed.toFixed(1)} km/h`, [await page.textContent('#ft-gps-speed'), live.last.speed])
  check('the GPS panel gives the satellites, the position as last reported, and the top speed today', same(await page.$$eval('#ft-gps div', (els) => els.map((el) => el.querySelector('dd').textContent.trim())).then((v) => v.slice(0, 3)), [String(live.last.satellite), live.last.longitude.toFixed(6), live.last.latitude.toFixed(6)]) && (await page.textContent('#ft-top-speed')) === `${live.top.toFixed(1)} km/h`)
  check('the battery shows its charge, power and energy used today', (await page.getAttribute('#ft-battery', 'title')) === `${live.last.ext.capacity}% charged` && (await page.textContent('#ft-power')) === `${Math.round(live.last.ext.power).toLocaleString()} W` && (await page.textContent('#ft-energy')) === `${Math.round(live.wh).toLocaleString()} Wh`, [await page.textContent('#ft-power'), await page.textContent('#ft-energy')])
  check('today\'s status bar has a coloured run for each change of state', (await page.locator('.ft-timeline .ft-run').count()) === live.runs && (await page.locator('.ft-legend span').count()) === 4)
  check('hovering a run names the state and the minutes', /^(Inactive|Idle|Active|Alert): \d\d:\d\d to \d\d:\d\d \(\d+ min\)$/.test(await page.getAttribute('.ft-timeline .ft-run', 'title')), await page.getAttribute('.ft-timeline .ft-run', 'title'))
  check('the route map shows how many minutes were on the move, and the forklift where it is, in the colour of its state', (await page.textContent('.ft-map-note')).includes(`${live.moving} of ${live.count} minutes on the move`) && (await page.getAttribute('.ft-map-now', 'fill')) === { Inactive: '#a8a29e', Idle: '#f59e0b', Active: '#16a34a', Alert: '#dc2626' }[live.state])
  check('the hours today in each state add up', (await page.$$eval('#ft-hours span', (els) => els.map((el) => el.textContent.trim()))).join('|') === ['Inactive', 'Idle', 'Active', 'Alert'].map((s) => `${s} ${live.hours[s].toFixed(2)} h`).join('|'))
  const week = await tableRows('#ft-week-table')
  check('the week has a line for each of the last seven days', week.length === 7 && same(week.map((r) => r[0]), live.week.map((w) => w.weekday)) && week.every((r, i) => r[1] === live.week[i].hours.Active.toFixed(2) && r[3] === live.week[i].hours.Inactive.toFixed(2)), week)
  const gpsRows = await tableRows('[data-table="live-gps"]')
  const extRows = await tableRows('[data-table="live-ext"]')
  check('the GPS table and the parameters table show the last ten reports, newest first, with no pager', gpsRows.length === 10 && extRows.length === 10 && same(gpsRows.map((r) => r[2]), live.newest) && same(extRows.map((r) => r[2]), live.newest) && gpsRows[0][0] === '1' && !(await page.locator('.ft-pager').count()), gpsRows[0])
  if (await store(() => typeof ApexCharts !== 'undefined')) {
    await page.waitForSelector('#ft-chart-speed .apexcharts-canvas')
    check('the speed chart, the week chart and the state chart are drawn', (await page.locator('#ft-chart-speed .apexcharts-canvas').count()) === 1 && (await page.locator('#ft-chart-week .apexcharts-bar-series').count()) === 1 && (await page.locator('#ft-chart-pie .apexcharts-pie').count()) === 1)
  } else skip('the charts', 'the chart library could not be loaded')

  await page.selectOption('#ft-device', IMEI[3])
  await page.waitForTimeout(150)
  const live4 = await store(() => { const d = Store.get().forkliftDevices[3]; return ForkliftData.latest(d, Date.now()) })
  check('another forklift shows its own readings', (await page.textContent('#ft-details')).includes('Pallet truck 04') && (await page.textContent('#ft-gps-speed')) === `${live4.speed.toFixed(1)} km/h`)

  section('Live view follows the clock')
  await fresh('forklift-tracking.html#app_forklift:live:' + IMEI[0], '#ft-details')
  const stamp0 = await page.textContent('#ft-last-report')
  await store(() => { const real = Date.now; Date.now = () => real() + 3 * 60000 })
  await page.waitForTimeout(5600)
  const stamp1 = await page.textContent('#ft-last-report')
  check('a new minute brings a newer last report without anything being pressed', stamp1 > stamp0, [stamp0, stamp1])

  // ============================================================ history
  section('History')
  await fresh('forklift-tracking.html#app_forklift:history:' + IMEI[0], '#ft-show')
  const today = await store(() => ForkliftData.isoOf(new Date()))
  const dayBefore = await store((t) => ForkliftData.addDays(t, -3), today)
  check('it starts on today, the whole day', (await page.inputValue('#ft-date')) === today && (await page.inputValue('#ft-from')) === '00:00' && (await page.inputValue('#ft-to')) === '23:59')
  const expectFor = (date, from, to) => store((a) => { const d = Store.get().forkliftDevices[0]; const rows = ForkliftData.between(d, a.date, a.from, a.to); const s = ForkliftData.summary(rows); return { rows: rows.length, gps: s.gpsDistance, ext: s.extDistance, wh: s.wattHr, top: s.topSpeed, hours: s.hours, runs: ForkliftData.timeline(rows).length, moving: rows.filter((r) => r.movement).length } }, { date, from, to })
  let want = await expectFor(today, '00:00', '23:59')
  check('the figures are for those readings', (await tileOf('Readings')) === String(want.rows) && (await tileOf('GPS distance')) === want.gps.toFixed(2) + ' km' && (await tileOf('Top speed')) === want.top.toFixed(1) + ' km/h' && (await tileOf('Active')) === hoursText(want.hours.Active), [await tileOf('Readings'), want.rows])
  await page.fill('#ft-date', dayBefore)
  await page.fill('#ft-from', '08:00')
  await page.fill('#ft-to', '12:00')
  await page.click('#ft-show')
  await page.waitForSelector('#ft-show')
  want = await expectFor(dayBefore, '08:00', '12:00')
  check('Show gives the readings of that part of that day: one a minute, both ends included', want.rows === 241 && (await tileOf('Readings')) === '241' && (await tileOf('GPS distance')) === want.gps.toFixed(2) + ' km' && (await tileOf('Odometer distance')) === want.ext.toFixed(2) + ' km' && (await tileOf('Idle')) === hoursText(want.hours.Idle), [await tileOf('Readings'), want])
  check('the heading and the status bar are for that window', (await page.textContent('.detail-card h2 .rt-card-note')).includes(`${dayBefore} · 08:00 to 12:00`) && (await page.locator('.ft-timeline .ft-run').count()) === want.runs)
  check('the route says how many of the 241 minutes were on the move', (await page.textContent('.ft-map-note')).includes(`${want.moving} of 241 minutes on the move`))
  const first = await tableRows('[data-table="hist-gps"]')
  check('the GPS table lists the readings newest first, 25 to a page', first.length === 25 && first[0][2].startsWith('12:00:') && (await page.textContent('#ft-gps-table [data-showing]')) === 'Showing 1 to 25 of 241 entries', first[0])
  check('with ten pages the pager shows the page and how many', same(await page.$$eval('#ft-gps-table .pagination button', (els) => els.map((el) => el.textContent.trim())), ['Previous', '1 / 10', 'Next']))
  await page.click('#ft-gps-table [data-page-of="hist-gps"][data-page="2"]')
  check('Next moves on to the following 25, and leaves the other table where it was', (await page.textContent('#ft-gps-table [data-showing]')) === 'Showing 26 to 50 of 241 entries' && (await tableRows('[data-table="hist-gps"]'))[0][0] === '26' && (await page.textContent('#ft-ext-table [data-showing]')) === 'Showing 1 to 25 of 241 entries')
  await page.click('#ft-ext-table [data-page-of="hist-ext"][data-page="2"]')
  await page.click('#ft-ext-table [data-page-of="hist-ext"][data-page="3"]')
  check('each table has its own page', (await page.textContent('#ft-ext-table [data-showing]')) === 'Showing 51 to 75 of 241 entries' && (await page.textContent('#ft-gps-table [data-showing]')) === 'Showing 26 to 50 of 241 entries')
  await page.fill('#ft-date', dayBefore)
  await page.fill('#ft-from', '00:00')
  await page.fill('#ft-to', '23:59')
  await page.click('#ft-show')
  check('Show starts the tables again from page one', (await page.textContent('#ft-gps-table [data-showing]')) === 'Showing 1 to 25 of 1440 entries' && (await page.textContent('#ft-ext-table [data-showing]')) === 'Showing 1 to 25 of 1440 entries')
  const ext1 = await tableRows('[data-table="hist-ext"]')
  check('the parameters table has the battery columns', same(await page.$$eval('[data-table="hist-ext"] thead th', (els) => els.map((el) => el.textContent.trim())), ['S/NO', 'Date', 'Time', 'Odometer distance (km)', 'Speed (km/h)', 'Watt hr', 'Batt voltage (V)', 'Batt amp (A)', 'Batt power (W)', 'Batt charge (%)']) && ext1[0].length === 10)

  await page.fill('#ft-from', '18:00')
  await page.fill('#ft-to', '09:00')
  await page.click('#ft-show')
  check('From after To is refused', (await errorText('ft-history-error')) === 'From must be before To.')
  await page.fill('#ft-from', '00:00')
  await page.fill('#ft-to', '23:59')
  await page.fill('#ft-date', await store((t) => ForkliftData.addDays(t, 1), today))
  await page.click('#ft-show')
  check('a day to come is refused', (await errorText('ft-history-error')) === 'Choose a date up to today.')
  await page.fill('#ft-date', '')
  await page.click('#ft-show')
  check('and so is no date', (await errorText('ft-history-error')) === 'Choose a date.')
  await page.selectOption('#ft-device', IMEI[3])
  await page.waitForTimeout(150)
  await page.fill('#ft-date', await store((t) => ForkliftData.addDays(t, -10), today))
  await page.click('#ft-show')
  check('for a day before the forklift was registered it says when it was, and shows nothing', /was registered on \d{4}-\d{2}-\d{2}, so there is nothing before then/.test(await page.textContent('#ft-history-empty')) && (await tileOf('Readings')) === '0' && (await page.textContent('#ft-gps-table')).includes('No data for this period.'))

  // ============================================================ reports
  section('Reports')
  await fresh('forklift-tracking.html#app_forklift:reports:' + IMEI[0], '#ft-report-table')
  const week7 = await store(() => { const d = Store.get().forkliftDevices[0]; const to = ForkliftData.isoOf(new Date()); return ForkliftData.report(d, ForkliftData.addDays(to, -6), to) })
  check('it starts on the last seven days', (await page.inputValue('#ft-rto')) === today && (await page.inputValue('#ft-rfrom')) === (await store((t) => ForkliftData.addDays(t, -6), today)))
  const lines = await tableRows('#ft-report-table')
  const days = lines.filter((r) => r[0] !== 'Total')
  check('there is a line a day, oldest first, with the distances, the energy and the hours in each state', days.length === week7.length && days.every((r, i) => r[0] === week7[i].date && r[1] === week7[i].gpsDistance.toFixed(2) && r[2] === week7[i].extDistance.toFixed(2) && r[3] === week7[i].wattHr.toFixed(2) && r[4] === week7[i].hours.Active.toFixed(2) && r[5] === week7[i].hours.Idle.toFixed(2) && r[6] === week7[i].hours.Inactive.toFixed(2) && r[7] === week7[i].hours.Alert.toFixed(2)), days[0])
  const total = lines.find((r) => r[0] === 'Total')
  const sums = [1, 2, 3, 4, 5, 6, 7].map((c) => days.reduce((a, r) => a + Number(r[c]), 0))
  check('the last line adds each column up', total && total.slice(1).every((v, i) => Math.abs(Number(v) - sums[i]) < 0.011 * days.length), [total, sums])
  await page.fill('#ft-rfrom', today)
  await page.fill('#ft-rto', await store((t) => ForkliftData.addDays(t, -2), today))
  await page.click('#ft-rsearch')
  check('a range the wrong way round is refused', (await errorText('ft-report-error')) === 'From must be on or before To.')
  await page.fill('#ft-rfrom', '')
  await page.click('#ft-rsearch')
  check('so is a missing date', (await errorText('ft-report-error')) === 'Choose both dates.')
  await page.fill('#ft-rfrom', await store((t) => ForkliftData.addDays(t, -100), today))
  await page.fill('#ft-rto', today)
  await page.click('#ft-rsearch')
  check('and one of more than 93 days', (await errorText('ft-report-error')) === 'Choose a range of up to 93 days.')
  const from3 = await store((t) => ForkliftData.addDays(t, -3), today)
  await page.fill('#ft-rfrom', from3)
  await page.fill('#ft-rto', today)
  await page.click('#ft-rsearch')
  check('a good range is shown, four days', (await tableRows('#ft-report-table')).filter((r) => r[0] !== 'Total').length === 4 && (await page.textContent('.detail-card h2 .rt-card-note')).includes(`${from3} to ${today}`) && !(await visible('#ft-report-error')))
  await page.click('#ft-rclear')
  check('Clear goes back to the last seven days', (await tableRows('#ft-report-table')).filter((r) => r[0] !== 'Total').length === week7.length)

  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#ft-csv')])
  const grid = parseCsv(await csv.text())
  check('Download CSV is named for the vehicle and the dates', csv.suggestedFilename() === `forklift-report_FL-2301_${week7[0].date}_to_${week7[week7.length - 1].date}.csv`, csv.suggestedFilename())
  check('it has the headings of the React report, plus alert hours, and a line a day without a total', same(grid[0], ['Date', 'GPS Distance', 'ODOMETER Distance', 'Watt HR', 'Active Hours', 'Inactive Hours', 'Idle Hours', 'Alert Hours']) && grid.length === week7.length + 1 && grid[1][0] === week7[0].date && Number(grid[1][1]) === week7[0].gpsDistance && Number(grid[1][5]) === week7[0].hours.Inactive && Number(grid[1][6]) === week7[0].hours.Idle, grid.slice(0, 2))
  await store(() => { window.__pdf = []; function FakeDoc(options) { window.__pdf.push({ options }) } FakeDoc.API = { autoTable: true }; FakeDoc.prototype.setFontSize = function () {}; FakeDoc.prototype.text = function (text) { window.__pdf.push({ title: text }) }; FakeDoc.prototype.autoTable = function (opts) { window.__pdf.push({ head: opts.head, body: opts.body }) }; FakeDoc.prototype.save = function (name) { window.__pdf.push({ saved: name }) }; window.jspdf = { jsPDF: FakeDoc } })
  await page.click('#ft-pdf')
  await page.waitForTimeout(250)
  const pdf = await store(() => window.__pdf)
  check('Download PDF makes a landscape table of the same lines, titled with the forklift and the dates', pdf.length === 4 && pdf[0].options.orientation === 'landscape' && pdf[1].title === `Forklift report: Forklift 01 (${IMEI[0]}), ${week7[0].date} to ${week7[week7.length - 1].date}` && pdf[2].head[0].length === 8 && pdf[2].body.length === week7.length && pdf[3].saved.endsWith('.pdf'), pdf)
  await page.selectOption('#ft-device', IMEI[3])
  await page.waitForTimeout(150)
  const fewer = (await tableRows('#ft-report-table')).filter((r) => r[0] !== 'Total').length
  check('another forklift has its own report (this one was registered four days ago, so it has fewer lines)', fewer < week7.length && fewer >= 4 && fewer <= 5, fewer)
  await page.fill('#ft-rfrom', await store((t) => ForkliftData.addDays(t, -30), today))
  await page.fill('#ft-rto', await store((t) => ForkliftData.addDays(t, -20), today))
  await page.click('#ft-rsearch')
  check('a range with no readings says so', (await tableRows('#ft-report-table'))[0][0] === 'No data for these dates.')
  await store(() => { window.__files = 0; const make = URL.createObjectURL; URL.createObjectURL = function () { window.__files++; return make.apply(URL, arguments) } })
  await page.click('#ft-csv')
  check('and then there is nothing to download, which it says, and no file is made', (await toast()) === 'There is nothing to download for these dates.' && (await store(() => window.__files)) === 0)

  // ===================================================== other places
  section('Names are shown as text, and who can see it')
  await fresh('forklift-tracking.html#app_forklift')
  const evil = '<img src=x onerror="window.__pwned=1">'
  await store((name) => { window.__pwned = 0; Store.updateForkliftDevice('fk1', { vehicleName: name, driver: name, vehicleId: name, deviceModel: name }) }, evil)
  const seen = {}
  for (const tab of ['fleet', 'live', 'history', 'reports']) {
    await open('forklift-tracking.html#app_forklift:' + tab + (tab === 'fleet' ? '' : ':' + IMEI[0]))
    await page.waitForTimeout(100)
    seen[tab] = await page.evaluate(() => ({ images: document.querySelectorAll('#ft-view img').length, pwned: window.__pwned || 0, text: document.getElementById('ft-view').textContent.includes('<img src=x') || Array.from(document.querySelectorAll('#ft-device option')).some((o) => o.textContent.includes('<img src=x')) }))
  }
  check('a forklift named with markup runs nothing on any tab, and shows as typed on the cards, the details and the selector', Object.keys(seen).every((t) => seen[t].images === 0 && seen[t].pwned === 0) && seen.fleet.text && seen.live.text && seen.reports.text, seen)
  await fresh('settings.html', '.bk-group')
  check('Settings > Backup offers it as a page of its own', (await page.locator('[data-bk-page="app:app_forklift"]').count()) === 1)
  await page.click('#bk-take')
  await page.waitForTimeout(300)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.bk-item:first-child [data-bk-download]')])
  const sql = await dl.text()
  check('the SQL backup has a forklift_devices table with the five forklifts, and no readings (they are not stored)', /CREATE TABLE "forklift_devices"/.test(sql) && (sql.match(/352093081452\d{3}/g) || []).length >= 5 && !/latitude/.test(sql))
  await fresh()
  await page.evaluate(() => { Store.logout(); Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE') })
  await open('forklift-tracking.html#app_forklift')
  check('a tenant that may view it sees it', (await page.locator('#ft-cards').count()) === 1)
  await page.evaluate(() => { Store.logout(); Store.login('admin', 'admin'); Store.setTenantApplicationAccess('t1', ['app_forklift'], false); Store.logout(); Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE') })
  await open('forklift-tracking.html#app_forklift')
  check('one that may not is told it is not enabled for it', /Application not found/.test(await page.textContent('.not-found-block')) && /isn't enabled for your organization/.test(await page.textContent('.not-found-block')))

  check('no JavaScript errors on the way', errors.length === 0, Array.from(new Set(errors)).slice(0, 5))
})
