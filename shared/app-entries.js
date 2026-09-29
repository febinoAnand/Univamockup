/* ==========================================================================
   Univa — static HTML build. Application-wise manual data.

   Some data never comes from a device: scrap weighed by an operator,
   rejects counted by hand, remarks, a hand-read meter. That data belongs
   to the APPLICATION it was entered for (PMS, an energy app, …), so it is
   stored as `manual-entry` records in the application's own
   applicationRecords, keyed by appId, and never written to the device-data
   table (shared/telemetry.js), which stays device telemetry only.

   Which fields an application collects come from its template's
   `manualFields` (shared/app-templates.js), overridable per instance
   (app.manualFields, edited in the app's Configuration tab).

   Record shape
     { id, appId, type: 'manual-entry', key|null, entityId (asset id), ts,
       data: { scrap_kg: 4.5, remarks: '…' }, enteredBy, createdDate, updatedDate }
   `key` is set only for upsertable records (a Data sheet cell row);
   form submissions append with key = null.

   AppEntries mirrors DataTable's read API (list / aggregate / series) so
   Notion data blocks and app KPIs read manual and device data the same way.
   ========================================================================== */
(function () {
  const TYPE = 'manual-entry'

  function appFor(appId) {
    return Store.get().applications.find((a) => a.id === appId) || null
  }

  function fieldsFor(appId) {
    const app = appFor(appId)
    if (!app) return []
    if (Array.isArray(app.manualFields)) return app.manualFields
    const template = app.templateKey && window.AppTemplates ? AppTemplates.get(app.templateKey) : null
    return (template && template.manualFields) || []
  }

  function entries(appId) {
    return (Store.get().applicationRecords || []).filter((r) => r.appId === appId && r.type === TYPE)
  }

  function inWindow(r, from, to) {
    return (from == null || r.ts >= from) && (to == null || r.ts < to)
  }

  function hasValue(v) {
    return v !== undefined && v !== null && v !== ''
  }

  const AppEntries = {
    TYPE,

    fields: fieldsFor,

    field(appId, key) {
      return fieldsFor(appId).find((f) => f.key === key) || null
    },

    // Newest first.
    list({ appId, entityIds, from, to, limit, excludeKeyPrefix } = {}) {
      let rows = entries(appId).filter((r) => inWindow(r, from, to))
      if (entityIds && entityIds.length) rows = rows.filter((r) => entityIds.includes(r.entityId))
      if (excludeKeyPrefix) rows = rows.filter((r) => !(r.key || '').startsWith(excludeKeyPrefix))
      rows.sort((a, b) => b.ts - a.ts)
      return limit ? rows.slice(0, limit) : rows
    },

    // quantity → sum (0 when nothing entered), reading → average,
    // text → latest value. `agg: 'last'` forces the latest value.
    aggregate({ appId, entityId, entityIds, key, from, to, agg, excludeKeyPrefix }) {
      const field = AppEntries.field(appId, key)
      const ids = entityIds || (entityId ? [entityId] : null)
      const rows = AppEntries.list({ appId, entityIds: ids, from, to, excludeKeyPrefix }).filter((r) => hasValue(r.data[key]))
      const kind = agg === 'last' ? 'text' : field ? field.kind : 'quantity'
      if (kind === 'text') return rows.length ? rows[0].data[key] : null
      const nums = rows.map((r) => Number(r.data[key])).filter((n) => isFinite(n))
      if (kind === 'reading') return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
      return nums.reduce((a, b) => a + b, 0)
    },

    // Raw points ({ ts, value } per entry) or, with bucketMs, one point per
    // bucket (sum for quantities, average for readings).
    series({ appId, entityId, key, from, to, bucketMs }) {
      const rows = AppEntries.list({ appId, entityIds: entityId ? [entityId] : null, from, to })
        .filter((r) => hasValue(r.data[key]) && isFinite(Number(r.data[key])))
        .sort((a, b) => a.ts - b.ts)
      if (!bucketMs) return rows.map((r) => ({ ts: r.ts, value: Number(r.data[key]) }))
      const field = AppEntries.field(appId, key)
      const buckets = new Map()
      rows.forEach((r) => {
        const b = from + Math.floor((r.ts - from) / bucketMs) * bucketMs
        if (!buckets.has(b)) buckets.set(b, [])
        buckets.get(b).push(Number(r.data[key]))
      })
      return Array.from(buckets.entries()).map(([ts, vals]) => ({
        ts,
        value: field && field.kind === 'reading' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0),
      }))
    },

    // ---------------------------------------------------------- writes
    add({ appId, entityId, ts, data }) {
      return Store.addApplicationRecord(appId, TYPE, { entityId, ts: ts || Date.now(), data })
    },
    upsert({ appId, key, entityId, ts, data }) {
      return Store.upsertApplicationRecord(appId, TYPE, key, data, { entityId, ts })
    },
    remove(id) {
      Store.removeApplicationRecord(id)
    },
  }

  window.AppEntries = AppEntries
})()
