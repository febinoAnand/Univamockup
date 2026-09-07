/* ==========================================================================
   Univa — static HTML build. Vanilla data layer.
   Stands in for the React app's Context providers: seed data lives here,
   persisted to localStorage so it survives navigation between the separate
   .html pages (each page load is a fresh JS runtime, unlike a real SPA).
   ========================================================================== */

// Bump this whenever DEFAULT_DATA's shape changes — loadData() shallow-merges
// stored data over the defaults, so a browser with an old key would otherwise
// keep serving stale/missing fields (e.g. undefined dates, dropped entities)
// forever instead of picking up fixes made here.
const STORAGE_KEY = 'univa-html-demo-v4'

const DEVICE_DEFAULT_METRICS = [{ key: 'value', label: 'Value', unit: '', baseline: 50, amplitude: 20, decimals: 1 }]

// Mirrors createDeviceRecord()/createAlert()/seedCommands() in
// src/modules/devices/deviceFactory.js so every device arrives with the same
// shape the real app seeds (metadata rows, one metric, one alert, two
// commands, an unavailable token) instead of Device detail hitting undefined.
function deviceSeed(base) {
  const metadata = [
    { id: base.id + '-md1', key: 'appName', value: base.profileName },
    { id: base.id + '-md2', key: 'appVersion.name', value: base.profileName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) + '-v1' },
    { id: base.id + '-md3', key: 'appVersion.registeredDate', value: base.createdDate },
    { id: base.id + '-md4', key: 'createdDate', value: base.createdDate },
    { id: base.id + '-md5', key: 'deviceId', value: base.endpointId },
  ]
  return Object.assign({}, base, {
    createdAt: base.createdAt || Date.now() - Math.floor((2 + Math.random() * 46) * 3600000),
    applicationName: base.profileName,
    appVersionName: base.profileName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) + '-v1',
    appVersionRegisteredDate: base.createdDate,
    metadata: metadata,
    metrics: DEVICE_DEFAULT_METRICS,
    commandNames: ['Ping', 'Restart', 'Request status report'],
    tokenStatus: 'unavailable',
    tokenValue: null,
    tokenUpdatedDate: base.metadataUpdatedDate,
    relations: [],
    logs: [],
    alerts: [{
      id: base.id + '-alert1',
      alertType: base.alertType,
      severity: base.severity,
      activateReason: base.alertReason,
      resolveReason: '',
      state: 'active',
      acknowledgedBy: '',
      acknowledgedDate: '',
      metadata: JSON.stringify({ metric: 'value' }),
      activationMetadata: JSON.stringify({ metric: 'value', reason: base.alertReason }),
      resolutionMetadata: '',
      createdDate: base.metadataUpdatedDate,
    }],
    commands: [
      { id: base.id + '-cmd1', name: 'Ping', params: '{}', executionType: 'async', status: 'delivered', statusCode: 200, reasonPhrase: 'OK', responsePayload: '{"result":"ok"}', createdDate: base.createdDate, updatedDate: base.createdDate },
      { id: base.id + '-cmd2', name: 'Restart', params: '{}', executionType: 'async', status: 'delivered', statusCode: 200, reasonPhrase: 'OK', responsePayload: '{"result":"ok"}', createdDate: base.metadataUpdatedDate, updatedDate: base.metadataUpdatedDate },
    ],
  })
}

