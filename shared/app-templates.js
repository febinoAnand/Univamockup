/* ==========================================================================
   Univa — static HTML build. Application templates.

   An application is a TEMPLATE (this file — what the app is) plus an
   INSTANCE (an `applications` record in store.js — which of this tenant's
   assets, shift schedule, and device keys it runs on). One generic
   renderer, shared/app-runtime.js, draws any template, so a new kind of
   application is a new entry here rather than new page code or new tables.

   Templates are deliberately plain JSON (no functions): the future backend
   stores them as rows, and KPI formulas are strings evaluated by
   app-runtime.js's small expression evaluator.

   Template shape
     key, name, icon, category, version, description
     entity         what one monitored thing is ({ label, plural, assetProfile })
     roles          data the template needs, by meaning rather than by key.
                    An instance's bindings.keyMap maps each role to the actual
                    data point key its devices report, which is how any
                    vendor's device fits ({ role, label, kind, required, states })
     attributes     per-entity config read from the asset's attributes
     settings       per-instance config
     kpis           computed in order, per entity and per time window:
                      { key, agg, role, state }   aggregate from the data table
                                                  (delta | avg | max | last | timeInState | minutes)
                      { key, formula }            expression over earlier KPIs,
                                                  attributes, and settings
                    combine: how entity values roll up: 'sum' (default for
                    aggregates / additive formulas), 'avg', 'max', or
                    'formula' (re-evaluate on the rolled-up values; the
                    default for formulas, so ratios stay correct)
     views          tabs; each `type` is a renderer in app-runtime.js
   ========================================================================== */
