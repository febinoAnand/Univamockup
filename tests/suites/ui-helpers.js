// The small pieces every page shares (shared/ui.js and shared/layout.js): turning
// text into safe markup, toasts, the "are you sure" dialog, dialogs, row menus,
// the table/widget switch, maximising a panel, and the menu and top bar.

Tests.suite('ui-helpers', 'Shared pieces: toasts, dialogs, menus, the shell', async ({ page, BASE, check, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  await page.goto(BASE + 'login.html')
  await page.evaluate(() => { Store.reset(); Store.login('admin', 'admin') })
  await page.goto(BASE + 'asset-groups.html')
  await page.waitForSelector('.sidebar')

  // ------------------------------------------------------------------ esc
  section('Making text safe for markup')
  const esc = await page.evaluate(() => ({
    angle: UI.esc('<script>alert(1)</script>'),
    quotes: UI.esc(`"double" and 'single'`),
    amp: UI.esc('Fish & Chips'),
    again: UI.esc(UI.esc('a & b')),
    nothing: [UI.esc(null), UI.esc(undefined), UI.esc('')],
    numbers: [UI.esc(0), UI.esc(12.5), UI.esc(false)],
    attribute: (() => { const el = document.createElement('div'); el.innerHTML = `<input value="${UI.esc('x" onfocus="window.__p=1')}">`; return { attrs: el.firstChild.getAttributeNames(), value: el.firstChild.value } })(),
    markup: (() => { const el = document.createElement('div'); el.innerHTML = `<b>${UI.esc('<img src=x onerror="window.__q=1">')}</b>`; return { images: el.querySelectorAll('img').length, text: el.textContent } })(),
  }))
  check('angle brackets, quotes and ampersands are turned into entities', esc.angle === '&lt;script&gt;alert(1)&lt;/script&gt;' && esc.quotes === '&quot;double&quot; and &#39;single&#39;' && esc.amp === 'Fish &amp; Chips', esc)
  check('nothing, null and undefined give an empty string; numbers and false give their text', same(esc.nothing, ['', '', '']) && same(esc.numbers, ['0', '12.5', 'false']), esc)
  check('escaping twice escapes the ampersand again (so each value is escaped once, where it is used)', esc.again === 'a &amp;amp; b', esc.again)
  check('inside an attribute, a quote cannot end the value and add another attribute', same(esc.attribute.attrs, ['value']) && esc.attribute.value === 'x" onfocus="window.__p=1', esc.attribute)
  check('inside an element, a tag becomes text', esc.markup.images === 0 && esc.markup.text.includes('<img'), esc.markup)

  // ---------------------------------------------------------------- toasts
  section('Toasts')
  const toast = await page.evaluate(async () => {
    const out = {}
    UI.toast('<img src=x onerror="window.__pwned=1"> Saved & done', 5000)
    const root = document.getElementById('toast-root')
    const message = root.querySelector('.device-toast-message')
    out.text = message.textContent
    out.images = message.querySelectorAll('img').length
    out.pwned = window.__pwned === undefined
    out.dismiss = root.querySelector('.device-toast-close').getAttribute('aria-label')
    UI.toast('second')
    out.one = root.querySelectorAll('.device-toast').length
    out.replaced = root.querySelector('.device-toast-message').textContent
    root.querySelector('.device-toast-close').click()
    out.closed = root.innerHTML === ''
    UI.toast('short', 120)
    out.shown = root.querySelectorAll('.device-toast').length === 1
    await new Promise((resolve) => setTimeout(resolve, 350))
    out.timedOut = root.innerHTML === ''
    UI.toast('first', 150)
    await new Promise((resolve) => setTimeout(resolve, 80))
    UI.toast('second', 400)
    await new Promise((resolve) => setTimeout(resolve, 200))
    out.newerKept = root.textContent.includes('second')
    return out
  })
  check('a toast shows its message as text: a name with markup in it stays text and runs nothing', toast.text === '<img src=x onerror="window.__pwned=1"> Saved & done' && toast.images === 0 && toast.pwned, toast)
  check('it has a Dismiss button, and a new toast replaces the one showing', toast.dismiss === 'Dismiss' && toast.one === 1 && toast.replaced === 'second', toast)
  check('Dismiss clears it, and it clears itself after its time', toast.closed && toast.shown && toast.timedOut, toast)
  check('an older toast\'s timer does not remove a newer toast', toast.newerKept, toast)

  // -------------------------------------------------------------- confirm
  section('The "are you sure" dialog')
  const confirmed = await page.evaluate(() => {
    const out = {}
    const calls = []
    const root = () => document.getElementById('confirm-dialog-root')
    UI.confirm({ message: 'Delete <strong>Pump 3</strong>? Cannot be undone.', onConfirm: () => calls.push('confirm'), onCancel: () => calls.push('cancel') })
    out.defaults = { title: root().querySelector('h2').textContent, button: document.getElementById('confirm-dialog-confirm').textContent, danger: document.getElementById('confirm-dialog-confirm').classList.contains('danger'), open: root().querySelector('.modal-overlay').classList.contains('open'), strong: root().querySelector('.confirm-dialog-message strong').textContent }
    document.getElementById('confirm-dialog-cancel').click()
    out.cancelled = { calls: calls.slice(), closed: root().innerHTML === '' }
    UI.confirm({ message: 'x', onConfirm: () => calls.push('confirm2'), onCancel: () => calls.push('cancel2') })
    document.getElementById('confirm-dialog-close').click()
    out.closeButton = { calls: calls.slice(1), closed: root().innerHTML === '' }
    UI.confirm({ title: 'Remove user', confirmLabel: 'Remove', danger: false, message: 'Remove?', onConfirm: () => calls.push('confirm3') })
    out.custom = { title: root().querySelector('h2').textContent, button: document.getElementById('confirm-dialog-confirm').textContent, primary: document.getElementById('confirm-dialog-confirm').classList.contains('primary') }
    document.getElementById('confirm-dialog-confirm').click()
    out.confirmed = { calls: calls.slice(2), closed: root().innerHTML === '' }
    UI.confirm({ message: 'no handlers' })
    document.getElementById('confirm-dialog-cancel').click()
    UI.confirm({ message: 'no handlers' })
    document.getElementById('confirm-dialog-confirm').click()
    out.noHandlers = 'ok'
    UI.confirm({ message: 'first' })
    UI.confirm({ message: 'second' })
    out.oneAtATime = document.querySelectorAll('#confirm-dialog-root .modal-overlay').length === 1 && root().textContent.includes('second')
    document.getElementById('confirm-dialog-cancel').click()
    return out
  })
  check('by default it is titled "Confirm delete" with a red Delete button, and its message can hold markup the page wrote', confirmed.defaults.title === 'Confirm delete' && confirmed.defaults.button === 'Delete' && confirmed.defaults.danger && confirmed.defaults.open && confirmed.defaults.strong === 'Pump 3', confirmed.defaults)
  check('Cancel closes it and calls only the cancel handler', same(confirmed.cancelled.calls, ['cancel']) && confirmed.cancelled.closed, confirmed.cancelled)
  check('the × button does the same', same(confirmed.closeButton.calls, ['cancel2']) && confirmed.closeButton.closed, confirmed.closeButton)
  check('the title, the button and its colour can be changed', confirmed.custom.title === 'Remove user' && confirmed.custom.button === 'Remove' && confirmed.custom.primary, confirmed.custom)
  check('Confirm closes it and calls only the confirm handler, once', same(confirmed.confirmed.calls, ['confirm3']) && confirmed.confirmed.closed, confirmed.confirmed)
  check('it works with no handlers, and only one dialog shows at a time', confirmed.noHandlers === 'ok' && confirmed.oneAtATime, confirmed)

  // --------------------------------------------------------------- modals
  section('Dialogs and menus')
  const modals = await page.evaluate(() => {
    const out = {}
    const el = document.getElementById('group-modal')
    out.start = el.classList.contains('open')
    UI.openModal('group-modal')
    out.opened = el.classList.contains('open')
    UI.closeModal('group-modal')
    out.closed = !el.classList.contains('open')
    out.unknown = (() => { try { UI.openModal('nope'); UI.closeModal('nope'); return 'fine' } catch (err) { return err.message } })()

    document.body.insertAdjacentHTML('beforeend', '<div class="row-menu" id="rm"><button type="button" id="rm-btn" style="position:fixed;top:100px;left:300px;width:30px;height:20px">…</button><div class="row-menu-dropdown">menu</div></div><div class="row-menu" id="rm2"><button type="button">…</button><div class="row-menu-dropdown">menu</div></div>')
    UI.openRowMenu(document.getElementById('rm-btn'))
    const menu = document.getElementById('rm')
    const dropdown = menu.querySelector('.row-menu-dropdown')
    out.menu = { open: menu.classList.contains('open'), portal: dropdown.classList.contains('row-menu-dropdown-portal'), top: dropdown.style.top, right: dropdown.style.right }
    document.getElementById('rm2').classList.add('open')
    UI.closeRowMenus()
    out.menuClosed = { first: !menu.classList.contains('open'), second: !document.getElementById('rm2').classList.contains('open'), portal: !dropdown.classList.contains('row-menu-dropdown-portal') }
    UI.openRowMenu(document.createElement('button'))
    menu.remove()
    document.getElementById('rm2').remove()
    return out
  })
  check('a dialog opens and closes by its id, and an id that is not there does nothing', modals.start === false && modals.opened && modals.closed && modals.unknown === 'fine', modals)
  check('a row menu opens below its button and as a floating menu, so a table\'s edge cannot clip it', modals.menu.open && modals.menu.portal && modals.menu.top === '126px', modals.menu)
  check('closing the row menus closes all of them', modals.menuClosed.first && modals.menuClosed.second && modals.menuClosed.portal, modals.menuClosed)

  // ----------------------------------------------------------- view toggle
  section('Table and widget view')
  const view = await page.evaluate(() => {
    const out = {}
    out.default = UI.getViewMode('probe')
    UI.setViewMode('probe', 'widget')
    out.set = [UI.getViewMode('probe'), localStorage.getItem('univa-view-probe')]
    localStorage.setItem('univa-view-probe', 'something else')
    out.garbage = UI.getViewMode('probe')
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = function () { throw new Error('blocked') }
    try { out.blocked = UI.getViewMode('probe') } finally { Storage.prototype.getItem = original }
    const setter = Storage.prototype.setItem
    Storage.prototype.setItem = function () { throw new Error('blocked') }
    try { UI.setViewMode('probe', 'widget'); out.blockedSet = 'no error' } finally { Storage.prototype.setItem = setter }

    const wrap = document.createElement('div')
    wrap.innerHTML = UI.viewToggleHtml('probe2')
    document.body.appendChild(wrap)
    const scroll = document.createElement('div')
    document.body.appendChild(scroll)
    out.initial = { table: wrap.querySelector('[data-view="table"]').classList.contains('active'), widget: wrap.querySelector('[data-view="widget"]').classList.contains('active') }
    UI.wireViewToggle('probe2', scroll)
    wrap.querySelector('[data-view="widget"]').click()
    out.widget = { scroll: scroll.classList.contains('view-widget'), stored: UI.getViewMode('probe2'), active: wrap.querySelector('[data-view="widget"]').classList.contains('active') && !wrap.querySelector('[data-view="table"]').classList.contains('active') }
    wrap.querySelector('[data-view="table"]').click()
    out.table = { scroll: !scroll.classList.contains('view-widget'), stored: UI.getViewMode('probe2') }
    UI.wireViewToggle('no-such-toggle', scroll)
    wrap.remove()
    scroll.remove()
    localStorage.removeItem('univa-view-probe')
    localStorage.removeItem('univa-view-probe2')
    return out
  })
  check('the view starts as a table, remembers a choice, and treats anything else as a table', view.default === 'table' && same(view.set, ['widget', 'widget']) && view.garbage === 'table', view)
  check('if the browser will not give or take storage, it is a table and nothing breaks', view.blocked === 'table' && view.blockedSet === 'no error', view)
  check('the switch marks the current view, and clicking it changes the table, the mark and the saved choice', view.initial.table && !view.initial.widget && view.widget.scroll && view.widget.stored === 'widget' && view.widget.active && view.table.scroll && view.table.stored === 'table', view)

  // ------------------------------------------------------------- maximise
  section('Maximising a panel')
  const max = await page.evaluate(() => {
    const out = {}
    const panel = document.createElement('div')
    document.body.appendChild(panel)
    const calls = []
    out.first = UI.toggleMaximize(panel, { onRestore: () => calls.push('restored') })
    out.up = { panel: panel.classList.contains('panel-maximized'), backdrop: document.getElementById('maximize-backdrop').classList.contains('open') }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    out.escape = { panel: !panel.classList.contains('panel-maximized'), backdrop: !document.getElementById('maximize-backdrop').classList.contains('open'), calls: calls.slice() }
    UI.toggleMaximize(panel, { onRestore: () => calls.push('restored again') })
    out.second = UI.toggleMaximize(panel)
    out.toggledBack = { panel: !panel.classList.contains('panel-maximized'), calls: calls.slice() }
    UI.toggleMaximize(panel)
    document.getElementById('maximize-backdrop').click()
    out.backdrop = !panel.classList.contains('panel-maximized')
    const button = document.createElement('button')
    document.body.appendChild(button)
    UI.wireMaximizeButton(button, panel)
    button.click()
    out.button = { label: button.getAttribute('aria-label'), up: panel.classList.contains('panel-maximized') }
    button.click()
    out.buttonBack = { label: button.getAttribute('aria-label'), up: panel.classList.contains('panel-maximized') }
    panel.remove()
    button.remove()
    return out
  })
  check('maximising covers the page with a backdrop, and says it is now maximised', max.first === true && max.up.panel && max.up.backdrop, max)
  check('Escape restores it, and tells whoever asked', max.escape.panel && max.escape.backdrop && same(max.escape.calls, ['restored']), max.escape)
  check('asking again restores it; the backdrop restores it too', max.second === false && max.toggledBack.panel && max.backdrop, max)
  check('the button on a panel switches between Expand and Restore', max.button.label === 'Restore' && max.button.up && max.buttonBack.label === 'Expand' && !max.buttonBack.up, max)

  // ----------------------------------------------------------------- forms
  section('Form helpers')
  const forms = await page.evaluate(async () => {
    const out = {}
    const button = document.createElement('button')
    button.textContent = 'Go'
    document.body.appendChild(button)
    let ran = 0
    UI.runWithLoading(button, () => { ran++ }, 120)
    out.during = { disabled: button.disabled, loading: button.classList.contains('is-loading'), ran }
    await new Promise((resolve) => setTimeout(resolve, 300))
    out.after = { disabled: button.disabled, loading: button.classList.contains('is-loading'), ran }
    UI.setButtonLoading(null, true)
    button.remove()

    const field = document.createElement('div')
    document.body.appendChild(field)
    UI.shakeField(field)
    out.shaking = field.classList.contains('is-shaking')
    UI.shakeField(null)
    await new Promise((resolve) => setTimeout(resolve, 600))
    out.stopped = !field.classList.contains('is-shaking')
    field.remove()

    const wrap = document.createElement('div')
    wrap.innerHTML = '<input id="pw-probe" type="password"><button type="button" id="pw-eye"></button>'
    document.body.appendChild(wrap)
    UI.wireShowHideToggle('pw-probe', 'pw-eye')
    document.getElementById('pw-eye').click()
    out.shown = [document.getElementById('pw-probe').type, document.getElementById('pw-eye').getAttribute('aria-label')]
    document.getElementById('pw-eye').click()
    out.hidden = [document.getElementById('pw-probe').type, document.getElementById('pw-eye').getAttribute('aria-label')]
    UI.wireShowHideToggle('nothing', 'nothing-either')
    wrap.remove()
    return out
  })
  check('a button that is working is disabled and marked, then goes back and runs its action once', forms.during.disabled && forms.during.loading && forms.during.ran === 0 && !forms.after.disabled && !forms.after.loading && forms.after.ran === 1, forms)
  check('a field that is shaken stops shaking again', forms.shaking && forms.stopped, forms)
  check('the eye button shows and hides a password, with a matching label', same(forms.shown, ['text', 'Hide password']) && same(forms.hidden, ['password', 'Show password']), forms)

  // ------------------------------------------------------------ the shell
  section('The menu and the top bar')
  const shell = await page.evaluate(() => ({
    active: Array.from(document.querySelectorAll('.sidebar .active')).map((a) => a.textContent.trim()),
    crumbs: Array.from(document.querySelectorAll('.top-bar-breadcrumbs > *')).map((c) => [c.tagName, c.textContent.trim(), c.getAttribute('href')]),
    sections: document.querySelectorAll('.sidebar-section').length,
    brand: document.querySelector('.sidebar-brand img').getAttribute('src'),
    logout: Boolean(document.getElementById('logout-button')),
  }))
  check('the page\'s own item is highlighted, and only that one', same(shell.active, ['Asset groups']), shell.active)
  check('the breadcrumbs are links, except the last, which is the current page', same(shell.crumbs.map((c) => c[1]), ['Home', '/', 'Asset management', '/', 'Asset groups']) && shell.crumbs[0][0] === 'A' && shell.crumbs[0][2] === 'dashboard.html' && shell.crumbs[4][0] === 'SPAN' && shell.crumbs[4][2] === null, shell.crumbs)
  check('the menu shows the logo and every section', shell.brand === 'assets/favicon.png' && shell.sections === 7 && shell.logout, shell)

  await page.evaluate(() => Layout.setActive('devices'))
  const moved = await page.evaluate(() => Array.from(document.querySelectorAll('.sidebar .active')).map((a) => a.textContent.trim()))
  check('Layout.setActive moves the highlight (used when an application page changes tab)', same(moved, ['Devices']), moved)

  const drawer = await page.evaluate(() => {
    const out = {}
    const shellEl = document.getElementById('app-shell')
    const toggle = document.getElementById('sidebar-toggle-btn')
    out.start = shellEl.classList.contains('sidebar-open')
    toggle.click()
    out.open = shellEl.classList.contains('sidebar-open')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    out.escape = !shellEl.classList.contains('sidebar-open')
    toggle.click()
    shellEl.querySelector('.sidebar-backdrop').click()
    out.backdrop = !shellEl.classList.contains('sidebar-open')
    toggle.click()
    toggle.click()
    out.twice = !shellEl.classList.contains('sidebar-open')
    out.label = toggle.getAttribute('aria-label')
    return out
  })
  check('the menu button opens the drawer; Escape, the backdrop or pressing it again close it', drawer.start === false && drawer.open && drawer.escape && drawer.backdrop && drawer.twice && drawer.label === 'Toggle navigation', drawer)

  check('no JavaScript errors on the way', errors.length === 0, errors.slice(0, 5))
})
