// Settings > Backup: the SQL file a backup downloads as. The script is
// checked here; the sample it produces is offered under the results so it can
// also be run through PostgreSQL's parser (see validate_sql.py).

// The tables a backup of every page should produce, and how many rows each holds.
function expectedTables(data, layouts) {
  return {
    devices: data.devices.length,
    device_profiles: data.deviceProfiles.length,
    applications: data.applications.length,
    assets: data.assets.length,
    asset_groups: data.assetGroups.length,
    asset_profiles: data.assetProfiles.length,
    shifts: data.shifts.length,
    shift_schedules: data.shiftSchedules.length,
    shift_instances: data.shiftInstances.length,
    rule_engines: data.ruleEngines.length,
    rule_engine_executions: data.ruleEngineExecutions.length,
    users: data.users.length,
    user_groups: data.userGroups.length,
    role_permissions: Object.keys(data.roles).length,
    application_records: data['app:app0'].applicationRecords.length,
    notion_pages: data['app:app_notion'].notionPages.length,
    ems_meters: data['app:app_ems'].emsMeters.length,
    ems_tod_readings: data['app:app_ems'].emsTodReadings.length,
    ems_energy_data: data['app:app_ems'].emsEnergyData.length,
    cms_machines: data['app:app_cms'].cmsMachines.length,
    email_inbox: data['app:app_email'].emailInbox.length,
    email_tickets: data['app:app_email'].emailTickets.length,
    email_reports: data['app:app_email'].emailReports.length,
    email_departments: data['app:app_email'].emailDepartments.length,
    email_users: data['app:app_email'].emailUsers.length,
    email_from_addresses: data['app:app_email'].emailFromAddresses.length,
    email_notifications: data['app:app_email'].emailNotifications.length,
    email_sms: data['app:app_email'].emailSms.length,
    email_settings: data['app:app_email'].emailSettings.length,
    email_notification_settings: data['app:app_email'].emailNotificationSettings.length,
    email_sms_settings: data['app:app_email'].emailSmsSettings.length,
    forklift_devices: data['app:app_forklift'].forkliftDevices.length,
    dashboard_layouts: layouts,
  }
}

