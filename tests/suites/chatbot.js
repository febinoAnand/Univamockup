// The floating assistant's tools (shared/chatbot.js), called directly, so no
// API key or network is involved. They must follow the signed-in role, only
// read what they are meant to, keep secrets out of what the model sees, and
// report what really happened.

Tests.suite('chatbot', 'Assistant tools follow the signed-in role', async ({ page, BASE, check, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async (url) => {
    await page.goto('about:blank')
    await page.goto(BASE + (url || 'dashboard.html'))
    await page.waitForFunction(() => typeof chatbotExecuteTool === 'function', null, { timeout: 8000 })
  }
  // Runs a tool the way the assistant would; resolves with what the model is told.
  const tool = (name, input) => page.evaluate((call) => chatbotExecuteTool(call.name, call.input), { name, input })
  const parsed = async (name, input) => {
    const result = await tool(name, input)
    return typeof result === 'string' && result.startsWith('{') ? JSON.parse(result) : result
  }
  const loginAs = (email) => page.evaluate((e) => { Store.logout(); return Store.login(e, '12345', 'NORTHBRIDGE') }, email)

  // ---------------------------------------------------------------- set-up
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => {
    Store.reset()
    Store.login('admin', 'admin')
    Store.addTenantUser('t1', { name: 'Vic Viewer', email: 'vic.viewer@northbridge.com', role: 'Viewer' })
    Store.addTenantUser('t1', { name: 'Mia Member', email: 'mia.member@northbridge.com', role: 'Member' })
  })

  // ------------------------------------------------------ a viewer, read-only
  section('A Viewer')
  await loginAs('vic.viewer@northbridge.com')
  await open()
  const shiftsBefore = await page.evaluate(() => Store.get().shifts.length)
  const devicesBefore = await page.evaluate(() => Store.get().devices.length)
  const viewerRead = await parsed('query_data', { entity: 'devices' })
  check('can look things up', viewerRead.total > 0 && Array.isArray(viewerRead.records), viewerRead.error || viewerRead.total)
  const viewerCreate = await tool('create_shift', { name: 'Viewer shift', startTime: '01:00', endTime: '02:00' })
  check('cannot create a shift', !!viewerCreate.error && (await page.evaluate(() => Store.get().shifts.length)) === shiftsBefore, viewerCreate)
  const viewerGroup = await tool('create_group', { kind: 'userGroup', name: 'Viewer group' })
  check('cannot create a group', !!viewerGroup.error, viewerGroup)
  const viewerStatus = await tool('set_record_status', { entity: 'assets', id: await page.evaluate(() => Store.get().assets[0].id), status: 'suspended' })
  check('cannot change a status', !!viewerStatus.error && (await page.evaluate(() => Store.get().assets[0].status)) === 'operational', viewerStatus)
  const viewerDelete = await tool('delete_record', { entity: 'devices', id: await page.evaluate(() => Store.get().devices[0].id) })
  check('cannot delete, and is not even asked to confirm', !!viewerDelete.error && !(await page.evaluate(() => !!document.getElementById('confirm-dialog-overlay'))) && (await page.evaluate(() => Store.get().devices.length)) === devicesBefore, viewerDelete)
  check('the refusal says why', /role isn't allowed/.test(viewerDelete.error || ''), viewerDelete.error)

  // ------------------------------------------------- what it may read at all
  section('What can be read')
  const unknown = await tool('query_data', { entity: 'applicationRecords' })
  check('an entity outside its list is refused (not any key of the store)', !!unknown.error, unknown)
  const auth = await tool('query_data', { entity: 'auth' })
  check('so is the session itself', !!auth.error, auth)
  const tenants = await tool('query_data', { entity: 'tenants' })
  check('a tenant\'s users cannot read the platform\'s tenant list', !!tenants.error, tenants)
  const tenantStatus = await tool('set_record_status', { entity: 'tenants', id: await page.evaluate(() => Store.get().tenants[0].id), status: 'suspended' })
  check('or change one', !!tenantStatus.error, tenantStatus)

  // ----------------------------------------------------------- secrets
  section('Secrets stay out of what the model sees')
  const hasSecret = await page.evaluate(() => /"[A-Za-z]*[Tt]oken[A-Za-z]*":/.test(JSON.stringify(Store.get().devices)))
  check('(the devices really do carry a token field)', hasSecret)
  const raw = await tool('query_data', { entity: 'devices', limit: 50 })
  check('query_data leaves token fields out', !/"[A-Za-z]*[Tt]oken[A-Za-z]*":/.test(raw), raw.slice(0, 80))
  const probe = await page.evaluate(() => Store.get().devices.find((d) => d.endpointToken || d.tokenValue))
  const secretValue = probe && (probe.tokenValue || probe.endpointToken)
  const guess = await tool('query_data', { entity: 'devices', filter: { tokenValue: secretValue, endpointToken: secretValue } })
  check('filtering on a secret does not narrow the result (it can\'t be used to guess one)', JSON.parse(guess).total === devicesBefore, JSON.parse(guess).total)

  // ----------------------------------------------------- an admin may act
  section('An Admin')
  await loginAs('omar.salim@northbridge.com')
  await open()
  const created = await tool('create_shift', { name: 'Assistant shift', startTime: '01:00', endTime: '02:00' })
  check('can create a shift', /Created shift/.test(created) && (await page.evaluate(() => Store.get().shifts.length)) === shiftsBefore + 1, created)
  const group = await tool('create_group', { kind: 'assetGroup', name: 'Assistant group', description: 'x' })
  check('can create a group', /Created asset group/.test(group), group)
  const assetId = await page.evaluate(() => Store.get().assets[0].id)
  const assetName = await page.evaluate(() => Store.get().assets[0].name)
  check('an asset starts operational', (await page.evaluate(() => Store.get().assets[0].status)) === 'operational')
  const already = await tool('set_record_status', { entity: 'assets', id: assetId, status: 'active' })
  check('asking to activate an operational asset changes nothing', /already operational/.test(already) && (await page.evaluate(() => Store.get().assets[0].status)) === 'operational', already)
  const suspended = await tool('set_record_status', { entity: 'assets', id: assetId, status: 'suspended' })
  check('suspending an asset takes it offline and says so', /is now offline/.test(suspended) && (await page.evaluate(() => Store.get().assets[0].status)) === 'offline', suspended)
  const again = await tool('set_record_status', { entity: 'assets', id: assetId, status: 'suspended' })
  check('suspending it twice does not flip it back', /already offline/.test(again) && (await page.evaluate(() => Store.get().assets[0].status)) === 'offline', again)
  const back = await tool('set_record_status', { entity: 'assets', id: assetId, status: 'active' })
  check('activating it brings it back and says so', /is now operational/.test(back) && (await page.evaluate(() => Store.get().assets[0].status)) === 'operational', back)
  const appId = await page.evaluate(() => Store.get().applications.find((a) => !a.isDefault).id)
  const appStatus = await tool('set_record_status', { entity: 'applications', id: appId, status: 'suspended' })
  check('an application goes active -> suspended as before', /is now suspended/.test(appStatus), appStatus)

  // ----------------------------------------- delete asks, and shows names as text
  section('Delete shows the name as text')
  const payload = `Q'<b class="xss">B</b>&amp;"<img src=x onerror="window.__xss=1">`
  const deviceId = await page.evaluate((name) => Store.addDevice({ name, profileId: Store.get().deviceProfiles[0].id, endpointToken: 'x' }).id, payload)
  await page.evaluate((id) => { window.__deleteResult = null; chatbotExecuteTool('delete_record', { entity: 'devices', id }).then((r) => { window.__deleteResult = r }) }, deviceId)
  await page.waitForTimeout(200)
  const dialog = await page.evaluate(() => {
    const message = document.querySelector('#confirm-dialog-root .confirm-dialog-message')
    return { open: !!message, text: message ? message.innerText : '', ran: window.__xss || 0, injected: document.querySelectorAll('b.xss, img[src="x"]').length }
  })
  check('the confirmation names the record as text', dialog.open && dialog.ran === 0 && dialog.injected === 0 && dialog.text.includes(payload), { ...dialog, text: dialog.text.slice(0, 50) })
  check('nothing is deleted before the user confirms', await page.evaluate((id) => Store.get().devices.some((d) => d.id === id), deviceId))
  await page.click('#confirm-dialog-confirm')
  await page.waitForTimeout(150)
  check('then it is deleted and the model is told', await page.evaluate((id) => !Store.get().devices.some((d) => d.id === id) && /^Deleted/.test(window.__deleteResult), deviceId))

  // ---------------------------------------------------------- the API key
  section('The API key is kept for the tab only')
  await page.evaluate(() => { localStorage.removeItem('univa-chatbot-api-key'); sessionStorage.removeItem('univa-chatbot-api-key'); chatbotSetApiKey('sk-test-123') })
  check('a saved key goes to sessionStorage, not localStorage', await page.evaluate(() => sessionStorage.getItem('univa-chatbot-api-key') === 'sk-test-123' && localStorage.getItem('univa-chatbot-api-key') === null))
  check('and is read back', (await page.evaluate(() => chatbotGetApiKey())) === 'sk-test-123')
  await page.evaluate(() => { sessionStorage.removeItem('univa-chatbot-api-key'); localStorage.setItem('univa-chatbot-api-key', 'sk-old-456') })
  check('a key an earlier version left in localStorage still works', (await page.evaluate(() => chatbotGetApiKey())) === 'sk-old-456')
  check('and is moved out of localStorage', await page.evaluate(() => localStorage.getItem('univa-chatbot-api-key') === null && sessionStorage.getItem('univa-chatbot-api-key') === 'sk-old-456'))
  await page.evaluate(() => chatbotSetApiKey(''))
  check('clearing it clears both', await page.evaluate(() => chatbotGetApiKey() === '' && localStorage.getItem('univa-chatbot-api-key') === null))

  check('no JavaScript errors on any page', errors.length === 0, errors)
})
