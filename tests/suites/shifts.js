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
  const lastDay = (weekday) => { const d = new Date(); while (d.getDay() !== weekday) d.setDate(d.getDate() - 1); return isoOf(d) }
  const lastSaturday = () => lastDay(6)

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

  // ============================================ THE REST OF EMAIL TRACKING
  // The window chosen for these checks is the shift with the most tickets in the
  // data, so the counts are never zero by accident.
  section('Email Tracking: the dashboard and the lists follow the schedule')
  await fresh()
  await store(() => Store.setApplicationShiftSchedule('app_email', 'ss3'))
  await open('email-tracking.html#app_email', '#et-view .rt-kpi-grid')
  const busiest = await store(() => {
    const d = Store.get()
    const app = d.applications.find((x) => x.id === 'app_email')
    const at = (s) => new Date(s.replace(' ', 'T')).getTime()
    const dates = Array.from(new Set(d.emailInbox.map((e) => e.receivedDate.slice(0, 10))))
    let best = null
    dates.forEach((date) => AppShifts.windows(app, date).forEach((w) => {
      const inbox = d.emailInbox.filter((e) => at(e.receivedDate) >= w.from && at(e.receivedDate) < w.to).length
      const tickets = d.emailTickets.filter((t) => at(t.receivedDate) >= w.from && at(t.receivedDate) < w.to).length
      if (!best || tickets * 100 + inbox > best.tickets * 100 + best.inbox) best = { date, shiftId: w.id, name: w.name, inbox, tickets }
    }))
    return best
  })
  // What a window holds, worked out from the stored rows. `shiftId` 'all' is the whole schedule's day.
  const mailIn = (arg) => store((a) => {
    const app = Store.get().applications.find((x) => x.id === 'app_email')
    const list = AppShifts.windows(app, a.date, { fullDay: true })
    const picked = list.find((x) => x.id === a.shiftId)
    const from = picked ? picked.from : list[0].from
    const to = picked ? picked.to : list[list.length - 1].to
    const at = (s) => new Date(s.replace(' ', 'T')).getTime()
    const within = (rows, field) => rows.filter((r) => at(r[field]) >= from && at(r[field]) < to)
    const d = Store.get()
    return { inbox: within(d.emailInbox, 'receivedDate').length, tickets: within(d.emailTickets, 'receivedDate').length, reports: within(d.emailReports, 'sentDate').length, notifications: within(d.emailNotifications, 'sentDate').length, sms: within(d.emailSms, 'sentDate').length }
  }, arg)
  const mailTotals = async () => {
    const t = await tiles()
    return { inbox: Number(t.find((x) => x.label === 'Total inbox').value), tickets: Number(t.find((x) => x.label === 'Total tickets').value) }
  }
  const listCount = async (key) => {
    await page.click(`[data-et-tab="${key}"]`)
    await page.waitForSelector(`[data-list="${key}"] [data-showing]`)
    await page.waitForTimeout(100)
    const m = /of (\d+) entr/.exec(await page.textContent(`[data-list="${key}"] [data-showing]`))
    return m ? Number(m[1]) : 0
  }
  check('there is mail in the data to cut down', busiest && busiest.inbox > 0 && busiest.tickets > 0, busiest)

  await open('email-tracking.html#app_email', '#et-view .rt-kpi-grid')
  const bar = {}
  for (const tab of ['dashboard', 'inbox', 'departments', 'tickets', 'reports', 'notifications', 'sms', 'users', 'shifts', 'settings']) {
    await page.click(`[data-et-tab="${tab}"]`)
    await page.waitForTimeout(100)
    bar[tab] = (await count('[data-scope-bar]')) === 1
  }
  check('the Date and Shift bar is on the tabs that go by time, and on no other', same(Object.keys(bar).filter((t) => bar[t]), ['dashboard', 'inbox', 'tickets', 'reports', 'notifications', 'sms']), bar)
  await page.click('[data-et-tab="dashboard"]')
  await page.waitForSelector('#et-view .rt-kpi-grid')
  const everything = await store(() => ({ inbox: Store.get().emailInbox.length, tickets: Store.get().emailTickets.length }))
  check('with no date, everything is counted and shown, as before', same(await mailTotals(), everything) && /All dates/.test(await page.innerText('[data-scope-note]')), await mailTotals())
  check('the Shift menu waits until there is a date', await page.locator('[data-scope="shift"]').isDisabled())
  await page.fill('[data-scope="date"]', busiest.date)
  await page.waitForTimeout(200)
  check('a date lets a shift be chosen, from the shifts that date has', !(await page.locator('[data-scope="shift"]').isDisabled()) && same(await page.$$eval('[data-scope="shift"] option', (els) => els.map((o) => o.value)), ['all', 'sh1', 'sh2', 'sh3']))
  await page.selectOption('[data-scope="shift"]', busiest.shiftId)
  await page.waitForTimeout(200)
  const mail = await mailIn({ date: busiest.date, shiftId: busiest.shiftId })
  check('the dashboard counts only that shift\'s emails and tickets', same(await mailTotals(), { inbox: mail.inbox, tickets: mail.tickets }) && mail.inbox < everything.inbox, { shown: await mailTotals(), mail, everything })
  check('and says which shift it is', (await page.innerText('[data-scope-note]')).includes(busiest.name) && (await page.innerText('.rt-card-note')).includes(busiest.name), await page.innerText('[data-scope-note]'))
  for (const key of ['inbox', 'tickets', 'reports', 'notifications', 'sms']) {
    const shown = await listCount(key)
    check(`${key}: the list holds that shift's rows only, and the bar stays as it was`, shown === mail[key] && (await page.inputValue('[data-scope="date"]')) === busiest.date && (await page.inputValue('[data-scope="shift"]')) === busiest.shiftId, { shown, expected: mail[key] })
  }
  await page.click('[data-et-tab="inbox"]')
  await page.waitForSelector('[data-list="inbox"]')
  await page.fill('[data-list="inbox"] [data-search]', 'priority')
  await page.waitForTimeout(150)
  const searched = await store((a) => {
    const app = Store.get().applications.find((x) => x.id === 'app_email')
    const w = AppShifts.windows(app, a.date).find((x) => x.id === a.shiftId)
    const at = (s) => new Date(s.replace(' ', 'T')).getTime()
    return Store.get().emailInbox.filter((e) => at(e.receivedDate) >= w.from && at(e.receivedDate) < w.to && [e.subject, e.message, e.fromEmail, e.receivedDate].join(' ').toLowerCase().includes('priority')).length
  }, busiest)
  check('a search works on what the shift leaves', (await page.textContent('[data-list="inbox"] [data-showing]')).includes(searched ? `of ${searched} entr` : 'Showing 0 entries'), await page.textContent('[data-list="inbox"] [data-showing]'))
  await page.fill('[data-list="inbox"] [data-search]', '')
  await page.click('[data-et-tab="tickets"]')
  await page.waitForSelector('[data-list="tickets"]')
  const [ticketCsv] = await Promise.all([page.waitForEvent('download'), page.click('[data-list="tickets"] [data-act="csv"]')])
  const csvRows = (await ticketCsv.text()).trim().split('\n').length - 1
  check('a download holds what the shift leaves', csvRows === mail.tickets, { csvRows, expected: mail.tickets })
  await page.fill('[data-scope="date"]', daysAgo(40))
  await page.waitForTimeout(200)
  check('a day with no mail says nothing matches', (await page.textContent('[data-list="tickets"] .empty-table-note')) === 'No matching tickets found.' && (await page.textContent('[data-list="tickets"] [data-showing]')) === 'Showing 0 entries')
  check('and changing the date drops a shift that day does not have, or keeps one it does', (await page.inputValue('[data-scope="shift"]')) === busiest.shiftId)
  await page.click('[data-scope-clear]')
  await page.waitForTimeout(200)
  check('Clear shows everything again, with no shift chosen', (await listCount('tickets')) === everything.tickets && (await page.inputValue('[data-scope="date"]')) === '' && (await page.locator('[data-scope="shift"]').isDisabled()))
  await page.click('[data-scope-today]')
  await page.waitForTimeout(200)
  check('Today puts today in', (await page.inputValue('[data-scope="date"]')) === daysAgo(0))

  await fresh()
  await open('email-tracking.html#app_email', '#et-view .rt-kpi-grid')
  check('with no schedule there is no Shift menu, and a way to choose one', (await count('[data-scope="shift"]')) === 0 && (await page.getAttribute('[data-scope-note] a', 'href')) === '#app_email:shifts')
  await page.fill('[data-scope="date"]', busiest.date)
  await page.waitForTimeout(200)
  const calendarDay = await store((date) => {
    const from = AppShifts.atTime(date, '00:00')
    const to = AppShifts.atTime(date, '00:00', 1)
    const at = (s) => new Date(s.replace(' ', 'T')).getTime()
    const within = (rows) => rows.filter((r) => at(r.receivedDate) >= from && at(r.receivedDate) < to).length
    return { inbox: within(Store.get().emailInbox), tickets: within(Store.get().emailTickets) }
  }, busiest.date)
  check('a date alone is that calendar day', same(await mailTotals(), calendarDay) && /Full day/.test(await page.innerText('[data-scope-note]')), { shown: await mailTotals(), calendarDay })

  // ====================================================== FORKLIFT TRACKING
  section('Forklift Tracking: Fleet, History and Reports follow the schedule')
  await fresh()
  await store(() => Store.setApplicationShiftSchedule('app_forklift', 'ss3'))
  const yesterday = daysAgo(1)
  // A window's minute rows, read through ForkliftData.between rather than the page's own helper.
  const forkIn = (a) => store((arg) => {
    const parts = { sh1: [[arg.date, '06:00', '13:59']], sh2: [[arg.date, '14:00', '21:59']], sh3: [[arg.date, '22:00', '23:59'], [ForkliftData.addDays(arg.date, 1), '00:00', '05:59']] }[arg.shiftId]
    const round2 = (v) => Math.round(v * 100) / 100
    return Store.get().forkliftDevices.map((d) => {
      let distance = 0
      let readings = 0
      let active = 0
      parts.forEach(([date, from, to]) => ForkliftData.between(d, date, from, to).forEach((r) => { distance += r.distance; readings++; if (r.state === 3) active++ }))
      return { name: d.vehicleName, distance: round2(distance), readings, active }
    })
  }, a)
  await open('forklift-tracking.html#app_forklift', '#ft-view .rt-kpi-grid')
  let distanceTile = (await tiles()).find((t) => t.label.startsWith('Distance'))
  check('Fleet: with no date it is today so far, labelled as before', distanceTile.label === 'Distance today' && /Today so far/.test(await page.innerText('[data-scope-note]')) && (await page.$$eval('.ft-card dt', (els) => els.map((e) => e.textContent))).includes('Active today'), distanceTile)
  await page.fill('[data-scope="date"]', yesterday)
  await page.waitForTimeout(200)
  await page.selectOption('[data-scope="shift"]', 'sh3')
  await page.waitForTimeout(250)
  const night = await forkIn({ date: yesterday, shiftId: 'sh3' })
  distanceTile = (await tiles()).find((t) => t.label.startsWith('Distance'))
  const fleetTotal = night.reduce((a, f) => a + f.distance, 0)
  check('Fleet: the Night shift of yesterday gives the fleet\'s distance in it, and the label drops "today"', distanceTile.label === 'Distance' && distanceTile.value === `${fleetTotal.toFixed(2)} km`, { distanceTile, fleetTotal })
  const cardDistance = await page.$$eval('.ft-card', (els) => els.map((c) => [c.querySelector('h3').textContent, Array.from(c.querySelectorAll('dl > div')).find((d) => d.querySelector('dt').textContent === 'Distance').querySelector('dd').textContent]))
  check('Fleet: and so does each forklift\'s card', same(cardDistance, night.map((f) => [f.name, `${f.distance.toFixed(2)} km`])), { cardDistance, night })
  check('Fleet: the bar names the window, across midnight', /Night shift 22:00–06:00 \(next day\)/.test(await page.innerText('[data-scope-note]')))
  await page.click('[data-scope-clear]')
  await page.waitForTimeout(200)
  check('Fleet: Clear is today so far again', (await tiles()).find((t) => t.label.startsWith('Distance')).label === 'Distance today')

  await page.click('[data-ft-tab="history"]')
  await page.waitForSelector('#ft-show')
  check('History: the Shift menu lists the date\'s shifts after Custom times', same(await page.$$eval('#ft-shift option', (els) => els.map((o) => o.value)), ['', 'sh1', 'sh2', 'sh3']))
  await page.fill('#ft-date', yesterday)
  await page.waitForTimeout(150)
  await page.selectOption('#ft-shift', 'sh3')
  await page.waitForTimeout(150)
  check('History: choosing a shift fills From and To with its times and locks them', (await page.inputValue('#ft-from')) === '22:00' && (await page.inputValue('#ft-to')) === '06:00' && (await page.locator('#ft-from').isDisabled()) && (await page.locator('#ft-to').isDisabled()))
  await page.click('#ft-show')
  await page.waitForTimeout(400)
  const firstForklift = night[0]
  const historyTiles = await tiles()
  check('History: the Night shift is eight hours of readings, from yesterday into today', historyTiles.find((t) => t.label === 'Readings').value === String(firstForklift.readings) && firstForklift.readings === 480, historyTiles.slice(0, 3))
  check('History: and its distance and Active time are those minutes\'', historyTiles.find((t) => t.label === 'GPS distance').value === `${firstForklift.distance.toFixed(2)} km`, { shown: historyTiles.find((t) => t.label === 'GPS distance'), firstForklift })
  const statusNote = await page.innerText('.rt-card-note')
  const statusAxis = await page.$$eval('.ft-ticks span', (els) => els.map((e) => e.textContent))
  check('History: the Status card names the shift, and its time axis runs past midnight', /Night shift, 22:00 to 06:00 next day/.test(await page.innerText('.rt-kpi-sub')) && statusAxis.includes('00:00') && statusAxis.includes('03:00') && !statusAxis.some((t) => /^2[4-9]/.test(t)), { statusNote, statusAxis })
  await page.selectOption('#ft-shift', '')
  await page.waitForTimeout(150)
  check('History: Custom times gives From and To back, as they were', (await page.inputValue('#ft-from')) === '00:00' && (await page.inputValue('#ft-to')) === '23:59' && !(await page.locator('#ft-from').isDisabled()))
  await page.click('#ft-show')
  await page.waitForTimeout(400)
  check('History: and shows the whole day again', (await tiles()).find((t) => t.label === 'Readings').value === '1440')
  await store(() => Store.setApplicationShiftSchedule('app_forklift', 'ss2'))
  await open('forklift-tracking.html#app_forklift:history', '#ft-show')
  await page.fill('#ft-date', lastSaturday())
  await page.waitForTimeout(150)
  check('History: a date the schedule has off offers no shift', same(await page.$$eval('#ft-shift option', (els) => els.map((o) => o.value)), ['']))

  await page.click('[data-ft-tab="reports"]')
  await page.waitForSelector('#ft-rsearch')
  check('Reports: the Shift menu lists the schedule\'s shifts after Whole day', same(await page.$$eval('#ft-rshift option', (els) => els.map((o) => o.textContent.trim())), ['Whole day', 'Evening shift (14:00–22:00)', 'Night shift (22:00–06:00)']))
  const wholeRows = async () => page.$$eval('#ft-report-table tbody tr:not(.total-row)', (trs) => trs.map((tr) => [tr.children[0].textContent, tr.children[1].textContent]))
  await page.fill('#ft-rfrom', daysAgo(14))
  await page.fill('#ft-rto', daysAgo(1))
  await page.click('#ft-rsearch')
  await page.waitForTimeout(300)
  const wholeDay = await wholeRows()
  await page.selectOption('#ft-rshift', 'sh2')
  await page.click('#ft-rsearch')
  await page.waitForTimeout(300)
  const eveningLines = await wholeRows()
  const expectedLines = await store((range) => {
    const d = Store.get().forkliftDevices[0]
    const out = []
    for (let iso = range.from; iso <= range.to; iso = ForkliftData.addDays(iso, 1)) {
      const weekday = ForkliftData.dateOf(iso).getDay()
      if (weekday === 0 || weekday === 6) continue
      const rows = ForkliftData.between(d, iso, '14:00', '21:59')
      if (!rows.length) continue
      out.push([iso, (Math.round(rows.reduce((a, r) => a + r.distance, 0) * 100) / 100).toFixed(2)])
    }
    return out
  }, { from: daysAgo(14), to: daysAgo(1) })
  check('Reports: one shift gives a line for each day the schedule runs it, with that shift\'s distance', same(eveningLines, expectedLines) && eveningLines.length > 0 && eveningLines.length < wholeDay.length, { eveningLines, expectedLines, whole: wholeDay.length })
  check('Reports: the card says which shift, and what is counted', /Evening shift/.test(await page.innerText('.rt-card-note')) && /Only the minutes inside the Evening shift/.test(await page.innerText('.et-card-note')))
  const [shiftCsv] = await Promise.all([page.waitForEvent('download'), page.click('#ft-csv')])
  check('Reports: a download is named for the shift, and holds its lines', /_Evening-shift\.csv$/.test(shiftCsv.suggestedFilename()) && (await shiftCsv.text()).trim().split('\n').length === expectedLines.length + 1, shiftCsv.suggestedFilename())
  await page.click('#ft-rclear')
  await page.waitForTimeout(250)
  check('Reports: Clear goes back to whole days', (await page.inputValue('#ft-rshift')) === '')

  // ================================================================== CMS
  section('CMS: the Shifts tab adds up the cranes, and a crane\'s page can show one shift')
  await fresh()
  await store(() => Store.setApplicationShiftSchedule('app_cms', 'ss3'))
  const minutesOf = (text) => { const m = /(\d+)h (\d\d)m/.exec(text); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
  await open('application-detail.html#app_cms:shifts', '[data-shifts="schedule"]')
  await page.fill('[data-shifts="date"]', daysAgo(2))
  await page.waitForTimeout(300)
  const cmsTable = await shiftTable()
  const cranes = await store(() => Store.get().cmsMachines.length)
  check('CMS: the figures are the four states, after the shift\'s time, length and status', same(cmsTable.head, ['Shift', 'Time', 'Length', 'Status', 'Working', 'Idle', 'Stop', 'Overload']), cmsTable.head)
  const cmsShifts = cmsTable.rows.filter((r) => !r.total)
  check('CMS: in a shift every crane is in some state the whole time, so the four add up to the cranes times eight hours', cmsShifts.length === 3 && cmsShifts.every((r) => [4, 5, 6, 7].reduce((a, c) => a + minutesOf(r.cells[c]), 0) === cranes * 480), cmsShifts.map((r) => r.cells))
  check('CMS: and the whole day to the cranes times twenty-four', [4, 5, 6, 7].reduce((a, c) => a + minutesOf(cmsTable.rows.find((r) => r.total).cells[c]), 0) === cranes * 1440)
  const morningExpected = await store((date) => {
    // The raw timeline of each crane, clipped to 06:00-14:00 here by hand.
    const totals = { working: 0, idle: 0, off: 0, overload: 0 }
    Store.get().cmsMachines.forEach((m) => CmsData.dayTimeline(m, date).forEach((seg) => {
      const s = Math.max(seg.startMin, 360)
      const e = Math.min(seg.endMin, 840)
      if (e > s) totals[seg.state] += e - s
    }))
    return [totals.working, totals.idle, totals.off, totals.overload]
  }, daysAgo(2))
  check('CMS: the Morning shift\'s figures are the cranes\' own timeline between 06:00 and 14:00', same([4, 5, 6, 7].map((c) => minutesOf(cmsShifts[0].cells[c])), morningExpected), { shown: cmsShifts[0].cells, morningExpected })

  const crane = await store(() => Store.get().cmsMachines[0].id)
  await open('cms-machine-dashboard.html#' + crane, '#cms-date-input')
  check('CMS crane: it opens on the whole day, with a Shift menu', (await page.textContent('.cms-timeline-total')) === 'Total: 24h 00m' && (await page.textContent('.cms-panel-header-row h2')) === 'Operating States' && same(await page.$$eval('#cms-shift-select option', (els) => els.map((o) => o.value)), ['all', 'sh1', 'sh2', 'sh3']))
  await page.fill('#cms-date-input', daysAgo(2))
  await page.waitForTimeout(200)
  await page.selectOption('#cms-shift-select', 'sh2')
  await page.waitForTimeout(250)
  const legend = await page.$$eval('.cms-timeline-legend span:not(.cms-timeline-total)', (els) => els.map((e) => e.textContent.trim()))
  const eveningExpected = await store(([id, date]) => {
    const m = Store.get().cmsMachines.find((x) => x.id === id)
    const sec = { working: 0, idle: 0, off: 0, overload: 0 }
    CmsData.dayTimeline(m, date).forEach((seg) => {
      const s = Math.max(seg.startMin, 840)
      const e = Math.min(seg.endMin, 1320)
      if (e > s) sec[seg.state] += (e - s) * 60
    })
    const short = (s) => (s < 60 ? s + 's' : Math.floor(s / 3600) > 0 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`)
    return [`Working: ${short(sec.working)}`, `Idle: ${short(sec.idle)}`, `Stop: ${short(sec.off)}`, `Overload: ${short(sec.overload)}`]
  }, [crane, daysAgo(2)])
  check('CMS crane: one shift narrows the bar to it, named, eight hours long', (await page.textContent('.cms-panel-header-row h2')) === 'Operating States · Evening shift' && (await page.textContent('.cms-timeline-total')) === 'Total: 8h 00m', await page.textContent('.cms-timeline-total'))
  check('CMS crane: the times in each state are that shift\'s, from the crane\'s own timeline', same(legend, eveningExpected), { legend, eveningExpected })
  check('CMS crane: the time axis runs from the shift\'s start to its end', same(await page.$$eval('.cms-timeline-axis span', (els) => els.map((e) => e.textContent)), ['14:00', '16:00', '18:00', '20:00', '22:00']))
  const widths = await page.$$eval('.cms-timeline-block', (els) => els.map((e) => parseFloat(e.style.flexBasis || e.style.flex.split(' ')[2])))
  check('CMS crane: its blocks fill the bar exactly', Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.01, widths.reduce((a, b) => a + b, 0))
  await page.selectOption('#cms-shift-select', 'sh3')
  await page.waitForTimeout(250)
  check('CMS crane: the Night shift crosses midnight, still eight hours', (await page.textContent('.cms-timeline-total')) === 'Total: 8h 00m' && same(await page.$$eval('.cms-timeline-axis span', (els) => els.map((e) => e.textContent)), ['22:00', '00:00', '02:00', '04:00', '06:00']))
  await page.selectOption('#cms-shift-select', 'all')
  await page.waitForTimeout(250)
  check('CMS crane: Whole day goes back to twenty-four hours', (await page.textContent('.cms-timeline-total')) === 'Total: 24h 00m' && (await page.textContent('.cms-panel-header-row h2')) === 'Operating States')
  await store(() => Store.setApplicationShiftSchedule('app_cms', 'ss2'))
  await open('cms-machine-dashboard.html#' + crane, '#cms-date-input')
  await page.fill('#cms-date-input', lastDay(3))
  await page.waitForTimeout(200)
  await page.selectOption('#cms-shift-select', 'sh2')
  await page.waitForTimeout(200)
  check('CMS crane: the weekday schedule has the Evening shift on a Wednesday', (await page.textContent('.cms-timeline-total')) === 'Total: 8h 00m' && (await page.textContent('.cms-panel-header-row h2')) === 'Operating States · Evening shift')
  await page.fill('#cms-date-input', lastDay(6))
  await page.waitForTimeout(250)
  check('CMS crane: on a Saturday, which it has off, the chosen shift is dropped, there is no Shift menu, and the whole day shows', (await count('#cms-shift-select')) === 0 && (await page.textContent('.cms-timeline-total')) === 'Total: 24h 00m' && (await page.textContent('.cms-panel-header-row h2')) === 'Operating States')
  await store(() => Store.setApplicationShiftSchedule('app_cms', ''))
  await open('cms-machine-dashboard.html#' + crane, '#cms-date-input')
  check('CMS crane: with no schedule there is no Shift menu', (await count('#cms-shift-select')) === 0)

  check('no JavaScript errors on any of these pages', errors.length === 0, errors.slice(0, 5))
})
