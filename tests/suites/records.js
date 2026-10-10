// The data layer (shared/store.js): adding, changing and removing each kind of
// record, and what else changes with it. These run against Store directly, so
// they are quick and say exactly which rule broke; the page suites check that
// the screens use these rules.

Tests.suite('records', 'Data layer: records and how they relate', async ({ page, BASE, check, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  await page.goto(BASE + 'login.html')
  const fresh = () => page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  await fresh()

  // --------------------------------------------------------------- devices
  section('Devices')
  const dev = await page.evaluate(() => {
    const out = {}
    const before = Store.get().devices.length
    const added = Store.addDevice({ name: 'Bench sensor', profileId: 'p4' })
    const stored = Store.get().devices.find((d) => d.id === added.id)
    out.countGrew = Store.get().devices.length === before + 1
    out.added = { name: stored.name, profile: stored.profileName, state: stored.state, token: stored.tokenStatus, metadata: stored.metadata.length, alerts: stored.alerts.length, commands: stored.commands.length, metrics: stored.metrics.map((m) => m.key) }
    out.fallbackProfile = Store.addDevice({ name: 'No such profile', profileId: 'p-missing' }).profileName
    Store.updateDevice(added.id, { name: 'Bench sensor 2' })
    out.renamed = Store.get().devices.find((d) => d.id === added.id).name

    Store.addMetadataField(added.id, 'zone', 'north')
    let md = Store.get().devices.find((d) => d.id === added.id).metadata
    const field = md.find((f) => f.key === 'zone')
    out.fieldAdded = Boolean(field) && field.value === 'north'
    Store.updateMetadataField(added.id, field.id, 'south')
    out.fieldUpdated = Store.get().devices.find((d) => d.id === added.id).metadata.find((f) => f.id === field.id).value
    Store.removeMetadataField(added.id, field.id)
    out.fieldRemoved = !Store.get().devices.find((d) => d.id === added.id).metadata.some((f) => f.id === field.id)

    Store.activateToken(added.id)
    const activated = Store.get().devices.find((d) => d.id === added.id)
    out.token = { status: activated.tokenStatus, length: String(activated.tokenValue || '').length }
    Store.setTokenStatus(added.id, 'suspended')
    out.tokenSuspended = Store.get().devices.find((d) => d.id === added.id).tokenStatus

    const alertId = Store.get().devices.find((d) => d.id === added.id).alerts[0].id
    Store.acknowledgeAlert(added.id, alertId)
    const acknowledged = Store.get().devices.find((d) => d.id === added.id).alerts[0]
    out.acknowledged = { state: acknowledged.state, by: acknowledged.acknowledgedBy }
    Store.resolveAlert(added.id, alertId, 'Replaced the cable')
    const resolved = Store.get().devices.find((d) => d.id === added.id).alerts[0]
    out.resolved = { state: resolved.state, reason: resolved.resolveReason, by: JSON.parse(resolved.resolutionMetadata).resolvedBy }

    Store.addRelation(added.id, { direction: 'From', relationType: 'Contains', relatedTo: 'Gateway 1' })
    const relation = Store.get().devices.find((d) => d.id === added.id).relations[0]
    out.relation = Boolean(relation && relation.id && relation.relatedTo === 'Gateway 1')
    Store.removeRelation(added.id, relation.id)
    out.relationRemoved = Store.get().devices.find((d) => d.id === added.id).relations.length === 0

    Store.sendDataSample(added.id)
    const logs = Store.get().devices.find((d) => d.id === added.id).logs
    out.sample = { count: logs.length, sameCorrelation: logs.length === 2 && logs[0].correlationId === logs[1].correlationId, inbound: logs.find((l) => l.direction === 'inbound') && Object.keys(JSON.parse(logs.find((l) => l.direction === 'inbound').payload)) }

    Store.deleteDevice(added.id)
    out.deleted = !Store.get().devices.some((d) => d.id === added.id)
    out.othersKept = Store.get().devices.length === before + 1
    return out
  })
  check('a new device arrives with the shape the pages expect (metadata, one alert, two commands, no token)', dev.countGrew && dev.added.name === 'Bench sensor' && dev.added.state === 'offline' && dev.added.token === 'unavailable' && dev.added.metadata === 5 && dev.added.alerts === 1 && dev.added.commands === 2, dev.added)
  check('it takes its profile, and charts that profile\'s gauges', dev.added.profile === 'Machine PLC' && same(dev.added.metrics, ['spindle_load']), dev.added)
  check('an unknown profile falls back to the first one', dev.fallbackProfile === 'Vehicles', dev.fallbackProfile)
  check('a device can be renamed', dev.renamed === 'Bench sensor 2', dev.renamed)
  check('metadata fields can be added, changed and removed', dev.fieldAdded && dev.fieldUpdated === 'south' && dev.fieldRemoved, dev)
  check('activating a token gives a long value and an active status', dev.token.status === 'active' && dev.token.length >= 16, dev.token)
  check('a token can be suspended', dev.tokenSuspended === 'suspended', dev.tokenSuspended)
  check('an alert can be acknowledged, then resolved with a reason', dev.acknowledged.state === 'acknowledged' && dev.acknowledged.by === 'You' && dev.resolved.state === 'resolved' && dev.resolved.reason === 'Replaced the cable' && dev.resolved.by === 'You', dev)
  check('relations can be added and removed', dev.relation && dev.relationRemoved, dev)
  check('sending a data sample logs an outbound and an inbound message with one correlation id', dev.sample.count === 2 && dev.sample.sameCorrelation, dev.sample)
  check('the inbound message carries the device\'s metric keys', Array.isArray(dev.sample.inbound) && dev.sample.inbound.includes('spindle_load'), dev.sample)
  check('deleting a device removes only that device', dev.deleted && dev.othersKept, dev)

  section('Commands')
  const cmd = await page.evaluate(() => {
    const out = {}
    const id = 'd1'
    const countBefore = Store.get().devices.find((d) => d.id === id).commands.length
    Store.sendCommand(id, { name: 'Ping', params: '{}', executionType: 'sync' })
    let list = Store.get().devices.find((d) => d.id === id).commands
    out.syncSettledAtOnce = list.length === countBefore + 1 && ['delivered', 'failed'].includes(list[0].status) && list[0].dueAt === undefined

    Store.sendCommand(id, { name: 'Restart', params: '{}', executionType: 'async' })
    list = Store.get().devices.find((d) => d.id === id).commands
    const pending = list[0]
    out.asyncPending = { name: pending.name, status: pending.status, code: pending.statusCode, due: typeof pending.dueAt === 'number' && pending.dueAt > Date.now() }

    // Not due yet: looking at the device again leaves it alone.
    Store.settleCommands(id)
    out.notDueYet = Store.get().devices.find((d) => d.id === id).commands[0].status

    // Time passes (the page was left before the timer fired): now it settles.
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
    raw.devices.find((d) => d.id === id).commands[0].dueAt = Date.now() - 1000
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    Store.settleCommands(id)
    const settled = Store.get().devices.find((d) => d.id === id).commands[0]
    out.settled = { status: settled.status, dueAt: settled.dueAt, code: settled.statusCode }

    // A command saved before dueAt existed counts as due after 10 seconds.
    const raw2 = JSON.parse(localStorage.getItem(STORAGE_KEY))
    const old = { id: 'cmd-old', name: 'Ping', params: '{}', executionType: 'async', status: 'pending', statusCode: null, reasonPhrase: 'Pending', responsePayload: '', createdDate: '2020-01-01 00:00:00', updatedDate: '2020-01-01 00:00:00' }
    raw2.devices.find((d) => d.id === id).commands.unshift(old)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw2))
    Store.settleCommands()
    out.oldSettled = Store.get().devices.find((d) => d.id === id).commands.find((c) => c.id === 'cmd-old').status
    out.unknownDevice = Store.sendCommand('nope', { name: 'x', params: '{}', executionType: 'sync' }) === undefined
    return out
  })
  check('a synchronous command settles at once, delivered or failed', cmd.syncSettledAtOnce, cmd)
  check('an asynchronous command starts pending, with the time it falls due', cmd.asyncPending.status === 'pending' && cmd.asyncPending.code === null && cmd.asyncPending.due, cmd.asyncPending)
  check('looking at the device before then leaves it pending', cmd.notDueYet === 'pending', cmd.notDueYet)
  check('once due, it settles the next time the device is looked at', ['delivered', 'failed'].includes(cmd.settled.status) && cmd.settled.dueAt === undefined && [200, 504].includes(cmd.settled.code), cmd.settled)
  check('a command saved before due times existed settles after 10 seconds', ['delivered', 'failed'].includes(cmd.oldSettled), cmd.oldSettled)
  check('a command to a device that is not there is ignored', cmd.unknownDevice, cmd)

  // -------------------------------------------------------- device profiles
  section('Device profiles')
  await fresh()
  const prof = await page.evaluate(() => {
    const out = {}
    const added = Store.addDeviceProfile({ name: 'Pumps', description: 'Water pumps', dataPoints: [{ key: 'flow', label: 'Flow', unit: 'L/s', type: 'number', kind: 'gauge', min: 0, max: 50, decimals: 1 }] })
    out.added = { isDefault: added.isDefault, points: added.dataPoints.length }
    const device = Store.addDevice({ name: 'Pump 1', profileId: added.id })
    out.deviceMetric = Store.get().devices.find((d) => d.id === device.id).metrics.map((m) => m.key)

    Store.updateDeviceProfile(added.id, { name: 'Water pumps', description: 'Renamed', dataPoints: [{ key: 'pressure', label: 'Pressure', unit: 'bar', type: 'number', kind: 'gauge', min: 0, max: 10, decimals: 1 }] })
    const after = Store.get()
    out.renamedOnDevice = after.devices.find((d) => d.id === device.id).profileName
    out.metricsFollow = after.devices.find((d) => d.id === device.id).metrics.map((m) => m.key)
    out.profileName = after.deviceProfiles.find((p) => p.id === added.id).name

    Store.setDefaultDeviceProfile(added.id)
    const defaults = Store.get().deviceProfiles.filter((p) => p.isDefault).map((p) => p.id)
    out.onlyOneDefault = defaults.length === 1 && defaults[0] === added.id

    Store.removeDeviceProfile(added.id)
    out.removed = !Store.get().deviceProfiles.some((p) => p.id === added.id)
    return out
  })
  check('a new profile is not the default, and keeps its data points', prof.added.isDefault === false && prof.added.points === 1, prof.added)
  check('a device on the profile charts its gauges', same(prof.deviceMetric, ['flow']), prof.deviceMetric)
  check('renaming a profile renames it on its devices', prof.renamedOnDevice === 'Water pumps' && prof.profileName === 'Water pumps', prof)
  check('changing a profile\'s data points changes what its devices chart', same(prof.metricsFollow, ['pressure']), prof.metricsFollow)
  check('making a profile the default leaves exactly one default', prof.onlyOneDefault, prof)
  check('a profile can be removed', prof.removed, prof)

  // ------------------------------------------------------------------ assets
  section('Assets, groups and profiles')
  await fresh()
  const asset = await page.evaluate(() => {
    const out = {}
    const added = Store.addAsset({ name: 'Press 9', groupNames: ['Vehicles'], profileName: 'Forklift', location: 'Bay 9', deviceIds: ['d1'] })
    out.added = { status: added.status, group: added.groupNames, devices: added.deviceIds, metadata: added.metadata, attributes: added.attributes }
    Store.updateAsset(added.id, { name: 'Press 10', groupNames: ['Generators'], profileName: 'Diesel generator', location: 'Bay 10', deviceIds: [] })
    const updated = Store.get().assets.find((a) => a.id === added.id)
    out.updated = { name: updated.name, group: updated.groupNames, profile: updated.profileName, location: updated.location, devices: updated.deviceIds }

    Store.toggleAssetStatus(added.id)
    const first = Store.get().assets.find((a) => a.id === added.id).status
    Store.toggleAssetStatus(added.id)
    const second = Store.get().assets.find((a) => a.id === added.id).status
    out.toggled = [first, second]
    // an asset under maintenance comes back to operational when toggled
    out.maintenance = (() => { Store.toggleAssetStatus('a2'); return Store.get().assets.find((a) => a.id === 'a2').status })()

    Store.addAssetMetadataField(added.id, 'owner', 'Plant 1')
    Store.addAssetMetadataField(added.id, 'tag', 'P-10')
    Store.updateAssetMetadataFieldAt(added.id, 1, 'P-11')
    Store.removeAssetMetadataFieldAt(added.id, 0)
    out.metadata = Store.get().assets.find((a) => a.id === added.id).metadata
    Store.updateAssetAttributes(added.id, { workCenter: 'WC-9' })
    Store.updateAssetAttributes(added.id, { targetPerHour: 90 })
    out.attributes = Store.get().assets.find((a) => a.id === added.id).attributes

    // renaming a group or a profile follows through to the assets that use it
    const group = Store.addAssetGroup({ name: 'Presses', description: 'Stamping presses' })
    Store.updateAsset(added.id, { name: 'Press 10', groupNames: ['Presses'], profileName: 'Diesel generator', location: 'Bay 10', deviceIds: [] })
    Store.updateAssetGroup(group.id, { name: 'Stamping presses', description: 'Renamed' })
    out.groupRenamed = Store.get().assets.find((a) => a.id === added.id).groupNames
    const profile = Store.addAssetProfile({ name: 'Press', category: 'Machinery', description: '', attributes: [] })
    Store.updateAsset(added.id, { name: 'Press 10', groupNames: ['Stamping presses'], profileName: 'Press', location: 'Bay 10', deviceIds: [] })
    Store.updateAssetProfile(profile.id, { name: 'Hydraulic press', category: 'Machinery', description: '' })
    out.profileRenamed = Store.get().assets.find((a) => a.id === added.id).profileName

    Store.removeAssetGroup(group.id)
    Store.removeAssetProfile(profile.id)
    out.groupAndProfileRemoved = !Store.get().assetGroups.some((g) => g.id === group.id) && !Store.get().assetProfiles.some((p) => p.id === profile.id)
    Store.removeAsset(added.id)
    out.removed = !Store.get().assets.some((a) => a.id === added.id)
    return out
  })
  check('a new asset starts operational, with its group, devices and no metadata', asset.added.status === 'operational' && same(asset.added.group, ['Vehicles']) && same(asset.added.devices, ['d1']) && same(asset.added.metadata, []) && same(asset.added.attributes, {}), asset.added)
  check('an asset can be edited', asset.updated.name === 'Press 10' && same(asset.updated.group, ['Generators']) && asset.updated.profile === 'Diesel generator' && asset.updated.location === 'Bay 10' && same(asset.updated.devices, []), asset.updated)
  check('toggling flips operational and offline', same(asset.toggled, ['offline', 'operational']), asset.toggled)
  check('toggling an asset under maintenance makes it operational', asset.maintenance === 'operational', asset.maintenance)
  check('metadata is added, changed and removed by position', same(asset.metadata, [{ key: 'tag', value: 'P-11' }]), asset.metadata)
  check('attribute values are merged, not replaced', same(asset.attributes, { workCenter: 'WC-9', targetPerHour: 90 }), asset.attributes)
  check('renaming an asset group renames it on the assets', same(asset.groupRenamed, ['Stamping presses']), asset.groupRenamed)
  check('renaming an asset profile renames it on the assets', asset.profileRenamed === 'Hydraulic press', asset.profileRenamed)
  check('groups, profiles and assets can be removed', asset.groupAndProfileRemoved && asset.removed, asset)

  // ------------------------------------------------------------ rule engines
  section('Rule engines')
  const rule = await page.evaluate(() => {
    const out = {}
    const added = Store.addRuleEngine({ name: 'Too hot', description: '', scope: 'All devices', deviceId: '', conditionMode: 'builder', conditions: [{ metric: 'temperature', operator: '>', value: '40' }], conditionLogic: 'AND', conditionFormula: '', triggerType: 'Telemetry received', actionType: 'Create alarm', actionDetail: 'Critical' })
    out.added = { status: added.status, hasId: Boolean(added.id), created: Boolean(added.createdDate) }
    Store.toggleRuleEngineStatus(added.id)
    out.suspended = Store.get().ruleEngines.find((r) => r.id === added.id).status
    Store.toggleRuleEngineStatus(added.id)
    out.active = Store.get().ruleEngines.find((r) => r.id === added.id).status
    Store.updateRuleEngine(added.id, { name: 'Far too hot', actionDetail: 'Major' })
    const updated = Store.get().ruleEngines.find((r) => r.id === added.id)
    out.updated = { name: updated.name, action: updated.actionDetail, conditions: updated.conditions.length }
    Store.removeRuleEngine(added.id)
    out.removed = !Store.get().ruleEngines.some((r) => r.id === added.id)
    return out
  })
  check('a new rule engine is active', rule.added.status === 'active' && rule.added.hasId && rule.added.created, rule.added)
  check('it can be suspended and activated again', rule.suspended === 'suspended' && rule.active === 'active', rule)
  check('editing changes only the fields given', rule.updated.name === 'Far too hot' && rule.updated.action === 'Major' && rule.updated.conditions === 1, rule.updated)
  check('a rule engine can be removed', rule.removed, rule)

  // ------------------------------------------------------------------ shifts
  section('Shifts and schedules')
  const shift = await page.evaluate(() => {
    const out = {}
    const added = Store.addShift({ name: 'Early', startTime: '04:00', endTime: '08:00', midnightCrossed: 0 })
    out.added = { status: added.status, crossed: added.midnightCrossed }
    Store.updateShift(added.id, { name: 'Early bird', startTime: '05:00', endTime: '09:00', midnightCrossed: true })
    const updated = Store.get().shifts.find((s) => s.id === added.id)
    out.updated = { name: updated.name, start: updated.startTime, crossed: updated.midnightCrossed }
    Store.toggleShiftStatus(added.id)
    out.toggled = Store.get().shifts.find((s) => s.id === added.id).status

    out.inUse = Store.shiftInUseBy('sh1')
    out.notInUse = Store.shiftInUseBy(added.id)
    const schedule = Store.addShiftSchedule({ name: 'Weekend', assignments: { Sat: [added.id], Sun: [] } })
    out.nowInUse = Store.shiftInUseBy(added.id)
    Store.updateShiftSchedule(schedule.id, { name: 'Weekend early', description: 'Sat only', assignments: { Sat: [], Sun: [added.id] } })
    const edited = Store.get().shiftSchedules.find((s) => s.id === schedule.id)
    out.schedule = { name: edited.name, description: edited.description, sun: edited.assignments.Sun }
    Store.removeShiftSchedule(schedule.id)
    out.scheduleRemoved = !Store.get().shiftSchedules.some((s) => s.id === schedule.id)
    out.freeAgain = Store.shiftInUseBy(added.id)
    Store.removeShift(added.id)
    out.removed = !Store.get().shifts.some((s) => s.id === added.id)
    const instances = Store.get().shiftInstances.length
    Store.removeShiftInstance('si1')
    out.instanceRemoved = Store.get().shiftInstances.length === instances - 1
    return out
  })
  check('a new shift is active, and "crosses midnight" is a true/false value', shift.added.status === 'active' && shift.added.crossed === false, shift.added)
  check('a shift can be edited and suspended', shift.updated.name === 'Early bird' && shift.updated.start === '05:00' && shift.updated.crossed === true && shift.toggled === 'suspended', shift)
  check('a shift that a schedule uses is reported as in use, with the schedule\'s name', shift.inUse.includes('Standard rotation') && shift.inUse.includes('Three-shift 24×7') && shift.notInUse.length === 0 && same(shift.nowInUse, ['Weekend']), shift)
  check('a schedule can be edited and removed, which frees the shift', shift.schedule.name === 'Weekend early' && shift.schedule.description === 'Sat only' && shift.schedule.sun.length === 1 && shift.scheduleRemoved && shift.freeAgain.length === 0, shift)
  check('a shift and a shift instance can be removed', shift.removed && shift.instanceRemoved, shift)

  // ---------------------------------------------------------------- users
  section('Users and user groups')
  await fresh()
  const users = await page.evaluate(() => {
    const out = {}
    const platformBefore = Store.get().users.length
    const added = Store.addUser({ name: 'Nia Park', email: 'nia@example.com', role: 'Member', groupNames: ['Operators'], mode: 'add' })
    const invited = Store.addUser({ name: 'Ravi Shah', email: 'ravi@example.com', role: 'Viewer', mode: 'invite' })
    out.added = { status: added.status, id: added.id.startsWith('u-'), groups: added.groupNames }
    out.invited = { status: invited.status, groups: invited.groupNames }
    Store.updateUser(added.id, { name: 'Nia P.', email: 'nia.p@example.com', role: 'Admin', groupNames: ['Administrators', 'Operators'] })
    const updated = Store.get().users.find((u) => u.id === added.id)
    out.updated = { name: updated.name, email: updated.email, role: updated.role, groups: updated.groupNames }
    Store.toggleUserStatus(added.id)
    const first = Store.get().users.find((u) => u.id === added.id).status
    Store.toggleUserStatus(added.id)
    out.toggled = [first, Store.get().users.find((u) => u.id === added.id).status]
    Store.toggleUserStatus(invited.id)
    out.invitedToggled = Store.get().users.find((u) => u.id === invited.id).status

    const group = Store.addUserGroup({ name: 'Auditors', description: 'Read only' })
    Store.updateUser(invited.id, { name: 'Ravi Shah', email: 'ravi@example.com', role: 'Viewer', groupNames: ['Auditors'] })
    Store.updateUserGroup(group.id, { name: 'External auditors', description: 'Read only' })
    out.groupRenamed = Store.get().users.find((u) => u.id === invited.id).groupNames
    Store.removeUserGroup(group.id)
    out.groupRemoved = !Store.get().userGroups.some((g) => g.id === group.id)

    Store.deleteUser(added.id)
    Store.deleteUser(invited.id)
    out.deleted = Store.get().users.length === platformBefore
    return out
  })
  check('adding a user makes them active; inviting one leaves them invited', users.added.status === 'active' && users.added.id && users.invited.status === 'invited' && same(users.invited.groups, []), users)
  check('a user can be edited', users.updated.name === 'Nia P.' && users.updated.email === 'nia.p@example.com' && users.updated.role === 'Admin' && same(users.updated.groups, ['Administrators', 'Operators']), users.updated)
  check('toggling suspends an active user and reactivates a suspended or invited one', same(users.toggled, ['suspended', 'active']) && users.invitedToggled === 'active', users)
  check('renaming a user group renames it on its users', same(users.groupRenamed, ['External auditors']), users.groupRenamed)
  check('groups and users can be removed', users.groupRemoved && users.deleted, users)

  section('Signed in to a tenant, users belong to the tenant')
  const scoped = await page.evaluate(() => {
    const out = {}
    const platformUsers = Store.get().users.map((u) => u.email)
    Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE')
    const tenantUsers = Store.get().users.map((u) => u.email)
    out.sees = tenantUsers
    const added = Store.addUser({ name: 'Kit Moore', email: 'kit@northbridge.com', role: 'Member', mode: 'add' })
    out.prefix = added.id.startsWith('tu-')
    out.inTenant = Store.get().users.some((u) => u.email === 'kit@northbridge.com')
    Store.logout()
    Store.login('admin', 'admin')
    out.platformUnchanged = Store.get().users.map((u) => u.email).join() === platformUsers.join()
    out.storedOnTenant = Store.get().tenants.find((t) => t.id === 't1').users.some((u) => u.email === 'kit@northbridge.com')
    Store.login('dana.whitfield@northbridge.com', '12345', 'NORTHBRIDGE')
    Store.deleteUser(added.id)
    out.deleted = !Store.get().users.some((u) => u.email === 'kit@northbridge.com')
    Store.logout()
    return out
  })
  check('a tenant user sees the tenant\'s users, not the platform\'s', same(scoped.sees, ['dana.whitfield@northbridge.com', 'omar.salim@northbridge.com']), scoped.sees)
  check('a user added there is stored on the tenant, with a tenant-user id', scoped.prefix && scoped.inTenant && scoped.storedOnTenant, scoped)
  check('the platform\'s own users are untouched', scoped.platformUnchanged, scoped)
  check('and can be deleted from the tenant', scoped.deleted, scoped)

  // ----------------------------------------------------------- applications
  section('Applications')
  await fresh()
  const apps = await page.evaluate(() => {
    const out = {}
    const added = Store.addApplication({ name: 'Yard watch', description: 'Gate and yard', deviceIds: ['d1'], assetIds: ['a1'], groupNames: ['Vehicles'], icon: 'truck' })
    out.added = { status: added.status, icon: added.icon, devices: added.deviceIds, template: added.templateKey || null }
    Store.updateApplication(added.id, { name: 'Yard watch 2', description: 'Changed' })
    const edited = Store.get().applications.find((a) => a.id === added.id)
    out.edited = { name: edited.name, devices: edited.deviceIds, icon: edited.icon, custom: edited.hasCustomDashboard }
    Store.toggleApplicationStatus(added.id)
    out.suspended = Store.get().applications.find((a) => a.id === added.id).status
    Store.toggleApplicationStatus(added.id)
    out.active = Store.get().applications.find((a) => a.id === added.id).status

    const fromTemplate = Store.addApplicationFromTemplate({ name: 'Line B', templateKey: 'production-monitoring', bindings: { assetGroup: 'Production line A', keyMap: { count: 'part_count' } }, settings: { oeeTarget: 80 } })
    out.template = { key: fromTemplate.templateKey, group: fromTemplate.groupNames, settings: fromTemplate.settings }
    Store.updateApplicationBindings(fromTemplate.id, { assetIds: ['a5', 'a6'], assetGroup: '' }, { oeeTarget: 60 })
    const rebound = Store.get().applications.find((a) => a.id === fromTemplate.id)
    out.rebound = { assets: rebound.assetIds, groups: rebound.groupNames, keyMap: rebound.bindings.keyMap, oee: rebound.settings.oeeTarget }

    // records: append-only vs. keyed upsert
    Store.addApplicationRecord(added.id, 'note', { data: { text: 'a' } })
    Store.addApplicationRecord(added.id, 'note', { data: { text: 'b' } })
    Store.upsertApplicationRecord(added.id, 'cell', 'k1', { a: 1 }, { entityId: 'a1' })
    Store.upsertApplicationRecord(added.id, 'cell', 'k1', { b: 2 }, { ts: 5 })
    Store.upsertApplicationRecord(added.id, 'cell', 'k2', { a: 9 })
    const records = Store.get().applicationRecords.filter((r) => r.appId === added.id)
    const cell = records.find((r) => r.key === 'k1')
    out.records = { notes: records.filter((r) => r.type === 'note').length, cells: records.filter((r) => r.type === 'cell').length, merged: cell && cell.data, kept: cell && cell.entityId, ts: cell && cell.ts }
    Store.setApplicationManualFields(added.id, [{ key: 'x', label: 'X', kind: 'quantity' }])
    out.manualFields = Store.get().applications.find((a) => a.id === added.id).manualFields.map((f) => f.key)

    // deleting an application takes its pages and records with it, and its place in every tenant's list
    const page = Store.addNotionPage({ appId: added.id, title: 'Yard log' })
    Store.setTenantApplicationAccess('t2', [added.id], true)
    out.beforeRemove = { pages: Store.notionPagesFor(added.id).length, tenant: Store.tenantApplicationIds('t2').includes(added.id) }
    Store.removeApplication(added.id)
    out.afterRemove = {
      app: Store.get().applications.some((a) => a.id === added.id),
      records: Store.get().applicationRecords.filter((r) => r.appId === added.id).length,
      pages: Store.get().notionPages.filter((p) => p.id === page.id).length,
      tenant: Store.tenantApplicationIds('t2').includes(added.id),
    }
    // the built-in applications cannot be removed
    const before = Store.get().applications.length
    Store.removeApplication('app0')
    Store.removeApplication('app_ems')
    out.defaultsKept = Store.get().applications.length === before
    return out
  })
  check('a new application starts active, with its devices and icon, and no template', apps.added.status === 'active' && apps.added.icon === 'truck' && same(apps.added.devices, ['d1']) && apps.added.template === null, apps.added)
  check('editing keeps the icon when none is given', apps.edited.name === 'Yard watch 2' && apps.edited.icon === 'truck' && apps.edited.custom === false, apps.edited)
  check('an application can be suspended and activated', apps.suspended === 'suspended' && apps.active === 'active', apps)
  check('an application built from a template keeps its template, bindings and settings', apps.template.key === 'production-monitoring' && same(apps.template.group, ['Production line A']) && apps.template.settings.oeeTarget === 80, apps.template)
  check('changing its bindings merges them and keeps the asset list and group in step', same(apps.rebound.assets, ['a5', 'a6']) && same(apps.rebound.groups, []) && apps.rebound.keyMap.count === 'part_count' && apps.rebound.oee === 60, apps.rebound)
  check('records: appends add each time, but one key is one record (its data merged, its details updated)', apps.records.notes === 2 && apps.records.cells === 2 && same(apps.records.merged, { a: 1, b: 2 }) && apps.records.kept === 'a1' && apps.records.ts === 5, apps.records)
  check('an application can have its own manual fields', same(apps.manualFields, ['x']), apps.manualFields)
  check('removing an application removes its records and pages, and its place in tenants\' lists', apps.beforeRemove.pages === 1 && apps.beforeRemove.tenant && !apps.afterRemove.app && apps.afterRemove.records === 0 && apps.afterRemove.pages === 0 && !apps.afterRemove.tenant, apps)
  check('the built-in applications cannot be removed', apps.defaultsKept, apps)

  // --------------------------------------------------------------- tenants
  section('Tenants')
  await fresh()
  const tenants = await page.evaluate(() => {
    const out = {}
    const first = Store.addTenant({ title: 'Acme Freight & Co.', email: 'ops@acme.test', country: 'India', tenantProfileName: 'Default' })
    const second = Store.addTenant({ title: 'Acme Freight & Co.', email: 'ops@acme2.test', country: 'India', tenantProfileName: 'Default' })
    out.ids = [first.organizationId, second.organizationId]
    out.fresh = { status: first.status, users: first.users.length, apps: first.applicationIds }
    out.defaultApps = Store.get().applications.filter((a) => a.isDefault).map((a) => a.id)

    Store.updateTenant(first.id, { email: 'someone@else.test', phone: '123' })
    const edited = Store.get().tenants.find((t) => t.id === first.id)
    out.keptOrg = edited.organizationId === first.organizationId && edited.phone === '123'
    Store.toggleTenantStatus(first.id)
    out.suspended = Store.get().tenants.find((t) => t.id === first.id).status

    const user = Store.addTenantUser(first.id, { name: 'Ann', email: 'ann@acme.test', role: 'Owner' })
    Store.updateTenantUser(first.id, user.id, { name: 'Ann B', email: 'ann@acme.test', role: 'Admin' })
    Store.toggleTenantUserStatus(first.id, user.id)
    const tUser = Store.get().tenants.find((t) => t.id === first.id).users[0]
    out.user = { name: tUser.name, role: tUser.role, status: tUser.status }
    Store.removeTenantUser(first.id, user.id)
    out.userRemoved = Store.get().tenants.find((t) => t.id === first.id).users.length === 0

    const device = Store.addTenantDevice(first.id, { name: 'Gate reader', profileName: 'Vehicles' })
    Store.updateTenantDevice(first.id, device.id, { name: 'Gate reader 2', profileName: 'ignored' })
    Store.toggleTenantDeviceStatus(first.id, device.id)
    const tDevice = Store.get().tenants.find((t) => t.id === first.id).devices[0]
    out.device = { name: tDevice.name, profile: tDevice.profileName, status: tDevice.status }
    Store.toggleTenantDeviceStatus(first.id, device.id)
    out.deviceBack = Store.get().tenants.find((t) => t.id === first.id).devices[0].status
    Store.removeTenantDevice(first.id, device.id)
    const asset = Store.addTenantAsset(first.id, { name: 'Dock 1', profileName: 'Forklift', location: 'Pier' })
    Store.updateTenantAsset(first.id, asset.id, { name: 'Dock 1B', profileName: 'Forklift', location: 'Pier 2' })
    Store.toggleTenantAssetStatus(first.id, asset.id)
    const tAsset = Store.get().tenants.find((t) => t.id === first.id).assets[0]
    out.asset = { name: tAsset.name, location: tAsset.location, status: tAsset.status }
    Store.removeTenantAsset(first.id, asset.id)
    out.cleared = Store.get().tenants.find((t) => t.id === first.id).devices.length + Store.get().tenants.find((t) => t.id === first.id).assets.length
    out.missingTenant = [Store.addTenantUser('nope', { name: 'x' }), Store.addTenantDevice('nope', { name: 'x' }), Store.addTenantAsset('nope', { name: 'x' }), Store.addTenantApplication('nope', { name: 'x' })].every((r) => r === undefined)

    const profile = Store.addTenantProfile({ name: 'Gold', description: '', maxDevices: 9 })
    Store.updateTenant(first.id, { tenantProfileName: 'Gold' })
    Store.updateTenantProfile(profile.id, { name: 'Platinum', description: 'Renamed', maxDevices: 99 })
    out.profileRenamed = Store.get().tenants.find((t) => t.id === first.id).tenantProfileName
    Store.setDefaultTenantProfile(profile.id)
    out.oneDefault = Store.get().tenantProfiles.filter((p) => p.isDefault).map((p) => p.name)
    Store.removeTenantProfile(profile.id)
    out.profileRemoved = !Store.get().tenantProfiles.some((p) => p.id === profile.id)

    Store.removeTenant(first.id)
    out.removed = !Store.get().tenants.some((t) => t.id === first.id) && Store.get().tenants.some((t) => t.id === second.id)
    return out
  })
  check('a tenant\'s Organization ID comes from its title, in capitals, without spaces or symbols', tenants.ids[0] === 'ACMEFREIGHTCO', tenants.ids)
  check('a second tenant with the same title gets a different Organization ID', tenants.ids[1] === 'ACMEFREIGHTCO2', tenants.ids)
  check('a new tenant is active, has no users, and may view every built-in application', tenants.fresh.status === 'active' && tenants.fresh.users === 0 && same(tenants.fresh.apps, tenants.defaultApps), tenants)
  check('editing a tenant (even its email) keeps its Organization ID', tenants.keptOrg, tenants)
  check('a tenant can be suspended', tenants.suspended === 'suspended', tenants.suspended)
  check('a tenant\'s users can be added, edited, suspended and removed', tenants.user.name === 'Ann B' && tenants.user.role === 'Admin' && tenants.user.status === 'suspended' && tenants.userRemoved, tenants.user)
  check('a tenant\'s devices change only their name when edited', tenants.device.name === 'Gate reader 2' && tenants.device.profile === 'Vehicles' && tenants.device.status === 'operational' && tenants.deviceBack === 'offline', tenants.device)
  check('a tenant\'s assets can be edited, toggled and removed', tenants.asset.name === 'Dock 1B' && tenants.asset.location === 'Pier 2' && tenants.asset.status === 'offline' && tenants.cleared === 0, tenants.asset)
  check('adding to a tenant that is not there does nothing', tenants.missingTenant, tenants)
  check('renaming a tenant profile renames it on the tenants that use it, and one profile is the default', tenants.profileRenamed === 'Platinum' && same(tenants.oneDefault, ['Platinum']) && tenants.profileRemoved, tenants)
  check('removing a tenant leaves the others', tenants.removed, tenants)

  // ------------------------------------------------------------ custom app pages
  section('Custom App pages')
  await fresh()
  const notion = await page.evaluate(() => {
    const out = {}
    const blank = Store.addNotionPage()
    out.blank = { title: blank.title, icon: blank.icon, app: blank.appId, blocks: blank.blocks.length }
    const mine = Store.addNotionPage({ appId: 'app1', title: 'Fleet notes', icon: '🚚' })
    out.byApp = { fleet: Store.notionPagesFor('app1').map((p) => p.title), custom: Store.notionPagesFor('app_notion').some((p) => p.id === blank.id) }
    Store.updateNotionPage(mine.id, { title: 'Fleet log' })
    out.renamed = Store.get().notionPages.find((p) => p.id === mine.id).title

    Store.addNotionBlock(mine.id, { type: 'heading', text: 'A' })
    Store.addNotionBlock(mine.id, { type: 'text', text: 'B' })
    Store.addNotionBlock(mine.id, { type: 'text', text: 'C' })
    const order = () => Store.get().notionPages.find((p) => p.id === mine.id).blocks.map((b) => b.text).join('')
    out.added = order()
    const ids = () => Store.get().notionPages.find((p) => p.id === mine.id).blocks.map((b) => b.id)
    Store.insertNotionBlockAfter(mine.id, ids()[0], { type: 'text', text: 'X' })
    out.inserted = order()
    Store.insertNotionBlockAfter(mine.id, 'nope', { type: 'text', text: 'Z' })
    out.insertedAtEnd = order()
    Store.moveNotionBlock(mine.id, ids()[1], 'down')
    out.movedDown = order()
    Store.moveNotionBlock(mine.id, ids()[0], 'up')
    out.firstStaysFirst = order()
    Store.moveNotionBlock(mine.id, ids()[ids().length - 1], 'down')
    out.lastStaysLast = order()
    Store.reorderNotionBlocks(mine.id, ids().slice().reverse())
    out.reversed = order()
    Store.updateNotionBlock(mine.id, ids()[0], { text: 'changed' })
    out.edited = Store.get().notionPages.find((p) => p.id === mine.id).blocks[0].text
    Store.removeNotionBlock(mine.id, ids()[0])
    out.afterRemove = ids().length

    // a database block: items, properties, and the required title property
    Store.addNotionBlock(mine.id, { type: 'database', title: 'Tasks', properties: [{ id: 'title', name: 'Name', type: 'title' }], items: [] })
    const dbId = Store.get().notionPages.find((p) => p.id === mine.id).blocks.find((b) => b.type === 'database').id
    const db = () => Store.get().notionPages.find((p) => p.id === mine.id).blocks.find((b) => b.id === dbId)
    Store.addNotionDatabaseProperty(mine.id, dbId, { name: 'Done', type: 'checkbox' })
    const prop = db().properties.find((p) => p.name === 'Done')
    Store.addNotionDatabaseItem(mine.id, dbId, { title: 'Wash trucks', [prop.id]: true })
    const item = db().items[0]
    out.item = { title: item.title, flag: item[prop.id], hasId: Boolean(item.id) }
    Store.updateNotionDatabaseItem(mine.id, dbId, item.id, { title: 'Wash all trucks' })
    out.itemEdited = db().items[0].title
    Store.updateNotionDatabaseProperty(mine.id, dbId, prop.id, { name: 'Finished' })
    out.propEdited = db().properties.find((p) => p.id === prop.id).name
    Store.removeNotionDatabaseProperty(mine.id, dbId, 'title')
    out.titleKept = db().properties.some((p) => p.id === 'title')
    Store.removeNotionDatabaseProperty(mine.id, dbId, prop.id)
    out.propRemoved = { gone: !db().properties.some((p) => p.id === prop.id), valueGone: db().items[0][prop.id] === undefined }
    Store.removeNotionDatabaseItem(mine.id, dbId, item.id)
    out.itemRemoved = db().items.length === 0

    Store.removeNotionPage(mine.id)
    out.pageRemoved = Store.notionPagesFor('app1').length === 0
    return out
  })
  check('a page made without details is "Untitled" in the Custom App', notion.blank.title === 'Untitled' && notion.blank.app === 'app_notion' && notion.blank.blocks === 0 && notion.blank.icon.length > 0, notion.blank)
  check('pages belong to one application', same(notion.byApp.fleet, ['Fleet notes']) && notion.byApp.custom, notion.byApp)
  check('a page can be renamed', notion.renamed === 'Fleet log', notion.renamed)
  check('blocks are added in order, and can be inserted after another (or at the end if it is gone)', notion.added === 'ABC' && notion.inserted === 'AXBC' && notion.insertedAtEnd === 'AXBCZ', notion)
  check('blocks move down and up, and the first and last stay put at the edges', notion.movedDown === 'ABXCZ' && notion.firstStaysFirst === 'ABXCZ' && notion.lastStaysLast === 'ABXCZ', notion)
  check('blocks can be put in a new order, edited and removed', notion.reversed === 'ZCXBA' && notion.edited === 'changed' && notion.afterRemove === 4, notion)
  check('a database has items and properties that can be added, edited and removed', notion.item.title === 'Wash trucks' && notion.item.flag === true && notion.item.hasId && notion.itemEdited === 'Wash all trucks' && notion.propEdited === 'Finished' && notion.itemRemoved, notion)
  check('its title property cannot be removed; removing another also clears its values', notion.titleKept && notion.propRemoved.gone && notion.propRemoved.valueGone, notion)
  check('a page can be removed', notion.pageRemoved, notion)

  // ----------------------------------------------------------- EMS and CMS
  section('Energy meters and cranes')
  const ems = await page.evaluate(() => {
    const out = {}
    const meter = Store.addEmsMeter({ name: 'Press feeder', vpnMin: 220, vpnMax: 240, kwMin: 10, kwMax: 50 })
    out.metrics = meter.metrics.length
    out.voltage = meter.metrics.find((m) => m.key === 'vr').baseline
    out.power = { baseline: meter.metrics.find((m) => m.key === 'kw').baseline, amplitude: meter.metrics.find((m) => m.key === 'kw').amplitude }
    Store.updateEmsMeter(meter.id, { kwMin: 0, kwMax: 100 })
    out.powerAfter = Store.get().emsMeters.find((m) => m.id === meter.id).metrics.find((m) => m.key === 'kw').baseline
    const other = Store.addEmsMeter({ name: 'Bare meter' })
    out.fallback = other.metrics.find((m) => m.key === 'vr').baseline
    Store.removeEmsMeters([meter.id, other.id])
    out.removed = !Store.get().emsMeters.some((m) => [meter.id, other.id].includes(m.id))

    const reading = Store.addEmsTodReading({ meterId: 'x', value: 1 })
    Store.updateEmsTodReading(reading.id, { value: 2 })
    out.todEdited = Store.get().emsTodReadings.find((r) => r.id === reading.id).value
    Store.removeEmsTodReadings([reading.id])
    const energy = Store.addEmsEnergyData({ meterId: 'x', kwh: 5 })
    Store.updateEmsEnergyData(energy.id, { kwh: 6 })
    out.energyEdited = Store.get().emsEnergyData.find((e) => e.id === energy.id).kwh
    Store.removeEmsEnergyData([energy.id])
    out.readingsRemoved = !Store.get().emsTodReadings.some((r) => r.id === reading.id) && !Store.get().emsEnergyData.some((e) => e.id === energy.id)

    const machine = Store.addCmsMachine({ machineId: 'CR-9', deviceId: 'd1', name: 'Crane 9', maxCapacity: '12.5', safeWorkingLoad: 'abc', craneSpeed: '' })
    out.machine = { capacity: machine.maxCapacity, load: machine.safeWorkingLoad, speed: machine.craneSpeed, status: machine.status, connected: machine.connected, motors: Object.keys(machine.motors), alerts: machine.alerts.length }
    Store.updateCmsMachine(machine.id, { machineId: 'CR-9', deviceId: 'd1', name: 'Crane 9B', maxCapacity: 20, safeWorkingLoad: 15 })
    const updated = Store.get().cmsMachines.find((m) => m.id === machine.id)
    out.machineUpdated = { name: updated.name, capacity: updated.maxCapacity, status: updated.status }
    Store.removeCmsMachine(machine.id)
    out.machineRemoved = !Store.get().cmsMachines.some((m) => m.id === machine.id)
    return out
  })
  check('a meter gets ten electrical readings, centred on the ranges it was given', ems.metrics === 10 && ems.voltage === 230 && ems.power.baseline === 30 && ems.power.amplitude === 20, ems)
  check('changing a meter\'s range changes its readings', ems.powerAfter === 50, ems.powerAfter)
  check('a meter with no ranges uses the defaults', ems.fallback === 230, ems.fallback)
  check('meters, time-of-day readings and energy data can be added, edited and removed', ems.removed && ems.todEdited === 2 && ems.energyEdited === 6 && ems.readingsRemoved, ems)
  check('a crane\'s numbers are read as numbers (blank or not a number counts as 0), and it starts offline', ems.machine.capacity === 12.5 && ems.machine.load === 0 && ems.machine.speed === 0 && ems.machine.status === 'offline' && ems.machine.connected === false && same(ems.machine.motors, ['ct', 'lt', 'hoist']) && ems.machine.alerts === 0, ems.machine)
  check('a crane can be edited and removed', ems.machineUpdated.name === 'Crane 9B' && ems.machineUpdated.capacity === 20 && ems.machineUpdated.status === 'offline' && ems.machineRemoved, ems.machineUpdated)

  // ------------------------------------------------------------------ reset
  section('Starting again')
  const reset = await page.evaluate(() => {
    const before = Store.get()
    const seeded = { devices: before.devices.length, apps: before.applications.length, tenants: before.tenants.length }
    Store.addDevice({ name: 'One more', profileId: 'p1' })
    Store.addBackup({ name: 'x', pages: [], data: {} })
    const changed = Store.get().devices.length
    Store.reset()
    return { seeded, changed, after: { devices: Store.get().devices.length, backups: Store.listBackups().length, loggedIn: Store.isLoggedIn() } }
  })
  check('reset puts the demo data back, drops the backups and signs out', reset.changed === reset.seeded.devices + 1 && reset.after.devices === reset.seeded.devices && reset.after.backups === 0 && reset.after.loggedIn === false, reset)

  check('no JavaScript errors on the way', errors.length === 0, errors.slice(0, 5))
})
