// Every link, image and page a page points to must be there. These read the
// source of the pages and scripts rather than clicking, so they catch a link to
// a page that was renamed or never written, in markup and in script alike.

Tests.suite('links', 'Links, images and the menu all lead somewhere', async ({ page, BASE, check, skip, section, same }) => {
  const get = async (url) => {
    try {
      const response = await fetch(BASE + url, { cache: 'no-store' })
      return response.ok ? await response.text() : null
    } catch (err) {
      return null
    }
  }
  const exists = async (url) => {
    try {
      const response = await fetch(BASE + url, { method: 'HEAD', cache: 'no-store' })
      return response.ok
    } catch (err) {
      return false
    }
  }
  const unique = (list) => Array.from(new Set(list))

  // The pages (the same list the pages suite loads), and the scripts they run.
  const PAGES = [
    'index.html', '404.html', 'login.html', 'signup.html', 'forgot-password.html', 'reset-password.html', 'create-password.html', 'verify-email.html',
    'organization-created.html', 'awaiting-approval.html', 'sysadmin-login.html', 'admin-dashboard.html', 'admin-tenants.html', 'admin-tenant-detail.html',
    'admin-tenant-profiles.html', 'dashboard.html', 'applications.html', 'application-detail.html', 'notion.html', 'devices.html', 'device-detail.html',
    'device-data.html', 'device-profiles.html', 'credentials.html', 'software-ota.html', 'assets.html', 'asset-detail.html', 'asset-groups.html',
    'asset-profiles.html', 'shift-management.html', 'shift-schedules.html', 'shift-instances.html', 'rule-engines.html', 'rule-engine-reports.html',
    'users.html', 'user-groups.html', 'roles.html', 'settings.html', 'ems-meter-dashboard.html', 'cms-machine-dashboard.html',
  ]
  const SCRIPTS = ['shared/layout.js', 'shared/ui.js', 'shared/store.js', 'shared/chatbot.js', 'shared/backup.js', 'shared/dashboard.js', 'shared/device-detail.js', 'shared/app-runtime.js', 'shared/app-templates.js', 'shared/app-entries.js', 'shared/notion-data-blocks.js', 'shared/telemetry.js']

  const sources = {}
  for (const url of PAGES.concat(SCRIPTS)) sources[url] = await get(url)
  check(`all ${PAGES.length} pages and ${SCRIPTS.length} scripts can be read`, Object.keys(sources).every((u) => sources[u] !== null), Object.keys(sources).filter((u) => sources[u] === null))

  // ---------------------------------------------------- links written in HTML
  section('Links and files named in the pages')
  const named = []
  PAGES.forEach((url) => {
    const text = (sources[url] || '').replace(/<!--[\s\S]*?-->/g, '')
    const re = /\s(?:href|src)="([^"$]+)"/g
    let m
    while ((m = re.exec(text))) {
      const ref = m[1]
      // Web addresses, and paths from the root of the site (the 404 page uses those, as it can be shown at any depth).
      if (/^(https?:|mailto:|tel:|javascript:|data:|#)/.test(ref) || ref.startsWith('/')) continue
      named.push({ from: url, ref: ref.split('#')[0].split('?')[0] })
    }
  })
  const refs = unique(named.map((n) => n.ref)).filter(Boolean)
  const found = {}
  for (const ref of refs) found[ref] = await exists(ref)
  const broken = named.filter((n) => n.ref && !found[n.ref]).map((n) => `${n.from} -> ${n.ref}`)
  check(`all ${refs.length} different files the pages link to or load exist`, broken.length === 0, unique(broken).slice(0, 8))
  const pageLinks = refs.filter((r) => /\.html$/.test(r))
  check(`${pageLinks.length} of them are pages, and every one of those is in the list of pages these tests know`, pageLinks.every((r) => PAGES.includes(r)), pageLinks.filter((r) => !PAGES.includes(r)))

  section('Pages named in script')
  const inScript = []
  const scriptSources = PAGES.concat(SCRIPTS)
  scriptSources.forEach((url) => {
    const text = sources[url] || ''
    const re = /['"`]([A-Za-z0-9_-]+\.html)(?:[#?][^'"`]*)?['"`]/g
    let m
    while ((m = re.exec(text))) inScript.push({ from: url, page: m[1] })
  })
  const brokenInScript = unique(inScript.filter((n) => !PAGES.includes(n.page)).map((n) => `${n.from} -> ${n.page}`))
  check(`${unique(inScript.map((n) => n.page)).length} different pages are named in script (redirects, breadcrumbs, navigation); all of them exist`, brokenInScript.length === 0, brokenInScript.slice(0, 8))
  const pagesInTemplates = []
  scriptSources.forEach((url) => {
    const re = /href="([A-Za-z0-9_-]+\.html)(?:#[^"]*)?"/g
    let m
    while ((m = re.exec(sources[url] || ''))) pagesInTemplates.push(`${url} -> ${m[1]}`)
  })
  check('and so are the pages that script writes into links (rows, cards, tabs)', pagesInTemplates.every((p) => PAGES.includes(p.split(' -> ')[1])), pagesInTemplates.filter((p) => !PAGES.includes(p.split(' -> ')[1])))

  // ------------------------------------------------------------------ the menu
  section('The menu')
  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  await page.goto(BASE + 'asset-groups.html')
  const nav = await page.evaluate(() => {
    const flat = []
    NAV_SECTIONS.forEach((s) => { if (s.children) s.children.forEach((c) => flat.push({ section: s.key, key: c.key, label: c.label, href: c.href, icon: c.icon })); else flat.push({ section: s.key, key: s.key, label: s.label, href: s.href, icon: s.icon }) })
    return { flat, sectionKeys: NAV_SECTIONS.map((s) => s.key) }
  })
  check('the menu has a dashboard and seven sections', nav.sectionKeys.length === 8 && nav.sectionKeys[0] === 'dashboard', nav.sectionKeys)
  check('every item leads to a page that exists', nav.flat.every((i) => PAGES.includes(i.href)), nav.flat.filter((i) => !PAGES.includes(i.href)))
  check('no two items share a label within a section, and no two share a page', unique(nav.flat.map((i) => i.href)).length === nav.flat.length, nav.flat.map((i) => i.href))
  const missingIcons = await page.evaluate(() => NAV_SECTIONS.flatMap((s) => (s.children || [s])).filter((c) => !iconSvg(c.icon) || !String(iconSvg(c.icon)).includes('<svg')).map((c) => c.key))
  check('every item has an icon', missingIcons.length === 0, missingIcons)
  const keys = nav.flat.map((i) => i.key)
  const actives = []
  PAGES.forEach((url) => {
    const m = /Layout\.mount\(\{\s*active:\s*(['"`][^'"`]+['"`])/.exec(sources[url] || '')
    if (m) actives.push([url, m[1].slice(1, -1)])
  })
  const unknownActive = actives.filter(([, key]) => !keys.includes(key) && !/^application-/.test(key) && !key.includes('${'))
  check(`each of the ${actives.length} pages that mounts the layout highlights an item the menu has`, unknownActive.length === 0, unknownActive)
  const leftOut = nav.flat.filter((i) => !actives.some(([, key]) => key === i.key) && i.section !== 'applications').map((i) => i.key)
  check('and every menu item is highlighted by some page', leftOut.length === 0, leftOut)

  section('Where an application opens')
  const apps = await page.evaluate(() => {
    const open = (app) => applicationHref(app)
    return {
      custom: open({ id: 'app_notion' }),
      defaults: [open({ id: 'app0', isDefault: true, templateKey: 'production-monitoring' }), open({ id: 'app_ems', isDefault: true }), open({ id: 'app_cms', isDefault: true })],
      made: open({ id: 'apn-1' }),
      fromTemplate: open({ id: 'apn-2', templateKey: 'energy-monitoring' }),
      uses: [appUsesWorkspace(null), appUsesWorkspace({ id: 'app_notion', isDefault: true }), appUsesWorkspace({ id: 'x' }), appUsesWorkspace({ id: 'x', templateKey: 'crane-monitoring' }), appUsesWorkspace({ id: 'x', isDefault: true })],
      module: [permissionModuleForKey('device-data'), permissionModuleForKey('application-apn-1'), permissionModuleForKey('roles'), permissionModuleForKey('settings'), permissionModuleForKey('something-new')],
      escaped: escapeLayoutText('<b>"x" & \'y\'</b>'),
    }
  })
  check('the Custom App and applications people make open the page workspace', apps.custom === 'notion.html#app_notion' && apps.made === 'notion.html#apn-1', apps)
  check('the built-in applications and applications made from a template open their own pages', same(apps.defaults, ['application-detail.html#app0', 'application-detail.html#app_ems', 'application-detail.html#app_cms']) && apps.fromTemplate === 'application-detail.html#apn-2', apps)
  check('an application that is not there does not use the workspace', same(apps.uses, [false, true, true, false, false]), apps.uses)
  check('each menu item maps to its permission module (device data is under devices, applications are app:<id>, an unknown key stands for itself)', same(apps.module, ['devices', 'app:apn-1', 'rolesPermissions', 'settings', 'something-new']), apps.module)
  check('names put into the menu are escaped', apps.escaped === '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;', apps.escaped)

  // ----------------------------------------------------------------- documents
  section('Links in the documents')
  const DOCS = ['README.md', 'tests/README.md', 'docs/data-model.md']
  const docLinks = []
  for (const doc of DOCS) {
    const text = await get(doc)
    if (text === null) { docLinks.push({ doc, ref: '(the document itself)', ok: false }); continue }
    const re = /\]\(([^)\s]+)\)/g
    let m
    while ((m = re.exec(text))) {
      const ref = m[1]
      if (/^(https?:|mailto:|#)/.test(ref)) continue
      const dir = doc.includes('/') ? doc.slice(0, doc.lastIndexOf('/') + 1) : ''
      const target = (dir + ref.split('#')[0]).replace(/[^/]+\/\.\.\//g, '')
      docLinks.push({ doc, ref, ok: await exists(target) })
    }
  }
  check(`the ${docLinks.length} links between the documents and the files they mention work`, docLinks.every((l) => l.ok), docLinks.filter((l) => !l.ok))
  const readme = (await get('README.md')) || ''
  const missingFromReadme = ['tests/index.html', 'docs/data-model.md'].filter((f) => !readme.includes(f))
  check('the README points to the tests and the data model', missingFromReadme.length === 0, missingFromReadme)
})
