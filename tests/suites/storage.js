// How the app treats its browser storage (shared/store.js): reading cheaply,
// not serving stale permissions, saying so when a save fails, keeping a copy of
// data it can't read, and cleaning up after a storage-key bump.

Tests.suite('storage', 'Browser storage: speed, failures, clean-up', async ({ page, BASE, check, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async (url) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForTimeout(300)
  }
  const signIn = async () => {
    await page.goto(BASE + 'login.html')
    await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  }

  // ------------------------------------------------------------------ speed
  section('Reading the data')
  await signIn()
  await open('dashboard.html')
  const parses = await page.evaluate(() => {
    let count = 0
    const original = JSON.parse
    JSON.parse = function () { count++; return original.apply(this, arguments) }
    try { Layout.setActive('dashboard') } finally { JSON.parse = original }
    return count
  })
  check('drawing the sidebar (dozens of permission checks) parses the stored data only a few times', parses <= 4, parses)
  const permissionParses = await page.evaluate(() => {
    let count = 0
    const original = JSON.parse
    JSON.parse = function () { count++; return original.apply(this, arguments) }
    try { for (let i = 0; i < 200; i++) Store.hasPermission('devices', 'view') } finally { JSON.parse = original }
    return count
  })
  check('200 permission checks in a row parse nothing', permissionParses === 0, permissionParses)

  section('Permission checks never go stale')
  const flips = await page.evaluate(() => {
    const out = {}
    Store.logout()
    out.loggedOut = Store.isLoggedIn()
    Store.login('admin', 'admin')
    out.loggedIn = Store.isLoggedIn()
    Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE')
    const role = Store.get().auth.role
    out.role = role
    out.viewBefore = Store.hasPermission('devices', 'delete')
    Store.setRolePermissions(role, { devices: { view: true, create: false, edit: false, delete: false, fields: {} } })
    out.viewAfter = Store.hasPermission('devices', 'delete')
    out.viewStill = Store.hasPermission('devices', 'view')
    return out
  })
  check('logging out is seen at once', flips.loggedOut === false && flips.loggedIn === true, flips)
  check('so is a change to a role\'s permissions', flips.viewBefore === true && flips.viewAfter === false && flips.viewStill === true, flips)

  section('Data saved before a seed key existed')
  const refilled = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const seedCount = raw.shiftSchedules.length
    delete raw.shiftSchedules
    delete raw.backupSettings
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const data = Store.get()
    return { seedCount, schedules: data.shiftSchedules.length, settings: data.backupSettings }
  })
  check('a key missing from the saved data is filled in from the seed', refilled.seedCount > 0 && refilled.schedules === refilled.seedCount && same(refilled.settings, {}), refilled)

  // ---------------------------------------------------------------- failures
  section('A save that fails')
  await signIn()
  await open('asset-groups.html')
  const failed = await page.evaluate(() => {
    const before = Store.get().assetGroups.length
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError') }
    let outcome = 'no error'
    try { Store.addAssetGroup({ name: 'Will not fit', description: '' }) } catch (err) { outcome = err.name }
    Storage.prototype.setItem = original
    const toast = document.getElementById('toast-root')
    return { before, after: Store.get().assetGroups.length, outcome, toast: toast ? toast.innerText : '' }
  })
  check('the caller is stopped (so no success message follows)', failed.outcome === 'QuotaExceededError', failed.outcome)
  check('nothing was half-saved', failed.after === failed.before, failed)
  check('and the user is told why', /Couldn't save your changes/.test(failed.toast) && /storage is full/.test(failed.toast), failed.toast)
  const recovered = await page.evaluate(() => { Store.addAssetGroup({ name: 'Fits now', description: '' }); return Store.get().assetGroups.some((g) => g.name === 'Fits now') })
  check('saving works again once there is room', recovered)

  // ------------------------------------------------------------ unreadable data
  section('Data that can\'t be read')
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, '{this is not json') })
  await open('login.html')
  const corrupt = await page.evaluate(() => ({
    works: Store.isLoggedIn() === false && Store.get().devices.length > 0,
    copy: localStorage.getItem(STORAGE_KEY + '-corrupt'),
  }))
  check('the app starts from the seed instead of breaking', corrupt.works, corrupt)
  check('the unreadable text is kept under a "-corrupt" key', corrupt.copy === '{this is not json', corrupt.copy)
  const afterSave = await page.evaluate(() => {
    Store.login('admin', 'admin') // a real save
    const saved = localStorage.getItem(STORAGE_KEY)
    let valid = true
    try { JSON.parse(saved) } catch (err) { valid = false }
    // the data goes bad again later: the first copy kept must not be overwritten
    localStorage.setItem(STORAGE_KEY, '{a second broken one')
    Store.get()
    return { valid, copy: localStorage.getItem(STORAGE_KEY + '-corrupt') }
  })
  check('the next save replaces the broken data with good data', afterSave.valid, afterSave)
  check('a later broken copy does not overwrite the first one kept', afterSave.copy === '{this is not json', afterSave.copy)

  // ------------------------------------------------------------- old versions
  section('After a storage-key bump')
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => {
    localStorage.clear()
    ;['univa-html-demo-v3', 'univa-html-demo-v25', STORAGE_KEY, 'univa-html-demo-v999', STORAGE_KEY + '-corrupt', 'univa-html-backups-v1', 'univa_dashboard_layout_v1', 'univa-chatbot-history']
      .forEach((key) => localStorage.setItem(key, '[]'))
  })
  await open('login.html')
  const kept = await page.evaluate(() => Object.keys(localStorage).sort())
  const currentKey = await page.evaluate(() => STORAGE_KEY)
  check('older versions\' data is removed', !kept.includes('univa-html-demo-v3') && !kept.includes('univa-html-demo-v25'), kept)
  check('the current data is kept', kept.includes(currentKey))
  check('a newer version\'s data is left alone (an older copy of the site may be open)', kept.includes('univa-html-demo-v999'))
  check('backups, layouts and everything else are untouched', [currentKey + '-corrupt', 'univa-html-backups-v1', 'univa_dashboard_layout_v1', 'univa-chatbot-history'].every((key) => kept.includes(key)), kept)

  // -------------------------------------------------------------- backups
  section('Removing backups')
  await signIn()
  const writes = await page.evaluate(() => {
    for (let i = 0; i < 6; i++) Store.addBackup({ createdBy: 'test', trigger: 'manual', pages: [], sizeBytes: 1, data: {} })
    const ids = Store.listBackups().slice(0, 3).map((b) => b.id)
    let count = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key) { if (key === 'univa-html-backups-v1') count++; return original.apply(this, arguments) }
    try { Store.removeBackups(ids) } finally { Storage.prototype.setItem = original }
    return { count, left: Store.listBackups().length, goneOk: Store.listBackups().every((b) => !ids.includes(b.id)) }
  })
  check('three backups are removed with one write, not three', writes.count === 1 && writes.left === 3 && writes.goneOk, writes)
  await page.evaluate(() => {
    Store.reset(); Store.login('admin', 'admin')
    Store.setBackupSettings({ auto: false, frequency: 'daily', keep: 3, excluded: [] })
    for (let i = 0; i < 5; i++) Store.addBackup({ createdBy: 'test', trigger: 'manual', pages: [], sizeBytes: 1, data: {} })
  })
  await open('settings.html')
  await page.evaluate(() => {
    window.__backupWrites = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key) { if (key === 'univa-html-backups-v1') window.__backupWrites++; return original.apply(this, arguments) }
  })
  await page.click('#bk-take')
  await page.waitForTimeout(250)
  const pruned = await page.evaluate(() => ({ writes: window.__backupWrites, kept: Store.listBackups().length }))
  check('taking a backup that trims the oldest ones writes the list twice at most (add + one trim)', pruned.writes <= 2 && pruned.kept === 3, pruned)

  check('no JavaScript errors on any page', errors.length === 0, errors)
})
