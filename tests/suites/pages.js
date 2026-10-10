// Every page, loaded the way a user would reach it, and the source files behind
// them. Catches a page that no longer loads, a script that throws, a missing
// file, a tag typed wrongly, and Windows line endings creeping back in.

// Every page in the project (404.html is checked separately). Add new pages here.
const SIGNED_OUT_PAGES = [
  'login.html', 'signup.html', 'forgot-password.html', 'reset-password.html', 'create-password.html',
  'verify-email.html', 'organization-created.html', 'awaiting-approval.html', 'sysadmin-login.html',
]
const ADMIN_PAGES = ['admin-dashboard.html', 'admin-tenants.html', 'admin-tenant-detail.html#t1', 'admin-tenant-profiles.html']
const APP_PAGES = [
  'dashboard.html', 'applications.html', 'application-detail.html#app0', 'application-detail.html#app_ems', 'application-detail.html#app_cms',
  'notion.html#app_notion', 'devices.html', 'device-detail.html#@device', 'device-data.html', 'device-profiles.html', 'credentials.html',
  'software-ota.html', 'assets.html', 'asset-detail.html#@asset', 'asset-groups.html', 'asset-profiles.html', 'shift-management.html',
  'shift-schedules.html', 'shift-instances.html', 'rule-engines.html', 'rule-engine-reports.html', 'users.html', 'user-groups.html',
  'roles.html', 'settings.html', 'ems-meter-dashboard.html#@meter', 'cms-machine-dashboard.html#@machine',
]
const ALL_PAGES = ['index.html'].concat(SIGNED_OUT_PAGES, ADMIN_PAGES, APP_PAGES)