const DEFAULT_DATA = {
  auth: { loggedIn: false, username: '', pendingApproval: false },
  devices: [
    deviceSeed({ id: 'd1', name: 'Forklift Unit 3', endpointId: 'ep-88213', state: 'online', profileName: 'Vehicles', createdDate: '2025-11-02 09:14:00', metadataUpdatedDate: '2026-02-11 08:02:00', severity: 'warning', alertType: 'Threshold breach', alertReason: 'Value reached 68.4 (threshold 64.0)' }),
    deviceSeed({ id: 'd2', name: 'HVAC Compressor A', endpointId: 'ep-77410', state: 'online', profileName: 'HVAC units', createdDate: '2025-12-19 14:02:00', metadataUpdatedDate: '2026-01-30 11:47:00', severity: 'minor', alertType: 'Threshold breach', alertReason: 'Value reached 61.2 (threshold 60.0)' }),
    deviceSeed({ id: 'd3', name: 'Rooftop HVAC unit', endpointId: 'ep-65310', state: 'offline', profileName: 'HVAC units', createdDate: '2026-01-08 11:47:00', metadataUpdatedDate: '2026-01-08 11:47:00', severity: 'critical', alertType: 'Device disconnected', alertReason: 'No heartbeat received for 15 minutes' }),
    deviceSeed({ id: 'd4', name: 'Generator 12', endpointId: 'ep-90142', state: 'online', profileName: 'Generators', createdDate: '2026-03-22 08:30:00', metadataUpdatedDate: '2026-03-22 08:30:00', severity: 'warning', alertType: 'Threshold breach', alertReason: 'Value reached 71.8 (threshold 70.0)' }),
    deviceSeed({ id: 'd5', name: 'Forklift Unit 7', endpointId: 'ep-90188', state: 'offline', profileName: 'Vehicles', createdDate: '2026-03-30 10:05:00', metadataUpdatedDate: '2026-03-30 10:05:00', severity: 'minor', alertType: 'Threshold breach', alertReason: 'Value reached 58.9 (threshold 55.0)' }),
  ],
  deviceProfiles: [
    { id: 'p1', name: 'Vehicles', description: 'Vehicle telemetry profile.', metadata: [], isDefault: true, createdDate: '2025-11-02 09:14:00' },
    { id: 'p2', name: 'HVAC units', description: 'Commercial HVAC monitoring profile.', metadata: [], isDefault: false, createdDate: '2025-12-19 14:02:00' },
    { id: 'p3', name: 'Generators', description: 'Backup generator telemetry profile.', metadata: [], isDefault: false, createdDate: '2026-01-08 11:47:00' },
  ],
  applications: [
    { id: 'app1', name: 'Fleet Tracker', profileName: 'Web application', description: 'Customer-facing dashboard for live fleet tracking.', status: 'active', metadata: [], createdDate: '2025-11-02 09:14:00' },
    { id: 'app2', name: 'Field Technician', profileName: 'Mobile application', description: 'Companion app for on-site maintenance crews.', status: 'active', metadata: [], createdDate: '2025-12-19 14:02:00' },
    { id: 'app3', name: 'Telemetry Ingest', profileName: 'Background service', description: 'Ingests and normalizes incoming device telemetry.', status: 'suspended', metadata: [], createdDate: '2026-01-08 11:47:00' },
  ],
  applicationProfiles: [
    { id: 'ap1', name: 'Web application', description: 'Browser-based application served over HTTPS.', metadata: [], isDefault: true, createdDate: '2025-11-02 09:14:00' },
    { id: 'ap2', name: 'Mobile application', description: 'Native iOS/Android companion application.', metadata: [], isDefault: false, createdDate: '2025-12-19 14:02:00' },
    { id: 'ap3', name: 'Background service', description: 'Headless service with no direct user interface.', metadata: [], isDefault: false, createdDate: '2026-01-08 11:47:00' },
  ],
  assets: [
    { id: 'a1', name: 'Forklift Unit 3', groupNames: ['Vehicles'], profileName: 'Forklift', status: 'operational', location: 'North Yard', deviceIds: [], metadata: [], createdDate: '2025-11-05 10:00:00' },
    { id: 'a2', name: 'HVAC Compressor A', groupNames: ['HVAC units'], profileName: 'Rooftop HVAC unit', status: 'maintenance', location: 'Building 2 Roof', deviceIds: [], metadata: [], createdDate: '2025-12-20 09:30:00' },
    { id: 'a3', name: 'Generator 12', groupNames: ['Generators'], profileName: 'Diesel generator', status: 'operational', location: 'East Depot', deviceIds: [], metadata: [], createdDate: '2026-01-09 13:15:00' },
    { id: 'a4', name: 'Forklift Unit 7', groupNames: ['Vehicles'], profileName: 'Forklift', status: 'offline', location: 'Harbor Dock', deviceIds: [], metadata: [], createdDate: '2026-03-22 08:45:00' },
  ],
  assetGroups: [
    { id: 'ag1', name: 'Vehicles', description: 'Forklifts, mobile cranes, and site transport.', createdDate: '2025-11-02 09:14:00' },
    { id: 'ag2', name: 'HVAC units', description: 'Rooftop and facility climate-control equipment.', createdDate: '2025-12-19 14:02:00' },
    { id: 'ag3', name: 'Generators', description: 'Backup and site power generation equipment.', createdDate: '2026-01-08 11:47:00' },
  ],
  assetProfiles: [
    { id: 'ap1', name: 'Forklift', category: 'Vehicle', description: 'Standard warehouse forklift telemetry profile.', metadata: [], createdDate: '2025-11-02 09:16:00' },
    { id: 'ap2', name: 'Rooftop HVAC unit', category: 'Facility equipment', description: 'Commercial HVAC monitoring profile.', metadata: [], createdDate: '2025-12-19 14:05:00' },
    { id: 'ap3', name: 'Diesel generator', category: 'Power equipment', description: 'Backup generator telemetry profile.', metadata: [], createdDate: '2026-01-08 11:50:00' },
  ],
  ruleEngines: [
    { id: 're1', name: 'High temperature alert', description: 'Raises an alarm when a device reports an unusually high temperature.', conditionMetric: 'temperature', conditionOperator: '>', conditionValue: '30', triggerType: 'Telemetry received', actionType: 'Create alarm', actionDetail: 'Critical', createdDate: '2025-11-02 09:14:00' },
    { id: 're2', name: 'Device offline notice', description: 'Notifies the operations team when a device disconnects.', conditionMetric: '', conditionOperator: '>', conditionValue: '', triggerType: 'Device disconnected', actionType: 'Send email', actionDetail: 'ops@monitoring.example', createdDate: '2026-02-11 15:40:00' },
  ],
  ruleEngineExecutions: [
    { id: 'rx1', ruleEngineName: 'High temperature alert', triggeredAt: '2026-03-20 09:12:44', triggerType: 'Telemetry received', condition: 'temperature > 30', actionType: 'Create alarm', outcome: 'success' },
    { id: 'rx2', ruleEngineName: 'Device offline notice', triggeredAt: '2026-03-19 22:47:03', triggerType: 'Device disconnected', condition: 'Always', actionType: 'Send email', outcome: 'success' },
    { id: 'rx3', ruleEngineName: 'High temperature alert', triggeredAt: '2026-03-18 14:03:57', triggerType: 'Telemetry received', condition: 'temperature > 30', actionType: 'Create alarm', outcome: 'failed' },
  ],
  tenants: [
    { id: 't1', title: 'Northbridge Logistics', email: 'admin@northbridge.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'United States', tenantProfileName: 'Enterprise', deviceCount: 128, status: 'active', createdDate: '2025-11-02 09:14:00',
      users: [
        { id: 'tu1', name: 'Dana Whitfield', email: 'dana.whitfield@northbridge.com', role: 'Owner', status: 'active', createdDate: '2025-11-02 09:20:00' },
        { id: 'tu2', name: 'Omar Salim', email: 'omar.salim@northbridge.com', role: 'Admin', status: 'active', createdDate: '2025-12-01 10:05:00' },
      ],
      devices: [
        { id: 'td1', name: 'Warehouse Scanner 1', status: 'operational', createdDate: '2025-11-05 09:00:00' },
        { id: 'td2', name: 'Loading Dock Sensor', status: 'offline', createdDate: '2025-12-14 13:30:00' },
      ],
      applications: [
        { id: 'ta1', name: 'Fleet Tracker', status: 'active', createdDate: '2025-11-06 08:00:00' },
      ],
    },
    { id: 't2', title: 'Cradlewell Facilities', email: 'admin@cradlewell.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'United Kingdom', tenantProfileName: 'Default', deviceCount: 42, status: 'active', createdDate: '2025-12-19 14:02:00',
      users: [
        { id: 'tu3', name: 'Isla Brennan', email: 'isla.brennan@cradlewell.com', role: 'Owner', status: 'active', createdDate: '2025-12-19 14:10:00' },
      ],
      devices: [
        { id: 'td3', name: 'HVAC Controller B2', status: 'operational', createdDate: '2025-12-20 09:15:00' },
      ],
      applications: [
        { id: 'ta2', name: 'Facilities Dashboard', status: 'active', createdDate: '2025-12-21 11:00:00' },
      ],
    },
    { id: 't3', title: 'Harbor Dock Ops', email: 'admin@harbordock.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'Canada', tenantProfileName: 'Default', deviceCount: 67, status: 'suspended', createdDate: '2026-01-08 11:47:00', users: [], devices: [], applications: [] },
    { id: 't4', title: 'East Depot Rentals', email: 'admin@eastdepot.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'United States', tenantProfileName: 'Default', deviceCount: 9, status: 'active', createdDate: '2026-03-22 08:30:00', users: [], devices: [], applications: [] },
  ],
  tenantProfiles: [
    { id: 'tp1', name: 'Default', description: 'Default tenant profile with standard platform limits.', isDefault: true, maxDevices: 500, maxAssets: 500, maxUsers: 50, maxDashboards: 50, createdDate: '2025-11-02 09:10:00' },
    { id: 'tp2', name: 'Enterprise', description: 'Higher limits for large multi-site tenants.', isDefault: false, maxDevices: 5000, maxAssets: 5000, maxUsers: 500, maxDashboards: 200, createdDate: '2025-12-05 10:00:00' },
  ],
  users: [
    { id: 'u1', name: 'Alicia Ferrer', email: 'alicia.ferrer@example.com', role: 'Owner', groupNames: ['Administrators'], status: 'active', createdDate: '2025-11-02 09:20:00' },
    { id: 'u2', name: 'Marcus Wren', email: 'marcus.wren@example.com', role: 'Admin', groupNames: ['Administrators'], status: 'active', createdDate: '2025-12-19 14:10:00' },
    { id: 'u3', name: 'Priya Nandakumar', email: 'priya.n@example.com', role: 'Member', groupNames: ['Operators'], status: 'active', createdDate: '2026-01-08 12:05:00' },
    { id: 'u4', name: 'Tomas Reyes', email: 'tomas.reyes@example.com', role: 'Member', groupNames: ['Viewers'], status: 'invited', createdDate: '2026-03-22 08:41:00' },
  ],
  userGroups: [
    { id: 'g1', name: 'Administrators', description: 'Full access to devices, applications, solutions, and settings.', createdDate: '2025-11-02 09:14:00' },
    { id: 'g2', name: 'Operators', description: 'Can view and control devices; no billing or settings access.', createdDate: '2025-12-19 14:02:00' },
    { id: 'g3', name: 'Viewers', description: 'Read-only access to dashboards and device data.', createdDate: '2026-01-08 11:47:00' },
  ],
  shifts: [
    { id: 'sh1', name: 'Morning shift', startTime: '06:00', endTime: '14:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], userIds: ['u1', 'u3'], status: 'active', createdDate: '2025-11-02 09:14:00' },
    { id: 'sh2', name: 'Evening shift', startTime: '14:00', endTime: '22:00', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], userIds: ['u2'], status: 'active', createdDate: '2025-12-19 14:02:00' },
    { id: 'sh3', name: 'Night shift', startTime: '22:00', endTime: '06:00', days: ['Sat', 'Sun'], userIds: [], status: 'suspended', createdDate: '2026-01-08 11:47:00' },
  ],
}

const DEMO_ACCOUNTS = {
  admin: { password: 'admin', pendingApproval: false },
  adminapprove: { password: 'admin', pendingApproval: true },
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredCloneSafe(DEFAULT_DATA)
    const parsed = JSON.parse(raw)
    // shallow-merge so new seed keys introduced later still show up
    return Object.assign(structuredCloneSafe(DEFAULT_DATA), parsed)
  } catch (err) {
    return structuredCloneSafe(DEFAULT_DATA)
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function uid(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 9)
}

function nowStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function findTenant(store, tenantId) {
  return store.tenants.find((t) => t.id === tenantId)
}

const Store = {
  get() {
    return loadData()
  },

  reset() {
    saveData(structuredCloneSafe(DEFAULT_DATA))
  },

  // ---------------------------------------------------------------- auth
  login(username, password) {
    const key = username.trim().toLowerCase()
    const account = DEMO_ACCOUNTS[key]
    if (!account || account.password !== password) {
      return { ok: false, error: 'Invalid username or password' }
    }
    if (account.pendingApproval) {
      return { ok: false, pendingApproval: true }
    }
    const data = loadData()
    data.auth = { loggedIn: true, username: key, pendingApproval: false }
    saveData(data)
    return { ok: true }
  },

  logout() {
    const data = loadData()
    data.auth = { loggedIn: false, username: '', pendingApproval: false }
    saveData(data)
  },

  isLoggedIn() {
    return loadData().auth.loggedIn === true
  },

  requireAuth() {
    if (!Store.isLoggedIn()) {
      window.location.href = 'login.html'
    }
  },

  // ------------------------------------------------------------- devices
  addDevice({ name, profileId, endpointToken }) {
    const data = loadData()
    const profile = data.deviceProfiles.find((p) => p.id === profileId) || data.deviceProfiles[0]
    const id = uid('d')
    const stamp = nowStamp()
    const record = deviceSeed({
      id: id,
      name: name,
      endpointId: 'ep-' + Math.floor(10000 + Math.random() * 89999),
      state: 'offline',
      profileName: profile ? profile.name : 'Default',
      createdDate: stamp,
      metadataUpdatedDate: stamp,
      severity: 'warning',
      alertType: 'Threshold breach',
      alertReason: 'Value reached 65.0 (threshold 60.0)',
    })
    data.devices.push(record)
    saveData(data)
    return record
  },

  updateDevice(id, { name }) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === id)
    if (device) device.name = name
    saveData(data)
    return device
  },

  deleteDevice(id) {
    const data = loadData()
    data.devices = data.devices.filter((d) => d.id !== id)
    saveData(data)
  },

  addMetadataField(deviceId, key, value) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) device.metadata.push({ id: uid('md'), key: key, value: value })
    saveData(data)
  },
  removeMetadataField(deviceId, fieldId) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) device.metadata = device.metadata.filter((f) => f.id !== fieldId)
    saveData(data)
  },
  updateMetadataField(deviceId, fieldId, value) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) {
      const field = device.metadata.find((f) => f.id === fieldId)
      if (field) field.value = value
    }
    saveData(data)
  },
  activateToken(deviceId) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) {
      device.tokenStatus = 'active'
      device.tokenValue = uid('tok').replace(/-/g, '') + uid('tok').replace(/-/g, '')
      device.tokenUpdatedDate = nowStamp()
    }
    saveData(data)
  },
  setTokenStatus(deviceId, status) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) { device.tokenStatus = status; device.tokenUpdatedDate = nowStamp() }
    saveData(data)
  },
  acknowledgeAlert(deviceId, alertId) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) {
      const alert = device.alerts.find((a) => a.id === alertId)
      if (alert) { alert.state = 'acknowledged'; alert.acknowledgedBy = 'You'; alert.acknowledgedDate = nowStamp() }
    }
    saveData(data)
  },
  resolveAlert(deviceId, alertId, resolveReason) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) {
      const alert = device.alerts.find((a) => a.id === alertId)
      if (alert) {
        alert.state = 'resolved'
        alert.resolveReason = resolveReason
        alert.resolutionMetadata = JSON.stringify({ resolvedBy: 'You', resolvedAt: nowStamp() })
      }
    }
    saveData(data)
  },
  sendCommand(deviceId, payload) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (!device) return
    const commandId = uid('cmd')
    const stamp = nowStamp()
    device.commands.unshift({
      id: commandId, name: payload.name, params: payload.params, executionType: payload.executionType,
      status: 'pending', statusCode: null, reasonPhrase: 'Pending', responsePayload: '',
      createdDate: stamp, updatedDate: stamp,
    })
    saveData(data)
    function resolveCommand() {
      const latest = loadData()
      const dev = latest.devices.find((d) => d.id === deviceId)
      if (!dev) return
      const command = dev.commands.find((c) => c.id === commandId)
      if (!command) return
      const succeeded = Math.random() < 0.85
      command.status = succeeded ? 'delivered' : 'failed'
      command.statusCode = succeeded ? 200 : 504
      command.reasonPhrase = succeeded ? 'OK' : 'Gateway Timeout'
      command.responsePayload = succeeded ? '{"result":"ok"}' : '{"error":"timeout"}'
      command.updatedDate = nowStamp()
      saveData(latest)
    }
    if (payload.executionType === 'sync') resolveCommand()
    else setTimeout(resolveCommand, 1200 + Math.random() * 1800)
  },
  addRelation(deviceId, relation) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) device.relations.push(Object.assign({ id: uid('rel'), createdDate: nowStamp() }, relation))
    saveData(data)
  },
  removeRelation(deviceId, relationId) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (device) device.relations = device.relations.filter((r) => r.id !== relationId)
    saveData(data)
  },
  sendDataSample(deviceId) {
    const data = loadData()
    const device = data.devices.find((d) => d.id === deviceId)
    if (!device) return
    const stamp = nowStamp()
    const correlationId = uid('log').replace(/-/g, '').slice(0, 16)
    const requestId = String(Math.floor(1 + Math.random() * 999))
    const samplePayload = {}
    device.metrics.forEach((metric) => { samplePayload[metric.key] = metric.baseline })
    device.logs.unshift(
      { id: uid('log'), correlationId: correlationId, feature: 'Data Collection', requestId: requestId, direction: 'outbound', resourcePath: '/json', statusCode: 200, payload: '', additionalMetadata: JSON.stringify({ processedAt: stamp }), createdAt: stamp },
      { id: uid('log'), correlationId: correlationId, feature: 'Data Collection', requestId: requestId, direction: 'inbound', resourcePath: '/json', statusCode: null, payload: JSON.stringify(samplePayload), additionalMetadata: '', createdAt: stamp },
    )
    saveData(data)
  },

  // ---------------------------------------------------- device profiles
  addDeviceProfile(data) {
    const store = loadData()
    const record = { id: uid('p'), name: data.name, description: data.description, metadata: data.metadata ?? [], isDefault: false, createdDate: nowStamp() }
    store.deviceProfiles.push(record)
    saveData(store)
    return record
  },
  updateDeviceProfile(id, data) {
    const store = loadData()
    const previous = store.deviceProfiles.find((p) => p.id === id)
    if (previous && previous.name !== data.name) {
      store.devices.forEach((d) => {
        if (d.profileName === previous.name) d.profileName = data.name
      })
    }
    if (previous) Object.assign(previous, { name: data.name, description: data.description, metadata: data.metadata ?? previous.metadata })
    saveData(store)
  },
  removeDeviceProfile(id) {
    const store = loadData()
    store.deviceProfiles = store.deviceProfiles.filter((p) => p.id !== id)
    saveData(store)
  },
  setDefaultDeviceProfile(id) {
    const store = loadData()
    store.deviceProfiles.forEach((p) => { p.isDefault = p.id === id })
    saveData(store)
  },

  // -------------------------------------------------------- applications
  addApplication(data) {
    const store = loadData()
    const record = { id: uid('apn'), name: data.name, profileName: data.profileName, description: data.description, status: 'active', metadata: data.metadata ?? [], createdDate: nowStamp() }
    store.applications.push(record)
    saveData(store)
    return record
  },
  updateApplication(id, data) {
    const store = loadData()
    const app = store.applications.find((a) => a.id === id)
    if (app) Object.assign(app, { name: data.name, profileName: data.profileName, description: data.description, metadata: data.metadata ?? app.metadata })
    saveData(store)
  },
  toggleApplicationStatus(id) {
    const store = loadData()
    const app = store.applications.find((a) => a.id === id)
    if (app) app.status = app.status === 'active' ? 'suspended' : 'active'
    saveData(store)
  },
  removeApplication(id) {
    const store = loadData()
    store.applications = store.applications.filter((a) => a.id !== id)
    saveData(store)
  },

  addApplicationProfile(data) {
    const store = loadData()
    const record = { id: uid('apf'), name: data.name, description: data.description, metadata: data.metadata ?? [], isDefault: false, createdDate: nowStamp() }
    store.applicationProfiles.push(record)
    saveData(store)
    return record
  },
  updateApplicationProfile(id, data) {
    const store = loadData()
    const previous = store.applicationProfiles.find((p) => p.id === id)
    if (previous && previous.name !== data.name) {
      store.applications.forEach((app) => {
        if (app.profileName === previous.name) app.profileName = data.name
      })
    }
    if (previous) Object.assign(previous, { name: data.name, description: data.description, metadata: data.metadata ?? previous.metadata })
    saveData(store)
  },
  setDefaultApplicationProfile(id) {
    const store = loadData()
    store.applicationProfiles.forEach((p) => { p.isDefault = p.id === id })
    saveData(store)
  },
  removeApplicationProfile(id) {
    const store = loadData()
    store.applicationProfiles = store.applicationProfiles.filter((p) => p.id !== id)
    saveData(store)
  },

  // ------------------------------------------------------------- assets
  addAsset(data) {
    const store = loadData()
    const record = { id: uid('a'), name: data.name, groupNames: data.groupNames ?? [], profileName: data.profileName, status: 'operational', location: data.location, deviceIds: data.deviceIds ?? [], metadata: data.metadata ?? [], createdDate: nowStamp() }
    store.assets.push(record)
    saveData(store)
    return record
  },
  updateAsset(id, data) {
    const store = loadData()
    const asset = store.assets.find((a) => a.id === id)
    if (asset) Object.assign(asset, { name: data.name, groupNames: data.groupNames ?? [], profileName: data.profileName, location: data.location, deviceIds: data.deviceIds ?? [], metadata: data.metadata ?? asset.metadata })
    saveData(store)
  },
  toggleAssetStatus(id) {
    const store = loadData()
    const asset = store.assets.find((a) => a.id === id)
    if (asset) asset.status = asset.status === 'operational' ? 'offline' : 'operational'
    saveData(store)
  },
  removeAsset(id) {
    const store = loadData()
    store.assets = store.assets.filter((a) => a.id !== id)
    saveData(store)
  },

  addAssetGroup(data) {
    const store = loadData()
    const record = { id: uid('ag'), name: data.name, description: data.description, createdDate: nowStamp() }
    store.assetGroups.push(record)
    saveData(store)
    return record
  },
  updateAssetGroup(id, data) {
    const store = loadData()
    const previous = store.assetGroups.find((g) => g.id === id)
    if (previous && previous.name !== data.name) {
      store.assets.forEach((asset) => {
        asset.groupNames = asset.groupNames.map((name) => (name === previous.name ? data.name : name))
      })
    }
    if (previous) Object.assign(previous, { name: data.name, description: data.description })
    saveData(store)
  },
  removeAssetGroup(id) {
    const store = loadData()
    store.assetGroups = store.assetGroups.filter((g) => g.id !== id)
    saveData(store)
  },

  addAssetProfile(data) {
    const store = loadData()
    const record = { id: uid('ap'), name: data.name, category: data.category, description: data.description, metadata: data.metadata ?? [], createdDate: nowStamp() }
    store.assetProfiles.push(record)
    saveData(store)
    return record
  },
  updateAssetProfile(id, data) {
    const store = loadData()
    const previous = store.assetProfiles.find((p) => p.id === id)
    if (previous && previous.name !== data.name) {
      store.assets.forEach((asset) => {
        if (asset.profileName === previous.name) asset.profileName = data.name
      })
    }
    if (previous) Object.assign(previous, { name: data.name, category: data.category, description: data.description, metadata: data.metadata ?? previous.metadata })
    saveData(store)
  },
  removeAssetProfile(id) {
    const store = loadData()
    store.assetProfiles = store.assetProfiles.filter((p) => p.id !== id)
    saveData(store)
  },

  // -------------------------------------------------------- rule engines
  addRuleEngine(data) {
    const store = loadData()
    const record = { id: uid('re'), ...data, createdDate: nowStamp() }
    store.ruleEngines.push(record)
    saveData(store)
    return record
  },
  updateRuleEngine(id, data) {
    const store = loadData()
    const record = store.ruleEngines.find((r) => r.id === id)
    if (record) Object.assign(record, data)
    saveData(store)
  },
  removeRuleEngine(id) {
    const store = loadData()
    store.ruleEngines = store.ruleEngines.filter((r) => r.id !== id)
    saveData(store)
  },

  // -------------------------------------------------------------- tenants
  addTenant(data) {
    const store = loadData()
    const record = { id: uid('t'), ...data, deviceCount: 0, status: 'active', createdDate: nowStamp(), users: [], devices: [], applications: [] }
    store.tenants.push(record)
    saveData(store)
    return record
  },
  updateTenant(id, data) {
    const store = loadData()
    const record = store.tenants.find((t) => t.id === id)
    if (record) Object.assign(record, data)
    saveData(store)
  },
  toggleTenantStatus(id) {
    const store = loadData()
    const record = store.tenants.find((t) => t.id === id)
    if (record) record.status = record.status === 'active' ? 'suspended' : 'active'
    saveData(store)
  },
  removeTenant(id) {
    const store = loadData()
    store.tenants = store.tenants.filter((t) => t.id !== id)
    saveData(store)
  },

  addTenantProfile(data) {
    const store = loadData()
    const record = { id: uid('tp'), ...data, isDefault: false, createdDate: nowStamp() }
    store.tenantProfiles.push(record)
    saveData(store)
    return record
  },
  updateTenantProfile(id, data) {
    const store = loadData()
    const previous = store.tenantProfiles.find((p) => p.id === id)
    if (previous && previous.name !== data.name) {
      store.tenants.forEach((tenant) => {
        if (tenant.tenantProfileName === previous.name) tenant.tenantProfileName = data.name
      })
    }
    if (previous) Object.assign(previous, data)
    saveData(store)
  },
  setDefaultTenantProfile(id) {
    const store = loadData()
    store.tenantProfiles.forEach((p) => { p.isDefault = p.id === id })
    saveData(store)
  },
  removeTenantProfile(id) {
    const store = loadData()
    store.tenantProfiles = store.tenantProfiles.filter((p) => p.id !== id)
    saveData(store)
  },

  // ------------------------------------------------------ tenant resources
  addTenantUser(tenantId, data) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (!tenant) return
    const record = { id: uid('tu'), name: data.name, email: data.email, role: data.role, status: 'active', createdDate: nowStamp() }
    tenant.users.push(record)
    saveData(store)
    return record
  },
  updateTenantUser(tenantId, userId, data) {
    const store = loadData()
    const user = findTenant(store, tenantId)?.users.find((u) => u.id === userId)
    if (user) Object.assign(user, { name: data.name, email: data.email, role: data.role })
    saveData(store)
  },
  toggleTenantUserStatus(tenantId, userId) {
    const store = loadData()
    const user = findTenant(store, tenantId)?.users.find((u) => u.id === userId)
    if (user) user.status = user.status === 'active' ? 'suspended' : 'active'
    saveData(store)
  },
  removeTenantUser(tenantId, userId) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (tenant) tenant.users = tenant.users.filter((u) => u.id !== userId)
    saveData(store)
  },

  addTenantDevice(tenantId, data) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (!tenant) return
    const record = { id: uid('td'), name: data.name, status: 'offline', createdDate: nowStamp() }
    tenant.devices.push(record)
    saveData(store)
    return record
  },
  updateTenantDevice(tenantId, deviceId, data) {
    const store = loadData()
    const device = findTenant(store, tenantId)?.devices.find((d) => d.id === deviceId)
    if (device) device.name = data.name
    saveData(store)
  },
  toggleTenantDeviceStatus(tenantId, deviceId) {
    const store = loadData()
    const device = findTenant(store, tenantId)?.devices.find((d) => d.id === deviceId)
    if (device) device.status = device.status === 'operational' ? 'offline' : 'operational'
    saveData(store)
  },
  removeTenantDevice(tenantId, deviceId) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (tenant) tenant.devices = tenant.devices.filter((d) => d.id !== deviceId)
    saveData(store)
  },

  addTenantApplication(tenantId, data) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (!tenant) return
    const record = { id: uid('ta'), name: data.name, status: 'active', createdDate: nowStamp() }
    tenant.applications.push(record)
    saveData(store)
    return record
  },
  updateTenantApplication(tenantId, appId, data) {
    const store = loadData()
    const app = findTenant(store, tenantId)?.applications.find((a) => a.id === appId)
    if (app) app.name = data.name
    saveData(store)
  },
  toggleTenantApplicationStatus(tenantId, appId) {
    const store = loadData()
    const app = findTenant(store, tenantId)?.applications.find((a) => a.id === appId)
    if (app) app.status = app.status === 'active' ? 'suspended' : 'active'
    saveData(store)
  },
  removeTenantApplication(tenantId, appId) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (tenant) tenant.applications = tenant.applications.filter((a) => a.id !== appId)
    saveData(store)
  },

  // ---------------------------------------------------------------- users
  addUser({ name, email, role, groupNames, mode }) {
    const data = loadData()
    const record = {
      id: uid('u'),
      name,
      email,
      role,
      groupNames: groupNames ?? [],
      status: mode === 'add' ? 'active' : 'invited',
      createdDate: nowStamp(),
    }
    data.users.push(record)
    saveData(data)
    return record
  },

  updateUser(id, { name, email, role, groupNames }) {
    const data = loadData()
    const user = data.users.find((u) => u.id === id)
    if (user) Object.assign(user, { name, email, role, groupNames: groupNames ?? [] })
    saveData(data)
    return user
  },

  toggleUserStatus(id) {
    const data = loadData()
    const user = data.users.find((u) => u.id === id)
    if (user) user.status = user.status === 'active' ? 'suspended' : 'active'
    saveData(data)
  },

  deleteUser(id) {
    const data = loadData()
    data.users = data.users.filter((u) => u.id !== id)
    saveData(data)
  },

  addUserGroup(data) {
    const store = loadData()
    const record = { id: uid('g'), name: data.name, description: data.description, createdDate: nowStamp() }
    store.userGroups.push(record)
    saveData(store)
    return record
  },
  updateUserGroup(id, data) {
    const store = loadData()
    const previous = store.userGroups.find((g) => g.id === id)
    if (previous && previous.name !== data.name) {
      store.users.forEach((user) => {
        user.groupNames = user.groupNames.map((name) => (name === previous.name ? data.name : name))
      })
    }
    if (previous) Object.assign(previous, { name: data.name, description: data.description })
    saveData(store)
  },
  removeUserGroup(id) {
    const store = loadData()
    store.userGroups = store.userGroups.filter((g) => g.id !== id)
    saveData(store)
  },

  // ------------------------------------------------------------- shifts
  addShift(data) {
    const store = loadData()
    const record = { id: uid('sh'), name: data.name, startTime: data.startTime, endTime: data.endTime, days: data.days ?? [], userIds: data.userIds ?? [], status: 'active', createdDate: nowStamp() }
    store.shifts.push(record)
    saveData(store)
    return record
  },
  updateShift(id, data) {
    const store = loadData()
    const shift = store.shifts.find((s) => s.id === id)
    if (shift) Object.assign(shift, { name: data.name, startTime: data.startTime, endTime: data.endTime, days: data.days ?? [], userIds: data.userIds ?? [] })
    saveData(store)
  },
  toggleShiftStatus(id) {
    const store = loadData()
    const shift = store.shifts.find((s) => s.id === id)
    if (shift) shift.status = shift.status === 'active' ? 'suspended' : 'active'
    saveData(store)
  },
  removeShift(id) {
    const store = loadData()
    store.shifts = store.shifts.filter((s) => s.id !== id)
    saveData(store)
  },
}

window.Store = Store
