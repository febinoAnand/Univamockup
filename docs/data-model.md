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

## 7. `application_records`: application-wise manual data

This table holds user-entered data an application owns. **Manual data is always application-wise.** Scrap weighed by an operator, rejects counted by hand, remarks and hand-read meters are stored here against the application they were entered for. They are **never written to `device_data`**, which stays device telemetry only.

| field | notes |
|---|---|
| `id` | |
| `app_id` | Owning application instance |
| `type` | `manual-entry` (manual data), `event-reason` (downtime reasons), … |
| `key` | Optional upsert key within (app, type). Data sheets use `sheet:<blockId>\|<assetId>\|<slotStart>` so re-editing a cell updates it. Form submissions append with `key = null` |
| `entity_id` | Asset the entry is about |
| `ts` | Time the entry applies to (the slot start for a data sheet row, or the chosen time for a form) |
| `data` | JSONB, e.g. `{ "scrap_kg": 4.5, "remarks": "Tool wear" }` |
| `entered_by`, `created_at`, `updated_at` | Audit |

**Manual fields.** Which keys an application collects is defined by its template's `manualFields` (`{ key, label, unit, type: number|text|select, kind: quantity|reading|text, options? }`). An instance can override them in `applications.manual_fields`, which is edited in the app's Configuration tab. Aggregation by kind:
- `quantity` is summed over a window.
- `reading` is averaged.
- `text` takes the latest value.

Templates use manual data in KPIs with `{ agg: 'manual', manual: '<key>' }`. For example, PMS's Scrap KPI is `{ agg: 'manual', manual: 'scrap_kg' }`.

`shared/app-entries.js` (`AppEntries.list / aggregate / series / add / upsert / remove`) is the read/write API. It is shaped like `DataTable`, so a screen reads telemetry and manual data in the same way.

## 7a. Custom App data blocks

Custom App pages (the built-in page workspace; `notion_pages.blocks`, JSONB) can embed four live-data blocks from `shared/notion-data-blocks.js`. Each block stores an `appId` and reads that application's bound assets.

A page belongs to one application (`notion_pages.app_id`). The Custom App (`app_notion`) and every other application that has no more specific screen open this workspace, each with its own pages. Default applications (PMS, EMS, CMS) and applications built from a template keep their own screens. `appUsesWorkspace()` in `shared/layout.js` is the one rule for this. A block's `appId` is separate from the page's application: it names the template application the block reads data from.

| block | reads | writes |
|---|---|---|
| `data-cards` | `device_data` aggregates, app manual entries | — |
| `data-chart` | `device_data` series, manual entries (markers) | — |
| `data-sheet` | `device_data` per row window (telemetry columns) | manual columns → `application_records` (upsert) |
| `data-form` | recent app entries | `application_records` (append) |

A block's config (cards, series, sheet columns with `telemetry | manual | formula` sources) is stored inside the block. Formula columns reference other column ids.

## 8. Permissions

Roles & permissions lists one module per template application. It has one field per template view (`view:overview`, `view:downtime`, …), plus `manualEntries` for manual data entry. This allows tab-level access control and a separate permission to enter data. Settings > Backup (§10) is not one of these modules: it is for owners and admins only, and no role can be given it.

## 9. Tenant application access

The system administrator decides which applications each tenant can view. On a tenant's detail page (`admin-tenant-detail.html`), the Applications tab lists every application on the platform, default and custom, each with a checkbox. Only the ticked ones can be viewed by that tenant. **Add application** on that tab creates a custom application on the platform and enables it for that tenant. A custom application can be edited, suspended, or deleted from its row menu, and other tenants get it by ticking it in their own tab. The default applications are built in, so they only have the checkbox.

```sql
CREATE TABLE tenant_applications (
  tenant_id       uuid NOT NULL,
  application_id  uuid NOT NULL,
  PRIMARY KEY (tenant_id, application_id)
);
```

In the mockup this is `tenants[].applicationIds`. A tenant with no saved list can view every application, as it could before this existed. A new tenant starts with the default applications ticked, and an application a tenant creates itself is added to its list.