(function () {
  const TEMPLATES = [
    {
      key: 'production-monitoring',
      name: 'Production monitoring',
      icon: 'factory',
      category: 'Manufacturing',
      version: '1.0',
      description: 'Output, OEE, hourly shift reports, and downtime tracking for production machines.',
      entity: { label: 'Machine', plural: 'Machines', assetProfile: 'CNC machine' },
      roles: [
        { role: 'count', label: 'Part counter', kind: 'counter', required: true },
        { role: 'rejects', label: 'Reject counter', kind: 'counter', required: false },
        { role: 'state', label: 'Run status', kind: 'state', required: true, states: ['running', 'idle', 'down'] },
        { role: 'load', label: 'Load / utilisation', kind: 'gauge', required: false },
      ],
      attributes: [
        { key: 'targetPerHour', label: 'Target per hour', type: 'number', unit: 'pcs/h', default: 100 },
        { key: 'idealCycleSec', label: 'Ideal cycle time', type: 'number', unit: 's', default: 30 },
      ],
      settings: [
        { key: 'oeeTarget', label: 'OEE target', type: 'number', unit: '%', default: 75 },
        { key: 'reasonCodes', label: 'Downtime reason codes', type: 'list', default: ['Breakdown', 'Tool change', 'Material shortage', 'Setup / changeover', 'Quality check', 'Other'] },
      ],
      kpis: [
        { key: 'output', label: 'Output', unit: 'pcs', agg: 'delta', role: 'count', format: 'int' },
        { key: 'rejects', label: 'Rejects', unit: 'pcs', agg: 'delta', role: 'rejects', format: 'int' },
        { key: 'runMin', label: 'Run time', agg: 'timeInState', role: 'state', state: 'running', format: 'duration' },
        { key: 'downMin', label: 'Downtime', agg: 'timeInState', role: 'state', state: 'down', format: 'duration' },
        { key: 'plannedMin', label: 'Planned time', agg: 'minutes', format: 'duration' },
        { key: 'target', label: 'Target', unit: 'pcs', formula: 'plannedMin / 60 * targetPerHour', combine: 'sum', format: 'int' },
        { key: 'idealMin', label: 'Ideal run time', formula: 'output * idealCycleSec / 60', combine: 'sum', format: 'duration' },
        { key: 'good', label: 'Good parts', unit: 'pcs', formula: 'output - rejects', combine: 'sum', format: 'int' },
        { key: 'availability', label: 'Availability', formula: 'runMin / plannedMin', format: 'percent' },
        { key: 'performance', label: 'Performance', formula: 'idealMin / runMin', format: 'percent' },
        { key: 'quality', label: 'Quality', formula: 'good / output', format: 'percent' },
        { key: 'oee', label: 'OEE', formula: 'availability * performance * quality', format: 'percent', targetSetting: 'oeeTarget' },
        { key: 'attainment', label: 'Attainment', formula: 'output / target', format: 'percent' },
      ],
      views: [
        { key: 'overview', label: 'Overview', type: 'kpi-overview', kpis: ['output', 'target', 'oee', 'availability', 'performance', 'quality'], cardKpis: ['output', 'target', 'oee'], progress: { value: 'output', of: 'target' }, chart: { kpi: 'output', compare: 'target', bucket: 'hour' } },
        { key: 'production', label: 'Production', type: 'shift-matrix', kpis: ['output', 'target', 'rejects', 'oee', 'downMin'] },
        { key: 'shift-report', label: 'Shift report', type: 'hourly-shift-report', kpi: 'output', compare: 'target' },
        { key: 'downtime', label: 'Downtime', type: 'event-log', role: 'state', state: 'down', reasonSetting: 'reasonCodes' },
        { key: 'machines', label: 'Machines', type: 'entity-table', columns: ['count', 'state', 'load'] },
        { key: 'configuration', label: 'Configuration', type: 'bindings' },
      ],
    },
    {
      key: 'energy-monitoring',
      name: 'Energy monitoring',
      icon: 'bolt',
      category: 'Utilities',
      version: '1.0',
      description: 'Consumption, cost, and demand per meter and per shift.',
      entity: { label: 'Meter', plural: 'Meters', assetProfile: 'Energy meter' },
      roles: [
        { role: 'energy', label: 'Energy counter (kWh)', kind: 'counter', required: true },
        { role: 'power', label: 'Active power (kW)', kind: 'gauge', required: true },
        { role: 'pf', label: 'Power factor', kind: 'gauge', required: false },
      ],
      attributes: [
        { key: 'tariffPerKwh', label: 'Tariff', type: 'number', unit: '₹/kWh', default: 8 },
        { key: 'contractDemandKw', label: 'Contract demand', type: 'number', unit: 'kW', default: 200 },
      ],
      settings: [
        { key: 'currency', label: 'Currency symbol', type: 'string', default: '₹' },
      ],
      kpis: [
        { key: 'energy', label: 'Energy', unit: 'kWh', agg: 'delta', role: 'energy', format: 'number' },
        { key: 'avgPower', label: 'Average demand', unit: 'kW', agg: 'avg', role: 'power', format: 'number' },
        { key: 'peakPower', label: 'Peak demand', unit: 'kW', agg: 'max', role: 'power', format: 'number' },
        { key: 'avgPf', label: 'Power factor', agg: 'avg', role: 'pf', combine: 'avg', format: 'decimal' },
        { key: 'cost', label: 'Cost', formula: 'energy * tariffPerKwh', combine: 'sum', format: 'currency' },
        { key: 'demandUse', label: 'Peak vs contract', formula: 'peakPower / contractDemandKw', combine: 'max', format: 'percent' },
      ],
      views: [
        { key: 'overview', label: 'Overview', type: 'kpi-overview', kpis: ['energy', 'cost', 'avgPower', 'peakPower', 'avgPf'], cardKpis: ['energy', 'cost', 'peakPower'], progress: { value: 'demandUse' }, chart: { kpi: 'energy', bucket: 'hour' } },
        { key: 'consumption', label: 'Consumption by shift', type: 'shift-matrix', kpis: ['energy', 'cost', 'peakPower'] },
        { key: 'meters', label: 'Meters', type: 'entity-table', columns: ['energy', 'power', 'pf'] },
        { key: 'configuration', label: 'Configuration', type: 'bindings' },
      ],
    },
    {
      key: 'crane-monitoring',
      name: 'Crane monitoring',
      icon: 'anchor',
      category: 'Material handling',
      version: '1.0',
      description: 'Utilisation, load profile, and fault events for overhead cranes.',
      entity: { label: 'Crane', plural: 'Cranes', assetProfile: '' },
      roles: [
        { role: 'state', label: 'Operating status', kind: 'state', required: true, states: ['running', 'idle', 'down'] },
        { role: 'load', label: 'Hook load', kind: 'gauge', required: true },
        { role: 'energy', label: 'Energy counter', kind: 'counter', required: false },
      ],
      attributes: [
        { key: 'safeWorkingLoad', label: 'Safe working load', type: 'number', unit: 't', default: 10 },
      ],
      settings: [
        { key: 'reasonCodes', label: 'Fault reason codes', type: 'list', default: ['Overload trip', 'Limit switch', 'Power failure', 'Maintenance', 'Other'] },
      ],
      kpis: [
        { key: 'runMin', label: 'Operating time', agg: 'timeInState', role: 'state', state: 'running', format: 'duration' },
        { key: 'downMin', label: 'Fault time', agg: 'timeInState', role: 'state', state: 'down', format: 'duration' },
        { key: 'plannedMin', label: 'Planned time', agg: 'minutes', format: 'duration' },
        { key: 'avgLoad', label: 'Average load', agg: 'avg', role: 'load', combine: 'avg', format: 'number' },
        { key: 'peakLoad', label: 'Peak load', agg: 'max', role: 'load', combine: 'max', format: 'number' },
        { key: 'energy', label: 'Energy', unit: 'kWh', agg: 'delta', role: 'energy', format: 'number' },
        { key: 'utilisation', label: 'Utilisation', formula: 'runMin / plannedMin', format: 'percent' },
        { key: 'loadFactor', label: 'Peak vs SWL', formula: 'peakLoad / safeWorkingLoad', combine: 'max', format: 'percent' },
      ],
      views: [
        { key: 'overview', label: 'Overview', type: 'kpi-overview', kpis: ['utilisation', 'runMin', 'downMin', 'avgLoad', 'peakLoad'], cardKpis: ['utilisation', 'peakLoad', 'downMin'], progress: { value: 'utilisation' }, chart: { kpi: 'runMin', bucket: 'hour' } },
        { key: 'utilisation', label: 'Utilisation by shift', type: 'shift-matrix', kpis: ['utilisation', 'runMin', 'downMin', 'peakLoad'] },
        { key: 'faults', label: 'Faults', type: 'event-log', role: 'state', state: 'down', reasonSetting: 'reasonCodes' },
        { key: 'cranes', label: 'Cranes', type: 'entity-table', columns: ['state', 'load', 'energy'] },
        { key: 'configuration', label: 'Configuration', type: 'bindings' },
      ],
    },
  ]

  const AppTemplates = {
    list() {
      return TEMPLATES
    },
    get(key) {
      return TEMPLATES.find((t) => t.key === key) || null
    },
    // Instance settings layered over the template's defaults.
    settingsFor(template, app) {
      const out = {}
      ;(template.settings || []).forEach((s) => { out[s.key] = s.default })
      return Object.assign(out, (app && app.settings) || {})
    },
  }

  window.AppTemplates = AppTemplates
})()