// Number of rows INSERTed into a table in the script.
function rowsIn(sql, table) {
  const start = sql.indexOf(`INSERT INTO "${table}"`)
  if (start === -1) return 0
  const block = sql.slice(start, sql.indexOf(';\n', start))
  return block.split('\n').filter((line) => /^ {2}\(/.test(line)).length
}

Tests.suite('backup-sql', 'Backup SQL download', async ({ page, BASE, check, skip, section, same, artifact, sleep }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async () => { await page.goto('about:blank'); await page.goto(BASE + 'settings.html', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(450) }
  const downloadNewest = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.bk-item:first-child [data-bk-download]')])
    return { name: dl.suggestedFilename(), sql: await dl.text() }
  }

  // Awkward values on purpose: quotes, a newline, non-ASCII text, a column that
  // holds a number in one row and text in another, a saved role, saved layouts.
  await page.goto(BASE + 'login.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    Store.reset()
    Store.login('admin', 'admin')
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    raw.devices[0].name = 'O\'Brien\'s "sensor"\nline two — ünï'
    raw.devices[1].extra = 5
    raw.devices[2].extra = 'five'
    raw.rolePermissions = { member: { devices: { view: true, edit: false, fields: {} } } }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    localStorage.setItem('univa_dashboard_layout_v1', JSON.stringify([{ id: 'w1', layout: { x: 0, y: 0 } }]))
    localStorage.setItem('univa_dashboard_layout_v1__app-app1', JSON.stringify([{ id: 'w9', layout: { x: 0, y: 0 } }]))
    localStorage.setItem('univa_dashboard_layout_v1__ems-meter-meter1', JSON.stringify([{ id: 'w5', layout: { x: 0, y: 0 } }]))
  })

  // ============================================================ every page
  section('SQL for a backup of every page')
  await open()
  await page.click('#bk-take')
  await page.waitForTimeout(300)
  const backup = await page.evaluate(() => Store.listBackups()[0])
  const { name, sql } = await downloadNewest()
  const expected = expectedTables(backup.data, 3)

  check('file is named for the time and ends in .sql', /^univa-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.sql$/.test(name), name)
  check('header says when, by whom and which pages', /^-- Univa database backup\n-- Taken: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} by admin \(manual\)\n-- Pages \(22\): Dashboard, All applications, PMS/.test(sql), sql.split('\n').slice(0, 3))
  check('one transaction', sql.includes('\nBEGIN;\n') && sql.trimEnd().endsWith('COMMIT;'))
  check('a table for every collection, and only those', same(Object.keys(expected).filter((t) => rowsIn(sql, t) > 0).sort(), Object.keys(expected).sort()) && (sql.match(/^CREATE TABLE /gm) || []).length === Object.keys(expected).length, (sql.match(/^CREATE TABLE /gm) || []).length)
  for (const [table, count] of Object.entries(expected)) check(`${table}: ${count} rows`, rowsIn(sql, table) === count, rowsIn(sql, table))
  check('a comment says which pages fed each table', /-- application_records \(from: PMS\)/.test(sql) && /-- dashboard_layouts \(from: Dashboard, EMS, Fleet Tracker\)/.test(sql))

  check('quotes, newlines and non-ASCII text are escaped', sql.includes('\'O\'\'Brien\'\'s "sensor"\nline two — ünï\''))
  check('a column mixing a number and text is JSONB', sql.includes('"extra" JSONB') && sql.includes("'5'::jsonb") && sql.includes('\'"five"\'::jsonb'))
  check('numbers are NUMERIC, booleans BOOLEAN, text TEXT', /"ts" NUMERIC/.test(sql) && /"is_default" BOOLEAN/.test(sql) && /"name" TEXT/.test(sql))
  check('booleans are TRUE / FALSE and missing values NULL', /, TRUE, /.test(sql) && /, NULL/.test(sql))
  check('nested values are JSONB', /"bindings" JSONB/.test(sql) && /'\{"assetGroup":"Production line A"/.test(sql))
  check('id, scope and role become primary keys', /"id" TEXT PRIMARY KEY/.test(sql) && /"scope" TEXT PRIMARY KEY/.test(sql) && /"role" TEXT PRIMARY KEY/.test(sql))
  check('camelCase keys become snake_case columns', /"app_id" TEXT/.test(sql) && /"created_date" TEXT/.test(sql) && !/^ {2}"[A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*" [A-Z]+/m.test(sql))

  // The browser can't run PostgreSQL's parser; the sample is offered for download
  // so that validate_sql.py can.
  artifact('backup-sample.sql', sql)

  // ============================================================ the page choice
  section('Only the ticked pages are in the SQL')
  await open()
  await page.click('[data-bk-page="devices"]')
  await page.click('[data-bk-group="users"]')
  await page.click('[data-bk-page="app:app_ems"]')
  await page.waitForTimeout(150)
  await page.click('#bk-take')
  await page.waitForTimeout(300)
  const partial = (await downloadNewest()).sql
  check('header counts the pages that went in', /-- Pages \(17\): /.test(partial))
  check('unticked pages leave no table', !partial.includes('CREATE TABLE "devices"') && !partial.includes('CREATE TABLE "users"') && !partial.includes('CREATE TABLE "user_groups"') && !partial.includes('CREATE TABLE "role_permissions"') && !partial.includes('CREATE TABLE "ems_meters"'))
  check('the others are still there', partial.includes('CREATE TABLE "device_profiles"') && partial.includes('CREATE TABLE "cms_machines"') && partial.includes('CREATE TABLE "applications"'))
  check('EMS data is left out but the application list still names EMS', rowsIn(partial, 'applications') === expected.applications && !partial.includes('INSERT INTO "ems_') && partial.includes("'app_ems'"))

  check('no JavaScript errors on any page', errors.length === 0, errors)
})