Tests.suite('pages', 'Every page loads; source files are sound', async ({ page, BASE, check, skip, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/i.test(m.text())) errors.push(`console.error @ ${page.url()}: ${m.text()}`)
  })
  const open = async (url) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
    await page.waitForTimeout(350)
  }
  const mark = () => errors.length
  const pageReport = () => page.evaluate(() => ({
    title: document.title,
    text: document.body ? document.body.innerText.trim().length : 0,
    sidebar: Boolean(document.querySelector('.sidebar')),
    admin: Boolean(document.querySelector('.admin-layout')),
  }))

  // ---------------------------------------------------------------- smoke
  await page.goto(BASE + 'login.html')
  const ids = await page.evaluate(() => {
    Store.reset()
    const data = Store.get()
    return { device: data.devices[0].id, asset: data.assets[0].id, meter: data.emsMeters[0].id, machine: data.cmsMachines[0].id }
  })
  const resolve = (url) => url.replace('@device', ids.device).replace('@asset', ids.asset).replace('@meter', ids.meter).replace('@machine', ids.machine)

  section('Signed-out pages')
  for (const url of SIGNED_OUT_PAGES) {
    const before = mark()
    await open(url)
    const r = await pageReport()
    check(`${url} loads without errors`, errors.length === before && r.text > 20 && r.title.length > 0, { newErrors: errors.slice(before), ...r })
  }

  section('Signed-in pages (demo administrator)')
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  for (const url of APP_PAGES) {
    const before = mark()
    await open(resolve(url))
    const r = await pageReport()
    check(`${url} loads with its sidebar and without errors`, errors.length === before && r.sidebar && r.text > 100 && r.title.length > 0, { newErrors: errors.slice(before), ...r })
  }

  section('Administrator pages')
  for (const url of ADMIN_PAGES) {
    const before = mark()
    await open(url)
    const r = await pageReport()
    check(`${url} loads without errors`, errors.length === before && r.text > 50 && r.title.length > 0, { newErrors: errors.slice(before), ...r })
  }

  section('Signed out, a signed-in page sends you to the login page')
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { Store.reset() })
  await open('devices.html')
  await page.waitForTimeout(300)
  check('devices.html redirects to login.html', /login\.html/.test(page.url()), page.url())

  // ---------------------------------------------------------- source files
  section('Source files')
  const fetchText = async (url) => {
    const response = await fetch(BASE + url, { cache: 'no-store' })
    return response.ok ? response.text() : null
  }
  const pages = {}
  for (const url of ALL_PAGES.map((u) => u.split('#')[0]).filter((u, i, all) => all.indexOf(u) === i).concat('404.html')) pages[url] = await fetchText(url)
  check('every page can be fetched', Object.keys(pages).every((u) => pages[u] !== null), Object.keys(pages).filter((u) => pages[u] === null))

  // every local script and stylesheet a page names must exist
  const refs = new Set()
  Object.keys(pages).forEach((url) => {
    const text = pages[url] || ''
    const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g
    let m
    while ((m = re.exec(text))) if (!/^(https?:)?\/\//.test(m[1]) && !m[1].startsWith('/')) refs.add(m[1].split('?')[0])
  })
  const files = {}
  for (const ref of refs) files[ref] = await fetchText(ref)
  const missing = Object.keys(files).filter((ref) => files[ref] === null)
  check(`all ${refs.size} scripts and stylesheets the pages refer to exist`, missing.length === 0, missing)

  const sources = Object.assign({}, pages)
  // Only text files: the favicon and any other image come through as binary.
  Object.keys(files).forEach((ref) => { if (files[ref] !== null && /\.(js|css|html)$/.test(ref)) sources[ref] = files[ref] })
  const withCr = Object.keys(sources).filter((name) => sources[name] && sources[name].includes('\r'))
  check('no file uses Windows (CRLF) line endings', withCr.length === 0, withCr)

  // a tag whose attribute is closed and then runs straight into a closing tag, e.g.  title="x"</span>
  const typo = /\b[\w-]+="[^"]*"<\/[a-z]+>/
  const typos = []
  Object.keys(sources).forEach((name) => {
    ;(sources[name] || '').split('\n').forEach((line, i) => { if (typo.test(line)) typos.push(`${name}:${i + 1}`) })
  })
  check('no tag is left unfinished before its closing tag', typos.length === 0, typos.slice(0, 5))

  // head tags
  const noIcon = Object.keys(pages).filter((u) => !/<link rel="icon" href="[^"]*favicon\.png"/.test(pages[u] || ''))
  check('every page has a favicon link', noIcon.length === 0, noIcon)
  const noTheme = Object.keys(pages).filter((u) => !/<meta name="theme-color"/.test(pages[u] || ''))
  check('every page has a theme-color', noTheme.length === 0, noTheme)
  const noViewport = Object.keys(pages).filter((u) => u !== 'index.html' && !/<meta name="viewport"/.test(pages[u] || ''))
  check('every page (but the redirect) has a viewport tag', noViewport.length === 0, noViewport)
  const badTitle = Object.keys(pages).filter((u) => (pages[u].match(/<title>/g) || []).length !== 1)
  check('every page has exactly one title', badTitle.length === 0, badTitle)

  // a page that calls into a shared script must load it
  const wants = [['UI.', 'shared/ui.js'], ['Layout.', 'shared/layout.js'], ['Store.', 'shared/store.js'], ['AppTemplates.', 'shared/app-templates.js']]
  const unloaded = []
  Object.keys(pages).forEach((url) => {
    const text = pages[url] || ''
    wants.forEach(([call, file]) => {
      const used = new RegExp('(^|[^A-Za-z0-9_.])' + call.replace('.', '\\.')).test(text.replace(/<!--[\s\S]*?-->/g, ''))
      if (used && !text.includes(`src="${file}"`)) unloaded.push(`${url} uses ${call.slice(0, -1)} but does not load ${file}`)
    })
  })
  check('a page that uses UI, Layout, Store or AppTemplates loads the script that defines it', unloaded.length === 0, unloaded.slice(0, 6))

  check('the 404 page is there and links back to the app', /Back to Univa/.test(pages['404.html'] || ''))
  check('no JavaScript errors on any page', errors.length === 0, errors.slice(0, 5))
})
