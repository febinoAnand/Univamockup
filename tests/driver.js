/* ==========================================================================
   Page driver for the in-browser tests.

   The suites click through the real pages the way a person would. Each suite
   gets a Page: an <iframe> on the same origin, plus a small set of methods
   (goto, click, fill, textContent, evaluate, ...) that wait for the page to
   be ready first. The pages share localStorage with this one, so a suite can
   read and set the app's data directly.

   A Page also records what the page under test does that a test cares about:
     - uncaught errors and console.error calls      page.on('pageerror' | 'console', fn)
     - files the page offers for download           page.waitForEvent('download')
       (the download is captured and read, not saved to disk)

   Selectors are CSS, plus two extras:
     text=Some words          the smallest elements whose text contains them
     a:has-text("Some words") elements matching the CSS that contain the text
     [data-x]:visible         only elements that are shown
   ========================================================================== */
(function (global) {
  'use strict'

  const DEFAULT_TIMEOUT = 5000
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const norm = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim().toLowerCase()

  function isVisible(el) {
    const style = el.ownerDocument.defaultView.getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    const box = el.getBoundingClientRect()
    return box.width > 0 && box.height > 0
  }

  function isDisabled(el) {
    return Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true' || Boolean(el.closest && el.closest('fieldset[disabled]'))
  }

  function query(doc, selector) {
    let sel = selector.trim()
    if (/^text=/.test(sel)) {
      const needle = norm(sel.slice(5).replace(/^(["'])(.*)\1$/, '$2'))
      const matching = Array.from(doc.body.querySelectorAll('*')).filter((el) => !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) && norm(el.textContent).includes(needle))
      const set = new Set(matching)
      return matching.filter((el) => !Array.from(el.children).some((child) => set.has(child)))
    }
    const texts = []
    sel = sel.replace(/:has-text\((["'])(.*?)\1\)/g, (all, quote, text) => { texts.push(norm(text)); return '' })
    let onlyVisible = false
    sel = sel.replace(/:visible/g, () => { onlyVisible = true; return '' })
    let found = Array.from(doc.querySelectorAll(sel))
    if (texts.length) found = found.filter((el) => texts.every((text) => norm(el.textContent).includes(text)))
    if (onlyVisible) found = found.filter(isVisible)
    return found
  }

  const splitHash = (url) => {
    const at = url.indexOf('#')
    return at === -1 ? [url, ''] : [url.slice(0, at), url.slice(at)]
  }

  class Locator {
    constructor(page, selector) {
      this.page = page
      this.selector = selector
    }
    first() { return this }
    async count() { await this.page._ready(); return query(this.page.doc, this.selector).length }
    async _first() { return (await this.page._waitFor(this.selector)) }
    async isVisible() { await this.page._ready(); const el = query(this.page.doc, this.selector)[0]; return Boolean(el) && isVisible(el) }
    async isDisabled() { return isDisabled(await this._first()) }
    async isEnabled() { return !isDisabled(await this._first()) }
    async isChecked() { return (await this._first()).checked }
    async getAttribute(name) { return (await this._first()).getAttribute(name) }
    async textContent() { return (await this._first()).textContent }
    async innerText() { return (await this._first()).innerText }
    async inputValue() { return (await this._first()).value }
    click(options) { return this.page.click(this.selector, options) }
  }

  class Page {
    // `host` is the element the preview iframe is added to.
    constructor(host, size) {
      this.frame = document.createElement('iframe')
      this.frame.title = 'Page under test'
      this.frame.style.width = (size && size.width || 1440) + 'px'
      this.frame.style.height = (size && size.height || 1000) + 'px'
      host.appendChild(this.frame)
      this.handlers = { pageerror: [], console: [] }
      this.downloadWaiters = []
      this.keyboard = { press: (key) => this._press(key) }
      // New documents replace the window's contents, so hook each one as soon as
      // it exists (before its own scripts run, where timing allows).
      this.timer = setInterval(() => this._hook(), 2)
      this.frame.addEventListener('load', () => this._hook())
    }

    get win() { return this.frame.contentWindow }
    get doc() { return this.frame.contentDocument }

    dispose() {
      clearInterval(this.timer)
      this.frame.remove()
    }

    on(event, handler) {
      if (!this.handlers[event]) throw new Error(`page.on: unknown event "${event}"`)
      this.handlers[event].push(handler)
    }

    _emit(event, payload) {
      this.handlers[event].forEach((handler) => handler(payload))
    }

    _hook() {
      let win
      try {
        win = this.win
        if (!win || win.__testHooked) return
        win.__testHooked = true
      } catch (err) {
        return
      }
      const page = this
      win.addEventListener('error', (e) => page._emit('pageerror', { message: e.message }))
      win.addEventListener('unhandledrejection', (e) => page._emit('pageerror', { message: String(e.reason && e.reason.message ? e.reason.message : e.reason) }))
      const original = win.console.error
      win.console.error = function () {
        const text = Array.prototype.map.call(arguments, String).join(' ')
        page._emit('console', { type: () => 'error', text: () => text })
        return original.apply(win.console, arguments)
      }
      // A page that offers a file builds a link with a download name and clicks it.
      // Capture that instead of saving files while the tests run.
      const elementClick = win.HTMLElement.prototype.click
      win.HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) {
          page._captureDownload(this)
          return undefined
        }
        return elementClick.call(this)
      }
    }

    _captureDownload(link) {
      const name = link.getAttribute('download')
      const text = this.win.fetch(link.href).then((response) => response.text())
      const download = { suggestedFilename: () => name, text: () => text }
      const waiter = this.downloadWaiters.shift()
      if (waiter) waiter(download)
    }

    waitForEvent(name, options) {
      if (name !== 'download') throw new Error(`waitForEvent: only "download" is supported, not "${name}"`)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for a download')), (options && options.timeout) || DEFAULT_TIMEOUT)
        this.downloadWaiters.push((download) => { clearTimeout(timer); resolve(download) })
      })
    }

    // ------------------------------------------------------------ waiting
    async _ready() {
      const deadline = Date.now() + 15000
      for (;;) {
        let state = null
        try { state = this.frame.contentDocument && this.frame.contentDocument.readyState } catch (err) { /* navigating */ }
        if (state && state !== 'loading') return
        if (Date.now() > deadline) throw new Error('The page did not finish loading')
        await sleep(10)
      }
    }

    async _waitFor(selector, options) {
      const timeout = (options && options.timeout) || DEFAULT_TIMEOUT
      const state = (options && options.state) || 'attached'
      const deadline = Date.now() + timeout
      for (;;) {
        await this._ready()
        const el = query(this.doc, selector)[0]
        if (state === 'hidden') {
          if (!el || !isVisible(el)) return el || null
        } else if (el && (state !== 'visible' || isVisible(el))) {
          return el
        }
        if (Date.now() > deadline) throw new Error(`Timeout ${timeout}ms waiting for ${selector} (${state})`)
        await sleep(25)
      }
    }

    waitForSelector(selector, options) { return this._waitFor(selector, Object.assign({ state: 'visible' }, options)) }
    waitForTimeout(ms) { return sleep(ms) }

    async waitForURL(expected, options) {
      const deadline = Date.now() + ((options && options.timeout) || DEFAULT_TIMEOUT)
      const matches = (url) => (expected instanceof RegExp ? expected.test(url) : typeof expected === 'function' ? expected(url) : url === expected)
      for (;;) {
        await this._ready()
        if (matches(this.win.location.href)) return
        if (Date.now() > deadline) throw new Error(`Timeout waiting for the URL to match ${expected}; it is ${this.win.location.href}`)
        await sleep(25)
      }
    }

    async waitForFunction(fn, arg, options) {
      const deadline = Date.now() + ((options && options.timeout) || DEFAULT_TIMEOUT)
      for (;;) {
        await this._ready()
        try {
          if (await this._fn(fn)(arg)) return
        } catch (err) { /* the page may be mid-navigation: try again */ }
        if (Date.now() > deadline) throw new Error('Timeout waiting for a condition in the page')
        await sleep(25)
      }
    }

    // A function written in the test is rebuilt inside the page, so it sees the
    // page's own globals (Store, localStorage, document). It can't use
    // variables from the test; pass them as the argument.
    _fn(fn) {
      return typeof fn === 'function' ? this.win.eval('(' + fn.toString() + ')') : () => this.win.eval(fn)
    }

    // ---------------------------------------------------------- navigation
    async goto(url) {
      await this._ready()
      const target = new URL(url, location.href).href
      const current = this.win.location.href
      if (target === 'about:blank' && current === 'about:blank') return
      const [targetPath, targetHash] = splitHash(target)
      const [currentPath, currentHash] = splitHash(current)
      // Only the #hash differs: the page stays loaded and gets a hashchange.
      if (targetPath === currentPath && targetHash && targetHash !== currentHash) {
        this.win.location.hash = targetHash
        await sleep(30)
        return
      }
      const before = this.frame.contentDocument
      this.frame.src = target
      const deadline = Date.now() + 15000
      for (;;) {
        let doc = null
        try { doc = this.frame.contentDocument } catch (err) { /* navigating */ }
        if (doc && doc !== before && doc.readyState !== 'loading') return
        if (Date.now() > deadline) throw new Error(`Timeout loading ${target}`)
        await sleep(5)
      }
    }

    url() { return this.win.location.href }
    title() { return this.doc.title }

    // ------------------------------------------------------------- actions
    async click(selector, options) {
      const force = Boolean(options && options.force)
      const timeout = (options && options.timeout) || DEFAULT_TIMEOUT
      const deadline = Date.now() + timeout
      let el = await this._waitFor(selector, { timeout, state: force ? 'attached' : 'visible' })
      if (!force) {
        // Like a person: the element must be enabled and nothing may cover it.
        for (;;) {
          el = await this._waitFor(selector, { timeout: Math.max(50, deadline - Date.now()), state: 'visible' })
          let problem = null
          if (isDisabled(el)) {
            problem = 'it is disabled'
          } else {
            el.scrollIntoView({ block: 'center', inline: 'center' })
            const box = el.getBoundingClientRect()
            const hit = this.doc.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            if (!hit || !(el === hit || el.contains(hit))) problem = `${hit ? '<' + hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + (hit.className && typeof hit.className === 'string' ? '.' + hit.className.trim().split(/\s+/).join('.') : '') + '>' : 'nothing'} covers it`
          }
          if (!problem) break
          if (Date.now() > deadline) throw new Error(`Timeout ${timeout}ms clicking ${selector}: ${problem}`)
          await sleep(25)
        }
      }
      const documentBefore = this.doc
      const box = el.getBoundingClientRect()
      const init = { bubbles: true, cancelable: true, composed: true, view: this.win, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 0 }
      if (el.focus) el.focus()
      el.dispatchEvent(new this.win.PointerEvent('pointerdown', init))
      el.dispatchEvent(new this.win.MouseEvent('mousedown', init))
      el.dispatchEvent(new this.win.PointerEvent('pointerup', init))
      el.dispatchEvent(new this.win.MouseEvent('mouseup', init))
      el.click()
      // A click that leaves the page: wait for the new one before going on.
      await sleep(20)
      if (this.doc !== documentBefore) await this._ready()
    }

    async fill(selector, value) {
      const el = await this._waitFor(selector, { state: 'visible' })
      el.focus()
      el.value = String(value)
      el.dispatchEvent(new this.win.Event('input', { bubbles: true }))
      el.dispatchEvent(new this.win.Event('change', { bubbles: true }))
    }

    async check(selector) {
      const el = await this._waitFor(selector, { state: 'visible' })
      if (!el.checked) await this.click(selector)
      if (!el.checked) throw new Error(`${selector} did not become checked`)
    }

    async uncheck(selector) {
      const el = await this._waitFor(selector, { state: 'visible' })
      if (el.checked) await this.click(selector)
      if (el.checked) throw new Error(`${selector} did not become unchecked`)
    }

    async selectOption(selector, value) {
      const el = await this._waitFor(selector, { state: 'visible' })
      el.value = String(value)
      if (el.value !== String(value)) throw new Error(`${selector} has no option "${value}"`)
      el.dispatchEvent(new this.win.Event('input', { bubbles: true }))
      el.dispatchEvent(new this.win.Event('change', { bubbles: true }))
    }

    async _press(key) {
      const target = this.doc.activeElement || this.doc.body
      const init = { key, code: key, bubbles: true, cancelable: true, view: this.win }
      target.dispatchEvent(new this.win.KeyboardEvent('keydown', init))
      target.dispatchEvent(new this.win.KeyboardEvent('keyup', init))
    }

    // ---------------------------------------------------------------- reads
    locator(selector) { return new Locator(this, selector) }
    async textContent(selector) { return (await this._waitFor(selector)).textContent }
    async innerText(selector) { return (await this._waitFor(selector)).innerText }
    async getAttribute(selector, name) { return (await this._waitFor(selector)).getAttribute(name) }
    async inputValue(selector) { return (await this._waitFor(selector)).value }
    async isChecked(selector) { return (await this._waitFor(selector)).checked }
    async $(selector) { await this._ready(); return query(this.doc, selector)[0] || null }
    async $eval(selector, fn, arg) { return this._fn(fn)(await this._waitFor(selector), arg) }
    async $$eval(selector, fn, arg) { await this._ready(); return this._fn(fn)(query(this.doc, selector), arg) }
    async evaluate(fn, arg) { await this._ready(); return this._fn(fn)(arg) }
  }

  global.PageDriver = { Page, sleep }
})(window)
