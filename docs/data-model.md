# Univa platform data model

This UI mockup has no backend. This document describes the data model the UI is built around, so a backend can implement it directly. Every entity below already exists in the mockup's seed data in `shared/store.js`, and the UI reads and writes it through `Store` and `DataTable`.

The goal: **any IoT application (energy, production, crane, water, cold chain, …) runs on the same tables.** A new application is a new *template* row, not new tables or new code.

```
Tenant ─┬─ Device profile ── data points (schema of telemetry keys)
        │        └─ Device ──────────────┐
        ├─ Asset profile ── attribute schema   │ writes
        │        └─ Asset (attribute values) ─┤
        │              └─ Asset group         ▼
        ├─ Shift ─ Shift schedule       device_data  (ONE table, all devices)
        ├─ Rule engine (conditions on data point keys)      ▲ reads (aggregates)
        └─ Application instance ── template + bindings ─────┘
                 └─ application_records (user-entered app data)
```

## 1. Device profile → data points

A device profile declares which telemetry keys its devices send. `DEVICE_PROFILES_SEED` in `store.js` has the seed profiles.

| field | type | notes |
|---|---|---|
| `key` | string | Key as it appears in `device_data.values`, e.g. `part_count` |
| `label`, `unit` | string | Display only |
| `type` | `number` \| `string` \| `boolean` | |
| `kind` | `gauge` \| `counter` \| `state` | Tells aggregations how to read the key (see §3) |
| `min`, `max` | number | Gauge range (charts, validation, default rule thresholds) |
| `states` | string[] | State values; `states[0]` = normal, last = fault |
| `sim` | object | **Mock only.** Drives the generator in `shared/telemetry.js`; ignore it in the backend |

## 2. `device_data`: the single telemetry table

Each message from a device is one row. The row is the same for every device type and every application.

```sql
CREATE TABLE device_data (
  id          bigserial,
  ts          timestamptz NOT NULL,        -- device reading time
  tenant_id   uuid        NOT NULL,
  device_id   uuid        NOT NULL,
  asset_id    uuid        NULL,            -- asset linked at ingest time
  profile_id  uuid        NOT NULL,
  values      jsonb       NOT NULL,        -- {"part_count": 15320, "run_status": "running", ...}
  PRIMARY KEY (device_id, ts)
);
SELECT create_hypertable('device_data', 'ts');            -- TimescaleDB
CREATE INDEX ON device_data (tenant_id, device_id, ts DESC);
CREATE INDEX ON device_data (asset_id, ts DESC);
```

The design keeps `values` schemaless on purpose. A new device type only needs a profile, and a new application only needs a template.

The Data explorer page (`device-data.html`) browses this table.

## 3. Read API (what the UI calls)

`shared/telemetry.js` exposes these calls. The signatures are meant to become REST endpoints as they are.

| call | endpoint (proposed) | returns |
|---|---|---|
| `DataTable.query({deviceIds, assetIds, from, to, keyContains, offset, limit})` | `GET /device-data` | `{ rows, total }`, newest first |
| `DataTable.latest(deviceId)` | `GET /devices/:id/latest` | the latest row |
| `DataTable.aggregate({deviceId, key, agg, from, to, state})` | `GET /device-data/aggregate` | one number |
| `DataTable.events({deviceId, key, state, from, to})` | `GET /device-data/events` | `[{id, start, end, minutes, ongoing}]` |

Aggregations by data point `kind`:

- `counter` → `delta` (increase over the window; handles counter resets)
- `gauge` → `avg` / `min` / `max` / `last`
- `state` → `timeInState` (minutes at a given value) and `events` (contiguous periods at a value)
- `minutes` → elapsed minutes in the window, capped at "now"

## 4. Asset profile → attribute schema, and asset attribute values

`assetProfile.attributes = [{ key, label, type, unit, default }]` declares typed per-asset configuration. Examples are `targetPerHour` and `idealCycleSec` for a CNC machine, or `tariffPerKwh` for a meter. Each asset stores its own values in `asset.attributes`, for example `{ targetPerHour: 120 }`. KPI formulas read these values.

`asset.deviceIds` links the physical devices. `asset_id` on an ingested row comes from this link.

## 5. Application template

`shared/app-templates.js` holds the templates. In the backend, store each one as a JSONB row in `application_templates`, versioned. A template contains:

- `entity`: the kind of thing it monitors (Machine, Meter, Crane) and its suggested asset profile.
- `roles`: the data the template needs, expressed by meaning (`count`, `state`, `energy`), each with a required `kind`. **Templates never hard-code device keys.**
- `attributes` / `settings`: per-entity and per-instance configuration with defaults.
- `kpis`: evaluated in order, for each entity and each time window:
  - `{ agg, role, state }` aggregates from `device_data`, using the key the role maps to.
  - `{ formula }` is an arithmetic expression (`+ - * / ( )`) over earlier KPIs, attributes and settings, for example `availability * performance * quality`.
  - `combine` says how entity values roll up to a total. The options are `sum`, `avg`, `max`, or `formula`. `formula` re-evaluates on the totals, so ratios stay correct.
- `views`: tabs. Each `type` (`kpi-overview`, `shift-matrix`, `hourly-shift-report`, `event-log`, `entity-table`, `bindings`) has one generic renderer in `shared/app-runtime.js`.

## 6. Application instance

These are rows in `applications`. The fields added for templates:

```json
{
  "templateKey": "production-monitoring",
  "bindings": {
    "assetGroup": "Production line A",
    "assetIds": [],
    "shiftScheduleId": "ss3",
    "keyMap": { "count": "part_count", "rejects": "reject_count", "state": "run_status", "load": "spindle_load" }
  },
  "settings": { "oeeTarget": 75, "reasonCodes": ["Breakdown", "Tool change"] }
}
```

`keyMap` is the part that makes any vendor's device fit. If a different PLC reports `pcs_total`, you map `count → pcs_total` and nothing else changes.

Time windows come from the bound **shift schedule**. The shifts assigned to the chosen date's weekday become the report columns. A shift whose end is before its start runs past midnight.

## 7. `application_records`

This table holds user-entered data an application owns. The UI currently uses it for downtime reason codes; it can later hold manual production entries, EMS TOD readings, and similar data.

| field | notes |
|---|---|
| `app_id` | Owning application instance |
| `type` | e.g. `event-reason` |
| `key` | Upsert key within (app, type), e.g. the event id `deviceId:startMinute` |
| `data` | JSONB payload, e.g. `{ reason, entityId, start, minutes }` |

## 8. Permissions

Roles & permissions lists one module per template application, with one field per template view (`view:overview`, `view:downtime`, …). This allows tab-level access control.

## Migration notes

- **PMS** runs on this model today (template `production-monitoring`).
- **EMS** and **CMS** still use their bespoke collections (`emsMeters`, `emsTodReadings`, `emsEnergyData`, `cmsMachines`). The `energy-monitoring` and `crane-monitoring` templates are their replacements. To migrate, turn meters and cranes into assets with profile attributes, move TOD and energy entries into `application_records`, and drop the bespoke tables.
