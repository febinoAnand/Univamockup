// The Shifts tab every application has (shared/app-shifts.js): it is on each
// application's page, an application with no schedule is asked to pick one,
// the schedule is kept on the application without touching the rest of it, the
// tab follows the date, and the figures Email Tracking and Forklift Tracking
// show for each shift agree with the data underneath.

Tests.suite('shifts', 'Shifts tab on every application', async ({ page, BASE, check, skip, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async (url, wait) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForSelector(wait)
    await page.waitForTimeout(200)
  }
  const fresh = async () => {
    await page.goto(BASE + 'login.html')
    await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  }
  const store = (fn, arg) => page.evaluate(fn, arg)
  const toast = async () => {
    await page.waitForSelector('.device-toast-message')
    return page.textContent('.device-toast-message')
  }
  const visible = (selector) => page.locator(selector).isVisible()
  const count = (selector) => page.locator(selector).count()
  const texts = (selector) => page.$$eval(selector, (els) => els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()))
  const activeTabs = () => texts('.detail-tab-button.active')
  const pad = (n) => String(n).padStart(2, '0')
  const hm = (minutes) => `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d) }
  const lastSaturday = () => { const d = new Date(); while (d.getDay() !== 6) d.setDate(d.getDate() - 1); return isoOf(d) }

  // Each card on the page: its title, table head and rows.
  const cards = () => page.$$eval('.detail-card', (els) => els.map((c) => ({
    title: c.querySelector('h2') ? c.querySelector('h2').textContent.replace(/\s+/g, ' ').trim() : '',
    head: Array.from(c.querySelectorAll('thead th')).map((th) => th.firstChild.textContent.trim()),
    rows: Array.from(c.querySelectorAll('tbody tr')).map((r) => ({ total: r.classList.contains('total-row'), current: r.classList.contains('rt-current-row'), cells: Array.from(r.children).map((td) => td.textContent.replace(/\s+/g, ' ').trim()) })),
    text: c.innerText.replace(/\s+/g, ' ').trim(),
  })))
  const tiles = () => page.$$eval('.rt-kpi-tile', (els) => els.map((t) => ({ label: t.querySelector('.rt-kpi-label').textContent.trim(), value: t.querySelector('.rt-kpi-value').textContent.trim() })))
  const shiftTable = async () => (await cards()).find((c) => /^Shifts on /.test(c.title))
  const weekTable = async () => (await cards()).find((c) => c.title.startsWith('Weekly schedule'))

  // Where each application is, and how to open its Shifts tab.
  const APPS = [
    { id: 'app0', name: 'PMS', url: 'application-detail.html#app0', ready: '.rt-app', tab: '[data-rt-view="shifts"]', template: true },
    { id: 'app_ems', name: 'EMS', url: 'application-detail.html#app_ems', ready: '[data-ems-tab]', tab: '[data-ems-tab="shifts"]' },
    { id: 'app_notion', name: 'Custom App', url: 'notion.html#app_notion', ready: '.notion-page-tabs', tab: '#notion-shifts-tab' },
    { id: 'app_cms', name: 'CMS', url: 'application-detail.html#app_cms', ready: '[data-cms-tab]', tab: '[data-cms-tab="shifts"]' },
    { id: 'app_email', name: 'Email Tracking', url: 'email-tracking.html#app_email', ready: '#et-view', tab: '[data-et-tab="shifts"]' },
    { id: 'app_forklift', name: 'Forklift Tracking', url: 'forklift-tracking.html#app_forklift', ready: '#ft-view', tab: '[data-ft-tab="shifts"]' },
    { id: 'app1', name: 'Fleet Tracker', url: 'notion.html#app1', ready: '.notion-page-tabs', tab: '#notion-shifts-tab' },
  ]
  const openShifts = async (app) => {
    await open(app.url, app.ready)
    await page.click(app.tab)
    await page.waitForSelector(app.template ? '.rt-view .rt-kpi-grid' : '[data-shifts="schedule"]')
    await page.waitForTimeout(150)
  }
  const OTHERS = APPS.filter((a) => !a.template)

  // ============================================================ THE TAB
  section('Every application has a Shifts tab')
  await fresh()
  const SCHEDULES = await store(() => Store.get().shiftSchedules.map((s) => s.name))
  for (const app of APPS) {
    await openShifts(app)
    const text = (await page.innerText('body')).replace(/\s+/g, ' ')
    check(`${app.name}: the Shifts tab is there and is the one open`, same(await activeTabs(), ['Shifts']), await activeTabs())
    if (app.template) {
      const t = await shiftTable()
      check(`${app.name}: it shows the schedule's three shifts, with figures for each`, t.rows.filter((r) => !r.total).length === 3 && t.head.length > 4, t)
      check(`${app.name}: the schedule is chosen in Configuration, so there is no menu here`, (await count('[data-shifts="schedule"]')) === 0)
    } else {
      check(`${app.name}: with no schedule yet it says so and offers the schedules`, /No shift schedule is bound/.test(text) && same(await page.$$eval('[data-shifts="schedule"] option', (els) => els.map((o) => o.textContent.trim())), ['None'].concat(SCHEDULES)), await page.$$eval('[data-shifts="schedule"] option', (els) => els.map((o) => o.textContent.trim())))
    }
  }

  // ===================================================== CHOOSING A SCHEDULE
  section('Choosing a schedule')
  for (const app of OTHERS) {
    await fresh()
    const before = await store((id) => { const a = JSON.parse(JSON.stringify(Store.get().applications.find((x) => x.id === id))); delete a.bindings; return a }, app.id)
    await openShifts(app)
    await page.selectOption('[data-shifts="schedule"]', 'ss3')
    await page.waitForTimeout(200)
    const t = await shiftTable()
    const shifts = t.rows.filter((r) => !r.total)
    check(`${app.name}: choosing "Three-shift 24×7" lists its shifts with their times and lengths`, same(shifts.map((r) => r.cells.slice(0, 3)), [['Morning shift', '06:00–14:00', '8h'], ['Evening shift', '14:00–22:00', '8h'], ['Night shift', '22:00–06:00 next day', '8h']]), shifts.map((r) => r.cells))
    check(`${app.name}: it says so`, (await toast()) === 'Shift schedule set to "Three-shift 24×7"')
    const week = await weekTable()
    check(`${app.name}: the week lists seven days, every one with all three shifts, and marks the date's weekday`, week.rows.length === 7 && week.rows.every((r) => /Morning shift.*Evening shift.*Night shift/.test(r.cells[1])) && week.rows.filter((r) => r.current).length === 1, week.rows.map((r) => r.cells))
    check(`${app.name}: the tiles give the schedule, three shifts and 24 hours covered`, same((await tiles()).map((x) => x.value), ['Three-shift 24×7', '3', '24h']), await tiles())
    const kept = await store((id) => { const a = JSON.parse(JSON.stringify(Store.get().applications.find((x) => x.id === id))); const schedule = a.bindings && a.bindings.shiftScheduleId; delete a.bindings; return { schedule, rest: a } }, app.id)
    check(`${app.name}: the schedule is kept on the application and nothing else about it changes`, kept.schedule === 'ss3' && same(kept.rest, before), { kept, before })
    await openShifts(app)
    check(`${app.name}: it is still chosen when the page is opened again`, (await page.inputValue('[data-shifts="schedule"]')) === 'ss3' && (await shiftTable()).rows.length >= 3)
  }

  section('A shift is Completed, In progress or Upcoming by the clock')
  await fresh()
  await store(() => Store.setApplicationShiftSchedule('app_ems', 'ss3'))
  await openShifts(APPS.find((a) => a.id === 'app_ems'))
  const status = await store(() => {
    const now = Date.now()
    return AppShifts.windows(Store.get().applications.find((a) => a.id === 'app_ems'), AppShifts.localIso(new Date())).map((w) => (w.to <= now ? 'Completed' : w.from <= now ? 'In Progress' : 'Upcoming'))
  })
  const shown = (await shiftTable()).rows.filter((r) => !r.total).map((r) => r.cells[3])
  check('today\'s shifts are marked from the time now', same(shown.map((s) => s.toLowerCase()), status.map((s) => s.toLowerCase())), { shown, status })
  await page.fill('[data-shifts="date"]', daysAgo(2))
  await page.waitForTimeout(200)
  check('every shift of a day gone by is Completed', (await shiftTable()).rows.filter((r) => !r.total).every((r) => r.cells[3] === 'Completed'))
  check('and the date is kept when the tab is drawn again', (await page.inputValue('[data-shifts="date"]')) === daysAgo(2))
  await page.click('[data-shifts-today]')
  await page.waitForTimeout(200)
  check('Today brings the date back', (await page.inputValue('[data-shifts="date"]')) === daysAgo(0))
  check('and no day after today can be picked', (await page.getAttribute('[data-shifts="date"]', 'max')) === daysAgo(0))

  // ================================================== CHANGING AND CLEARING
  section('Changing, clearing and losing a schedule')
  await fresh()
  const email = APPS.find((a) => a.id === 'app_email')
  await openShifts(email)
  await page.selectOption('[data-shifts="schedule"]', 'ss2')
  await page.waitForTimeout(200)
  let week = await weekTable()
  check('the weekday schedule gives Friday two shifts and the weekend none', same(week.rows.map((r) => r.cells[1]), ['Evening shift 14:00–22:00', 'Evening shift 14:00–22:00', 'Evening shift 14:00–22:00', 'Evening shift 14:00–22:00', 'Evening shift 14:00–22:00Night shift 22:00–06:00', 'Day off', 'Day off']), week.rows.map((r) => r.cells))
  await page.fill('[data-shifts="date"]', lastSaturday())
  await page.waitForTimeout(200)
  const saturday = await cards()
  check('a day the schedule has off says there is no shift, and still shows the week', /no shift on Sat/.test(saturday[0].text) && saturday[0].rows.length === 0 && saturday[1].rows.length === 7 && saturday[1].rows[5].current, saturday.map((c) => c.text))
  check('and the tiles say no shifts and no hours', same((await tiles()).map((x) => x.value), ['Evening coverage', '0', '—']), await tiles())
  await page.selectOption('[data-shifts="schedule"]', '')
  await page.waitForTimeout(200)
  check('choosing None clears it, and says so', (await toast()) === 'Shift schedule cleared' && /No shift schedule is bound/.test(await page.innerText('#et-shifts-host')))
  check('and the application keeps an empty schedule, not a missing one', (await store(() => Store.get().applications.find((a) => a.id === 'app_email').bindings.shiftScheduleId)) === '')
  await store(() => { Store.setApplicationShiftSchedule('app_email', 'ss3'); Store.removeShiftSchedule('ss3') })
  await openShifts(email)
  check('a schedule that has since been deleted is treated as none', /No shift schedule is bound/.test(await page.innerText('#et-shifts-host')) && (await page.inputValue('[data-shifts="schedule"]')) === '')

  section('Setting a schedule changes only the schedule')
  await fresh()
  const kept = await store(() => {
    const snapshot = (id) => JSON.parse(JSON.stringify(Store.get().applications.find((a) => a.id === id)))
    const pms = snapshot('app0')
    Store.setApplicationShiftSchedule('app0', 'ss1')
    const pmsAfter = snapshot('app0')
    const fleet = snapshot('app1')
    Store.setApplicationShiftSchedule('app1', 'ss2')
    const fleetAfter = snapshot('app1')
    Store.setApplicationShiftSchedule('nope', 'ss1')
    Store.setApplicationShiftSchedule('app1', '')
    return { pms, pmsAfter, fleet, fleetAfter, cleared: snapshot('app1').bindings }
  })
  check('a template application keeps its asset group, assets and data mapping', same(kept.pmsAfter.bindings, Object.assign({}, kept.pms.bindings, { shiftScheduleId: 'ss1' })) && same(kept.pmsAfter.groupNames, kept.pms.groupNames) && same(kept.pmsAfter.assetIds, kept.pms.assetIds), kept.pmsAfter)
  check('Fleet Tracker keeps its group, assets and devices (they are not re-derived from bindings)', same(kept.fleetAfter.groupNames, ['Vehicles']) && same(kept.fleetAfter.assetIds, ['a1', 'a4']) && same(kept.fleetAfter.deviceIds, ['d1', 'd5']) && same(kept.fleetAfter.bindings, { shiftScheduleId: 'ss2' }), kept.fleetAfter)
  check('an application that does not exist is left alone, and a schedule can be cleared', same(kept.cleared, { shiftScheduleId: '' }), kept.cleared)

  // ========================================================= TEMPLATE TABS
  section('The template applications')
  await fresh()
  await open('application-detail.html#app0', '.rt-app')
  const templates = await store(() => AppTemplates.list().map((t) => ({ key: t.key, views: t.views.map((v) => v.type + ':' + v.key) })))
  check('each template has a Shifts view, before the Configuration view', templates.length === 3 && templates.every((t) => t.views.includes('shifts:shifts') && t.views.indexOf('shifts:shifts') < t.views.length - 1 && t.views[t.views.length - 1] === 'bindings:configuration'), templates)
  await page.click('[data-rt-view="configuration"]')
  await page.waitForSelector('[data-binding="shiftScheduleId"]')
  await page.selectOption('[data-binding="shiftScheduleId"]', 'ss1')
  await page.click('[data-bindings-save]')
  await page.waitForTimeout(200)
  await page.click('[data-rt-view="shifts"]')
  await page.waitForTimeout(200)
  check('PMS follows the schedule chosen in its Configuration tab', (await tiles())[0].value === 'Standard rotation', await tiles())
  await store(() => Store.setApplicationShiftSchedule('app0', ''))
  await open('application-detail.html#app0', '.rt-app')
  await page.click('[data-rt-view="shifts"]')
  await page.waitForTimeout(200)
  const unbound = await page.innerText('.rt-view')
  check('a template application with no schedule says it reports on the full day and links to Configuration', /No shift schedule is bound/.test(unbound) && /full calendar day/.test(unbound) && (await count('.rt-view [data-rt-view="configuration"]')) === 1)

  // ===================================================== OTHER TABS, LINKS
  section('The other tabs still work, and the tab can be linked to')
  await fresh()
  await openShifts(APPS.find((a) => a.id === 'app_ems'))
  await page.click('[data-ems-tab="meters"]')
  await page.waitForSelector('#ems-meter-search, .data-table')
  check('EMS: Meter List opens after Shifts, and Shifts is no longer the open tab', same(await activeTabs(), ['Meter List']) && (await count('[data-shifts="schedule"]')) === 0, await activeTabs())
  await openShifts(APPS.find((a) => a.id === 'app_cms'))
  await page.click('[data-cms-tab="dashboard"]')
  await page.waitForTimeout(250)
  check('CMS: Dashboard opens after Shifts', same(await activeTabs(), ['Dashboard']) && (await count('[data-shifts="schedule"]')) === 0, await activeTabs())
  await open('application-detail.html#app_ems:shifts', '[data-shifts="schedule"]')
  check('EMS: an address with the tab opens it', same(await activeTabs(), ['Shifts']))
  await open('application-detail.html#app_cms:shifts', '[data-shifts="schedule"]')
  check('CMS: an address with the tab opens it', same(await activeTabs(), ['Shifts']))
  await open('email-tracking.html#app_email:shifts', '[data-shifts="schedule"]')
  check('Email Tracking: an address with the tab opens it', same(await activeTabs(), ['Shifts']) && /#app_email:shifts$/.test(page.url()), page.url())
  await open('forklift-tracking.html#app_forklift:shifts', '[data-shifts="schedule"]')
  check('Forklift Tracking: an address with the tab opens it', same(await activeTabs(), ['Shifts']))
  await page.click('[data-ft-tab="fleet"]')
  await page.waitForSelector('#ft-search, .ft-fleet, #ft-view .detail-card')
  check('Forklift Tracking: Fleet opens after Shifts', same(await activeTabs(), ['Fleet']) && (await count('[data-shifts="schedule"]')) === 0, await activeTabs())

  // ======================================================== CUSTOM APP PAGES
  section('The Custom App pages')
  await fresh()
  const custom = APPS.find((a) => a.id === 'app_notion')
  await open(custom.url, custom.ready)
  const strip = await texts('.notion-page-tabs .detail-tab-button')
  check('Shifts sits after the pages and before New page', strip.length >= 3 && same(strip.slice(-2), ['Shifts', 'New page']), strip)
  check('before it is opened, a page is the open tab and the editor is on screen', (await visible('#notion-title-input')) && (await activeTabs()).length === 1 && (await activeTabs())[0] !== 'Shifts', await activeTabs())
  await page.click('#notion-shifts-tab')
  await page.waitForSelector('[data-shifts="schedule"]')
  check('with Shifts open no page is open and no editor is on screen', same(await activeTabs(), ['Shifts']) && (await count('#notion-title-input')) === 0 && (await count('.notion-editor')) === 0, await activeTabs())
  await page.click('[data-notion-page]')
  await page.waitForSelector('#notion-title-input')
  check('clicking a page goes back to it', (await count('[data-shifts="schedule"]')) === 0 && (await activeTabs())[0] !== 'Shifts')
  await page.click('#notion-shifts-tab')
  await page.waitForSelector('[data-shifts="schedule"]')
  const pagesBefore = await store(() => Store.get().notionPages.filter((p) => p.appId === 'app_notion').length)
  await page.click('#notion-new-page-btn')
  await page.waitForSelector('#notion-title-input')
  check('New page, from the Shifts tab, makes a page and opens it', (await store(() => Store.get().notionPages.filter((p) => p.appId === 'app_notion').length)) === pagesBefore + 1 && (await count('[data-shifts="schedule"]')) === 0)
  await page.click('#notion-shifts-tab')
  await page.waitForSelector('[data-shifts="schedule"]')
  await page.evaluate(() => { window.location.hash = '#app1' })
  await page.waitForTimeout(300)
  check('moving to another application from the Shifts tab shows that application\'s pages, not Shifts', (await count('[data-shifts="schedule"]')) === 0 && (await activeTabs())[0] !== 'Shifts' && (await page.innerText('.page-title')).startsWith('Fleet Tracker'), await activeTabs())

  section('An application made later has the tab too')
  await fresh()
  const made = await store(() => Store.addApplication({ name: 'Dock cameras', description: 'Added by a person' }).id)
  await open('notion.html#' + made, '.notion-page-tabs')
  await page.click('#notion-shifts-tab')
  await page.waitForSelector('[data-shifts="schedule"]')
  check('a user-created application has Shifts tab, with no schedule yet', /No shift schedule is bound/.test(await page.innerText('#app-shifts-host')) && same(await activeTabs(), ['Shifts']))
  await page.selectOption('[data-shifts="schedule"]', 'ss1')
  await page.waitForTimeout(200)
  check('and it can be given one', (await store((id) => Store.get().applications.find((a) => a.id === id).bindings.shiftScheduleId, made)) === 'ss1' && (await tiles())[0].value === 'Standard rotation')
  const fromTemplate = await store(() => Store.addApplicationFromTemplate({ name: 'Hoists', templateKey: 'crane-monitoring', bindings: { assetGroup: 'Production line A', assetIds: [], shiftScheduleId: 'ss3', keyMap: AppRuntime.autoKeyMap(AppTemplates.get('crane-monitoring'), 'Production line A') } }).id)
  await open('application-detail.html#' + fromTemplate, '.rt-app')
  check('an application made from a template has it as well', (await texts('.rt-tabs .detail-tab-button')).includes('Shifts'))

  // ====================================================== EMAIL TRACKING
  section('Email Tracking: emails and tickets in each shift')
  await fresh()
  await store(() => Store.setApplicationShiftSchedule('app_email', 'ss3'))
  await openShifts(email)
  const emailExpected = () => store(() => {
    const at = (row) => new Date(row.receivedDate.replace(' ', 'T')).getTime()
    const within = (rows, from, to) => rows.filter((r) => at(r) >= from && at(r) < to).length
    const app = Store.get().applications.find((a) => a.id === 'app_email')
    const windows = AppShifts.windows(app, AppShifts.localIso(new Date()))
    const now = Date.now()
    return {
      shifts: windows.map((w) => (w.from > now ? ['—', '—'] : [String(within(Store.get().emailInbox, w.from, w.to)), String(within(Store.get().emailTickets, w.from, w.to))])),
      day: [String(within(Store.get().emailInbox, windows[0].from, windows[2].to)), String(within(Store.get().emailTickets, windows[0].from, windows[2].to))],
    }
  })
  let emailTable = await shiftTable()
  let expected = await emailExpected()
  check('the figures are Emails and Tickets, after the shift\'s time, length and status', same(emailTable.head, ['Shift', 'Time', 'Length', 'Status', 'Emails', 'Tickets']), emailTable.head)
  check('each shift counts the emails and tickets that arrived in it', same(emailTable.rows.filter((r) => !r.total).map((r) => r.cells.slice(4)), expected.shifts), { shown: emailTable.rows.map((r) => r.cells), expected })
  check('the whole day counts all of them, and a shift not yet started shows a dash', same(emailTable.rows.find((r) => r.total).cells.slice(4), expected.day), emailTable.rows.find((r) => r.total).cells)
  const emailsOfDay = Number(emailTable.rows.find((r) => r.total).cells[4])
  check('tickets are never more than emails', emailTable.rows.every((r) => Number(r.cells[5]) <= Number(r.cells[4]) || r.cells[4] === '—'), emailTable.rows.map((r) => r.cells))
  const inProgress = emailTable.rows.findIndex((r) => r.cells[3] === 'In Progress')
  await store(() => Store.receiveEmail({ fromEmail: 'alerts@acmetelecom.test', subject: '[NET] Shift test', message: 'Priority: Low' }))
  await page.click('[data-shifts-today]')
  await page.waitForTimeout(200)
  emailTable = await shiftTable()
  expected = await emailExpected()
  check('an email that arrives now is counted in the shift in progress, as an email and a ticket', inProgress < 0 || (Number(emailTable.rows[inProgress].cells[4]) === Number(expected.shifts[inProgress][0]) && Number(emailTable.rows.find((r) => r.total).cells[4]) === emailsOfDay + 1 && same(emailTable.rows.filter((r) => !r.total).map((r) => r.cells.slice(4)), expected.shifts)), { shown: emailTable.rows.map((r) => r.cells), expected })
  await page.fill('[data-shifts="date"]', daysAgo(30))
  await page.waitForTimeout(200)
  emailTable = await shiftTable()
  check('a day with no mail shows zeros, not dashes', emailTable.rows.filter((r) => !r.total).every((r) => r.cells[4] === '0' && r.cells[5] === '0'), emailTable.rows.map((r) => r.cells))

  // ==================================================== FORKLIFT TRACKING
  section('Forklift Tracking: the fleet\'s hours and distance in each shift')
  await fresh()
  await store(() => Store.setApplicationShiftSchedule('app_forklift', 'ss3'))
  const forklift = APPS.find((a) => a.id === 'app_forklift')
  await openShifts(forklift)
  const day = daysAgo(1)
  await page.fill('[data-shifts="date"]', day)
  await page.waitForTimeout(300)
  const forkTable = await shiftTable()
  check('the figures are Active, Idle and Distance', same(forkTable.head, ['Shift', 'Time', 'Length', 'Status', 'Active', 'Idle', 'Distance']), forkTable.head)
  // The same rows, read another way: ForkliftData.between over each shift's clock times.
  const forkExpected = await store((iso) => {
    const devices = Store.get().forkliftDevices
    const next = ForkliftData.addDays(iso, 1)
    const total = (parts) => {
      let active = 0
      let idle = 0
      let distance = 0
      devices.forEach((d) => parts.forEach(([date, from, to]) => ForkliftData.between(d, date, from, to).forEach((r) => {
        if (r.state === 3) active++
        else if (r.state === 2) idle++
        distance += r.distance
      })))
      return { active, idle, distance }
    }
    const morning = total([[iso, '06:00', '13:59']])
    const evening = total([[iso, '14:00', '21:59']])
    const night = total([[iso, '22:00', '23:59'], [next, '00:00', '05:59']])
    const whole = total([[iso, '06:00', '23:59'], [next, '00:00', '05:59']])
    return { morning, evening, night, whole, devices: devices.length }
  }, day)
  const fmt = (t) => [hm(t.active), hm(t.idle), `${t.distance.toFixed(2)} km`]
  const shiftRows = forkTable.rows.filter((r) => !r.total)
  check('the Morning shift\'s figures are its 06:00 to 13:59 minutes, all forklifts added up', same(shiftRows[0].cells.slice(4), fmt(forkExpected.morning)), { shown: shiftRows[0].cells, expected: fmt(forkExpected.morning) })
  check('the Evening shift\'s are its 14:00 to 21:59 minutes', same(shiftRows[1].cells.slice(4), fmt(forkExpected.evening)), { shown: shiftRows[1].cells, expected: fmt(forkExpected.evening) })
  check('the Night shift\'s run across midnight, from this day into the next', same(shiftRows[2].cells.slice(4), fmt(forkExpected.night)), { shown: shiftRows[2].cells, expected: fmt(forkExpected.night) })
  check('the whole day is the three shifts together', same(forkTable.rows.find((r) => r.total).cells.slice(4), fmt(forkExpected.whole)) && forkExpected.whole.active === forkExpected.morning.active + forkExpected.evening.active + forkExpected.night.active, { shown: forkTable.rows.find((r) => r.total).cells, expected: fmt(forkExpected.whole) })
  check('a fleet of forklifts was counted, and some of them worked', forkExpected.devices >= 5 && forkExpected.whole.active > 0 && forkExpected.whole.distance > 0, forkExpected)
  await page.fill('[data-shifts="date"]', daysAgo(0))
  await page.waitForTimeout(300)
  const todayRows = (await shiftTable()).rows.filter((r) => !r.total)
  check('a shift that has not started shows dashes, and one that has shows figures', todayRows.every((r) => (r.cells[3] === 'Upcoming') === (r.cells[4] === '—')), todayRows.map((r) => r.cells))

  check('no JavaScript errors on any of these pages', errors.length === 0, errors.slice(0, 5))
})
