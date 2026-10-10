// The list pages and their dialogs, used the way a person uses them: Add, fill in
// the form, search, sort, open a row's menu, edit, suspend, delete (and think
// again). Each page is a little different; what they share is checked on every
// page that has it.

Tests.suite('lists', 'List pages: add, search, edit, suspend, delete', async ({ page, BASE, check, skip, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async (url) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForTimeout(250)
  }
  const signIn = async () => {
    await page.goto(BASE + 'login.html')
    await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  }
  const rows = () => page.$$eval('tbody tr', (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()))
  const hasRow = async (text) => (await rows()).some((r) => r.includes(text))
  const modalOpen = (id) => page.evaluate((m) => document.getElementById(m).classList.contains('open'), id)
  const toast = async () => {
    await page.waitForSelector('.device-toast-message')
    return page.textContent('.device-toast-message')
  }
  // Marks the row that has some text in it, so its own menu can be reached.
  const mark = (text) => page.evaluate((t) => {
    document.querySelectorAll('[data-test-row]').forEach((el) => el.removeAttribute('data-test-row'))
    const row = Array.from(document.querySelectorAll('tbody tr')).find((r) => r.textContent.includes(t))
    if (row) row.setAttribute('data-test-row', '1')
    return Boolean(row)
  }, text)
  const rowMenu = async (rowText, label) => {
    if (!(await mark(rowText))) throw new Error(`no row has "${rowText}" in it`)
    await page.click('[data-test-row] [data-menu-toggle]')
    await page.click(`[data-test-row] .row-menu-item:has-text("${label}")`)
  }
  const menuLabels = async (rowText) => {
    await mark(rowText)
    return page.$$eval('[data-test-row] .row-menu-item', (els) => els.map((el) => el.textContent.trim()))
  }
  const confirmText = () => page.textContent('.confirm-dialog-message')
  const store = (fn, arg) => page.evaluate(fn, arg)

  // ---------------------------------------------------------------------------
  // Pages that share one shape: a name (and more) in a dialog, a menu with Edit
  // and Delete. `fields` are filled in order; `edited` replaces the name.
  const SIMPLE = [
    { url: 'asset-groups.html', what: 'asset group', collection: 'assetGroups', modal: 'group-modal', fields: { '#group-name': 'Cold store', '#group-description': 'Chilled goods' }, renamed: 'Cold storage', nameField: '#group-name', sort: true },
    { url: 'user-groups.html', what: 'user group', collection: 'userGroups', modal: 'group-modal', fields: { '#group-name': 'Auditors', '#group-description': 'Read only' }, renamed: 'External auditors', nameField: '#group-name' },
    { url: 'shift-management.html', what: 'shift', collection: 'shifts', modal: 'shift-modal', fields: { '#shift-name': 'Late shift', '#shift-start': '16:00', '#shift-end': '23:30' }, renamed: 'Later shift', nameField: '#shift-name', suspend: true },
    { url: 'asset-profiles.html', what: 'asset profile', collection: 'assetProfiles', modal: 'profile-modal', fields: { '#profile-name': 'Conveyor', '#profile-description': 'Belt conveyors' }, renamed: 'Roller conveyor', nameField: '#profile-name' },
  ]

  for (const spec of SIMPLE) {
    section(spec.what[0].toUpperCase() + spec.what.slice(1) + 's (' + spec.url + ')')
    await signIn()
    await open(spec.url)
    const name = Object.values(spec.fields)[0]
    const before = await store((c) => Store.get()[c].length, spec.collection)
    check(`the table lists the ${before} existing ones`, (await page.$$eval('tbody tr', (r) => r.length)) === before, before)

    await page.click('#add-btn')
    await page.waitForSelector(`#${spec.modal}.open`)
    check('Add opens an empty dialog', (await page.textContent('#modal-title')).startsWith('Add') && (await page.inputValue(spec.nameField)) === '' && (await page.textContent('#save-btn')) === 'Create')
    await page.click('#save-btn')
    check('an empty name is not accepted: nothing is added and the dialog stays open', (await store((c) => Store.get()[c].length, spec.collection)) === before && (await modalOpen(spec.modal)))

    for (const [selector, value] of Object.entries(spec.fields)) await page.fill(selector, value)
    await page.click('#save-btn')
    await page.waitForSelector(`#${spec.modal}:not(.open)`, { state: 'hidden' })
    const message = await toast()
    check('Create closes the dialog, says so, and lists the new one', !(await modalOpen(spec.modal)) && message.includes(name) && /created/.test(message) && (await hasRow(name)) && (await store((c) => Store.get()[c].length, spec.collection)) === before + 1, message)

    await page.fill('#search', 'zzz-nothing-matches')
    check('searching for something that is not there says so', (await rows()).length === 1 && /No .* match/.test((await rows())[0]), await rows())
    await page.fill('#search', name.toUpperCase())
    check('a search finds it whatever the case', (await rows()).length === 1 && (await hasRow(name)))
    await page.fill('#search', '')
    check('clearing the search brings everything back', (await rows()).length === before + 1)

    if (spec.sort) {
      await page.click('[data-sort="name"]')
      const asc = await page.evaluate(() => { const d = Store.get(); return Array.from(document.querySelectorAll('tbody tr')).map((r) => d.assetGroups.find((g) => r.textContent.trim().startsWith(g.name)).name) })
      const expected = asc.slice().sort((a, b) => a.localeCompare(b))
      await page.click('[data-sort="name"]')
      const desc = await page.evaluate(() => { const d = Store.get(); return Array.from(document.querySelectorAll('tbody tr')).map((r) => d.assetGroups.find((g) => r.textContent.trim().startsWith(g.name)).name) })
      check('clicking a column\'s heading sorts by it, and clicking again reverses it', same(asc, expected) && same(desc, expected.slice().reverse()), { asc, desc })
    }

    await rowMenu(name, 'Edit')
    await page.waitForSelector(`#${spec.modal}.open`)
    check('Edit opens the dialog with its details filled in', (await page.textContent('#modal-title')).startsWith('Edit') && (await page.inputValue(spec.nameField)) === name && (await page.textContent('#save-btn')) === 'Save changes')
    await page.fill(spec.nameField, spec.renamed)
    await page.click('#save-btn')
    await page.waitForSelector(`#${spec.modal}:not(.open)`, { state: 'hidden' })
    check('Save changes renames it in the list and in the data, without adding another', (await hasRow(spec.renamed)) && !(await hasRow(name)) && (await store((c) => Store.get()[c].length, spec.collection)) === before + 1)

    if (spec.suspend) {
      const labels = await menuLabels(spec.renamed)
      await rowMenu(spec.renamed, 'Suspend')
      const afterSuspend = await store(() => Store.get().shifts.find((s) => s.name === 'Later shift').status)
      check('Suspend suspends it, and the menu then offers Activate', afterSuspend === 'suspended' && labels.some((l) => l.includes('Suspend')) && (await menuLabels(spec.renamed)).some((l) => l.includes('Activate')), { labels, afterSuspend })
      await rowMenu(spec.renamed, 'Activate')
      check('Activate makes it active again', (await store(() => Store.get().shifts.find((s) => s.name === 'Later shift').status)) === 'active')
    }

    await rowMenu(spec.renamed, 'Delete')
    await page.waitForSelector('#confirm-dialog-confirm')
    check('Delete asks first, naming it', (await confirmText()).includes(spec.renamed))
    await page.click('#confirm-dialog-cancel')
    check('Cancel keeps it', (await hasRow(spec.renamed)) && (await store((c) => Store.get()[c].length, spec.collection)) === before + 1)
    await rowMenu(spec.renamed, 'Delete')
    await page.waitForSelector('#confirm-dialog-confirm')
    await page.click('#confirm-dialog-confirm')
    check('Delete (confirmed) removes it and says so', !(await hasRow(spec.renamed)) && (await store((c) => Store.get()[c].length, spec.collection)) === before && /deleted|removed/.test(await toast()), await rows())
  }

  // --------------------------------------------------- what is in use stays
  section('Things that are in use cannot be deleted from under their users')
  await signIn()
  await open('asset-groups.html')
  await rowMenu('Vehicles', 'Delete')
  const blocked = await toast()
  check('an asset group that still has assets in it says to move them first, and is not deleted', blocked.includes('Move assets out') && (await hasRow('Vehicles')) && (await store(() => Store.get().assetGroups.some((g) => g.name === 'Vehicles'))), blocked)
  await open('shift-management.html')
  await rowMenu('Morning shift', 'Delete')
  await page.waitForTimeout(300)
  const shiftBlocked = await store(() => ({ stillThere: Store.get().shifts.some((s) => s.name === 'Morning shift'), inUse: Store.shiftInUseBy('sh1') }))
  const shiftMessage = (await page.locator('.device-toast-message').count()) ? await page.textContent('.device-toast-message') : ''
  check('a shift that a schedule uses is not deleted, and the message names the schedules', shiftBlocked.stillThere && shiftBlocked.inUse.length > 0 && shiftMessage.includes(shiftBlocked.inUse[0]), { shiftBlocked, shiftMessage })

  // ------------------------------------------------------------------ users
  section('Users (users.html)')
  await signIn()
  await open('users.html')
  const userRows = await rows()
  check('the four demo users are listed with their role, group and status', userRows.length === 4 && userRows[0].includes('Alicia Ferrer') && userRows[0].includes('Owner') && userRows[0].includes('Administrators') && userRows[0].includes('active') && userRows[3].includes('invited'), userRows)
  await page.click('#add-user-btn')
  await page.waitForSelector('#user-modal.open')
  check('Add opens with the first group ticked, the role Admin and two buttons: Add user and Send invite', (await page.inputValue('#user-role')) === 'Admin' && (await page.isChecked('#user-groups-list input[data-group-name="Administrators"]')) && (await page.locator('#add-user-mode-btn').isVisible()) && (await page.textContent('#user-save-btn')) === 'Send invite')
  await page.fill('#user-name', 'Nia Park')
  await page.fill('#user-email', 'nia@example.test')
  await page.selectOption('#user-role', 'Member')
  await page.uncheck('#user-groups-list input[data-group-name="Administrators"]')
  await page.check('#user-groups-list input[data-group-name="Operators"]')
  await page.fill('#user-groups-search', 'view')
  const filtered = await page.$$eval('#user-groups-list .modal-checkbox', (els) => els.filter((el) => el.style.display !== 'none').map((el) => el.textContent.trim()))
  check('the group list can be searched', same(filtered, ['Viewers']), filtered)
  await page.fill('#user-groups-search', 'nothing like this')
  check('and says so when nothing matches', (await page.textContent('#user-groups-list .checklist-no-match')) === 'No matches found.')
  await page.fill('#user-groups-search', '')
  await page.click('#user-save-btn')
  await page.waitForSelector('#user-modal:not(.open)', { state: 'hidden' })
  const invited = await store(() => Store.get().users.find((u) => u.email === 'nia@example.test'))
  check('"Send invite" adds the user as invited, with the role and the group chosen', invited && invited.status === 'invited' && invited.role === 'Member' && same(invited.groupNames, ['Operators']), invited)
  check('and says an invite was sent', (await toast()).includes('Invite sent to "nia@example.test"'))

  await page.click('#add-user-btn')
  await page.waitForSelector('#user-modal.open')
  await page.fill('#user-name', 'Raj Rao')
  await page.fill('#user-email', 'raj@example.test')
  await page.click('#add-user-mode-btn')
  await page.waitForSelector('#user-modal:not(.open)', { state: 'hidden' })
  const added = await store(() => Store.get().users.find((u) => u.email === 'raj@example.test'))
  check('"Add user" adds them as active straight away', added && added.status === 'active', added)

  await page.fill('#user-search', 'RAJ@')
  check('a search matches the email as well as the name', (await rows()).length === 1 && (await hasRow('Raj Rao')))
  await page.fill('#user-search', 'park')
  check('and the name, in any case', (await rows()).length === 1 && (await hasRow('Nia Park')))
  await page.fill('#user-search', '')

  const inviteMenu = await menuLabels('Nia Park')
  const activeMenu = await menuLabels('Raj Rao')
  check('an invited user\'s menu offers Resend invite; an active one\'s does not; both offer Suspend or Activate, Edit and Remove', inviteMenu[0] === 'Resend invite' && !activeMenu.includes('Resend invite') && inviteMenu.includes('Activate') && activeMenu.includes('Suspend') && activeMenu.includes('Edit') && activeMenu.includes('Remove'), { inviteMenu, activeMenu })
  await rowMenu('Nia Park', 'Resend invite')
  check('Resend invite says it was sent', (await toast()).includes('Invite resent to "nia@example.test"'))

  await rowMenu('Raj Rao', 'Suspend')
  check('Suspend suspends the user', (await store(() => Store.get().users.find((u) => u.email === 'raj@example.test').status)) === 'suspended' && (await hasRow('suspended')))
  await rowMenu('Raj Rao', 'Activate')
  check('Activate brings them back', (await store(() => Store.get().users.find((u) => u.email === 'raj@example.test').status)) === 'active')

  await rowMenu('Raj Rao', 'Edit')
  await page.waitForSelector('#user-modal.open')
  check('Edit shows the user\'s details and only the Save button', (await page.inputValue('#user-name')) === 'Raj Rao' && (await page.inputValue('#user-email')) === 'raj@example.test' && (await page.textContent('#user-save-btn')) === 'Save changes' && !(await page.locator('#add-user-mode-btn').isVisible()))
  await page.fill('#user-name', 'Raj R. Rao')
  await page.selectOption('#user-role', 'Admin')
  await page.click('#user-save-btn')
  await page.waitForSelector('#user-modal:not(.open)', { state: 'hidden' })
  check('Save changes updates the user', (await store(() => { const u = Store.get().users.find((x) => x.email === 'raj@example.test'); return [u.name, u.role] })).join() === 'Raj R. Rao,Admin')

  await rowMenu('Raj R. Rao', 'Remove')
  await page.waitForSelector('#confirm-dialog-confirm')
  check('Remove asks first, naming the user', (await confirmText()).includes('Raj R. Rao'))
  await page.click('#confirm-dialog-confirm')
  check('and then removes them', !(await hasRow('Raj R. Rao')) && (await rows()).length === 5)

  // ----------------------------------------------------------------- assets
  section('Assets (assets.html)')
  await signIn()
  await open('assets.html')
  const assetBefore = await store(() => Store.get().assets.length)
  await page.click('#add-btn')
  await page.waitForSelector('#asset-modal.open')
  await page.fill('#asset-name', 'Bench press')
  await page.fill('#asset-location', 'Bay 4')
  await page.check('#asset-groups-list input[type="checkbox"]')
  await page.click('#save-btn')
  await page.waitForSelector('#asset-modal:not(.open)', { state: 'hidden' })
  const asset = await store(() => Store.get().assets.find((a) => a.name === 'Bench press'))
  check('adding an asset stores its name, location and the group that was ticked, and it starts operational', asset && asset.location === 'Bay 4' && asset.groupNames.length === 1 && asset.status === 'operational' && (await store(() => Store.get().assets.length)) === assetBefore + 1, asset)
  check('it appears in the table with its location and group', await (async () => { const r = (await rows()).find((x) => x.includes('Bench press')); return Boolean(r) && r.includes('Bay 4') && r.includes(asset.groupNames[0]) })(), await rows())
  await rowMenu('Bench press', 'Edit')
  await page.waitForSelector('#asset-modal.open')
  check('Edit shows what was entered', (await page.inputValue('#asset-name')) === 'Bench press' && (await page.inputValue('#asset-location')) === 'Bay 4')
  await page.fill('#asset-location', 'Bay 5')
  await page.click('#save-btn')
  await page.waitForSelector('#asset-modal:not(.open)', { state: 'hidden' })
  check('and saves a change', (await store(() => Store.get().assets.find((a) => a.name === 'Bench press').location)) === 'Bay 5')
  const toggleLabels = await menuLabels('Bench press')
  await rowMenu('Bench press', 'Mark offline')
  const toggled = await store(() => Store.get().assets.find((a) => a.name === 'Bench press').status)
  check('the first item in the menu switches an operational asset to offline', toggled === 'offline' && toggleLabels[0] === 'Mark offline', { toggleLabels, toggled })
  check('and then offers to mark it operational again', (await menuLabels('Bench press'))[0] === 'Mark operational')
  await rowMenu('Bench press', 'Delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  await page.click('#confirm-dialog-confirm')
  check('an asset is deleted after confirming', !(await hasRow('Bench press')) && (await store(() => Store.get().assets.length)) === assetBefore)

  // ------------------------------------------------------------ rule engines
  section('Rule engines (rule-engines.html)')
  await signIn()
  await open('rule-engines.html')
  const ruleRows = await rows()
  check('the demo rule engines are listed', ruleRows.length === 5 && ruleRows.some((r) => r.includes('High temperature alert')), ruleRows)
  const ruleLabels = await menuLabels('Device offline notice')
  check('a suspended rule\'s menu offers Enable', ruleLabels[0] === 'Enable', ruleLabels)
  await rowMenu('Device offline notice', 'Enable')
  check('Enable switches it on', (await store(() => Store.get().ruleEngines.find((r) => r.name === 'Device offline notice').status)) === 'active')
  await rowMenu('Device offline notice', 'Disable')
  check('Disable switches it off again', (await store(() => Store.get().ruleEngines.find((r) => r.name === 'Device offline notice').status)) === 'suspended')
  await rowMenu('Environmental combo alert', 'Edit')
  await page.waitForSelector('#engine-modal.open')
  check('Edit shows the rule\'s name, description and its conditions', (await page.inputValue('#engine-name')) === 'Environmental combo alert' && (await page.$$eval('#condition-rows > *', (els) => els.length)) === 2)
  await page.fill('#engine-name', 'Environmental alert')
  await page.click('#save-btn')
  await page.waitForSelector('#engine-modal:not(.open)', { state: 'hidden' })
  check('Save changes renames it and keeps its two conditions', await store(() => { const r = Store.get().ruleEngines.find((x) => x.name === 'Environmental alert'); return Boolean(r) && r.conditions.length === 2 && r.conditionLogic === 'OR' }))
  await rowMenu('Environmental alert', 'Delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  await page.click('#confirm-dialog-confirm')
  check('Delete removes it', !(await hasRow('Environmental alert')) && (await rows()).length === 4)

  // ---------------------------------------------------------------- tenants
  section('Tenants (admin-tenants.html)')
  await signIn()
  await open('admin-tenants.html')
  await page.waitForSelector('tbody tr')
  const tenantsBefore = await store(() => Store.get().tenants.length)
  await page.click('#add-btn')
  await page.waitForSelector('#tenant-modal.open')
  await page.fill('#t-title', 'Zenith Foods')
  await page.fill('#t-email', 'ops@zenith.test')
  await page.click('#save-btn')
  await page.waitForSelector('#tenant-modal:not(.open)', { state: 'hidden' })
  const tenant = await store(() => Store.get().tenants.find((t) => t.title === 'Zenith Foods'))
  check('a new tenant is stored with an Organization ID made from its title, and is active', tenant && tenant.organizationId === 'ZENITHFOODS' && tenant.status === 'active' && (await store(() => Store.get().tenants.length)) === tenantsBefore + 1, tenant)
  check('it is in the table', await hasRow('Zenith Foods'))
  await rowMenu('Zenith Foods', 'Suspend')
  check('Suspend suspends the tenant', (await store(() => Store.get().tenants.find((t) => t.title === 'Zenith Foods').status)) === 'suspended')
  await rowMenu('Zenith Foods', 'Activate')
  check('Activate brings it back', (await store(() => Store.get().tenants.find((t) => t.title === 'Zenith Foods').status)) === 'active')
  await rowMenu('Zenith Foods', 'Edit')
  await page.waitForSelector('#tenant-modal.open')
  await page.fill('#t-title', 'Zenith Foods Ltd')
  await page.click('#save-btn')
  await page.waitForSelector('#tenant-modal:not(.open)', { state: 'hidden' })
  check('renaming a tenant keeps its Organization ID, which is the login key', (await store(() => { const t = Store.get().tenants.find((x) => x.title === 'Zenith Foods Ltd'); return t && t.organizationId })) === 'ZENITHFOODS')
  await rowMenu('Zenith Foods Ltd', 'Delete')
  await page.waitForSelector('#confirm-dialog-confirm')
  await page.click('#confirm-dialog-confirm')
  check('Delete removes it', !(await hasRow('Zenith Foods')) && (await store(() => Store.get().tenants.length)) === tenantsBefore)

  check('no JavaScript errors on any of these pages', errors.length === 0, Array.from(new Set(errors)).slice(0, 5))
})
