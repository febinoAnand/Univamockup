// Names typed by a user must be shown as text, never run as HTML.
//
// Every kind of record is created with a name that contains markup (a <b> tag
// and an <img onerror> that would set window.__xss), quotes and an ampersand.
// Each page is then loaded and checked two ways:
//   - nothing was injected: no <b class="xss">, no <img src="x">, __xss unset
//   - the name is shown exactly as typed (so it isn't escaped twice either)

// What goes into a name. The tag after it tells the records apart.
const PAYLOAD = `Q'<b class="xss">B</b>&amp;"<img src=x onerror="window.__xss=1">`
const named = (tag) => PAYLOAD + '#' + tag

Tests.suite('security', 'Names are shown as text, not markup', async ({ page, BASE, check, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const visit = async (url) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForTimeout(350)
  }
  // Loads a page and checks what the payload did there. `expected` are names
  // that must be visible, exactly as typed.
  const inspect = async (url, expected) => {
    await visit(url)
    const r = await page.evaluate((names) => ({
      ran: window.__xss || 0,
      injected: document.querySelectorAll('b.xss, img[src="x"]').length,
      missing: names.filter((n) => !document.body.innerText.includes(n)).map((n) => n.slice(-8)),
    }), expected || [])
    check(`${url}: names are text, not markup`, r.ran === 0 && r.injected === 0, r)
    if (expected && expected.length) check(`${url}: shows ${expected.length === 1 ? 'the name' : 'the names'} exactly as typed`, r.missing.length === 0, r.missing)
  }

  // ---------------------------------------------------------------- records
  await page.goto(BASE + 'login.html')
  const ids = await page.evaluate((payload) => {
    Store.reset()
    Store.login('admin', 'admin')
    const n = (tag) => payload + '#' + tag
    const made = {}
    const make = (key, fn) => { try { made[key] = fn().id } catch (err) { made[key] = 'ERROR ' + err.message } }
    make('device', () => Store.addDevice({ name: n('dev'), profileId: Store.get().deviceProfiles[0].id, endpointToken: 'x' }))
    make('profile', () => Store.addDeviceProfile({ name: n('prof'), description: n('profdesc') }))
    make('app', () => Store.addApplication({ name: n('app'), description: n('appdesc') }))
    make('asset', () => Store.addAsset({ name: n('asset'), location: n('assetloc'), profileName: Store.get().assetProfiles[0].name }))
    make('group', () => Store.addAssetGroup({ name: n('ag'), description: n('agdesc') }))
    make('assetProfile', () => Store.addAssetProfile({ name: n('ap'), category: n('apcat'), description: n('apdesc') }))
    make('rule', () => Store.addRuleEngine({ name: n('rule'), description: n('ruledesc'), triggerType: 'threshold', scope: 'all', conditions: [], actionType: 'notify', actionDetail: '' }))
    make('user', () => Store.addUser({ name: n('user'), email: 'probe@example.com', role: 'Member', groupNames: [] }))
    make('userGroup', () => Store.addUserGroup({ name: n('ug'), description: n('ugdesc') }))
    make('shift', () => Store.addShift({ name: n('shift'), startTime: '06:00', endTime: '14:00' }))
    make('schedule', () => Store.addShiftSchedule({ name: n('sched'), description: n('scheddesc') }))
    make('tenant', () => Store.addTenant({ title: n('tenant'), email: 'probe@probe.example', tenantProfileName: 'Default' }))
    make('page', () => Store.addNotionPage({ appId: made.app, title: n('page') }))
    // Records that show up inside other pages' tabs and tables.
    make('meter', () => Store.addEmsMeter({ name: n('meter'), meterId: n('mid'), location: n('mloc'), model: n('mmodel'), unit: 'Peak Timing' }))
    make('machine', () => Store.addCmsMachine({ machineId: n('mach'), deviceId: Store.get().devices[0].id, name: n('machname'), manufacturer: n('mfr'), model: n('mdl'), line: n('line') }))
    make('tenantUser', () => Store.addTenantUser(made.tenant, { name: n('tuser'), email: 'probe@example.com', role: 'Member' }))
    make('tenantDevice', () => Store.addTenantDevice(made.tenant, { name: n('tdev'), profileName: n('tprof') }))
    make('tenantAsset', () => Store.addTenantAsset(made.tenant, { name: n('tasset'), location: n('tloc'), profileName: n('tap'), groupNames: [n('tgrp')] }))
    Store.addMetadataField(made.device, n('mdkey'), n('mdval'))
    Store.addAssetMetadataField(made.asset, n('amkey'), n('amval'))
    Store.addApplicationRecord('app0', 'manual-entry', { entityId: Store.get().assets[0].id, ts: Date.now(), data: { scrap_kg: 1, remarks: n('remark') } })
    // Group names are listed inside the asset and user tables.
    Store.updateAsset(made.asset, { name: n('asset'), location: n('assetloc'), profileName: Store.get().assetProfiles[0].name, groupNames: [n('grpname')], deviceIds: [] })
    Store.updateUser(made.user, { name: n('user'), email: 'probe@example.com', role: 'Member', groupNames: [n('usergrp')] })
    return made
  }, PAYLOAD)
  section('Records created')
  Object.keys(ids).forEach((key) => check(`created a ${key} with markup in its name`, !String(ids[key]).startsWith('ERROR'), ids[key]))

  // ------------------------------------------------------------- list pages
  section('List pages')
  await inspect('devices.html', [named('dev')])
  await inspect('device-profiles.html', [named('prof')])
  await inspect('applications.html', [named('app')])
  await inspect('assets.html', [named('asset')])
  await inspect('asset-groups.html', [named('ag')])
  await inspect('asset-profiles.html', [named('ap')])
  await inspect('rule-engines.html', [named('rule')])
  await inspect('users.html', [named('user')])
  await inspect('user-groups.html', [named('ug')])
  await inspect('shift-management.html', [named('shift')])
  await inspect('shift-schedules.html', [named('sched')])
  await inspect('shift-instances.html')
  await inspect('rule-engine-reports.html')
  await inspect('roles.html')
  await inspect('credentials.html')
  await inspect('software-ota.html')
  await inspect('device-data.html')
  await inspect('dashboard.html')
  await inspect('settings.html')

  // ----------------------------------------------------------- detail pages
  section('Detail pages (the name is in the title, breadcrumb and headings)')
  await inspect('application-detail.html#' + ids.app, [named('app')])
  await inspect('notion.html#' + ids.app, [named('app'), named('page')])
  await inspect('device-detail.html#' + ids.device, [named('dev')])
  await inspect('asset-detail.html#' + ids.asset, [named('asset')])

  // ------------------------------------------------------------ admin pages
  section('Administrator pages')
  await inspect('admin-tenants.html', [named('tenant')])
  await inspect('admin-tenant-detail.html#' + ids.tenant, [named('tenant')])
  await inspect('admin-tenant-profiles.html')
  await inspect('admin-dashboard.html')

  // Opens every tab on a page in turn and checks the page after each one.
  const inspectTabs = async (url, tabSelector, expectedByTab) => {
    await visit(url)
    const tabs = await page.evaluate((sel) => document.querySelectorAll(sel).length, tabSelector)
    for (let i = 0; i < tabs; i++) {
      const label = await page.evaluate((arg) => {
        const tab = document.querySelectorAll(arg.sel)[arg.index]
        if (!tab) return null
        tab.click()
        return tab.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)
      }, { sel: tabSelector, index: i })
      if (label === null) break
      await page.waitForTimeout(200)
      const r = await page.evaluate((names) => ({
        ran: window.__xss || 0,
        injected: document.querySelectorAll('b.xss, img[src="x"]').length,
        missing: names.filter((n) => !document.body.innerText.includes(n)).map((n) => n.slice(-8)),
      }), (expectedByTab && expectedByTab[i]) || [])
      check(`${url}, tab "${label}": names are text, not markup`, r.ran === 0 && r.injected === 0 && r.missing.length === 0, r)
    }
    check(`${url}: has tabs to check`, tabs > 0, tabs)
  }

  section('Records inside tabs')
  await inspectTabs('admin-tenant-detail.html#' + ids.tenant, '.tab-button', {
    0: [named('tuser')], 1: [named('tdev')], 2: [named('tasset')],
  })
  await inspectTabs('application-detail.html#app_ems', '.detail-tab-button, [role="tab"]', { 0: [named('meter')] })
  await inspectTabs('application-detail.html#app_cms', '.detail-tab-button, [role="tab"]')
  await inspectTabs('application-detail.html#app0', '.detail-tab-button, [role="tab"], .rt-tab')
  await inspect('ems-meter-dashboard.html#' + ids.meter, [named('meter')])
  await inspect('cms-machine-dashboard.html#' + ids.machine, [named('machname')])
  // metadata, group names and manual-entry remarks
  await inspect('device-detail.html#' + ids.device, [named('dev'), named('mdkey'), named('mdval')])
  await inspect('asset-detail.html#' + ids.asset, [named('asset'), named('amkey'), named('amval')])
  await inspect('assets.html', [named('grpname')])
  await inspect('users.html', [named('usergrp')])

  // --------------------------------------------- delete confirmation + toast
  section('Delete dialogs and toasts')
  // Opens the row's menu and clicks its Delete item, from inside the page.
  const deleteRow = (name) => page.evaluate((text) => {
    const row = Array.from(document.querySelectorAll('tbody tr')).find((r) => r.textContent.includes(text))
    if (!row) return 'no row'
    const toggle = row.querySelector('[data-menu-toggle], .row-menu-button')
    if (toggle) toggle.click()
    const del = row.querySelector('.row-menu-item.danger, [data-delete]')
    if (!del) return 'no delete item'
    del.click()
    return 'ok'
  }, name)
  const dialogState = () => page.evaluate(() => {
    const root = document.getElementById('confirm-dialog-root')
    const message = root && root.querySelector('.confirm-dialog-message')
    return { open: Boolean(message), text: message ? message.innerText : '', ran: window.__xss || 0, injected: document.querySelectorAll('b.xss, img[src="x"]').length }
  })
  const toastState = () => page.evaluate(() => {
    const root = document.getElementById('toast-root')
    return { text: root ? root.innerText : '', ran: window.__xss || 0, injected: document.querySelectorAll('b.xss, img[src="x"]').length }
  })
  const flows = [
    ['applications.html', 'app'], ['assets.html', 'asset'], ['asset-groups.html', 'ag'],
    ['asset-profiles.html', 'ap'], ['device-profiles.html', 'prof'], ['rule-engines.html', 'rule'], ['users.html', 'user'],
    ['user-groups.html', 'ug'], ['shift-management.html', 'shift'], ['shift-schedules.html', 'sched'], ['admin-tenants.html', 'tenant'],
  ]
  for (const [url, tag] of flows) {
    await visit(url)
    const clicked = await deleteRow(named(tag))
    await page.waitForTimeout(150)
    const dialog = await dialogState()
    check(`${url}: the delete dialog names the record as text`, clicked === 'ok' && dialog.open && dialog.ran === 0 && dialog.injected === 0 && dialog.text.includes(named(tag)), { clicked, ...dialog, text: dialog.text.slice(0, 60) })
    if (dialog.open) {
      await page.click('#confirm-dialog-confirm')
      await page.waitForTimeout(200)
      const toast = await toastState()
      check(`${url}: the toast after deleting is text`, toast.ran === 0 && toast.injected === 0, toast)
    }
  }

  check('no JavaScript errors on any page', errors.length === 0, errors)
})