A session is tied to a tenant by the **Organization ID** on the login page (`tenants[].organizationId`, shown on the tenant's detail page). `Store.get()` in `shared/store.js` then returns only that tenant's applications. The sidebar, the applications list, and direct links to any other application (which show "Application not found") all follow the same rule. A blank or unknown Organization ID gives the plain demo session, which is not tied to a tenant and sees every application.

## 10. Database backup

**Settings > Backup** in the sidebar (`settings.html`, `shared/backup.js`) takes a backup of the whole workspace. The pages that go into it are chosen with checkboxes, grouped like the sidebar: Dashboard, All applications, each application, Devices, Device profiles, Assets, Asset groups, Asset profiles, Shift, Schedule, Instance, Rule engine, Reports, Users, User groups, and Roles & permissions. Credentials, Software OTA, and the Data explorer have no saved data of their own, so they are not offered. Device telemetry is not included either, because `device_data` belongs to the devices.

A backup can be downloaded as an SQL file or deleted. The download is a PostgreSQL script in one transaction: a `CREATE TABLE` and an `INSERT` for each collection (`devices`, `applications`, `application_records`, `ems_meters`, `notion_pages`, `dashboard_layouts`, `role_permissions`, and so on). Column types come from the values: numbers are `NUMERIC`, booleans `BOOLEAN`, text `TEXT`, and nested objects, arrays, and columns that mix types are `JSONB`. A column named `id`, `scope`, or `role` becomes the primary key when it is filled in and unique. Settings is **only for owners and admins**. Other roles don't see it in the sidebar, and opening `settings.html` directly shows "You do not have permission to view this page." It is not on the Roles & permissions page, so it can't be granted to another role.

```sql
CREATE TABLE backups (
  id          uuid PRIMARY KEY,
  tenant_id   uuid        NOT NULL,
  created_at  timestamptz NOT NULL,
  created_by  text        NOT NULL,
  trigger     text        NOT NULL,   -- 'manual' | 'auto'
  size_bytes  bigint      NOT NULL,
  pages       jsonb       NOT NULL,   -- [{ "key": "devices", "label": "Devices", "count": 13 }, ...]
  data        jsonb       NOT NULL    -- { "<page key>": <that page's data>, ... }
);

CREATE TABLE backup_settings (
  tenant_id   uuid PRIMARY KEY,
  auto        boolean NOT NULL DEFAULT false,
  frequency   text    NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly' | 'monthly'
  keep        integer NOT NULL DEFAULT 10,        -- 0 = keep every backup
  excluded    text[]  NOT NULL DEFAULT '{}'       -- page keys left out of a backup
);
```

`data` is keyed by page key. An application's page is `app:<application id>` and holds its `application_records`, its Custom App pages, and its saved dashboard layouts. EMS and CMS keep their own collections, so their pages also hold the meters, TOD readings, and energy data, or the machines. `applications` holds the application list itself. The pages not ticked are simply absent from `pages` and `data`.

The settings are workspace-wide. `excluded` is the pages left unticked, so a page added later (a new application, say) is included until someone unticks it. Automatic backups use the same selection as manual ones. After a backup is taken, the oldest ones beyond `keep` are deleted. Lowering `keep` deletes nothing until the next backup.

The mockup has no scheduler, so `Layout.mount()` calls `Backup.runDue()` on every page. When automatic backups are on and the last backup (manual or automatic) is older than the interval, one is taken. A real backend would run this as a scheduled job.

In the mockup the backups are kept in the browser under their own storage key (`univa-html-backups-v1`), apart from the data blob, so a backup is not re-written on every change.

## 11. Where the mockup keeps things (browser storage)

The mockup has no database. Everything below is in the browser, so a backend replaces all of it. This table is for anyone debugging the mockup.

| Key | Where | What it holds |
|---|---|---|
| `univa-html-demo-v<N>` (`STORAGE_KEY`, `shared/store.js`) | `localStorage` | All the demo data: devices, assets, applications, tenants, users, roles, shifts, rule engines, application records, Custom App pages, the session (`auth`), and the backup settings. Bump `N` when the seed data changes shape; older versions' keys are removed on the next page load. |
| `univa-html-demo-v<N>-corrupt` | `localStorage` | The first copy of stored data the app could not read. The app starts from the seed instead and the next save replaces the data, so this is where the unreadable text is kept. Safe to delete. |
| `univa-html-backups-v1` (`BACKUPS_KEY`) | `localStorage` | The backups taken on Settings > Backup (§10). Separate from the data above so a backup is not rewritten on every change, and so changing `STORAGE_KEY` does not delete them. |
| `univa_dashboard_layout_v1` and `univa_dashboard_layout_v1__<scope>` | `localStorage` | Widget dashboards: the main Dashboard, `app-<id>` for an application's own dashboard, `ems-meter-<id>` for each EMS meter. |
| `univa-view-<page>` | `localStorage` | Whether a list page shows its table or card view. |
| `univa-chatbot-api-key` | `sessionStorage` | The assistant's API key, for this tab only. An earlier version kept it in `localStorage`; it is moved over once and removed from there. |
| `univa-chatbot-history`, `univa-chatbot-open`, `univa-chatbot-pending-continuation` | `sessionStorage` | The assistant's conversation and window state, for this tab only. |

If a save fails because the browser's storage is full, the app says so (a toast) and stops the action instead of reporting a success that never reached storage.

## 12. Email Tracking (built-in application)

`app_email` is a built-in default application, like EMS and CMS: every tenant may view it, it cannot be deleted, and it has its own page (`email-tracking.html`) instead of a template. It is a port of the `ifmEmailTracking` React app. Emails that reach a mailbox become tickets, and the people of the department named in the subject are told by push notification and SMS.

The data is not tenant-scoped and is not device data. Dates are `'YYYY-MM-DD HH:MM:SS'`. In the mockup each collection is a top-level key of the stored data and each is its own table in a backup (§10):

| Collection (table) | Row |
|---|---|
| `emailInbox` (`email_inbox`) | `id, fromEmail, toEmail, subject, message, receivedDate, outcome, ticketId` |
| `emailTickets` (`email_tickets`) | `id, ticketName, receivedDate, emailId, department, fields` (`fields` is JSON: the `Key: value` lines of the email) |
| `emailReports` (`email_reports`) | `id, sentDate, message, department, sendToUsers` (usernames, JSON) |
| `emailDepartments` (`email_departments`) | `id, alias, department, userIds` |
| `emailUsers` (`email_users`) | `id, username, email, designation, mobileNo, deviceId, active, expiryTime, createdDate` — the people who are notified; they are not Univa users |
| `emailFromAddresses` (`email_from_addresses`) | `id, email, active` |
| `emailNotifications` (`email_notifications`) | `id, sentDate, title, message, sendToUser, deliveryStatus` (`delivered`, `failed` or `pending`) |
| `emailSms` (`email_sms`) | `id, sentDate, toNumber, fromNumber, message, delivered` |
| `emailSettings`, `emailNotificationSettings`, `emailSmsSettings` | one row each: the mailbox (`host, port, username, password, checkStatus, checkInterval`), the push application (`applicationId`) and the SMS gateway (`sid, authToken, fromNumber, isActive`) |

**What turns an email into a ticket.** The mockup has no mail server, so `receiveEmail()` and `processIncomingEmail()` in `shared/store.js` stand in for the backend. An email becomes a ticket when it comes from an **active** From address and its subject carries a department **alias** in square brackets, for example `[NET] Link down at Kochi PoP`. The result is kept on the email as `outcome`: `ticket`, or `sender` (not an active From address), `no-alias` or `unknown-alias`. For a ticket:

1. the `Key: value` lines of the body become the ticket's `fields`;
2. a report row is written, naming the department and the users told;
3. every **active** user in the department gets a push notification (`delivered`, or `failed` when the user has no `deviceId` or no push application is set);
4. if the SMS gateway is on, each of them with a mobile number also gets a text (`delivered` only for a number in international form, such as `+91 98450 11201`).

A department alias is unique (it is how the subject picks a department). Removing a user also removes them from every department; removing a ticket, report, notification or email takes nothing else with it, because those are history.

The mailbox password and the SMS auth token are kept as plain text in the mockup. A backend must store them encrypted and never send them back to the browser.

## 13. Forklift Tracking (built-in application)

`app_forklift` is a built-in default application like Email Tracking (§12), with its own page (`forklift-tracking.html`). It is a port of the `Forklift_TCP_Live` Django app: a GPS tracker on each forklift reports to a TCP server (Teltonika codec 8E for the position and ignition, codec 12 for the forklift's own controller), and the pages show where each forklift is, how it is being used and how its battery is doing, live, over time and as daily reports.

**What is stored.** Only the registered forklifts, in `forkliftDevices` (table `forklift_devices`): `id, deviceId, vehicleName, deviceModel, vehicleId, driver, manufacturer, hardwareVersion, softwareVersion, addDate`. `deviceId` is the tracker's IMEI (15 characters at most, unique, never changed once registered). It matches the React app's `tracker_device` table.

**What is not stored.** The readings. A tracker sends one a few seconds, which the real system keeps as rows in two tables; the mockup has no tracker, so `shared/forklift-data.js` makes them on read, one a minute, the same for the same forklift and day every time (as `shared/telemetry.js` does for devices). A forklift has readings from the day it was registered, up to the current minute. A backend would keep them, and the React app's models are the ones to use:

| Table | Row |
|---|---|
| `GPSData` | `device_id, date, time, latitude, longitude, speed, distance, state, ignition, movementState, gsmOperatorCode, gsmSignal, gsmAreaCode, odometer, satellite` |
| `EXTData` | `device_id, server_date, server_time, date, time, speed, distance, batt_voltage, batt_amp, batt_capacity, batt_power, watt_hr` (from the forklift's controller) |

`distance` and `watt_hr` are per reading, so a day's figure is their sum.

**The four states**, as the TCP server works them out for each GPS reading (`tcpserver.py`):

| Ignition | Moving | State |
|---|---|---|
| on | yes | 3 Active |
| on | no | 2 Idle |
| off | no | 1 Inactive |
| off | yes | 4 Alert (pushed or towed) |

The hours a forklift spent in each state are the number of readings in it divided by 60. The Reports tab adds up, for each day, the GPS distance, the controller's ("odometer") distance, the watt-hours and those hours.

The map is a drawing of the site seen from above, not map tiles (there is no network to fetch them from). `ForkliftData.toSite()` turns a latitude and longitude into metres on that drawing.

## Migration notes

- **PMS** runs on this model today (template `production-monitoring`).
- **EMS** and **CMS** still use their bespoke collections (`emsMeters`, `emsTodReadings`, `emsEnergyData`, `cmsMachines`). The `energy-monitoring` and `crane-monitoring` templates are their replacements. To migrate, turn meters and cranes into assets with profile attributes, move TOD and energy entries into `application_records`, and drop the bespoke tables.
