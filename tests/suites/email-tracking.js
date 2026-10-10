// The built-in Email Tracking application (email-tracking.html): how an email
// becomes a ticket and who is told (the rules in shared/store.js), and every tab
// of its page used as a person would: inbox, departments, tickets, reports,
// notifications, SMS gateway, users and settings.

Tests.suite('email-tracking', 'Email Tracking application', async ({ page, BASE, check, skip, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async (url, wait) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForSelector(wait || '#et-view, .not-found-block')
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
  const rows = (key) => page.$$eval(`[data-list="${key}"] tbody tr`, (trs) => trs.map((tr) => Array.from(tr.children).map((td) => td.textContent.replace(/\s+/g, ' ').trim())))
  const rowIds = (key) => page.$$eval(`[data-list="${key}"] tbody tr[data-id]`, (trs) => trs.map((tr) => tr.getAttribute('data-id')))
  const menu = async (key, id, act) => {
    await page.click(`[data-list="${key}"] tr[data-id="${id}"] [data-menu-toggle]`)
    await page.click(`[data-list="${key}"] tr[data-id="${id}"] [data-row-act="${act}"]`)
  }
  const confirmYes = async () => {
    await page.waitForSelector('#confirm-dialog-confirm')
    await page.click('#confirm-dialog-confirm')
  }
  const showing = (key) => page.textContent(`[data-list="${key}"] [data-showing]`)
  const modalOpen = (id) => page.evaluate((m) => document.getElementById(m).classList.contains('open'), id)
  const visible = (selector) => page.locator(selector).isVisible()
  const errorText = async (id) => ((await page.locator('#' + id).isVisible()) ? page.textContent('#' + id) : '')
  // a tiny CSV reader: quoted cells, doubled quotes, newlines inside quotes
  const parseCsv = (text) => {
    const out = []
    let row = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
        else cell += c
      } else if (c === '"') quoted = true
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = '' }
      else cell += c
    }
    row.push(cell)
    out.push(row)
    return out
  }
  const receive = (email) => store((e) => { const r = Store.receiveEmail(e); return { outcome: r.outcome, notified: r.notified, texted: r.texted, ticket: r.ticket, report: r.report, email: r.email } }, email)

  // =========================================================== the data
  section('The seeded mailbox')
  await fresh('email-tracking.html#app_email')
  const seed = await store(() => {
    const s = Store.get()
    const byOutcome = {}
    s.emailInbox.forEach((e) => { byOutcome[e.outcome] = (byOutcome[e.outcome] || 0) + 1 })
    const ticketsLinked = s.emailTickets.every((t) => { const e = s.emailInbox.find((x) => x.id === t.emailId); return e && e.ticketId === t.id && e.subject === t.ticketName })
    const reportsMatch = s.emailReports.length === s.emailTickets.length && s.emailReports.every((r) => s.emailTickets.some((t) => t.receivedDate === r.sentDate && t.department === r.department))
    const names = new Set(s.emailUsers.map((u) => u.username))
    const notifiedNames = new Set(s.emailNotifications.map((n) => n.sendToUser))
    return {
      counts: { inbox: s.emailInbox.length, tickets: s.emailTickets.length, reports: s.emailReports.length, departments: s.emailDepartments.length, users: s.emailUsers.length, from: s.emailFromAddresses.length, push: s.emailNotifications.length, sms: s.emailSms.length },
      byOutcome, ticketsLinked, reportsMatch,
      everyoneKnown: Array.from(notifiedNames).every((n) => names.has(n)),
      inactiveNeverTold: !notifiedNames.has('sanjay.iyer') && s.emailReports.every((r) => !r.sendToUsers.includes('sanjay.iyer')),
      oneTextPerPush: s.emailSms.length === s.emailNotifications.length,
      failedPush: s.emailNotifications.filter((n) => n.deliveryStatus === 'failed').every((n) => n.sendToUser === 'divya.shetty'),
      failedSms: s.emailSms.filter((m) => !m.delivered).map((m) => m.toNumber).filter((v, i, all) => all.indexOf(v) === i),
      dates: s.emailInbox.every((e) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.receivedDate)),
      secrets: { password: s.emailSettings[0].password, token: s.emailSmsSettings[0].authToken },
      app: s.applications.find((a) => a.id === 'app_email'),
    }
  })
  check('a week of mail: 14 emails, 10 of them tickets, with a report for each', same(seed.counts, { inbox: 14, tickets: 10, reports: 10, departments: 4, users: 6, from: 4, push: 17, sms: 17 }) && seed.byOutcome.ticket === 10, seed)
  check('the emails that did not become tickets say why (two had no department, two came from addresses that cannot be used)', seed.byOutcome.sender === 2 && seed.byOutcome['no-alias'] === 2, seed.byOutcome)
  check('every ticket points to its email and the email to its ticket, and every report has its ticket', seed.ticketsLinked && seed.reportsMatch, seed)
  check('only people who exist were told, and the one inactive person never was', seed.everyoneKnown && seed.inactiveNeverTold, seed)
  check('each notification came with a text message', seed.oneTextPerPush, seed)
  check('a push to a person with no device failed, and a text to a number with no country code failed', seed.failedPush && same(seed.failedSms, ['98450 11203']), seed)
  check('every date is in the one format', seed.dates)
  check('the mailbox password and SMS token in the seed are plainly fake', /demo/.test(seed.secrets.password) && /demo/.test(seed.secrets.token), seed.secrets)
  check('the application is a built-in default with the mail icon', seed.app && seed.app.isDefault === true && seed.app.icon === 'mail' && seed.app.name === 'Email Tracking' && seed.app.status === 'active', seed.app)

  section('Reading the fields of an email')
  const parsed = await store(() => ({
    simple: parseEmailFields('Customer: Zenith Foods\nPriority: High'),
    trimmed: parseEmailFields('  Site  :   Kochi PoP   '),
    colons: parseEmailFields('Issue: down since 09:40: check at 10:15'),
    first: parseEmailFields('Priority: High\nPriority: Low'),
    noColon: parseEmailFields('Hello there\nPlease help'),
    punctuation: parseEmailFields('Dear team, can you look at: this'),
    phrase: parseEmailFields('Please check the router: it is down'),
    digit: parseEmailFields('3rd: not a field name'),
    empty: parseEmailFields('Customer:\nSite: x'),
    crlf: parseEmailFields('A: 1\r\nB: 2\r\n'),
    longKey: parseEmailFields('K'.repeat(60) + ': x'),
    nothing: [parseEmailFields(''), parseEmailFields(null)],
    many: Object.keys(parseEmailFields(Array.from({ length: 20 }, (_, i) => `Field${i}: v`).join('\n'))).length,
    spaces: parseEmailFields('Order no: 77\nOrder-ID: 9'),
  }))
  check('each "Key: value" line is a field', same(parsed.simple, { Customer: 'Zenith Foods', Priority: 'High' }), parsed.simple)
  check('spaces around the key and value are dropped', same(parsed.trimmed, { Site: 'Kochi PoP' }), parsed.trimmed)
  check('only the first colon splits, so a time in the value is kept', same(parsed.colons, { Issue: 'down since 09:40: check at 10:15' }), parsed.colons)
  check('if a key appears twice the first one counts', same(parsed.first, { Priority: 'High' }), parsed.first)
  check('lines without a colon are not fields', same(parsed.noColon, {}), parsed.noColon)
  check('a sentence with a comma before its colon is not a field, but a plain phrase is (so keep fields on their own lines)', same(parsed.punctuation, {}) && same(parsed.phrase, { 'Please check the router': 'it is down' }), [parsed.punctuation, parsed.phrase])
  check('a key has to start with a letter and have a value', same(parsed.digit, {}) && same(parsed.empty, { Site: 'x' }), parsed)
  check('Windows line endings are fine', same(parsed.crlf, { A: '1', B: '2' }), parsed.crlf)
  check('a key of 60 letters is not a field name', same(parsed.longKey, {}), parsed.longKey)
  check('an empty body, or none, has no fields', same(parsed.nothing, [{}, {}]), parsed.nothing)
  check('at most 12 fields are read', parsed.many === 12, parsed.many)
  check('keys may hold spaces, dashes and digits', same(parsed.spaces, { 'Order no': '77', 'Order-ID': '9' }), parsed.spaces)

  section('When an email becomes a ticket')
  const base = { fromEmail: 'alerts@acmetelecom.test', message: 'Customer: Test Co\nSite: Lab\nPriority: High' }
  const t1 = await receive(Object.assign({}, base, { subject: '[NET] Router down' }))
  check('mail from an active address with a department alias in the subject becomes a ticket', t1.outcome === 'ticket' && t1.ticket && t1.ticket.ticketName === '[NET] Router down' && t1.ticket.department === 'Network operations', t1)
  check('its fields come from the body', same(t1.ticket.fields, { Customer: 'Test Co', Site: 'Lab', Priority: 'High' }), t1.ticket.fields)
  check('the email and the ticket point to each other', t1.email.ticketId === t1.ticket.id && t1.ticket.emailId === t1.email.id)
  check('the department\'s two active people were told, by push and by text', t1.notified === 2 && t1.texted === 2 && same(t1.report.sendToUsers, ['arjun.menon', 'kiran.patel']), t1)
  const afterT1 = await store(() => { const s = Store.get(); return { push: s.emailNotifications.slice(-2).map((n) => [n.title, n.message, n.sendToUser, n.deliveryStatus]), sms: s.emailSms.slice(-2).map((m) => [m.toNumber, m.fromNumber, m.message, m.delivered]) } })
  check('the push says which department and carries the subject', same(afterT1.push, [['New ticket · NET', '[NET] Router down', 'arjun.menon', 'delivered'], ['New ticket · NET', '[NET] Router down', 'kiran.patel', 'delivered']]), afterT1.push)
  check('the text comes from the gateway\'s number and says the same', same(afterT1.sms, [['+91 98450 11202', '+1 555 010 0100', 'New ticket: [NET] Router down', true], ['+91 98450 11204', '+1 555 010 0100', 'New ticket: [NET] Router down', true]]), afterT1.sms)
  check('the report names the ticket, the sender and the department', /\[NET\] Router down/.test(t1.report.message) && /alerts@acmetelecom\.test/.test(t1.report.message) && t1.report.department === 'Network operations', t1.report)

  const odd = await receive(Object.assign({}, base, { fromEmail: ' NOC@AcmeTelecom.TEST ', subject: 'Re: [bill] invoice' }))
  check('the sender and the alias match whatever the case, and the alias can be anywhere in the subject', odd.outcome === 'ticket' && odd.ticket.department === 'Billing and accounts', odd)
  check('a text to a number without its country code is reported as failed, though sent', odd.texted === 1 && (await store(() => Store.get().emailSms.slice(-1)[0].delivered)) === false)
  const noDevice = await receive(Object.assign({}, base, { subject: '[SUP] Needs help' }))
  const pushes = await store(() => Store.get().emailNotifications.slice(-2).map((n) => [n.sendToUser, n.deliveryStatus]))
  check('a push to someone with no device is reported as failed', same(pushes, [['meera.nair', 'delivered'], ['divya.shetty', 'failed']]) && noDevice.notified === 2, pushes)
  const several = await receive(Object.assign({}, base, { subject: '[FIELD] [NET] both' }))
  check('with two aliases the first one wins', several.ticket.department === 'Field service', several.ticket)

  const nope = {
    inactive: await receive(Object.assign({}, base, { fromEmail: 'old-monitor@acmetelecom.test', subject: '[NET] Not from a live address' })),
    stranger: await receive(Object.assign({}, base, { fromEmail: 'someone@else.test', subject: '[NET] Who is this' })),
    noAlias: await receive(Object.assign({}, base, { subject: 'No department here' })),
    brackets: await receive(Object.assign({}, base, { subject: '[] [two words] [NET' })),
    unknown: await receive(Object.assign({}, base, { subject: '[ZZZ] Nobody has this alias' })),
  }
  const outcomes = Object.keys(nope).map((k) => [k, nope[k].outcome, nope[k].ticket, nope[k].notified])
  check('mail from an inactive address, or one not in the list, is only kept in the inbox', nope.inactive.outcome === 'sender' && nope.stranger.outcome === 'sender' && !nope.inactive.ticket && !nope.stranger.ticket, outcomes)
  check('with no department in the subject it is only kept in the inbox', nope.noAlias.outcome === 'no-alias' && nope.brackets.outcome === 'no-alias', outcomes)
  check('an alias no department has is only kept in the inbox, and says so', nope.unknown.outcome === 'unknown-alias', outcomes)
  check('none of those told anyone or made a report', outcomes.every((o) => o[3] === 0) && (await store(() => Store.get().emailReports.length)) === 10 + 4, await store(() => Store.get().emailReports.length))
  check('but all of them are in the inbox, with the reason on them', (await store(() => Store.get().emailInbox.length)) === 14 + 4 + 5 && (await store(() => Store.get().emailInbox.slice(-5).map((e) => e.outcome))).join() === 'sender,sender,no-alias,no-alias,unknown-alias')

  await fresh()
  await store(() => Store.updateEmailSmsSettings({ sid: 'AC1', authToken: 'x', fromNumber: '+1 555 010 0100', isActive: false }))
  const noSms = await receive(Object.assign({}, base, { subject: '[NET] Gateway off' }))
  check('with the SMS gateway off, people are still pushed to but not texted', noSms.notified === 2 && noSms.texted === 0 && (await store(() => Store.get().emailSms.length)) === 17)
  await store(() => Store.updateEmailNotificationSettings({ applicationId: ' ' }))
  const noPush = await receive(Object.assign({}, base, { subject: '[NET] No push app' }))
  check('with no push application set, every push is reported as failed', noPush.notified === 2 && (await store(() => Store.get().emailNotifications.slice(-2).every((n) => n.deliveryStatus === 'failed'))))

  await fresh()
  await store(() => Store.updateEmailDepartment('ed1', { alias: 'NET', department: 'Network operations', userIds: ['eu5'] }))
  const empty = await receive(Object.assign({}, base, { subject: '[NET] Only an inactive person' }))
  check('a department whose people are all inactive still gets the ticket, but nobody is told', empty.outcome === 'ticket' && empty.notified === 0 && same(empty.report.sendToUsers, []), empty)
  await store(() => Store.updateEmailDepartment('ed1', { alias: 'NET', department: 'Network operations', userIds: [] }))
  const none = await receive(Object.assign({}, base, { subject: '[NET] Nobody at all' }))
  check('and so does one with no people', none.outcome === 'ticket' && none.notified === 0, none)

  await fresh()
  const added = await store(() => {
    const before = Store.receiveEmail({ fromEmail: 'partner@else.test', subject: '[NET] Before', message: '' }).outcome
    Store.addEmailFromAddress('partner@else.test')
    const after = Store.receiveEmail({ fromEmail: 'partner@else.test', subject: '[NET] After', message: '' }).outcome
    const id = Store.get().emailFromAddresses.find((a) => a.email === 'partner@else.test').id
    Store.toggleEmailFromAddress(id)
    const off = Store.receiveEmail({ fromEmail: 'partner@else.test', subject: '[NET] Off', message: '' }).outcome
    Store.toggleEmailFromAddress(id)
    const on = Store.receiveEmail({ fromEmail: 'partner@else.test', subject: '[NET] On', message: '' }).outcome
    Store.removeEmailFromAddress(id)
    const gone = Store.receiveEmail({ fromEmail: 'partner@else.test', subject: '[NET] Gone', message: '' }).outcome
    return { before, after, off, on, gone }
  })
  check('an address can be added, switched off, switched on and removed, and mail follows', same(added, { before: 'sender', after: 'ticket', off: 'sender', on: 'ticket', gone: 'sender' }), added)

  section('Changing the data')
  await fresh()
  const crud = await store(() => {
    const out = {}
    const user = Store.addEmailUser({ username: 'new.person', email: 'np@acmetelecom.test', designation: 'Tester', mobileNo: '+91 1', deviceId: 'dev-1' })
    out.user = { active: user.active, id: user.id.startsWith('eu-'), created: Boolean(user.createdDate), expiry: user.expiryTime }
    Store.updateEmailUser(user.id, { designation: 'Lead tester', active: false })
    const edited = Store.get().emailUsers.find((u) => u.id === user.id)
    out.edited = [edited.designation, edited.active, edited.username]
    const dep = Store.addEmailDepartment({ alias: ' QA ', department: ' Quality ', userIds: [user.id, 'eu1'] })
    out.dep = [dep.alias, dep.department, dep.userIds.length]
    out.aliasTaken = [Store.emailAliasTaken('qa'), Store.emailAliasTaken('QA', dep.id), Store.emailAliasTaken('net'), Store.emailAliasTaken('zzz'), Store.emailAliasTaken('')]
    Store.updateEmailDepartment(dep.id, { alias: 'QA2', department: 'Quality assurance', userIds: ['eu1'] })
    const upd = Store.get().emailDepartments.find((d) => d.id === dep.id)
    out.depUpdated = [upd.alias, upd.department, upd.userIds.join()]
    // a person who is removed leaves the departments they were in
    Store.updateEmailDepartment(dep.id, { alias: 'QA2', department: 'Quality assurance', userIds: [user.id, 'eu1'] })
    Store.removeEmailUsers([user.id])
    out.cascade = [Store.get().emailUsers.some((u) => u.id === user.id), Store.get().emailDepartments.find((d) => d.id === dep.id).userIds.join()]
    Store.removeEmailDepartments([dep.id])
    out.depGone = !Store.get().emailDepartments.some((d) => d.id === dep.id)
    // history rows go without taking anything with them
    const ticket = Store.get().emailTickets[0]
    const email = Store.get().emailInbox.find((e) => e.id === ticket.emailId)
    Store.removeEmailTickets([ticket.id])
    Store.removeEmailInbox([email.id])
    out.history = [Store.get().emailTickets.length, Store.get().emailInbox.length, Store.get().emailReports.length, Store.get().emailNotifications.length]
    Store.removeEmailReports(Store.get().emailReports.map((r) => r.id))
    Store.removeEmailNotifications(Store.get().emailNotifications.map((n) => n.id))
    Store.removeEmailSms(Store.get().emailSms.map((m) => m.id))
    out.cleared = [Store.get().emailReports.length, Store.get().emailNotifications.length, Store.get().emailSms.length]
    // the three one-row settings
    Store.updateEmailSettings({ host: ' mail.test ', port: '2525', username: ' me ', password: 'pw', checkStatus: 0, checkInterval: '' })
    const mail = Store.get().emailSettings[0]
    out.mail = [mail.host, mail.port, mail.username, mail.password, mail.checkStatus, mail.checkInterval, Store.get().emailSettings.length]
    Store.updateEmailSettings({ host: 'h', port: 1, username: 'u', password: 'p', checkStatus: true, checkInterval: '30' })
    out.interval = Store.get().emailSettings[0].checkInterval
    Store.updateEmailNotificationSettings({ applicationId: ' abc ' })
    Store.updateEmailSmsSettings({ sid: ' S ', authToken: 'T', fromNumber: ' +1 ', isActive: 1 })
    const sms = Store.get().emailSmsSettings[0]
    out.push = Store.get().emailNotificationSettings[0].applicationId
    out.sms = [sms.sid, sms.authToken, sms.fromNumber, sms.isActive, Store.get().emailSmsSettings.length]
    // the application itself cannot be removed
    const apps = Store.get().applications.length
    Store.removeApplication('app_email')
    out.appKept = Store.get().applications.length === apps
    return out
  })
  check('a person is added active, with an id and a date, and can be edited', crud.user.active && crud.user.id && crud.user.created && crud.user.expiry === '' && same(crud.edited, ['Lead tester', false, 'new.person']), crud)
  check('a department takes its alias and name without the spaces round them', same(crud.dep, ['QA', 'Quality', 2]) && same(crud.depUpdated, ['QA2', 'Quality assurance', 'eu1']), crud)
  check('an alias is taken whatever the case, except by the department itself', same(crud.aliasTaken, [true, false, true, false, false]), crud.aliasTaken)
  check('a person who is removed leaves their departments; the department stays', same(crud.cascade, [false, 'eu1']) && crud.depGone, crud.cascade)
  check('removing a ticket or an email takes nothing else with it', same(crud.history, [9, 13, 10, 17]), crud.history)
  check('reports, notifications and texts can be cleared', same(crud.cleared, [0, 0, 0]), crud.cleared)
  check('the mailbox settings are tidied: no spaces, the port a number, an empty interval nothing, one row only', same(crud.mail, ['mail.test', 2525, 'me', 'pw', false, null, 1]) && crud.interval === 30, crud.mail)
  check('the push and SMS settings are tidied and keep one row', crud.push === 'abc' && same(crud.sms, ['S', 'T', '+1', true, 1]), crud)
  check('the built-in application cannot be removed', crud.appKept)

  // ================================================== the application in the app
  section('Where it appears')
  await fresh('applications.html', '#tbody tr')
  const listRow = await page.evaluate(() => { const tr = Array.from(document.querySelectorAll('#tbody tr')).find((r) => r.textContent.includes('Email Tracking')); return tr && { open: tr.getAttribute('data-open'), text: tr.textContent.replace(/\s+/g, ' ') } })
  check('the Applications list has it, and it opens its own page', listRow && listRow.open === 'email-tracking.html#app_email', listRow)
  const sidebar = await page.$$eval('.sidebar-child-link', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]).filter((l) => l[0] === 'Email Tracking'))
  check('the sidebar has it, with the same link', same(sidebar, [['Email Tracking', 'email-tracking.html#app_email']]), sidebar)
  await page.click('.sidebar-child-link[href="email-tracking.html#app_email"]')
  await page.waitForURL(/email-tracking\.html/)
  await page.waitForSelector('#et-view')
  check('a click on the sidebar entry opens it, with the entry highlighted', same(await page.$$eval('.sidebar .active', (els) => els.map((el) => el.textContent.trim())), ['Email Tracking']))
  check('the breadcrumbs lead back through Applications', same(await page.$$eval('.top-bar-breadcrumbs > *:not(.breadcrumb-separator)', (els) => els.map((el) => el.textContent.trim())), ['Home', 'Applications', 'Email Tracking']))
  check('the page is titled for the application', (await page.title()) === 'Email Tracking — Univa' && (await page.textContent('.page-title')).includes('Email Tracking') && (await visible('.default-profile-badge')))
  check('its status can be changed, and Manage leads to the application\'s own page', (await page.textContent('#toggle-status-btn')) === 'Suspend' && (await page.getAttribute('a.modal-button', 'href')) === 'application-detail.html#app_email')
  await page.click('#toggle-status-btn')
  check('Suspend suspends it and says so', (await page.textContent('.page-header .status-pill')) === 'suspended' && (await toast()).includes('status updated') && (await page.textContent('#toggle-status-btn')) === 'Activate')
  await page.click('#toggle-status-btn')
  await open('application-detail.html#app_email', '.page-title')
  const manage = await page.evaluate(() => ({ title: document.querySelector('.page-title').textContent.trim(), badge: Boolean(document.querySelector('.default-profile-badge')), deleteButton: Boolean(document.getElementById('delete-app-btn')) }))
  check('Manage shows the application\'s details, as a default application with no Delete', /Email Tracking/.test(manage.title) && manage.badge && !manage.deleteButton, manage)

  section('The tabs')
  await open('email-tracking.html#app_email')
  const tabs = await page.$$eval('[data-et-tab]', (els) => els.map((el) => [el.getAttribute('data-et-tab'), el.textContent.trim()]))
  check('there are nine tabs', same(tabs, [['dashboard', 'Dashboard'], ['inbox', 'Inbox'], ['departments', 'Departments'], ['tickets', 'Tickets'], ['reports', 'Reports'], ['notifications', 'Notifications'], ['sms', 'SMS gateway'], ['users', 'Users'], ['settings', 'Settings']]), tabs)
  check('the Dashboard shows first', same(await page.$$eval('[data-et-tab].active', (els) => els.map((el) => el.getAttribute('data-et-tab'))), ['dashboard']))
  await page.click('[data-et-tab="inbox"]')
  await page.waitForSelector('[data-list="inbox"]')
  check('a tab\'s button moves the highlight and puts the tab in the address', same(await page.$$eval('[data-et-tab].active', (els) => els.map((el) => el.getAttribute('data-et-tab'))), ['inbox']) && /#app_email:inbox$/.test(page.url()), page.url())
  check('the active tab is marked for screen readers', (await page.getAttribute('[data-et-tab="inbox"]', 'aria-selected')) === 'true' && (await page.getAttribute('[data-et-tab="dashboard"]', 'aria-selected')) === 'false')
  await open('email-tracking.html#app_email:tickets')
  check('an address with a tab opens that tab', (await page.locator('[data-list="tickets"]').count()) === 1)
  await open('email-tracking.html#app_email:nonsense')
  check('an address with a tab that is not there opens the Dashboard', (await page.locator('.rt-kpi-grid').count()) === 1)
  await page.click('.sidebar-child-link[href="email-tracking.html#app_email"]')
  await page.waitForTimeout(150)
  check('the sidebar entry, clicked while on the page, goes back to the Dashboard', (await page.locator('.rt-kpi-grid').count()) === 1 && same(await page.$$eval('[data-et-tab].active', (els) => els.map((el) => el.getAttribute('data-et-tab'))), ['dashboard']))

  // =========================================================== dashboard
  section('Dashboard')
  await fresh('email-tracking.html#app_email')
  const tiles = await page.$$eval('.rt-kpi-tile', (els) => els.map((el) => [el.querySelector('.rt-kpi-label').textContent.trim(), el.querySelector('.rt-kpi-value').textContent.trim()]))
  check('six figures: users, active and inactive, departments, inbox, tickets', same(tiles, [['Total users', '6'], ['Active users', '5'], ['Inactive users', '1'], ['Departments', '4'], ['Total inbox', '14'], ['Total tickets', '10']]), tiles)
  const chartSeries = await page.evaluate(() => (typeof ApexCharts === 'undefined' ? null : true))
  if (chartSeries) {
    await page.waitForSelector('#et-chart .apexcharts-canvas')
    const chartText = await page.textContent('#et-chart')
    check('the chart has a bar for each department, named under it', ['Network operations', 'Billing and accounts', 'Customer support', 'Field service'].every((name) => chartText.includes(name)) && (await page.$$eval('#et-chart .apexcharts-bar-area', (els) => els.length)) === 4, chartText)
    check('and the figures are on the bars', same(await page.$$eval('#et-chart .apexcharts-datalabel', (els) => els.map((el) => el.textContent.trim())), ['4', '3', '1', '2']))
  } else skip('the ticket chart', 'the chart library could not be loaded')
  const userRows = await page.$$eval('.data-table tbody tr', (trs) => trs.map((tr) => [tr.children[0].textContent.replace(/\s+/g, ' ').trim(), tr.children[3].textContent.trim()]))
  check('every user is listed with their status', userRows.length === 6 && userRows[0][0].startsWith('meera.nair') && userRows[4][1] === 'Inactive' && userRows.filter((u) => u[1] === 'Active').length === 5, userRows)
  await store(() => Store.receiveEmail({ fromEmail: 'alerts@acmetelecom.test', subject: '[SUP] One more', message: '' }))
  await open('email-tracking.html#app_email')
  const tiles2 = await page.$$eval('.rt-kpi-tile .rt-kpi-value', (els) => els.map((el) => el.textContent.trim()))
  check('a new email moves the inbox and ticket figures', same(tiles2.slice(4), ['15', '11']), tiles2)

  // ============================================================== inbox
  section('Inbox')
  await fresh('email-tracking.html#app_email:inbox')
  const inbox = await rows('inbox')
  check('the newest email is first, ten to a page, with its date, time, sender and subject', inbox.length === 10 && inbox[0].includes('[NET] Link down at Kochi PoP') && inbox[0].includes('alerts@acmetelecom.test'), inbox[0])
  check('the page says what it is showing', (await showing('inbox')) === 'Showing 1 to 10 of 14 entries', await showing('inbox'))
  const dates = inbox.map((r) => r[2] + ' ' + r[3])
  check('they run from newest to oldest', dates.every((d, i) => i === 0 || d <= dates[i - 1]), dates)
  check('the ticket column tells a ticket from mail that was only kept', inbox[0].includes('Ticket') && inbox.some((r) => r.includes('No ticket')))
  const reason = await page.$eval('[data-list="inbox"] tr[data-id="em11"] .status-pill', (el) => el.getAttribute('title'))
  check('and says why on hover', /not from an active From address/.test(reason), reason)
  await page.click('[data-list="inbox"] [data-page="2"]')
  check('page two has the other four', (await rows('inbox')).length === 4 && (await showing('inbox')) === 'Showing 11 to 14 of 14 entries' && same(await page.$$eval('[data-list="inbox"] .pagination button', (els) => els.map((el) => el.textContent.trim())), ['Previous', '1', '2', 'Next']))
  check('Previous is on and Next is off on the last page', !(await page.locator('[data-list="inbox"] [data-page="1"][disabled]').count()) && (await page.locator('[data-list="inbox"] .page-btn:has-text("Next")').isDisabled()))
  await page.click('[data-list="inbox"] [data-page="1"]')

  await page.fill('[data-list="inbox"] [data-search]', 'BILLING@')
  check('a search looks at the sender, in any case', (await rows('inbox')).length === 3 && (await showing('inbox')) === 'Showing 1 to 3 of 3 entries', await rows('inbox'))
  await page.fill('[data-list="inbox"] [data-search]', 'latency above')
  check('and at the message', (await rowIds('inbox')).join() === 'em13')
  await page.fill('[data-list="inbox"] [data-search]', '2020-01-01')
  check('and says so when nothing matches', (await rows('inbox'))[0][0] === 'No matching emails found.' && (await showing('inbox')) === 'Showing 0 entries')
  await page.fill('[data-list="inbox"] [data-search]', '')
  check('clearing the search brings every email back', (await showing('inbox')) === 'Showing 1 to 10 of 14 entries')

  await page.click('[data-list="inbox"] [data-open="em14"]')
  await page.waitForSelector('#inbox-modal.open')
  const detail = await page.textContent('#inbox-detail')
  check('a message opens the whole email: from, to, subject, time, whether it made a ticket, and the text', /alerts@acmetelecom\.test/.test(detail) && /tickets@acmetelecom\.test/.test(detail) && /\[NET\] Link down at Kochi PoP/.test(detail) && /A ticket was made/.test(detail) && /Leased line LL-4471 down/.test(await page.textContent('#inbox-message')), detail)
  await page.click('#inbox-modal .modal-button.secondary')
  await page.click('[data-list="inbox"] [data-open="em11"]')
  await page.waitForSelector('#inbox-modal.open')
  check('an email that made no ticket says why', /not from an active From address/.test(await page.textContent('#inbox-detail')))
  await page.click('#inbox-modal .modal-close')
  await menu('inbox', 'em9', 'open')
  await page.waitForSelector('#inbox-modal.open')
  check('the row menu\'s View does the same', /Weekly maintenance summary/.test(await page.textContent('#inbox-detail')) && /no department alias/.test(await page.textContent('#inbox-detail')))
  await page.click('#inbox-modal .modal-close')

  await page.click('[data-list="inbox"] [data-act="delete"]')
  check('Delete selected with nothing selected says so', (await toast()) === 'Select at least one email first.')
  await page.click('[data-list="inbox"] [data-select-row="em14"]')
  await page.click('[data-list="inbox"] [data-select-row="em13"]')
  check('ticking rows counts them', (await page.textContent('[data-list="inbox"] .et-selected-note')) === '2 selected')
  await page.click('[data-list="inbox"] [data-page="2"]')
  await page.click('[data-list="inbox"] [data-page="1"]')
  check('the ticks stay when you change page', (await page.isChecked('[data-list="inbox"] [data-select-row="em14"]')) && (await page.textContent('[data-list="inbox"] .et-selected-note')) === '2 selected')
  await page.click('[data-list="inbox"] [data-act="delete"]')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('deleting the selected asks first, with the number', (await page.textContent('.confirm-dialog-message')).includes('2 emails'))
  await page.click('#confirm-dialog-cancel')
  check('Cancel keeps them', (await store(() => Store.get().emailInbox.length)) === 14)
  await page.click('[data-list="inbox"] [data-act="delete"]')
  await confirmYes()
  check('Delete removes them and says so', (await store(() => Store.get().emailInbox.length)) === 12 && (await toast()) === '2 emails deleted successfully!' && !(await page.locator('[data-list="inbox"] .et-selected-note').count()) && (await showing('inbox')) === 'Showing 1 to 10 of 12 entries')
  check('a ticket made from a deleted email stays', (await store(() => Store.get().emailTickets.length)) === 10)
  await menu('inbox', 'em12', 'delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('a row\'s Delete names the email', (await page.textContent('.confirm-dialog-message')).includes('[BILL] Invoice INV-2291 disputed'))
  await confirmYes()
  check('and removes just that one', (await store(() => Store.get().emailInbox.length)) === 11 && (await toast()).includes('deleted successfully'))
  await page.click('[data-list="inbox"] [data-select-all]')
  check('the box in the heading ticks every email, not only those on the page', (await page.textContent('[data-list="inbox"] .et-selected-note')) === '11 selected')
  await page.click('[data-list="inbox"] [data-select-all]')
  check('and unticks them again', !(await page.locator('[data-list="inbox"] .et-selected-note').count()))

  section('Receiving a test email')
  await fresh('email-tracking.html#app_email:inbox')
  await page.click('[data-list="inbox"] [data-act="receive"]')
  await page.waitForSelector('#receive-modal.open')
  const fromOptions = await page.$$eval('#receive-from option', (els) => els.map((el) => [el.value, el.selected]))
  check('the From list holds the four addresses (the inactive one marked) and a stranger', same(fromOptions.map((o) => o[0]), ['alerts@acmetelecom.test', 'noc@acmetelecom.test', 'billing@acmetelecom.test', 'old-monitor@acmetelecom.test', 'customer@example.test']) && (await page.textContent('#receive-from')).includes('old-monitor@acmetelecom.test (inactive)') && fromOptions[0][1], fromOptions)
  check('it starts filled in with a subject for the first department and a message with fields', (await page.inputValue('#receive-subject')) === '[NET] Test email' && /Customer: Test customer/.test(await page.inputValue('#receive-message')))
  await page.fill('#receive-subject', '   ')
  await page.click('#receive-save')
  check('a subject is needed', (await errorText('receive-error')) === 'Subject is required' && (await modalOpen('receive-modal')))
  await page.fill('#receive-subject', '[FIELD] Fibre cut at the test site')
  await page.fill('#receive-message', 'Customer: Test customer\nPriority: Urgent')
  await page.click('#receive-save')
  check('receiving it closes the dialog and says what came of it', !(await modalOpen('receive-modal')) && (await toast()) === 'Email received. A ticket was made and 2 people told.', await toast())
  check('the new email is at the top of the inbox, marked as a ticket', (await rows('inbox'))[0].includes('[FIELD] Fibre cut at the test site') && (await rows('inbox'))[0].includes('Ticket') && (await showing('inbox')) === 'Showing 1 to 10 of 15 entries')
  await page.click('[data-list="inbox"] [data-act="receive"]')
  await page.selectOption('#receive-from', 'old-monitor@acmetelecom.test')
  await page.click('#receive-save')
  check('mail from an inactive address says it made no ticket because of the sender', (await toast()) === 'Email received, but no ticket: the sender is not an active From address.', await toast())
  await page.click('[data-list="inbox"] [data-act="receive"]')
  await page.fill('#receive-subject', 'Just a note')
  await page.click('#receive-save')
  check('a subject with no department says that', (await toast()) === 'Email received, but no ticket: the subject has no department such as [NET].', await toast())
  await page.click('[data-list="inbox"] [data-act="receive"]')
  await page.fill('#receive-subject', '[NOPE] Which department?')
  await page.click('#receive-save')
  check('an alias that is not a department says which', (await toast()) === 'Email received, but no ticket: no department has the alias "NOPE".', await toast())
  await store(() => Store.updateEmailDepartment('ed1', { alias: 'NET', department: 'Network operations', userIds: [] }))
  await page.click('[data-list="inbox"] [data-act="receive"]')
  await page.fill('#receive-subject', '[NET] Nobody is there')
  await page.click('#receive-save')
  check('a department with nobody to tell says so', (await toast()) === 'Email received. A ticket was made, but nobody in the department is active to be told.', await toast())

  // =========================================================== departments
  section('Departments')
  await fresh('email-tracking.html#app_email:departments')
  const deps = await rows('departments')
  check('the four departments, newest first, each with its people', deps.length === 4 && deps[0].includes('FIELD') && deps[0].includes('Field service') && deps[0].join(' ').includes('kiran.patel') && deps[0].join(' ').includes('divya.shetty'), deps[0])
  await page.click('[data-list="departments"] [data-act="create"]')
  await page.waitForSelector('#department-modal.open')
  check('Create opens an empty dialog with every user to pick from, the inactive one marked', (await page.inputValue('#dep-alias')) === '' && (await page.textContent('#department-title')) === 'Create department' && (await page.locator('#dep-users-list input').count()) === 6 && (await page.textContent('#dep-users-list')).includes('sanjay.iyer · Account manager (inactive)'))
  await page.click('#department-save')
  check('an empty alias and department are both refused', (await errorText('dep-alias-error')) === 'Department alias is required' && (await errorText('dep-name-error')) === 'Department is required' && (await modalOpen('department-modal')))
  await page.fill('#dep-alias', 'a b')
  await page.fill('#dep-name', 'Test')
  await page.click('#department-save')
  check('an alias with a space is refused', (await errorText('dep-alias-error')) === 'Use letters, digits, - and _ only')
  await page.fill('#dep-alias', '[QA]')
  await page.click('#department-save')
  check('so are brackets', (await errorText('dep-alias-error')) === 'Use letters, digits, - and _ only')
  await page.fill('#dep-alias', 'net')
  await page.click('#department-save')
  check('an alias another department has is refused, in any case', (await errorText('dep-alias-error')) === 'Another department already has this alias')
  await page.fill('#dep-alias', 'QA')
  await page.fill('#dep-name', 'Quality assurance')
  await page.fill('#dep-users-search', 'priya')
  check('the users can be searched', same(await page.$$eval('#dep-users-list .modal-checkbox', (els) => els.filter((el) => el.style.display !== 'none').map((el) => el.textContent.trim().split(' ')[0])), ['priya.raman']))
  await page.check('#dep-users-list [data-user-id="eu3"]')
  await page.fill('#dep-users-search', '')
  await page.check('#dep-users-list [data-user-id="eu1"]')
  await page.click('#department-save')
  check('a good department is added, with the users ticked, and the dialog says so', !(await modalOpen('department-modal')) && (await toast()) === '"QA" department created successfully!' && (await store(() => { const d = Store.get().emailDepartments.find((x) => x.alias === 'QA'); return d && d.userIds.slice().sort().join() })) === 'eu1,eu3')
  check('it is at the top of the list, with its two people', (await rows('departments'))[0].includes('QA') && (await rows('departments'))[0].join(' ').includes('meera.nair') && (await rows('departments'))[0].join(' ').includes('priya.raman'))
  const qa = await store(() => Store.get().emailDepartments.find((d) => d.alias === 'QA').id)
  await menu('departments', qa, 'edit')
  await page.waitForSelector('#department-modal.open')
  check('Edit shows what it has and ticks its users', (await page.textContent('#department-title')) === 'Update department' && (await page.inputValue('#dep-alias')) === 'QA' && (await page.isChecked('#dep-users-list [data-user-id="eu1"]')) && (await page.isChecked('#dep-users-list [data-user-id="eu3"]')) && !(await page.isChecked('#dep-users-list [data-user-id="eu2"]')))
  await page.fill('#dep-alias', 'QA')
  await page.uncheck('#dep-users-list [data-user-id="eu3"]')
  await page.fill('#dep-name', 'Quality')
  await page.click('#department-save')
  check('keeping its own alias is fine, and the changes are saved', (await toast()) === '"QA" department updated successfully!' && (await store(() => { const d = Store.get().emailDepartments.find((x) => x.alias === 'QA'); return [d.department, d.userIds.join()] })).join() === 'Quality,eu1')
  const routed = await receive({ fromEmail: 'noc@acmetelecom.test', subject: '[qa] A new department gets its mail', message: 'Customer: Routing' })
  check('mail with its alias is then sent to it, and only its people are told', routed.outcome === 'ticket' && routed.ticket.department === 'Quality' && same(routed.report.sendToUsers, ['meera.nair']), routed)
  await menu('departments', qa, 'delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('Delete names the department', (await page.textContent('.confirm-dialog-message')).includes('QA'))
  await confirmYes()
  check('and removes it, leaving its tickets', !(await store(() => Store.get().emailDepartments.some((d) => d.alias === 'QA'))) && (await store(() => Store.get().emailTickets.some((t) => t.department === 'Quality'))))
  await page.fill('[data-list="departments"] [data-search]', 'kiran')
  check('a search finds a department by one of its users', (await rows('departments')).length === 2, await rows('departments'))
  await page.fill('[data-list="departments"] [data-search]', 'BILL')
  check('or by its alias', (await rows('departments')).length === 1 && (await rows('departments'))[0].includes('Billing and accounts'))
  await page.fill('[data-list="departments"] [data-search]', '')
  await page.click('[data-list="departments"] [data-select-all]')
  await page.click('[data-list="departments"] [data-act="delete"]')
  await confirmYes()
  check('all the departments can be deleted at once, and the list says there are none', (await store(() => Store.get().emailDepartments.length)) === 0 && (await rows('departments'))[0][0] === 'No departments yet. Create one to start routing emails.')

  // ============================================================== tickets
  section('Tickets')
  await fresh('email-tracking.html#app_email:tickets')
  const head = await page.$$eval('[data-list="tickets"] thead th', (ths) => ths.map((th) => th.textContent.trim()).filter(Boolean))
  check('a ticket\'s fields are its columns, after the ticket\'s name and department', same(head, ['Sl.No', 'Date-Time', 'Ticket name', 'Department', 'Customer', 'Site', 'Priority', 'Issue', 'Invoice']), head)
  const tickets = await rows('tickets')
  check('there are ten, the newest first, each with its field values', tickets.length === 10 && tickets[0].join(' ').includes('[NET] Link down at Kochi PoP') && tickets[0].join(' ').includes('Zenith Foods') && tickets[0].join(' ').includes('Leased line LL-4471 down since 09:40'), tickets[0])
  check('a field a ticket does not have is empty', (await page.$$eval('[data-list="tickets"] tbody tr', (trs) => trs[0].children[trs[0].children.length - 2].textContent.trim())) === '')
  await page.fill('[data-list="tickets"] [data-search]', 'zenith')
  check('a search looks in the fields as well as the name', (await rows('tickets')).length === 2, await rows('tickets'))

  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-list="tickets"] [data-act="csv"]')])
  const csvText = await csv.text()
  const grid = parseCsv(csvText)
  check('Download as CSV gives a file named for the search', csv.suggestedFilename() === 'tickets_zenith.csv', csv.suggestedFilename())
  check('it holds the heading and only the rows the search left, numbered', grid[0].join('|') === 'Sl.No|Date-Time|Ticket name|Department|Customer|Site|Priority|Issue|Invoice' && grid.length === 3 && grid[1][0] === '1' && grid[2][0] === '2' && grid[1][4] === 'Zenith Foods', grid)
  await page.fill('[data-list="tickets"] [data-search]', '"; rm -rf /')
  check('a search made of odd characters finds nothing, and says so', (await rows('tickets'))[0][0] === 'No matching tickets found.')
  await store(() => { window.__files = 0; const make = URL.createObjectURL; URL.createObjectURL = function () { window.__files++; return make.apply(URL, arguments) } })
  await page.click('[data-list="tickets"] [data-act="csv"]')
  check('and then there is nothing to download, which it says, and no file is made', (await toast()) === 'There are no tickets to download.' && (await store(() => window.__files)) === 0, await toast())
  await page.fill('[data-list="tickets"] [data-search]', '')

  await store(() => Store.receiveEmail({ fromEmail: 'alerts@acmetelecom.test', subject: '[NET] Sheet test', message: 'Customer: =HYPERLINK("http://evil.test","click")\nSite: Smith, "Bob" & Co\nPriority: +1 high\nIssue: -5\nInvoice: @SUM(A1)' }))
  await open('email-tracking.html#app_email:tickets')
  const [csv3] = await Promise.all([page.waitForEvent('download'), page.click('[data-list="tickets"] [data-act="csv"]')])
  const g3 = parseCsv(await csv3.text())
  const newest = g3[1]
  check('with no search the file is just "tickets.csv", and holds all the tickets', csv3.suggestedFilename() === 'tickets.csv' && g3.length === 12, [csv3.suggestedFilename(), g3.length])
  check('a value that a spreadsheet would run as a formula gets a quote in front', newest[4] === `'=HYPERLINK("http://evil.test","click")` && newest[6] === "'+1 high" && newest[8] === "'@SUM(A1)", newest)
  check('a plain number, even a negative one, is left alone', newest[7] === '-5', newest)
  check('commas, quotes and ampersands survive', newest[5] === 'Smith, "Bob" & Co', newest)

  await store(() => { window.__pdf = []; function FakeDoc(options) { window.__pdf.push({ options }) } FakeDoc.API = { autoTable: true }; FakeDoc.prototype.autoTable = function (opts) { window.__pdf.push({ head: opts.head, body: opts.body }) }; FakeDoc.prototype.save = function (name) { window.__pdf.push({ saved: name }) }; window.jspdf = { jsPDF: FakeDoc } })
  await page.fill('[data-list="tickets"] [data-search]', 'packet loss')
  await page.click('[data-list="tickets"] [data-act="pdf"]')
  await page.waitForTimeout(250)
  const pdf = await store(() => window.__pdf)
  check('Download as PDF builds a table of the rows shown, in landscape, and saves it under the same name', pdf.length === 3 && pdf[0].options.orientation === 'landscape' && pdf[1].head[0][2] === 'Ticket name' && pdf[1].body.length === 1 && pdf[1].body[0][2] === '[NET] Packet loss at Chennai PoP' && pdf[2].saved === 'tickets_packet-loss.pdf', pdf)
  await page.fill('[data-list="tickets"] [data-search]', '')

  await page.click('[data-list="tickets"] [data-select-all]')
  await page.click('[data-list="tickets"] [data-act="delete"]')
  check('Delete selected counts what it will remove', (await (async () => { await page.waitForSelector('#confirm-dialog-confirm'); return page.textContent('.confirm-dialog-message') })()).includes('11 tickets'))
  await confirmYes()
  check('and removes every ticket', (await store(() => Store.get().emailTickets.length)) === 0 && (await rows('tickets'))[0][0] === 'No tickets yet.')

  // ============================================================== reports
  section('Reports')
  await fresh('email-tracking.html#app_email:reports')
  const reports = await rows('reports')
  check('ten reports, the newest first: when, what, which department and who was told', reports.length === 10 && reports[0].join(' ').includes('New ticket "[NET] Link down at Kochi PoP" from alerts@acmetelecom.test') && reports[0].join(' ').includes('Network operations') && reports[0].join(' ').includes('arjun.menon') && reports[0].join(' ').includes('kiran.patel'), reports[0])
  await page.fill('[data-list="reports"] [data-search]', 'priya')
  check('a search finds the people who were told', (await rows('reports')).length === 3, await rows('reports'))
  const [rcsv] = await Promise.all([page.waitForEvent('download'), page.click('[data-list="reports"] [data-act="csv"]')])
  const rgrid = parseCsv(await rcsv.text())
  check('Download as CSV is named tickets_report.csv and holds the rows shown, with the people in one cell', rcsv.suggestedFilename() === 'tickets_report.csv' && rgrid[0].join('|') === 'Sl.No|Date|Time|Message|Department|Send to user' && rgrid.length === 4 && rgrid[1][5] === 'priya.raman', rgrid)
  await page.fill('[data-list="reports"] [data-search]', '')
  await menu('reports', (await rowIds('reports'))[0], 'delete')
  await confirmYes()
  check('a report can be deleted', (await store(() => Store.get().emailReports.length)) === 9 && (await store(() => Store.get().emailTickets.length)) === 10)
  await store(() => Store.updateEmailDepartment('ed1', { alias: 'NET', department: 'Network operations', userIds: [] }))
  await store(() => Store.receiveEmail({ fromEmail: 'alerts@acmetelecom.test', subject: '[NET] Nobody', message: '' }))
  await open('email-tracking.html#app_email:reports')
  check('a report for a ticket nobody was told about says so', (await rows('reports'))[0].join(' ').includes('Nobody was active'))

  // ============================================================ notifications
  section('Notifications')
  await fresh('email-tracking.html#app_email:notifications')
  const pushes2 = await rows('notifications')
  check('17 notifications on two pages, each with its title, message, user and delivery status', pushes2.length === 10 && (await showing('notifications')) === 'Showing 1 to 10 of 17 entries' && pushes2[0].includes('New ticket · NET'), pushes2[0])
  await page.fill('[data-list="notifications"] [data-search]', 'failed')
  const failed = await rows('notifications')
  check('a search finds the ones that failed, and they are all one person\'s', failed.length === 3 && failed.every((r) => r.includes('divya.shetty') && r.includes('failed')), failed)
  await page.fill('[data-list="notifications"] [data-search]', '')
  check('delivered and failed look different', (await page.locator('[data-list="notifications"] .status-delivered').count()) > 0)
  check('the settings show the push application', (await page.inputValue('#push-app')) === 'demo-push-app-0001')
  await page.fill('#push-app', '   ')
  await page.click('#push-form button[type="submit"]')
  check('an empty application ID is refused, and nothing changes', (await errorText('push-error')) === 'Application ID is required' && (await store(() => Store.get().emailNotificationSettings[0].applicationId)) === 'demo-push-app-0001')
  await page.fill('#push-app', 'new-push-app-77')
  await page.click('#push-form button[type="submit"]')
  check('a new one is saved', (await store(() => Store.get().emailNotificationSettings[0].applicationId)) === 'new-push-app-77' && (await toast()) === 'Settings updated successfully!' && !(await visible('#push-error')))
  await menu('notifications', (await rowIds('notifications'))[0], 'delete')
  await confirmYes()
  check('a notification can be deleted', (await store(() => Store.get().emailNotifications.length)) === 16)

  // ================================================================== SMS
  section('SMS gateway')
  await fresh('email-tracking.html#app_email:sms')
  const sms = await rows('sms')
  check('17 texts, with the number each came from and went to, and whether it was delivered', sms.length === 10 && (await showing('sms')) === 'Showing 1 to 10 of 17 entries' && sms[0].includes('+1 555 010 0100'), sms[0])
  await page.fill('[data-list="sms"] [data-search]', 'failed')
  const smsFailed = await rows('sms')
  check('the failed ones all went to the number without a country code', smsFailed.length === 3 && smsFailed.every((r) => r.includes('98450 11203') && r.includes('Failed')), smsFailed)
  await page.fill('[data-list="sms"] [data-search]', '')
  const seededSid = await store(() => Store.get().emailSmsSettings[0].sid)
  check('the settings show the gateway', (await page.inputValue('#sms-sid')) === seededSid && (await page.inputValue('#sms-from')) === '+1 555 010 0100' && (await page.isChecked('#sms-active')))
  check('the auth token is hidden until asked for', (await page.getAttribute('#sms-token', 'type')) === 'password')
  await page.click('#sms-token-eye')
  check('the eye shows it', (await page.getAttribute('#sms-token', 'type')) === 'text' && (await page.inputValue('#sms-token')) === 'demo-auth-token')
  await page.fill('#sms-sid', '')
  await page.fill('#sms-token', '')
  await page.click('#sms-form button[type="submit"]')
  check('an empty SID or token is refused, and nothing changes', (await errorText('sms-sid-error')) === 'SID is required' && (await errorText('sms-token-error')) === 'Auth token is required' && (await store(() => Store.get().emailSmsSettings[0].sid)) === seededSid)
  await page.fill('#sms-sid', 'ACnew')
  await page.fill('#sms-token', 'tok-new')
  await page.fill('#sms-from', '+44 20 7946 0000')
  await page.uncheck('#sms-active')
  await page.click('#sms-form button[type="submit"]')
  check('the changes are saved, including switching the gateway off', same(await store(() => { const g = Store.get().emailSmsSettings[0]; return [g.sid, g.authToken, g.fromNumber, g.isActive] }), ['ACnew', 'tok-new', '+44 20 7946 0000', false]) && (await toast()) === 'Settings updated successfully!')
  const smsBefore = await store(() => Store.get().emailSms.length)
  const off = await receive({ fromEmail: 'alerts@acmetelecom.test', subject: '[NET] Gateway is off', message: '' })
  check('with the gateway off, a ticket tells people by push only', off.notified === 2 && off.texted === 0 && (await store(() => Store.get().emailSms.length)) === smsBefore)
  await menu('sms', (await rowIds('sms'))[0], 'delete')
  await confirmYes()
  check('a text can be deleted', (await store(() => Store.get().emailSms.length)) === smsBefore - 1)

  // ================================================================ users
  section('Users')
  await fresh('email-tracking.html#app_email:users')
  const users = await rows('users')
  check('six people, newest first, with their designation, number, device, status and expiry', users.length === 6 && users[0].join(' ').includes('divya.shetty') && users[0].join(' ').includes('None') && users[0].join(' ').includes('2027-03-31 23:59:59') && users[1].join(' ').includes('Inactive'), users[0])
  await page.click('[data-list="users"] [data-act="add"]')
  await page.waitForSelector('#user-modal.open')
  check('Add opens an empty form, active by default, with the name and email open to type in', (await page.textContent('#user-title')) === 'Add user' && (await page.inputValue('#eu-username')) === '' && (await page.isChecked('#eu-active')) && (await page.getAttribute('#eu-username', 'readonly')) === null)
  await page.click('#user-save')
  check('a name is needed', (await errorText('eu-username-error')) === 'User name is required')
  await page.fill('#eu-username', 'MEERA.NAIR')
  await page.click('#user-save')
  check('a name someone has is refused, in any case', (await errorText('eu-username-error')) === 'Another user already has this name')
  await page.fill('#eu-username', 'new.hire')
  await page.fill('#eu-email', 'not an email')
  await page.click('#user-save')
  check('an email that is not one is refused', (await errorText('eu-email-error')) === 'Enter a valid email address' && (await modalOpen('user-modal')))
  await page.fill('#eu-email', 'new.hire@acmetelecom.test')
  await page.fill('#eu-designation', 'Engineer')
  await page.fill('#eu-mobile', '+91 98450 11299')
  await page.fill('#eu-device', 'dev-new-1')
  await page.fill('#eu-expiry', '2028-01-31T18:30')
  await page.click('#user-save')
  const hire = await store(() => Store.get().emailUsers.find((u) => u.username === 'new.hire'))
  check('a good user is added with everything entered, the expiry as a date and time', !(await modalOpen('user-modal')) && hire && hire.email === 'new.hire@acmetelecom.test' && hire.designation === 'Engineer' && hire.mobileNo === '+91 98450 11299' && hire.deviceId === 'dev-new-1' && hire.expiryTime === '2028-01-31 18:30:00' && hire.active === true && (await toast()) === '"new.hire" added successfully!', hire)
  check('and is at the top of the list', (await rows('users'))[0].join(' ').includes('new.hire') && (await showing('users')) === 'Showing 1 to 7 of 7 entries')
  await menu('users', hire.id, 'edit')
  await page.waitForSelector('#user-modal.open')
  check('Edit fills the form in, with the name and email read-only and the expiry in the box', (await page.inputValue('#eu-username')) === 'new.hire' && (await page.getAttribute('#eu-username', 'readonly')) !== null && (await page.getAttribute('#eu-email', 'readonly')) !== null && (await page.inputValue('#eu-expiry')) === '2028-01-31T18:30' && (await page.textContent('#user-save')) === 'Save changes')
  await page.fill('#eu-designation', 'Senior engineer')
  await page.uncheck('#eu-active')
  await page.fill('#eu-expiry', '')
  await page.click('#user-save')
  const edited2 = await store((id) => Store.get().emailUsers.find((u) => u.id === id), hire.id)
  check('the changes are saved: a switched-off user and no expiry', edited2.designation === 'Senior engineer' && edited2.active === false && edited2.expiryTime === '' && edited2.username === 'new.hire' && (await toast()) === '"new.hire" updated successfully!', edited2)
  check('an inactive user shows as inactive, and no expiry as a dash', (await rows('users'))[0].includes('Inactive') && (await rows('users'))[0].includes('—'))

  await menu('users', hire.id, 'password')
  await page.waitForSelector('#password-modal.open')
  check('Update password names the user and lists the five rules, none met yet', (await page.inputValue('#pw-user')) === 'new.hire' && (await page.locator('#pw-requirements .requirement').count()) === 5 && (await page.locator('#pw-requirements .requirement-icon.met').count()) === 0)
  await page.fill('#pw-new', 'Abcdef1!')
  check('the rules tick as the password meets them', (await page.locator('#pw-requirements .requirement-icon.met').count()) === 5)
  await page.fill('#pw-new', 'abc')
  await page.fill('#pw-confirm', 'abc')
  await page.click('#password-modal button[type="submit"]')
  check('a weak password is refused', (await errorText('pw-error')) === 'The new password does not meet every requirement' && (await modalOpen('password-modal')))
  await page.fill('#pw-new', 'Abcdef1!')
  await page.fill('#pw-confirm', 'Abcdef1?')
  await page.click('#password-modal button[type="submit"]')
  check('two that differ are refused', (await errorText('pw-error')) === 'The two passwords do not match')
  await page.fill('#pw-confirm', 'Abcdef1!')
  await page.click('#password-modal button[type="submit"]')
  check('matching, strong ones are accepted, and said so', !(await modalOpen('password-modal')) && (await toast()) === 'Password updated for "new.hire".')
  check('but the password is not kept anywhere', !(await store(() => JSON.stringify(Object.assign({}, localStorage)).includes('Abcdef1!'))))

  await menu('users', 'eu4', 'delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('Delete names the person', (await page.textContent('.confirm-dialog-message')).includes('kiran.patel'))
  await confirmYes()
  const removed = await store(() => ({ gone: !Store.get().emailUsers.some((u) => u.id === 'eu4'), deps: Store.get().emailDepartments.filter((d) => d.userIds.includes('eu4')).length, pushes: Store.get().emailNotifications.filter((n) => n.sendToUser === 'kiran.patel').length }))
  check('they go, and leave their departments, but what they were sent stays', removed.gone && removed.deps === 0 && removed.pushes > 0, removed)
  await page.fill('[data-list="users"] [data-search]', 'dev-sanjay')
  check('a search finds a person by their device', (await rows('users')).length === 1)
  await page.fill('[data-list="users"] [data-search]', '+91 98450 11202')
  check('or by their number', (await rows('users')).length === 1 && (await rows('users'))[0].join(' ').includes('arjun.menon'))
  await page.fill('[data-list="users"] [data-search]', '')

  // ============================================================= settings
  section('Settings: the mailbox')
  await fresh('email-tracking.html#app_email:settings')
  check('the SMTP settings show the saved mailbox', (await page.inputValue('#mb-host')) === 'imap.acmetelecom.test' && (await page.inputValue('#mb-port')) === '993' && (await page.inputValue('#mb-username')) === 'tickets@acmetelecom.test' && (await page.inputValue('#mb-interval')) === '60' && (await page.isChecked('input[name="mb-status"][value="true"]')))
  check('the password is hidden until the eye is pressed', (await page.getAttribute('#mb-password', 'type')) === 'password')
  await page.click('#mb-password-eye')
  check('then it shows', (await page.getAttribute('#mb-password', 'type')) === 'text' && (await page.getAttribute('#mb-password-eye', 'aria-label')) === 'Hide password')
  await page.fill('#mb-host', '')
  await page.fill('#mb-port', '')
  await page.fill('#mb-username', '')
  await page.fill('#mb-password', '')
  await page.click('#mailbox-form button[type="submit"]')
  check('every empty field is refused with its own message', (await errorText('mb-host-error')) === 'Host is required' && (await errorText('mb-port-error')) === 'Port is required' && (await errorText('mb-username-error')) === 'Username is required' && (await errorText('mb-password-error')) === 'Password is required')
  check('and nothing is saved', (await store(() => Store.get().emailSettings[0].host)) === 'imap.acmetelecom.test')
  await page.fill('#mb-host', 'h'.repeat(201))
  await page.fill('#mb-port', '70000')
  await page.fill('#mb-username', 'u'.repeat(51))
  await page.fill('#mb-password', 'p'.repeat(51))
  await page.fill('#mb-interval', '4000')
  await page.click('#mailbox-form button[type="submit"]')
  check('too long, too big: each says what the limit is', (await errorText('mb-host-error')) === 'Host must be less than 200 characters' && (await errorText('mb-port-error')) === 'Port must be a number between 0 to 65535' && (await errorText('mb-username-error')) === 'Username must be less than 50 characters' && (await errorText('mb-password-error')) === 'Password must be less than 50 characters' && (await errorText('mb-interval-error')) === 'Check Interval must be a number between 0 to 3600')
  await page.fill('#mb-port', 'abc')
  await page.fill('#mb-interval', '-1')
  await page.click('#mailbox-form button[type="submit"]')
  check('letters and a minus sign are not numbers', (await errorText('mb-port-error')) === 'Port must be a number between 0 to 65535' && (await errorText('mb-interval-error')) === 'Check Interval must be a number between 0 to 3600')
  await page.fill('#mb-host', 'mail.example.test')
  await page.fill('#mb-port', '587')
  await page.fill('#mb-username', 'inbox@example.test')
  await page.fill('#mb-password', 's3cret')
  await page.fill('#mb-interval', '')
  await page.click('input[name="mb-status"][value="false"]')
  await page.click('#mailbox-form button[type="submit"]')
  const mailbox = await store(() => Store.get().emailSettings[0])
  check('good values are saved: a number for the port, no interval, checking switched off', mailbox.host === 'mail.example.test' && mailbox.port === 587 && mailbox.username === 'inbox@example.test' && mailbox.password === 's3cret' && mailbox.checkInterval === null && mailbox.checkStatus === false && (await toast()) === 'Settings updated successfully!', mailbox)
  check('the old messages go away', !(await visible('#mb-host-error')) && !(await visible('#mb-port-error')))
  await page.fill('#mb-interval', '0')
  await page.fill('#mb-port', '0')
  await page.click('#mailbox-form button[type="submit"]')
  check('0 is allowed for both', (await store(() => Store.get().emailSettings[0].checkInterval)) === 0 && (await store(() => Store.get().emailSettings[0].port)) === 0)

  section('Settings: From addresses')
  const fromRows = await rows('from')
  check('the From addresses list holds the four, newest first, with a switch for each', fromRows.length === 4 && fromRows[0].includes('old-monitor@acmetelecom.test') && (await page.locator('[data-list="from"] [data-toggle-from]').count()) === 4)
  check('the inactive one is off and the others on', same(await page.$$eval('[data-list="from"] [data-toggle-from]', (els) => els.map((el) => el.checked)), [false, true, true, true]))
  await page.click('[data-list="from"] [data-toggle-from="ef4"]')
  check('the switch turns an address on, and says so', (await store(() => Store.get().emailFromAddresses.find((a) => a.id === 'ef4').active)) === true && (await toast()) === 'Email updated successfully!')
  await page.click('[data-list="from"] [data-toggle-from="ef4"]')
  check('and off again', (await store(() => Store.get().emailFromAddresses.find((a) => a.id === 'ef4').active)) === false)
  await page.click('[data-list="from"] [data-act="add"]')
  await page.waitForSelector('#from-modal.open')
  await page.click('#from-modal button[type="submit"]')
  check('an empty address is refused', (await errorText('from-error')) === 'Input value is empty. No email added.')
  await page.fill('#from-email', 'nope')
  await page.click('#from-modal button[type="submit"]')
  check('so is one that is not an address', (await errorText('from-error')) === 'Enter a valid email address')
  await page.fill('#from-email', 'NOC@acmetelecom.test')
  await page.click('#from-modal button[type="submit"]')
  check('and one that is there already, in any case', (await errorText('from-error')) === 'That address is already in the list')
  await page.fill('#from-email', 'ops@partner.test')
  await page.click('#from-modal button[type="submit"]')
  check('a new address is added, active, at the top', !(await modalOpen('from-modal')) && (await toast()) === 'Email added successfully!' && (await store(() => Store.get().emailFromAddresses.find((a) => a.email === 'ops@partner.test').active)) === true && (await rows('from'))[0].includes('ops@partner.test'))
  await page.fill('[data-list="from"] [data-search]', 'partner')
  check('a search finds it', (await rows('from')).length === 1)
  await page.fill('[data-list="from"] [data-search]', 'zzz')
  check('and says when there is nothing', (await rows('from'))[0][0] === 'No emails available')
  await page.fill('[data-list="from"] [data-search]', '')
  const partnerId = await store(() => Store.get().emailFromAddresses.find((a) => a.email === 'ops@partner.test').id)
  await menu('from', partnerId, 'delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('Delete names the address', (await page.textContent('.confirm-dialog-message')).includes('ops@partner.test'))
  await confirmYes()
  check('and removes it', !(await store(() => Store.get().emailFromAddresses.some((a) => a.email === 'ops@partner.test'))))

  // ================================================================ safety
  section('Names are shown as text')
  await fresh('email-tracking.html#app_email:users')
  const evil = '<img src=x onerror="window.__pwned=1">'
  await store((name) => {
    window.__pwned = 0
    const user = Store.addEmailUser({ username: name, email: 'evil@acmetelecom.test', designation: name, mobileNo: '+1 555 010 0199', deviceId: 'dev-evil' })
    Store.updateEmailDepartment('ed3', { alias: 'SUP', department: 'Customer support', userIds: ['eu1', user.id] })
    Store.receiveEmail({ fromEmail: 'alerts@acmetelecom.test', subject: '[SUP] ' + name, message: 'Customer: ' + name + '\nIssue: ' + name })
  }, evil)
  const seen = {}
  for (const tab of ['dashboard', 'inbox', 'departments', 'tickets', 'reports', 'notifications', 'sms', 'users']) {
    await open('email-tracking.html#app_email:' + tab)
    await page.waitForTimeout(100)
    seen[tab] = await page.evaluate(() => ({ images: document.querySelectorAll('#et-view img').length, pwned: window.__pwned || 0, text: document.getElementById('et-view').textContent.includes('<img src=x') }))
  }
  check('a name with markup in it runs nothing on any tab, and shows up as typed on the tabs that name it', Object.keys(seen).every((t) => seen[t].images === 0 && seen[t].pwned === 0) && seen.users.text && seen.tickets.text && seen.inbox.text && seen.departments.text && seen.dashboard.text && seen.reports.text, seen)
  await open('email-tracking.html#app_email:departments')
  await menu('departments', 'ed3', 'edit')
  await page.waitForSelector('#department-modal.open')
  check('nor in the dialog\'s list of users', (await page.locator('#dep-users-list img').count()) === 0 && (await page.textContent('#dep-users-list')).includes('<img src=x'))
  await page.click('#department-modal .modal-close')
  await open('email-tracking.html#app_email:inbox')
  await page.click('[data-list="inbox"] [data-open]')
  await page.waitForSelector('#inbox-modal.open')
  check('nor in an email\'s own window', (await page.locator('#inbox-detail img').count()) === 0)

  // ======================================================== who can see it
  section('Who can see it')
  await fresh()
  await page.evaluate(() => { Store.logout(); Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE') })
  await open('email-tracking.html#app_email')
  check('a tenant that may view it sees it', (await page.locator('.rt-kpi-grid').count()) === 1 && (await page.$$eval('.sidebar-child-link', (as) => as.some((a) => a.textContent.trim() === 'Email Tracking'))))
  await page.evaluate(() => { Store.logout(); Store.login('admin', 'admin') ; Store.setTenantApplicationAccess('t1', ['app_email'], false); Store.logout(); Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE') })
  await open('email-tracking.html#app_email')
  check('one that may not is told the application is not enabled for it, and has no entry in its sidebar', /Application not found/.test(await page.textContent('.not-found-block')) && /isn't enabled for your organization/.test(await page.textContent('.not-found-block')) && !(await page.$$eval('.sidebar-child-link', (as) => as.some((a) => a.textContent.trim() === 'Email Tracking'))))
  await fresh('settings.html', '.bk-group')
  await page.waitForSelector('.bk-group')
  check('Settings > Backup offers Email Tracking as a page of its own, with what it holds', (await page.locator('[data-bk-page="app:app_email"]').count()) === 1 && /entr|item/.test(await page.textContent('[data-bk-page="app:app_email"] ~ .bk-page-count')), await page.textContent('[data-bk-page="app:app_email"] ~ .bk-page-count'))
  await page.click('#bk-take')
  await page.waitForTimeout(300)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.bk-item:first-child [data-bk-download]')])
  const sql = await dl.text()
  check('the SQL backup has a table for each of its collections', ['email_inbox', 'email_tickets', 'email_reports', 'email_departments', 'email_users', 'email_from_addresses', 'email_notifications', 'email_sms', 'email_settings', 'email_notification_settings', 'email_sms_settings'].every((t) => sql.includes(`CREATE TABLE "${t}"`)), sql.match(/CREATE TABLE "email_[a-z_]+"/g))
  check('a ticket\'s fields are JSON and its department list is JSON too', /"fields" JSONB/.test(sql) && /"user_ids" JSONB/.test(sql) && /"send_to_users" JSONB/.test(sql))

  check('no JavaScript errors on the way', errors.length === 0, Array.from(new Set(errors)).slice(0, 5))
})
