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
const STORAGE_KEY = 'univa-html-demo-v20'

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

// Derives an EMS meter's electrical-parameter simulation config (same
// {key,label,unit,baseline,amplitude,decimals} shape as a device's own
// .metrics — see DEVICE_DEFAULT_METRICS) from the meter's configured
// min/max spec fields, so shared/dashboard.js's existing device-telemetry
// engine can simulate live VR/VY/VB/IR/IY/IB/kW/kVA/Freq/PF readings for a
// meter with zero changes to that engine.
function emsMeterMetrics(m) {
  const range = (min, max, fallbackBaseline, fallbackAmplitude) => {
    if (typeof min === 'number' && typeof max === 'number' && max > min) return { baseline: (min + max) / 2, amplitude: (max - min) / 2 }
    return { baseline: fallbackBaseline, amplitude: fallbackAmplitude }
  }
  const v = range(m.vpnMin, m.vpnMax, 230, 10)
  const i = range(m.iMin, m.iMax, 40, 15)
  const kw = range(m.kwMin, m.kwMax, 120, 60)
  const kva = range(m.kvaMin, m.kvaMax, 140, 60)
  const freq = range(m.freqMin, m.freqMax, 50, 0.3)
  return [
    { key: 'vr', label: 'VR', unit: 'V', baseline: v.baseline, amplitude: v.amplitude, decimals: 1 },
    { key: 'vy', label: 'VY', unit: 'V', baseline: v.baseline, amplitude: v.amplitude, decimals: 1 },
    { key: 'vb', label: 'VB', unit: 'V', baseline: v.baseline, amplitude: v.amplitude, decimals: 1 },
    { key: 'ir', label: 'IR', unit: 'A', baseline: i.baseline, amplitude: i.amplitude, decimals: 1 },
    { key: 'iy', label: 'IY', unit: 'A', baseline: i.baseline, amplitude: i.amplitude, decimals: 1 },
    { key: 'ib', label: 'IB', unit: 'A', baseline: i.baseline, amplitude: i.amplitude, decimals: 1 },
    { key: 'kw', label: 'Active power', unit: 'kW', baseline: kw.baseline, amplitude: kw.amplitude, decimals: 2 },
    { key: 'kva', label: 'Apparent power', unit: 'kVA', baseline: kva.baseline, amplitude: kva.amplitude, decimals: 2 },
    { key: 'freq', label: 'Frequency', unit: 'Hz', baseline: freq.baseline, amplitude: freq.amplitude, decimals: 2 },
    { key: 'pf', label: 'Power factor', unit: '', baseline: 0.92, amplitude: 0.05, decimals: 2 },
  ]
}
function emsMeterSeed(base) {
  return Object.assign({}, base, { metrics: emsMeterMetrics(base) })
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
    { id: 'app0', name: 'PMS', description: 'Built-in system application available to every tenant.', status: 'active', deviceIds: [], assetIds: [], groupNames: [], metadata: [], icon: 'dashboard', isDefault: true, createdDate: '2025-11-01 08:00:00' },
    { id: 'app_ems', name: 'EMS', description: 'Built-in energy management application available to every tenant.', status: 'active', deviceIds: [], assetIds: [], groupNames: [], metadata: [], icon: 'report', isDefault: true, createdDate: '2025-11-01 08:00:00' },
    { id: 'app1', name: 'Fleet Tracker', description: 'Customer-facing dashboard for live fleet tracking.', status: 'active', deviceIds: ['d1', 'd5'], assetIds: ['a1', 'a4'], groupNames: ['Vehicles'], metadata: [], icon: 'asset', createdDate: '2025-11-02 09:14:00' },
    { id: 'app2', name: 'Field Technician', description: 'Companion app for on-site maintenance crews.', status: 'active', deviceIds: ['d2'], assetIds: ['a2'], groupNames: ['HVAC units'], metadata: [], icon: 'users', createdDate: '2025-12-19 14:02:00' },
    { id: 'app3', name: 'Telemetry Ingest', description: 'Ingests and normalizes incoming device telemetry.', status: 'suspended', deviceIds: ['d1', 'd2', 'd3', 'd4', 'd5'], assetIds: [], groupNames: [], metadata: [], icon: 'cloud-ota', createdDate: '2026-01-08 11:47:00' },
  ],
  assets: [
    { id: 'a1', name: 'Forklift Unit 3', groupNames: ['Vehicles'], profileName: 'Forklift', status: 'operational', location: 'North Yard', deviceIds: [], metadata: [], metrics: DEVICE_DEFAULT_METRICS, createdDate: '2025-11-05 10:00:00' },
    { id: 'a2', name: 'HVAC Compressor A', groupNames: ['HVAC units'], profileName: 'Rooftop HVAC unit', status: 'maintenance', location: 'Building 2 Roof', deviceIds: [], metadata: [], metrics: DEVICE_DEFAULT_METRICS, createdDate: '2025-12-20 09:30:00' },
    { id: 'a3', name: 'Generator 12', groupNames: ['Generators'], profileName: 'Diesel generator', status: 'operational', location: 'East Depot', deviceIds: [], metadata: [], metrics: DEVICE_DEFAULT_METRICS, createdDate: '2026-01-09 13:15:00' },
    { id: 'a4', name: 'Forklift Unit 7', groupNames: ['Vehicles'], profileName: 'Forklift', status: 'offline', location: 'Harbor Dock', deviceIds: [], metadata: [], metrics: DEVICE_DEFAULT_METRICS, createdDate: '2026-03-22 08:45:00' },
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
    // Scoped to a single device rather than all devices — demonstrates the Scope/Device fields.
    { id: 're1', name: 'High temperature alert', description: 'Raises an alarm when a device reports an unusually high temperature.', status: 'active', scope: 'Specific device', deviceId: 'd2', conditionMode: 'builder', conditions: [{ metric: 'temperature', operator: '>', value: '30' }], conditionLogic: 'AND', conditionFormula: '', triggerType: 'Telemetry received', actionType: 'Create alarm', actionDetail: 'Critical', createdDate: '2025-11-02 09:14:00' },
    { id: 're2', name: 'Device offline notice', description: 'Notifies the operations team when a device disconnects.', status: 'suspended', scope: 'All devices', deviceId: '', conditionMode: 'builder', conditions: [], conditionLogic: 'AND', conditionFormula: '', triggerType: 'Device disconnected', actionType: 'Send email', actionDetail: 'ops@monitoring.example', createdDate: '2026-02-11 15:40:00' },
    // Multiple conditions joined by OR — demonstrates the AND/OR condition builder.
    { id: 're3', name: 'Environmental combo alert', description: 'Warns facilities when either humidity or temperature drifts out of range.', status: 'active', scope: 'All devices', deviceId: '', conditionMode: 'builder', conditions: [{ metric: 'humidity', operator: '>', value: '70' }, { metric: 'temperature', operator: '>', value: '35' }], conditionLogic: 'OR', conditionFormula: '', triggerType: 'Telemetry received', actionType: 'Send notification', actionDetail: 'Humidity or temperature out of range', createdDate: '2026-03-05 10:20:00' },
    // Free-typed formula instead of the row builder — demonstrates the "Write formula" mode.
    { id: 're4', name: 'Pressure drop with hot/humid combo', description: 'Custom expression combining three metrics beyond a simple AND/OR row.', status: 'active', scope: 'All devices', deviceId: '', conditionMode: 'formula', conditions: [], conditionLogic: 'AND', conditionFormula: '(temperature > 30 AND humidity > 70) OR pressure < 950', triggerType: 'Telemetry received', actionType: 'Send notification', actionDetail: 'Formula condition matched', createdDate: '2026-03-10 08:35:00' },
  ],
  ruleEngineExecutions: [
    { id: 'rx1', ruleEngineName: 'High temperature alert', triggeredAt: '2026-03-20 09:12:44', triggerType: 'Telemetry received', deviceName: 'HVAC Compressor A', condition: 'temperature > 30', actionType: 'Create alarm', actionDetail: 'Critical', durationMs: 142, outcome: 'success', failReason: '' },
    { id: 'rx2', ruleEngineName: 'Device offline notice', triggeredAt: '2026-03-19 22:47:03', triggerType: 'Device disconnected', deviceName: 'Rooftop HVAC unit', condition: 'Always', actionType: 'Send email', actionDetail: 'ops@monitoring.example', durationMs: 340, outcome: 'success', failReason: '' },
    { id: 'rx3', ruleEngineName: 'High temperature alert', triggeredAt: '2026-03-18 14:03:57', triggerType: 'Telemetry received', deviceName: 'HVAC Compressor A', condition: 'temperature > 30', actionType: 'Create alarm', actionDetail: 'Critical', durationMs: 88, outcome: 'failed', failReason: 'Alarm creation failed: an active alarm of this type already exists for this device.' },
    { id: 'rx4', ruleEngineName: 'Environmental combo alert', triggeredAt: '2026-03-17 06:41:12', triggerType: 'Telemetry received', deviceName: 'Rooftop HVAC unit', condition: 'humidity > 70 OR temperature > 35', actionType: 'Send notification', actionDetail: 'Humidity or temperature out of range', durationMs: 2210, outcome: 'failed', failReason: 'Notification delivery timed out after 2s: push notification service did not respond.' },
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
      assets: [
        { id: 'tas1', name: 'Forklift Unit 3', status: 'operational', createdDate: '2025-11-05 10:00:00' },
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
      assets: [
        { id: 'tas2', name: 'HVAC Compressor A', status: 'operational', createdDate: '2025-12-20 09:30:00' },
      ],
      applications: [
        { id: 'ta2', name: 'Facilities Dashboard', status: 'active', createdDate: '2025-12-21 11:00:00' },
      ],
    },
    { id: 't3', title: 'Harbor Dock Ops', email: 'admin@harbordock.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'Canada', tenantProfileName: 'Default', deviceCount: 67, status: 'suspended', createdDate: '2026-01-08 11:47:00', users: [], devices: [], assets: [], applications: [] },
    { id: 't4', title: 'East Depot Rentals', email: 'admin@eastdepot.com', phone: '', address: '', city: '', state: '', postalCode: '', country: 'United States', tenantProfileName: 'Default', deviceCount: 9, status: 'active', createdDate: '2026-03-22 08:30:00', users: [], devices: [], assets: [], applications: [] },
  ],
  tenantProfiles: [
    { id: 'tp1', name: 'Default', description: 'Default tenant profile with standard platform limits.', isDefault: true, maxDevices: 500, maxAssets: 500, maxUsers: 50, maxDashboards: 50, maxApplications: 50, createdDate: '2025-11-02 09:10:00' },
    { id: 'tp2', name: 'Enterprise', description: 'Higher limits for large multi-site tenants.', isDefault: false, maxDevices: 5000, maxAssets: 5000, maxUsers: 500, maxDashboards: 200, maxApplications: 200, createdDate: '2025-12-05 10:00:00' },
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
    { id: 'sh1', name: 'Morning shift', startTime: '06:00', endTime: '14:00', midnightCrossed: false, status: 'active', createdDate: '2025-11-02 09:14:00' },
    { id: 'sh2', name: 'Evening shift', startTime: '14:00', endTime: '22:00', midnightCrossed: false, status: 'active', createdDate: '2025-12-19 14:02:00' },
    { id: 'sh3', name: 'Night shift', startTime: '22:00', endTime: '06:00', midnightCrossed: true, status: 'suspended', createdDate: '2026-01-08 11:47:00' },
  ],
  // Maps each weekday to the shift(s) covering it (an array of shift ids —
  // a day can be covered by more than one shift, e.g. overlapping coverage
  // — or [] when the day is off) — mirrors ShiftSchedule.jsx's weekly
  // rotation editor.
  shiftSchedules: [
    { id: 'ss1', name: 'Standard rotation', description: 'Default weekday/weekend rotation for warehouse staff.', assignments: { Mon: ['sh1'], Tue: ['sh1'], Wed: ['sh1'], Thu: ['sh1'], Fri: ['sh1'], Sat: ['sh1', 'sh2', 'sh3'], Sun: ['sh3'] }, createdDate: '2025-11-02 09:14:00' },
    { id: 'ss2', name: 'Evening coverage', description: 'Evening shift coverage for the facilities team.', assignments: { Mon: ['sh2'], Tue: ['sh2'], Wed: ['sh2'], Thu: ['sh2'], Fri: ['sh2', 'sh3'], Sat: [], Sun: [] }, createdDate: '2025-12-19 14:02:00' },
  ],
  // Generated occurrences of a shift on a specific date — read-only history,
  // like ruleEngineExecutions above; not hand-edited, only removable.
  shiftInstances: [
    { id: 'si1', shiftName: 'Morning shift', scheduleName: 'Standard rotation', date: '2026-03-20', day: 'Fri', startTime: '06:00', endTime: '14:00', status: 'completed' },
    // Saturday is covered by all three shifts on this schedule — one
    // instance per shift, same date, back-to-back round-the-clock coverage.
    { id: 'si2', shiftName: 'Morning shift', scheduleName: 'Standard rotation', date: '2026-03-21', day: 'Sat', startTime: '06:00', endTime: '14:00', status: 'completed' },
    { id: 'si3', shiftName: 'Evening shift', scheduleName: 'Standard rotation', date: '2026-03-21', day: 'Sat', startTime: '14:00', endTime: '22:00', status: 'completed' },
    { id: 'si4', shiftName: 'Night shift', scheduleName: 'Standard rotation', date: '2026-03-21', day: 'Sat', startTime: '22:00', endTime: '06:00', status: 'completed' },
    { id: 'si5', shiftName: 'Evening shift', scheduleName: 'Evening coverage', date: '2026-03-23', day: 'Mon', startTime: '14:00', endTime: '22:00', status: 'upcoming' },
    { id: 'si6', shiftName: 'Morning shift', scheduleName: 'Standard rotation', date: '2026-03-24', day: 'Tue', startTime: '06:00', endTime: '14:00', status: 'upcoming' },
  ],

  // ---------------------------------------------------------- EMS (built-in app)
  emsTodReadings: [
    { id: 'tod1', meterId: 'meter1', date: '2026-03-09', t1: 6, t2: 5, t3: 4, t4: 5, t5: 4, totalHours: 142.8 },
    { id: 'tod2', meterId: 'meter1', date: '2026-03-10', t1: 6, t2: 5, t3: 4, t4: 5, t5: 4, totalHours: 138.4 },
    { id: 'tod3', meterId: 'meter1', date: '2026-03-11', t1: 5, t2: 6, t3: 4, t4: 4, t5: 5, totalHours: 151.2 },
    { id: 'tod4', meterId: 'meter1', date: '2026-03-12', t1: 6, t2: 5, t3: 5, t4: 4, t5: 4, totalHours: 146.6 },
    { id: 'tod5', meterId: 'meter1', date: '2026-03-13', t1: 6, t2: 6, t3: 4, t4: 4, t5: 4, totalHours: 149.0 },
    { id: 'tod6', meterId: 'meter1', date: '2026-03-14', t1: 5, t2: 5, t3: 5, t4: 5, t5: 4, totalHours: 140.3 },
    { id: 'tod7', meterId: 'meter1', date: '2026-03-15', t1: 6, t2: 5, t3: 4, t4: 5, t5: 4, totalHours: 144.7 },
    { id: 'tod8', meterId: 'meter1', date: '2026-03-16', t1: 6, t2: 5, t3: 4, t4: 4, t5: 5, totalHours: 137.9 },
    { id: 'tod9', meterId: 'meter1', date: '2026-03-17', t1: 5, t2: 6, t3: 5, t4: 4, t5: 4, totalHours: 152.5 },
    { id: 'tod10', meterId: 'meter1', date: '2026-03-18', t1: 6, t2: 5, t3: 4, t4: 5, t5: 4, totalHours: 148.1 },
    { id: 'tod11', meterId: 'meter1', date: '2026-03-19', t1: 6, t2: 6, t3: 4, t4: 4, t5: 4, totalHours: 145.0 },
    { id: 'tod12', meterId: 'meter1', date: '2026-03-20', t1: 5, t2: 5, t3: 5, t4: 5, t5: 4, totalHours: 139.6 },
    { id: 'tod13', meterId: 'meter2', date: '2026-03-15', t1: 8, t2: 7, t3: 6, t4: 7, t5: 6, totalHours: 210.4 },
    { id: 'tod14', meterId: 'meter2', date: '2026-03-16', t1: 8, t2: 8, t3: 6, t4: 6, t5: 6, totalHours: 218.9 },
    { id: 'tod15', meterId: 'meter2', date: '2026-03-17', t1: 7, t2: 8, t3: 7, t4: 6, t5: 6, totalHours: 205.2 },
    { id: 'tod16', meterId: 'meter2', date: '2026-03-18', t1: 8, t2: 7, t3: 6, t4: 7, t5: 7, totalHours: 224.6 },
    { id: 'tod17', meterId: 'meter2', date: '2026-03-19', t1: 8, t2: 8, t3: 7, t4: 6, t5: 6, totalHours: 212.0 },
    { id: 'tod18', meterId: 'meter2', date: '2026-03-20', t1: 7, t2: 7, t3: 7, t4: 7, t5: 6, totalHours: 216.8 },
  ],
  emsMeters: [
    emsMeterSeed({
      id: 'meter1', name: 'Demo', meterId: 'Demo', location: 'Main Panel', partNumber: 'EM-3120', model: 'ElMeasure', modelNumber: 'EM6400', unit: 'Peak Timing',
      vpnMin: 220, vpnMax: 240, vppMin: 380, vppMax: 415, iMin: 0, iMax: 100, kwMin: 0, kwMax: 500, kvaMin: 0, kvaMax: 600, freqMin: 49, freqMax: 51,
    }),
    emsMeterSeed({
      id: 'meter2', name: 'GT1_EMS1', meterId: 'GT1_EMS1', location: 'Generator Room', partNumber: 'EM-3121', model: 'ElMeasure', modelNumber: 'EM6400', unit: 'Peak Timing',
      vpnMin: 220, vpnMax: 240, vppMin: 380, vppMax: 415, iMin: 0, iMax: 150, kwMin: 0, kwMax: 750, kvaMin: 0, kvaMax: 900, freqMin: 49, freqMax: 51,
    }),
  ],
  emsEnergyData: [
    { id: 'energy1', meterId: 'meter1', year: 2026, month: 'January', renewable: 3200, nonRenewable: 8400, renewablePercent: 27.6, nonRenewablePercent: 72.4 },
    { id: 'energy2', meterId: 'meter1', year: 2026, month: 'February', renewable: 3400, nonRenewable: 7900, renewablePercent: 30.1, nonRenewablePercent: 69.9 },
    { id: 'energy3', meterId: 'meter1', year: 2026, month: 'March', renewable: 3100, nonRenewable: 8100, renewablePercent: 27.7, nonRenewablePercent: 72.3 },
    { id: 'energy4', meterId: 'meter2', year: 2026, month: 'January', renewable: 4100, nonRenewable: 11200, renewablePercent: 26.8, nonRenewablePercent: 73.2 },
    { id: 'energy5', meterId: 'meter2', year: 2026, month: 'February', renewable: 4400, nonRenewable: 10600, renewablePercent: 29.3, nonRenewablePercent: 70.7 },
    { id: 'energy6', meterId: 'meter2', year: 2026, month: 'March', renewable: 4250, nonRenewable: 10950, renewablePercent: 27.9, nonRenewablePercent: 72.1 },
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
    const record = { id: uid('apn'), name: data.name, description: data.description, status: 'active', deviceIds: data.deviceIds ?? [], assetIds: data.assetIds ?? [], groupNames: data.groupNames ?? [], metadata: data.metadata ?? [], icon: data.icon || 'app', hasCustomDashboard: Boolean(data.hasCustomDashboard), createdDate: nowStamp() }
    store.applications.push(record)
    saveData(store)
    return record
  },
  updateApplication(id, data) {
    const store = loadData()
    const app = store.applications.find((a) => a.id === id)
    if (app) Object.assign(app, { name: data.name, description: data.description, deviceIds: data.deviceIds ?? [], assetIds: data.assetIds ?? [], groupNames: data.groupNames ?? [], metadata: data.metadata ?? app.metadata, icon: data.icon || app.icon, hasCustomDashboard: Boolean(data.hasCustomDashboard) })
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
    const app = store.applications.find((a) => a.id === id)
    if (app?.isDefault) return
    store.applications = store.applications.filter((a) => a.id !== id)
    saveData(store)
  },

  // ------------------------------------------------------------- assets
  addAsset(data) {
    const store = loadData()
    const record = { id: uid('a'), name: data.name, groupNames: data.groupNames ?? [], profileName: data.profileName, status: 'operational', location: data.location, deviceIds: data.deviceIds ?? [], metadata: data.metadata ?? [], metrics: DEVICE_DEFAULT_METRICS, createdDate: nowStamp() }
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
  // Asset metadata fields have no persistent id (unlike a device's), so
  // these are addressed by array index instead — asset-detail.html always
  // recomputes indices from the current array before calling these.
  addAssetMetadataField(assetId, key, value) {
    const store = loadData()
    const asset = store.assets.find((a) => a.id === assetId)
    if (asset) { asset.metadata = asset.metadata || []; asset.metadata.push({ key, value }) }
    saveData(store)
  },
  updateAssetMetadataFieldAt(assetId, index, value) {
    const store = loadData()
    const asset = store.assets.find((a) => a.id === assetId)
    if (asset && asset.metadata[index]) asset.metadata[index].value = value
    saveData(store)
  },
  removeAssetMetadataFieldAt(assetId, index) {
    const store = loadData()
    const asset = store.assets.find((a) => a.id === assetId)
    if (asset) asset.metadata.splice(index, 1)
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
    const record = { id: uid('re'), status: 'active', ...data, createdDate: nowStamp() }
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
  toggleRuleEngineStatus(id) {
    const store = loadData()
    const record = store.ruleEngines.find((r) => r.id === id)
    if (record) record.status = record.status === 'active' ? 'suspended' : 'active'
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
    const record = { id: uid('t'), ...data, deviceCount: 0, status: 'active', createdDate: nowStamp(), users: [], devices: [], assets: [], applications: [] }
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
    const record = { id: uid('td'), name: data.name, profileName: data.profileName, endpointToken: data.endpointToken || '', status: 'offline', metadata: data.metadata ?? [], createdDate: nowStamp() }
    tenant.devices.push(record)
    saveData(store)
    return record
  },
  // Mirrors the real Devices page: a device's profile, token, and metadata
  // are only set at creation — editing only ever changes the name.
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

  addTenantAsset(tenantId, data) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (!tenant) return
    const record = { id: uid('tas'), name: data.name, groupNames: data.groupNames ?? [], profileName: data.profileName, location: data.location, deviceIds: data.deviceIds ?? [], status: 'operational', metadata: data.metadata ?? [], createdDate: nowStamp() }
    tenant.assets.push(record)
    saveData(store)
    return record
  },
  updateTenantAsset(tenantId, assetId, data) {
    const store = loadData()
    const asset = findTenant(store, tenantId)?.assets.find((a) => a.id === assetId)
    if (asset) Object.assign(asset, { name: data.name, groupNames: data.groupNames ?? [], profileName: data.profileName, location: data.location, deviceIds: data.deviceIds ?? [], metadata: data.metadata ?? asset.metadata })
    saveData(store)
  },
  toggleTenantAssetStatus(tenantId, assetId) {
    const store = loadData()
    const asset = findTenant(store, tenantId)?.assets.find((a) => a.id === assetId)
    if (asset) asset.status = asset.status === 'operational' ? 'offline' : 'operational'
    saveData(store)
  },
  removeTenantAsset(tenantId, assetId) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (tenant) tenant.assets = tenant.assets.filter((a) => a.id !== assetId)
    saveData(store)
  },

  addTenantApplication(tenantId, data) {
    const store = loadData()
    const tenant = findTenant(store, tenantId)
    if (!tenant) return
    const record = { id: uid('ta'), name: data.name, description: data.description, deviceIds: data.deviceIds ?? [], assetIds: data.assetIds ?? [], status: 'active', metadata: data.metadata ?? [], createdDate: nowStamp() }
    tenant.applications.push(record)
    saveData(store)
    return record
  },
  updateTenantApplication(tenantId, appId, data) {
    const store = loadData()
    const app = findTenant(store, tenantId)?.applications.find((a) => a.id === appId)
    if (app) Object.assign(app, { name: data.name, description: data.description, deviceIds: data.deviceIds ?? [], assetIds: data.assetIds ?? [], metadata: data.metadata ?? app.metadata })
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
    const record = { id: uid('sh'), name: data.name, startTime: data.startTime, endTime: data.endTime, midnightCrossed: !!data.midnightCrossed, status: 'active', createdDate: nowStamp() }
    store.shifts.push(record)
    saveData(store)
    return record
  },
  updateShift(id, data) {
    const store = loadData()
    const shift = store.shifts.find((s) => s.id === id)
    if (shift) Object.assign(shift, { name: data.name, startTime: data.startTime, endTime: data.endTime, midnightCrossed: !!data.midnightCrossed })
    saveData(store)
  },
  toggleShiftStatus(id) {
    const store = loadData()
    const shift = store.shifts.find((s) => s.id === id)
    if (shift) shift.status = shift.status === 'active' ? 'suspended' : 'active'
    saveData(store)
  },
  // Blocked (rather than cascade-clearing) when a shift schedule still
  // assigns this shift to a day — mirrors handleRemove()'s in-use guard on
  // asset-profiles.html so a schedule never ends up pointing at a dangling id.
  shiftInUseBy(id) {
    const store = loadData()
    return store.shiftSchedules.filter((s) => Object.values(s.assignments).some((ids) => ids.includes(id))).map((s) => s.name)
  },
  removeShift(id) {
    const store = loadData()
    store.shifts = store.shifts.filter((s) => s.id !== id)
    saveData(store)
  },

  // ---------------------------------------------------- shift schedules
  addShiftSchedule(data) {
    const store = loadData()
    const record = { id: uid('ss'), name: data.name, description: data.description || '', assignments: data.assignments ?? {}, createdDate: nowStamp() }
    store.shiftSchedules.push(record)
    saveData(store)
    return record
  },
  updateShiftSchedule(id, data) {
    const store = loadData()
    const schedule = store.shiftSchedules.find((s) => s.id === id)
    if (schedule) Object.assign(schedule, { name: data.name, description: data.description || '', assignments: data.assignments ?? {} })
    saveData(store)
  },
  removeShiftSchedule(id) {
    const store = loadData()
    store.shiftSchedules = store.shiftSchedules.filter((s) => s.id !== id)
    saveData(store)
  },

  // ---------------------------------------------------- shift instances
  removeShiftInstance(id) {
    const store = loadData()
    store.shiftInstances = store.shiftInstances.filter((s) => s.id !== id)
    saveData(store)
  },

  // ------------------------------------------------------- EMS (built-in app)
  addEmsTodReading(data) {
    const store = loadData()
    const record = { id: uid('tod'), ...data }
    store.emsTodReadings.push(record)
    saveData(store)
    return record
  },
  updateEmsTodReading(id, data) {
    const store = loadData()
    const record = store.emsTodReadings.find((r) => r.id === id)
    if (record) Object.assign(record, data)
    saveData(store)
  },
  removeEmsTodReadings(ids) {
    const store = loadData()
    store.emsTodReadings = store.emsTodReadings.filter((r) => !ids.includes(r.id))
    saveData(store)
  },
  addEmsMeter(data) {
    const store = loadData()
    const record = emsMeterSeed({ id: uid('meter'), ...data })
    store.emsMeters.push(record)
    saveData(store)
    return record
  },
  updateEmsMeter(id, data) {
    const store = loadData()
    const record = store.emsMeters.find((m) => m.id === id)
    if (record) {
      Object.assign(record, data)
      record.metrics = emsMeterMetrics(record)
    }
    saveData(store)
  },
  removeEmsMeters(ids) {
    const store = loadData()
    store.emsMeters = store.emsMeters.filter((m) => !ids.includes(m.id))
    saveData(store)
  },
  addEmsEnergyData(data) {
    const store = loadData()
    const record = { id: uid('energy'), ...data }
    store.emsEnergyData.push(record)
    saveData(store)
    return record
  },
  updateEmsEnergyData(id, data) {
    const store = loadData()
    const record = store.emsEnergyData.find((e) => e.id === id)
    if (record) Object.assign(record, data)
    saveData(store)
  },
  removeEmsEnergyData(ids) {
    const store = loadData()
    store.emsEnergyData = store.emsEnergyData.filter((e) => !ids.includes(e.id))
    saveData(store)
  },
}

window.Store = Store
