// Per-tenant application access: admin checkbox table + tenant-side enforcement.

Tests.suite('tenant-apps', 'Tenant application access', async ({ page, BASE, check, skip, section, same, artifact, sleep }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const goto = async (p) => { await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(350) }
  const reset = async () => { await goto('login.html'); await page.evaluate(() => Store.reset()) }
  const signIn = async (org) => { await page.evaluate((o) => { Store.logout(); return Store.login('admin', 'admin', o) }, org || '') }
  const sidebarApps = () => page.$$eval('.sidebar-child-link', (as) => {
    const names = as.map((a) => a.textContent.trim())
    return names.slice(1, names.indexOf('Devices'))
  })
  const listApps = () => page.$$eval('#tbody tr', (trs) => trs.map((tr) => (tr.querySelector('.group-name-cell span') ? tr.querySelector('.group-name-cell span').childNodes[0].textContent.trim() : tr.textContent.trim())))
  const adminRows = () => page.$$eval('#applications-tbody tr', (trs) => trs.map((tr) => ({
    name: tr.querySelector('.group-name-cell') ? tr.querySelector('.group-name-cell').childNodes[0].textContent.trim() : tr.textContent.trim(),
    type: tr.querySelector('td[data-label="Type"]') ? tr.querySelector('td[data-label="Type"]').textContent.trim() : '',
    ticked: tr.querySelector('[data-app-access]') ? tr.querySelector('[data-app-access]').checked : null,
  })))
  // The page reads the tenant id once at load (it's always reached from the tenants list), so
  // always start from a blank page to force a real load rather than a same-document hash change.
  const openAdmin = async (tenant) => { await page.goto('about:blank'); await goto('admin-tenant-detail.html#' + tenant); await page.click('#tab-applications') }
  const toast = () => page.$eval('#toast-root', (e) => e.innerText.trim()).catch(() => '')
  const tenantIds = (t) => page.evaluate((id) => Store.tenantApplicationIds(id), t)

  // =========================================================== ADMIN TABLE
  section('admin: tenant detail → Applications')
  await reset()
  await openAdmin('t1')
  let rows = await adminRows()
  check('lists every platform app, default first then custom', same(rows.map((r) => r.name), ['PMS', 'EMS', 'Custom App', 'CMS', 'Fleet Tracker']), rows)
  check('types: 4 Default + 1 Custom', same(rows.map((r) => r.type), ['Default', 'Default', 'Default', 'Default', 'Custom']), rows.map((r) => r.type))
  check('Northbridge (t1) has all five ticked', rows.every((r) => r.ticked === true))
  check('limit badge shows selected / plan max', (await page.textContent('#applications-limit-badge')).trim() === '5 / 200', await page.textContent('#applications-limit-badge'))
  check('"Add application" button is still there', await page.locator('#add-application-btn').isVisible())
  check('only custom rows have a row menu (default rows are built in)', same(await page.$$eval('#applications-tbody tr', (trs) => trs.map((tr) => !!tr.querySelector('.row-menu'))), [false, false, false, false, true]))
  check('header select-all is ticked when everything is', await page.$eval('#applications-select-all', (e) => e.checked === true && e.indeterminate === false))
  check('Organization ID shown in the tenant header', (await page.textContent('#tenant-meta')).includes('NORTHBRIDGE'), await page.textContent('#tenant-meta'))

  await openAdmin('t2')
  rows = await adminRows()
  check('Cradlewell (t2): four defaults ticked, Fleet Tracker not', same(rows.map((r) => r.ticked), [true, true, true, true, false]), rows.map((r) => r.ticked))
  check('t2 select-all is indeterminate (partial)', await page.$eval('#applications-select-all', (e) => e.checked === false && e.indeterminate === true))
  check('t2 badge is 4 / 50 (Default plan)', (await page.textContent('#applications-limit-badge')).trim() === '4 / 50')

  // untick one
  await page.uncheck('[data-app-access="app0"]')
  await page.waitForTimeout(200)
  check('unticking PMS saves it', same(await tenantIds('t2'), ['app_ems', 'app_notion', 'app_cms']), await tenantIds('t2'))
  check('toast says PMS is no longer available', /"PMS" is no longer available to Cradlewell Facilities/.test(await toast()), await toast())
  check('badge updates to 3 / 50', (await page.textContent('#applications-limit-badge')).trim() === '3 / 50')
  // tick Fleet Tracker
  await page.check('[data-app-access="app1"]')
  await page.waitForTimeout(200)
  check('ticking Fleet Tracker adds it', (await tenantIds('t2')).includes('app1'))

  // search + select-all only touches visible rows
  await page.fill('#applications-search', 'cms')
  await page.waitForTimeout(150)
  rows = await adminRows()
  check('search narrows the list', same(rows.map((r) => r.name), ['CMS']), rows)
  await page.uncheck('#applications-select-all')
  await page.waitForTimeout(200)
  check('select-all (while searching) only affects the visible row', !(await tenantIds('t2')).includes('app_cms') && (await tenantIds('t2')).includes('app_ems'), await tenantIds('t2'))
  await page.fill('#applications-search', '')
  await page.waitForTimeout(150)
  await page.check('#applications-select-all')
  await page.waitForTimeout(200)
  check('select-all ticks everything', same((await tenantIds('t2')).sort(), ['app0', 'app1', 'app_cms', 'app_ems', 'app_notion']), await tenantIds('t2'))
  check('bulk toast names the count', /applications are now available/.test(await toast()) || /is now available/.test(await toast()), await toast())
  await page.uncheck('#applications-select-all')
  await page.waitForTimeout(200)
  check('select-all off leaves the tenant with none', same(await tenantIds('t2'), []), await tenantIds('t2'))
  check('empty selection still shows all rows (unticked)', (await adminRows()).every((r) => r.ticked === false) && (await adminRows()).length === 5)

  // ======================================================== ADD / EDIT / SUSPEND / DELETE
  section('admin: Add application + row menu')
  await reset()
  await openAdmin('t1')
  await page.click('#add-application-btn')
  await page.waitForSelector('#application-modal.open')
  check('Add application opens the modal', (await page.textContent('#application-modal-title')).trim() === 'Add application' && (await page.locator('#ta-name').isVisible()) && (await page.locator('#ta-devices-list input').count()) > 0 && (await page.locator('#ta-assets-list input').count()) > 0)
  await page.fill('#ta-name', 'Warehouse Hub')
  await page.fill('#ta-description', 'Dock scheduling for the warehouse')
  await page.check('#ta-devices-list [data-device="d1"]')
  await page.check('#ta-assets-list [data-asset="a1"]')
  await page.click('#application-save-btn')
  await page.waitForTimeout(300)
  rows = await adminRows()
  const hub = rows.find((r) => r.name.startsWith('Warehouse Hub'))
  check('new custom app appears as a Custom row, ticked', !!hub && hub.type === 'Custom' && hub.ticked === true, rows)
  const hubId = await page.evaluate(() => (Store.allApplications().find((a) => a.name === 'Warehouse Hub') || {}).id)
  check('it is a platform app enabled for this tenant', !!hubId && (await tenantIds('t1')).includes(hubId))
  check('with its linked device + asset counted', await page.$eval(`tr:has([data-app-access="${hubId}"])`, (tr) => tr.querySelector('td[data-label="Devices"]').textContent.trim() === '1' && tr.querySelector('td[data-label="Assets"]').textContent.trim() === '1'))
  check('limit badge counts it (6 / 200)', (await page.textContent('#applications-limit-badge')).trim() === '6 / 200', await page.textContent('#applications-limit-badge'))
  check('toast confirms the add', /"Warehouse Hub" application added successfully/.test(await toast()), await toast())
  await openAdmin('t2')
  rows = await adminRows()
  const hub2 = rows.find((r) => r.name.startsWith('Warehouse Hub'))
  check('other tenants see it in their list, unticked', !!hub2 && hub2.ticked === false)
  check('and it is not enabled for them', !(await tenantIds('t2')).includes(hubId))

  // row menu: edit / suspend / delete
  await openAdmin('t1')
  const menuFor = async (id) => { await page.click(`tr:has([data-app-access="${id}"]) [data-menu-toggle]`); await page.waitForTimeout(120) }
  await menuFor(hubId)
  await page.click(`[data-app-edit="${hubId}"]`)
  await page.waitForSelector('#application-modal.open')
  check('Edit opens the modal prefilled', (await page.inputValue('#ta-name')) === 'Warehouse Hub' && (await page.inputValue('#ta-description')) === 'Dock scheduling for the warehouse' && (await page.isChecked('#ta-devices-list [data-device="d1"]')) && (await page.textContent('#application-modal-title')).trim() === 'Edit application')
  await page.fill('#ta-name', 'Warehouse Hub 2')
  await page.click('#application-save-btn')
  await page.waitForTimeout(300)
  check('Edit saves the new name', (await page.evaluate((id) => Store.allApplications().find((a) => a.id === id).name, hubId)) === 'Warehouse Hub 2' && (await adminRows()).some((r) => r.name.startsWith('Warehouse Hub 2')))

  await menuFor(hubId)
  await page.click(`[data-app-toggle="${hubId}"]`)
  await page.waitForTimeout(300)
  check('Suspend flips the status', (await page.evaluate((id) => Store.allApplications().find((a) => a.id === id).status, hubId)) === 'suspended' && (await page.$eval(`tr:has([data-app-access="${hubId}"]) td[data-label="Status"]`, (e) => e.textContent.trim())) === 'suspended')
  await menuFor(hubId)
  check('menu now offers Activate', /Activate/.test(await page.textContent(`[data-app-toggle="${hubId}"]`)))
  await page.keyboard.press('Escape')
  await page.click('h1#tenant-title')

  // editing an existing app must not disturb its platform links
  const before = await page.evaluate(() => { const a = Store.allApplications().find((x) => x.id === 'app1'); return { deviceIds: a.deviceIds, assetIds: a.assetIds, groupNames: a.groupNames, icon: a.icon } })
  await menuFor('app1')
  await page.click('[data-app-edit="app1"]')
  await page.waitForSelector('#application-modal.open')
  check('Edit pre-checks the app\'s real linked devices/assets', (await page.isChecked('#ta-devices-list [data-device="d1"]')) && (await page.isChecked('#ta-devices-list [data-device="d5"]')) && (await page.isChecked('#ta-assets-list [data-asset="a1"]')))
  await page.fill('#ta-description', 'Customer-facing dashboard for live fleet tracking. (edited)')
  await page.click('#application-save-btn')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => { const a = Store.allApplications().find((x) => x.id === 'app1'); return { deviceIds: a.deviceIds, assetIds: a.assetIds, groupNames: a.groupNames, icon: a.icon } })
  check('editing Fleet Tracker keeps its devices, assets, groups and icon', same(before, after), { before, after })

  await menuFor(hubId)
  await page.click(`[data-app-delete="${hubId}"]`)
  check('delete confirm warns it is removed for every tenant', /every tenant/.test(await page.textContent('.confirm-dialog-message')), await page.textContent('.confirm-dialog-message'))
  await page.click('#confirm-dialog-confirm')
  await page.waitForTimeout(300)
  check('Delete removes the app and drops it from every tenant list', !(await page.evaluate((id) => Store.allApplications().some((a) => a.id === id), hubId)) && !(await tenantIds('t1')).includes(hubId) && (await adminRows()).every((r) => !r.name.startsWith('Warehouse Hub')))

  // a custom app added by the admin reaches the tenant (and only while ticked)
  await page.click('#add-application-btn')
  await page.waitForSelector('#application-modal.open')
  await page.fill('#ta-name', 'Dock Board')
  await page.click('#application-save-btn')
  await page.waitForTimeout(300)
  const dockId = await page.evaluate(() => (Store.allApplications().find((a) => a.name === 'Dock Board') || {}).id)
  await signIn('NORTHBRIDGE')
  await goto('applications.html')
  check('a custom app added for a tenant shows up in its own session', (await sidebarApps()).includes('Dock Board'), await sidebarApps())
  await goto('notion.html#' + dockId)
  check('and opens as a Custom App workspace', (await page.$eval('#app-detail-root h1', (e) => e.childNodes[0].textContent.trim())) === 'Dock Board' && (await page.locator('#notion-new-page-btn').count()) === 1)
  await signIn('CRADLEWELL')
  await goto('applications.html')
  check('another tenant does not see it', !(await sidebarApps()).includes('Dock Board'), await sidebarApps())
  await page.evaluate((id) => Store.setTenantApplicationAccess('t1', [id], false), dockId)
  await signIn('NORTHBRIDGE')
  await goto('applications.html')
  check('unticking it hides it from that tenant again', !(await sidebarApps()).includes('Dock Board'), await sidebarApps())

  // plan limit also gates Add application
  await reset()
  await page.evaluate(() => Store.updateTenantProfile('tp1', { name: 'Default', maxApplications: 4 }))
  await openAdmin('t2')
  await page.click('#add-application-btn')
  await page.waitForTimeout(250)
  check('Add application is refused at the plan limit', (await page.locator('#application-modal.open').count()) === 0 && /plan allows up to 4 applications/.test(await toast()), await toast())
  await page.evaluate(() => Store.updateTenantProfile('tp1', { name: 'Default', maxApplications: 50 }))

  // plan limit on ticking (start from a tenant with nothing ticked)
  await page.evaluate(() => Store.setTenantApplicationAccess('t2', ['app0', 'app_ems', 'app_notion', 'app_cms', 'app1'], false))
  await page.evaluate(() => Store.updateTenantProfile('tp1', { name: 'Default', maxApplications: 2 }))
  await openAdmin('t2')
  await page.click('#applications-select-all') // ends up partly ticked (indeterminate), so click rather than check()
  await page.waitForTimeout(250)
  check('plan limit caps a bulk tick at the plan maximum', same((await tenantIds('t2')).sort(), ['app0', 'app_ems']), await tenantIds('t2'))
  check('limit note shown in the toast', /plan allows up to 2 applications/.test(await toast()), await toast())
  await page.click('[data-app-access="app_cms"]') // refused, so it never ends up checked: click rather than check()
  await page.waitForTimeout(250)
  check('ticking another at the limit is refused', same((await tenantIds('t2')).sort(), ['app0', 'app_ems']) && /plan allows up to 2 applications/.test(await toast()), await tenantIds('t2'))
  check('and its checkbox snaps back to unticked', (await page.isChecked('[data-app-access="app_cms"]')) === false)
  check('badge turns red at the limit', await page.$eval('#applications-limit-badge', (e) => e.classList.contains('limit-reached')))
  await page.evaluate(() => Store.updateTenantProfile('tp1', { name: 'Default', maxApplications: 50 }))

  // card view keeps the checkbox reachable
  await reset()
  await openAdmin('t1')
  await page.click('#applications-view-toggle-slot button:nth-child(2), #applications-view-toggle-slot [data-view="widget"]').catch(() => {})
  await page.waitForTimeout(200)
  const cardBoxes = await page.locator('#applications-table-scroll.view-widget [data-app-access]:visible').count()
  if (cardBoxes > 0) {
    check('card view still shows a checkbox per app', cardBoxes === 5, cardBoxes)
  }

  // =========================================================== ENFORCEMENT
  section('tenant-facing app')
  await reset()
  // Northbridge: hide PMS
  await page.evaluate(() => Store.setTenantApplicationAccess('t1', ['app0'], false))

  await signIn('NORTHBRIDGE')
  await goto('applications.html')
  check('scoped sidebar hides PMS', same(await sidebarApps(), ['EMS', 'Custom App', 'CMS', 'Fleet Tracker']), await sidebarApps())
  check('scoped applications list hides PMS', same(await listApps(), ['EMS', 'Custom App', 'CMS', 'Fleet Tracker']), await listApps())
  await goto('application-detail.html#app0')
  check('direct link to a hidden app -> not found', (await page.locator('text=Application not found').count()) === 1 && /isn't enabled for your organization/.test(await page.textContent('#app-detail-root')))
  await goto('application-detail.html#app_ems')
  check('an enabled app still opens', (await page.locator('#app-detail-root h1').count()) === 1 && (await page.locator('text=Application not found').count()) === 0)
  await goto('notion.html#app1')
  check('enabled custom app opens its workspace', (await page.$eval('#app-detail-root h1', (e) => e.childNodes[0].textContent.trim())) === 'Fleet Tracker')

  // The Custom App page that has PMS-bound data blocks must not crash without PMS.
  await goto('notion.html#app_notion')
  const shiftLogTab = page.locator('.notion-page-tabs [data-notion-page]', { hasText: 'Line A shift log' })
  await shiftLogTab.click()
  await page.waitForTimeout(500)
  check('page with data blocks bound to a hidden app renders without errors', errors.length === 0, errors)

  // case-insensitive org id + other tenant + blank + unknown
  await signIn('northbridge')
  await goto('applications.html')
  check('organization id is case-insensitive', same(await listApps(), ['EMS', 'Custom App', 'CMS', 'Fleet Tracker']), await listApps())
  await signIn('CRADLEWELL')
  await goto('applications.html')
  check('another tenant has its own list (no Fleet Tracker)', same(await listApps(), ['PMS', 'EMS', 'Custom App', 'CMS']), await listApps())
  await goto('notion.html#app1')
  check('Fleet Tracker hidden for Cradlewell', (await page.locator('text=Application not found').count()) === 1)
  await signIn('')
  await goto('applications.html')
  check('blank organization id -> plain demo session sees everything', same(await listApps(), ['PMS', 'EMS', 'Custom App', 'CMS', 'Fleet Tracker']), await listApps())
  await signIn('NOSUCHORG')
  await goto('applications.html')
  check('unknown organization id -> plain demo session sees everything', (await listApps()).length === 5, await listApps())

  // filtering is display-only
  await signIn('NORTHBRIDGE')
  await goto('applications.html')
  await page.evaluate(() => Store.toggleApplicationStatus('app_ems'))
  check('writes in a scoped session keep hidden apps in storage', (await page.evaluate(() => Store.allApplications().length)) === 5 && (await page.evaluate(() => Store.get().applications.length)) === 4)
  await openAdmin('t1')
  check('admin table still lists every app while a scoped session exists', (await adminRows()).length === 5 && (await adminRows())[0].name === 'PMS' && (await adminRows())[0].ticked === false, (await adminRows()).map((r) => r.name))

  // creating an app as a tenant grants it
  await goto('applications.html')
  await page.click('#add-btn')
  await page.click('[data-pick-template=""]')
  await page.fill('#app-name', 'Northbridge Custom')
  await page.click('#save-btn')
  await page.waitForTimeout(300)
  const created = await page.evaluate(() => (Store.get().applications.find((a) => a.name === 'Northbridge Custom') || {}).id)
  check('an app the tenant creates is visible to it', !!created && (await listApps()).includes('Northbridge Custom'), await listApps())
  check('and is added to the tenant access list', (await tenantIds('t1')).includes(created))
  check('but not to other tenants', !(await tenantIds('t2')).includes(created))
  // deleting prunes
  await page.evaluate((id) => Store.removeApplication(id), created)
  check('deleting an app removes it from every tenant list', !(await tenantIds('t1')).includes(created))

  // zero apps
  await page.evaluate(() => Store.setTenantApplicationAccess('t1', ['app0', 'app_ems', 'app_notion', 'app_cms', 'app1'], false))
  await goto('applications.html')
  check('tenant with nothing enabled: empty sidebar section', same(await sidebarApps(), []), await sidebarApps())
  check('tenant with nothing enabled: helpful empty state', /No applications are enabled for your organization yet/.test(await page.textContent('#tbody')), await page.textContent('#tbody'))

  // legacy tenant (no saved selection / no org id) keeps everything, org id derived
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    delete raw.tenants[1].applicationIds
    delete raw.tenants[1].organizationId
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
  })
  check('legacy tenant (no saved list) can view every app', (await tenantIds('t2')).length === 5, await tenantIds('t2'))
  check('legacy tenant org id derived from its email', (await page.evaluate(() => Store.tenantOrganizationId('t2'))) === 'CRADLEWELL')
  await signIn('CRADLEWELL')
  await goto('applications.html')
  check('legacy tenant logs in with the derived org id and sees all', (await listApps()).length === 5, await listApps())
  await page.evaluate(() => Store.updateTenant('t2', { title: 'Cradlewell Facilities', email: 'someone@elsewhere.org' }))
  check('editing the email does not change a legacy tenant org id', (await page.evaluate(() => Store.tenantOrganizationId('t2'))) === 'CRADLEWELL')
  await openAdmin('t2')
  check('legacy tenant shows all ticked in the admin table', (await adminRows()).every((r) => r.ticked === true))
  await page.uncheck('[data-app-access="app_cms"]')
  await page.waitForTimeout(200)
  check('first explicit change keeps the rest', same((await tenantIds('t2')).sort(), ['app0', 'app1', 'app_ems', 'app_notion']), await tenantIds('t2'))

  // new tenants
  const t5 = await page.evaluate(() => Store.addTenant({ title: 'Acme Corp', email: 'ops@gmail.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'US', tenantProfileName: 'Default' }))
  const t6 = await page.evaluate(() => Store.addTenant({ title: 'Acme Corp', email: 'x@gmail.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'US', tenantProfileName: 'Default' }))
  check('new tenant gets an organization id from its title', t5.organizationId === 'ACMECORP', t5.organizationId)
  check('organization ids are unique', t6.organizationId === 'ACMECORP2', t6.organizationId)
  check('new tenant starts with the four default apps', same(t5.applicationIds, ['app0', 'app_ems', 'app_notion', 'app_cms']), t5.applicationIds)
  await signIn('ACMECORP')
  await goto('applications.html')
  check('new tenant logs in and sees only the defaults', same(await listApps(), ['PMS', 'EMS', 'Custom App', 'CMS']), await listApps())

  // real login form + logout clears the scope
  section('login form / logout')
  await page.evaluate(() => Store.logout())
  await goto('login.html')
  check('login page has the organization id field', (await page.locator('#organizationId').count()) === 1 && /email/i.test(await page.getAttribute('#username', 'placeholder')))
  await page.fill('#organizationId', 'cradlewell')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'admin')
  await page.click('.login-button')
  await page.waitForURL(/dashboard\.html/, { timeout: 8000 })
  check('logging in through the form scopes the session', (await page.evaluate(() => Store.get().auth.tenantId)) === 't2', await page.evaluate(() => Store.get().auth))
  await page.click('#logout-button')
  await page.waitForURL(/login\.html/)
  check('logout drops the tenant scope', (await page.evaluate(() => Store.get().auth.tenantId || '')) === '' && (await page.evaluate(() => Store.get().auth.loggedIn)) === false)

  // =========================================================== SMOKE
  section('smoke: admin + tenant pages render without JS errors')
  await reset()
  await page.evaluate(() => Store.login('admin', 'admin', 'NORTHBRIDGE'))
  for (const p of ['admin-tenants.html', 'admin-tenant-detail.html#t1', 'admin-tenant-detail.html#t3', 'admin-dashboard.html', 'admin-tenant-profiles.html', 'dashboard.html', 'roles.html', 'device-data.html', 'devices.html']) {
    await goto(p)
    if (p.startsWith('admin-tenant-detail')) for (const tab of ['#tab-users', '#tab-devices', '#tab-assets', '#tab-applications']) await page.click(tab)
  }
  check('no JS errors across pages', errors.length === 0, errors)

})
