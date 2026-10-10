// End-to-end check: non-default apps open the Custom App page workspace.

Tests.suite('routing', 'Application pages and routing', async ({ page, BASE, check, skip, section, same, artifact, sleep }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push('console.error: ' + m.text())
  })
  // Fonts are irrelevant here and slow to fail offline.

  const goto = async (p) => { await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(400) }
  const sidebar = () => page.$$eval('.sidebar-child-link', (as) => as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href'), active: a.classList.contains('active') })))
  const h1 = () => page.$eval('#app-detail-root h1', (e) => e.childNodes[0].textContent.trim()).catch(() => null)
  const tabs = () => page.$$eval('.notion-page-tabs .notion-page-title', (els) => els.map((e) => e.textContent.trim())).catch(() => [])
  const crumb = () => page.$eval('.breadcrumb-current', (e) => e.textContent.trim()).catch(() => null)
  const storePages = (appId) => page.evaluate((id) => Store.notionPagesFor(id).map((p) => p.title), appId)

  // ---- login (demo account) then fresh seed data
  await goto('login.html')
  await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })

  // ================= 1. Routing on the Applications list + sidebar
  await goto('applications.html')
  const rows = await page.$$eval('#tbody tr', (trs) => trs.map((tr) => ({ name: tr.querySelector('.group-name-cell span').childNodes[0].textContent.trim(), open: tr.getAttribute('data-open'), isDefault: !!tr.querySelector('.default-profile-badge') })))
  const rowMap = Object.fromEntries(rows.map((r) => [r.name, r.open]))
  check('PMS (default) keeps application-detail', rowMap['PMS'] === 'application-detail.html#app0')
  check('EMS (default) keeps application-detail', rowMap['EMS'] === 'application-detail.html#app_ems')
  check('CMS (default) keeps application-detail', rowMap['CMS'] === 'application-detail.html#app_cms')
  check('Custom App opens notion.html', rowMap['Custom App'] === 'notion.html#app_notion')
  check('Fleet Tracker -> workspace', rowMap['Fleet Tracker'] === 'notion.html#app1')
  const sb = Object.fromEntries((await sidebar()).map((s) => [s.text, s.href]))
  check('sidebar matches list routing', sb['Fleet Tracker'] === 'notion.html#app1' && sb['PMS'] === 'application-detail.html#app0' && sb['EMS'] === 'application-detail.html#app_ems' && sb['CMS'] === 'application-detail.html#app_cms' && sb['Custom App'] === 'notion.html#app_notion', sb)

  // ================= 2. Click a non-default app from the list
  await page.click('tr[data-open="notion.html#app1"] td.card-title-cell')
  await page.waitForURL(/notion\.html#app1$/)
  await page.waitForSelector('#app-detail-root h1')
  check('Fleet Tracker workspace header', (await h1()) === 'Fleet Tracker', await h1())
  check('no Default badge on non-default app', (await page.$('#app-detail-root h1 .default-profile-badge')) === null)
  check('document title follows the app', (await page.title()) === 'Fleet Tracker — Univa', await page.title())
  check('breadcrumb follows the app', (await crumb()) === 'Fleet Tracker', await crumb())
  check('sidebar highlights Fleet Tracker', (await sidebar()).filter((s) => s.active).map((s) => s.text).join() === 'Fleet Tracker', (await sidebar()).filter((s) => s.active))
  check('Fleet Tracker starts with no pages (does not inherit Custom App pages)', (await tabs()).length === 0, await tabs())
  check('empty-state text shown', (await page.locator('text=No pages yet').count()) === 1)
  check('Manage link present', (await page.locator('a:has-text("Manage")').getAttribute('href')) === 'application-detail.html#app1')

  // ================= 3. Create a page in Fleet Tracker
  await page.click('#notion-new-page-btn')
  await page.waitForTimeout(200)
  await page.fill('#notion-title-input', 'Fleet notes')
  await page.waitForTimeout(200)
  check('new page shows as a tab in Fleet Tracker', JSON.stringify(await tabs()) === JSON.stringify(['Fleet notes']), await tabs())
  check('page stored against app1', JSON.stringify(await storePages('app1')) === JSON.stringify(['Fleet notes']), await storePages('app1'))
  check('Custom App pages untouched', JSON.stringify(await storePages('app_notion')) === JSON.stringify(['Getting started', 'Line A shift log', 'Meeting notes']), await storePages('app_notion'))

  // Add a block to the page, including a live data block (defaults to a template app).
  await page.click('[data-notion-add-block="heading"]')
  await page.waitForTimeout(200)
  await page.click('[data-notion-add-block="data-cards"]')
  await page.waitForTimeout(400)
  check('data-cards block added to a non-template app page', (await page.locator('.nd-app-pill').count()) >= 1, await page.locator('.nd-app-pill').first().textContent().catch(() => null))

  // ================= 4. Switch apps via the sidebar (same document -> hashchange)
  await page.click('a.sidebar-child-link[href="notion.html#app_notion"]')
  await page.waitForFunction(() => document.querySelector('#app-detail-root h1') && document.querySelector('#app-detail-root h1').childNodes[0].textContent.trim() === 'Custom App')
  check('sidebar click switches to Custom App w/o reload', (await h1()) === 'Custom App', await h1())
  check('Custom App shows its 3 pages only', JSON.stringify(await tabs()) === JSON.stringify(['Getting started', 'Line A shift log', 'Meeting notes']), await tabs())
  check('Custom App keeps Default badge', (await page.$('#app-detail-root h1 .default-profile-badge')) !== null)
  check('title/breadcrumb/sidebar updated on switch', (await page.title()) === 'Custom App — Univa' && (await crumb()) === 'Custom App' && (await sidebar()).filter((s) => s.active).map((s) => s.text).join() === 'Custom App', { title: await page.title(), crumb: await crumb() })


  await page.click('a.sidebar-child-link[href="notion.html#app1"]')
  await page.waitForFunction(() => document.querySelector('#app-detail-root h1') && document.querySelector('#app-detail-root h1').childNodes[0].textContent.trim() === 'Fleet Tracker')
  check('switch back to Fleet Tracker: page + blocks persisted', JSON.stringify(await tabs()) === JSON.stringify(['Fleet notes']) && (await page.locator('.notion-block').count()) >= 2, { tabs: await tabs(), blocks: await page.locator('.notion-block').count() })

  // ================= 5. Sidebar -> a default app leaves the workspace normally
  await page.click('a.sidebar-child-link[href="application-detail.html#app0"]')
  await page.waitForURL(/application-detail\.html#app0$/)
  await page.waitForSelector('#app-detail-root h1')
  check('PMS still opens its template screen', (await page.locator('#app-runtime-host').count()) === 1)
  await page.click('a.sidebar-child-link[href="notion.html#app1"]')
  await page.waitForURL(/notion\.html#app1$/)
  await page.waitForSelector('#app-detail-root h1')
  check('workspace reachable from a default app page', (await h1()) === 'Fleet Tracker', await h1())

  // ================= 6. Manage page + delete removes the app's pages
  await page.click('a:has-text("Manage")')
  await page.waitForURL(/application-detail\.html#app1$/)
  await page.waitForSelector('#delete-app-btn')
  check('Manage shows generic detail view w/ Delete for non-default app', (await page.locator('.detail-tabs').count()) === 1 && (await page.locator('#delete-app-btn').count()) === 1)
  await page.click('#delete-app-btn')
  await page.click('#confirm-dialog-confirm')
  await page.waitForURL(/applications\.html$/)
  check('deleting an app removes its pages', JSON.stringify(await storePages('app1')) === '[]' && (await page.evaluate(() => Store.get().notionPages.every((p) => p.appId !== 'app1'))))
  check('other apps pages intact after delete', JSON.stringify(await storePages('app_notion')) === JSON.stringify(['Getting started', 'Line A shift log', 'Meeting notes']))

  // ================= 7. Custom dashboard checkbox is gone; creating/editing through the modal still works
  await goto('applications.html')
  check('checkbox markup absent from the page', (await page.locator('#app-custom-dashboard').count()) === 0 && (await page.locator('text=Custom dashboard').count()) === 0)
  await page.click('#add-btn')
  await page.click('[data-pick-template=""]')
  await page.waitForSelector('#app-modal.open, #app-modal[class*="open"]')
  check('Add modal has no custom dashboard option', (await page.locator('#app-modal #app-custom-dashboard').count()) === 0 && (await page.locator('#app-modal').innerText()).toLowerCase().includes('custom dashboard') === false)
  await page.fill('#app-name', 'Blank via modal')
  await page.fill('#app-description', 'made in the modal')
  await page.click('#save-btn')
  await page.waitForTimeout(300)
  const rows2a = Object.fromEntries((await page.$$eval('#tbody tr', (trs) => trs.map((tr) => [tr.querySelector('.group-name-cell span').childNodes[0].textContent.trim(), tr.getAttribute('data-open')]))))
  const modalId = await page.evaluate(() => Store.get().applications.find((a) => a.name === 'Blank via modal').id)
  check('app created via modal -> workspace', rows2a['Blank via modal'] === `notion.html#${modalId}`, rows2a['Blank via modal'])
  // Edit modal
  await page.evaluate((id) => openEdit(id), modalId)
  await page.waitForSelector('#app-modal.open, #app-modal[class*="open"]')
  check('Edit modal has no custom dashboard option', (await page.locator('#app-custom-dashboard').count()) === 0)
  await page.fill('#app-name', 'Blank renamed')
  await page.click('#save-btn')
  await page.waitForTimeout(300)
  check('edit via modal saves', (await page.evaluate((id) => Store.get().applications.find((a) => a.id === id).name, modalId)) === 'Blank renamed')
  await page.goto(BASE + 'notion.html#' + modalId, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app-detail-root h1')
  check('modal-created app opens as a workspace', (await h1()) === 'Blank renamed' && (await page.locator('#notion-new-page-btn').count()) === 1, await h1())

  // ================= 7b. Apps created programmatically / legacy data
  const ids = await page.evaluate(() => {
    const blank = Store.addApplication({ name: 'Blank one', description: '', icon: 'app' })
    // an app saved back when the checkbox existed
    const legacy = Store.addApplication({ name: 'Legacy dash', description: '', icon: 'app', hasCustomDashboard: true })
    const tpl = Store.addApplicationFromTemplate({ name: 'Tpl one', templateKey: 'production-monitoring', icon: 'factory', bindings: { assetGroup: 'Production line A', assetIds: [], shiftScheduleId: 'ss3', keyMap: {} }, settings: {} })
    return { blank: blank.id, legacy: legacy.id, tpl: tpl.id }
  })
  await goto('applications.html')
  const rows2 = Object.fromEntries((await page.$$eval('#tbody tr', (trs) => trs.map((tr) => [tr.querySelector('.group-name-cell span').childNodes[0].textContent.trim(), tr.getAttribute('data-open')]))))
  check('new blank app -> workspace', rows2['Blank one'] === `notion.html#${ids.blank}`, rows2['Blank one'])
  check('legacy hasCustomDashboard app -> workspace like any other', rows2['Legacy dash'] === `notion.html#${ids.legacy}`, rows2['Legacy dash'])
  check('new template app keeps its template view', rows2['Tpl one'] === `application-detail.html#${ids.tpl}`, rows2['Tpl one'])
  await goto('application-detail.html#' + ids.legacy)
  await page.waitForTimeout(800)
  check('Manage page of a legacy flagged app still renders its dashboard (no crash)', (await page.locator('#app-detail-root h1').count()) >= 1 && (await page.locator('#dashboard-canvas').count()) === 1)
  await goto('application-detail.html#' + ids.tpl)
  check('template app detail still renders its runtime', (await page.locator('#app-runtime-host').count()) === 1)

  // ================= 8. Legacy stored data (pages saved before appId existed)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('univa-html-demo-v26'))
    raw.notionPages.forEach((p) => { delete p.appId })
    localStorage.setItem('univa-html-demo-v26', JSON.stringify(raw))
  })
  await goto('notion.html#app_notion')
  check('legacy pages (no appId) still belong to Custom App', JSON.stringify(await tabs()) === JSON.stringify(['Getting started', 'Line A shift log', 'Meeting notes']), await tabs())
  const otherId = await page.evaluate(() => { const a = Store.get().applications.find((x) => !x.isDefault); return a ? a.id : null })
  check('a non-default app exists for the legacy-leak check', Boolean(otherId), otherId)
  await goto('notion.html#' + otherId)
  check('legacy pages do not leak into other apps', (await tabs()).length === 0, await tabs())

  // ================= 9. Unknown app id
  await goto('notion.html#nope')
  check('unknown app id shows not-found', (await page.locator('text=Application not found').count()) === 1)

  check('no JavaScript errors on any page', errors.length === 0, errors)
})
