# Univa — HTML mockup

A static mockup of the Univa IoT platform: plain HTML, CSS and JavaScript, no
build step and no framework. There is no backend. Everything is kept in the
browser's `localStorage`, so the pages behave like the real app while you click
through them. [`docs/data-model.md`](docs/data-model.md) describes the data the
UI is built around, so a backend can implement it directly.

## Run it

Serve the folder over HTTP (opening the files directly with `file://` won't
work, because pages share scripts and storage):

```
python -m http.server 8000
```

Then open <http://localhost:8000/>. It redirects to the login page.

## Sign in

| Who | Organization ID | Username | Password | Notes |
|---|---|---|---|---|
| Demo user (not tied to a tenant) | leave blank | `admin` | `admin` | sees every application |
| Demo user awaiting approval | leave blank | `adminapprove` | `admin` | shows the "awaiting approval" notice |
| Tenant owner | `NORTHBRIDGE` | `dana.whitfield@northbridge.com` | `12345` | owner of Northbridge Logistics |
| Tenant admin | `NORTHBRIDGE` | `omar.salim@northbridge.com` | `12345` | admin of the same tenant |
| Tenant owner | `CRADLEWELL` | `isla.brennan@cradlewell.com` | `12345` | a second tenant, with other applications |

A tenant user only sees the applications the system administrator enabled for
that tenant, and what their role allows. The system administrator area starts at
`sysadmin-login.html` (it has no password check). These are demo credentials
only.

## How it is put together

```
*.html            one page each; the page's own script is at the bottom of the file
shared/store.js   the data: seed data, localStorage read/write, login, roles
shared/layout.js  sidebar, top bar and role checks for every signed-in page
shared/ui.js      modals, confirm dialog, toasts
shared/*.css      one stylesheet per area; colours are the variables in app.css
shared/backup.js  Settings > Backup (owners and admins only)
docs/             the data model
tests/            the test page (see below)
```

A signed-in page loads `store.js`, `layout.js` and `ui.js`, then calls
`Layout.mount({ active, breadcrumbs })`, which draws the sidebar and top bar and
checks the signed-in role may see the page. After that the page reads and writes
data through `Store`.

## Rules to know before changing things

- **Seed data changes need a new storage key.** The demo data is saved in the
  browser under `STORAGE_KEY` (`shared/store.js`, currently `univa-html-demo-v26`).
  If you change the shape of the seed data, bump the number, otherwise browsers
  that already saved the old data keep serving it. Backups live under their own
  key (`BACKUPS_KEY`), so a bump doesn't delete them.
- **Escape names you put into HTML.** Anything a user can type (a device or
  application name, say) must go through `UI.esc()` before it is built into an
  HTML string.
- **Keep files on LF line endings.** `.gitattributes` enforces it. If a script
  rewrites a file, check it doesn't turn it into CRLF.

## Tests

The tests are a plain HTML page. With the server above running, open
<http://localhost:8000/tests/index.html> and press **Run all tests**. They click
through the real pages in a frame and take about a minute. See
[`tests/README.md`](tests/README.md) for what is covered and how to add a test.
A run resets the demo data in your browser and puts your own data back when it
finishes.

## Deployment

The site is served as-is from the repository root (see `CNAME`). All links are
relative, so it also works from a sub-path.
