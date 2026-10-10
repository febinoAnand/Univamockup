# Tests

End-to-end tests for the Univa HTML mockup, written as a plain HTML page. There
is nothing to install: serve the project folder the way you already do and open
the page.

```
python -m http.server 8000
```

then open **http://localhost:8000/tests/index.html** and press **Run all tests**.

The page loads each of the app's pages in the frame on the right and checks them
the way a person would: clicking, typing, and reading what is on screen. Results
appear as they happen. A suite with a failure opens itself and shows which check
failed and the values it saw. Each suite also has its own **Run** button.

You can also start a run from the address:

- `tests/index.html?run=all` runs everything as soon as the page opens.
- `tests/index.html?run=backup,routing` runs only those suites.

## Your own data

The pages under test use the same browser storage as the app, and the tests
reset the demo data. So when a run starts, whatever is in the browser's storage
is saved, and it is put back when the run ends. If a run is cut short (the tab
is closed halfway), the saved copy is still there and the page shows a **Restore
my data** button the next time you open it.

## What is covered

| Suite | File | Covers |
|---|---|---|
| Application pages and routing | `suites/routing.js` | Which page each application opens, sidebar highlighting, per-application Custom App pages, creating and deleting applications |
| Tenant application access | `suites/tenant-apps.js` | The tenant's Applications tab in the admin area, tenant users signing in with their email, and what each tenant, role and permission can see |
| Settings > Backup | `suites/backup.js` | The page picker, taking, listing, downloading and deleting backups, automatic backups, retention, a full browser, and owner/admin-only access |
| Backup SQL download | `suites/backup-sql.js` | The `.sql` file a backup downloads as: its tables, rows, column types and escaping, and the effect of unticking pages |

## Checking the SQL with PostgreSQL's parser (optional)

A browser can't run PostgreSQL's grammar over the SQL file. After a run, the
backup SQL suite offers the file it produced under **Files produced**. With
Python and `pglast` installed you can parse it:

```
pip install pglast
python tests/validate_sql.py backup-sample.sql
```

This is a separate, manual step; the tests page doesn't need it.

## How it works

- `index.html` is the page, `runner.js` runs the suites and draws the results,
  and `driver.js` is the small toolkit the suites use to drive a page.
- The pages under test run in an `<iframe>` on the same origin, so a suite can
  call the app's own code (`Store.reset()`, `Store.listBackups()`) as well as
  click.
- Files a page offers for download are captured and read by the test; nothing
  is saved to disk while the tests run.
- Selectors are CSS, plus `text=Some words`, `a:has-text("Some words")` and
  `:visible`.
- Moving between pages that differ only by the `#hash` doesn't reload them, so
  tests go through `about:blank` first when they need a fresh load.

## Adding a test

Add a file in `suites/`, list it in `index.html`, and register it:

```js
Tests.suite('my-suite', 'What it checks', async ({ page, BASE, check, section, same }) => {
  section('Opening the page')
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  await page.goto(BASE + 'settings.html')
  check('the page has its title', (await page.textContent('.page-title')) === 'Settings')
})
```

A function passed to `page.evaluate`, `page.$eval` or `page.$$eval` is rebuilt
inside the page, so it can use the page's globals but not variables from the
test; pass those as the argument (`page.evaluate((id) => Store.get().x[id], id)`).
