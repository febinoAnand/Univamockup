/* ==========================================================================
   Test runner for tests/index.html.

   A suite file calls Tests.suite(name, title, async (t) => { ... }) and uses
   what it is given:
     t.page          a Page (see driver.js) on a fresh iframe
     t.BASE          where the app's pages are served, e.g. http://localhost:8000/
     t.check(name, ok, detail)   record one check
     t.skip(name, why)           record a check that could not run
     t.section(title)            start a group of checks
     t.same(a, b)                deep equality for plain data
     t.artifact(file, text)      offer a file for download under the results

   The pages under test share localStorage with this page, and the tests reset
   the demo data (Store.reset). So a run first saves everything that is in
   localStorage, and puts it back when it finishes. If a run is interrupted,
   the saved copy is still there and the page offers to restore it.
   ========================================================================== */
(function (global) {
  'use strict'

  const APP_BASE = new URL('../', location.href).href
  const SAVED_KEY = 'univa-tests-saved-data'
  const suites = []
  let running = false

  // ------------------------------------------------------------- the data
  function snapshotStorage() {
    const data = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key !== SAVED_KEY) data[key] = localStorage.getItem(key)
    }
    return data
  }

  function wipeStorage() {
    Object.keys(snapshotStorage()).forEach((key) => localStorage.removeItem(key))
  }

  function restoreStorage() {
    const saved = localStorage.getItem(SAVED_KEY)
    if (saved === null) return false
    const data = JSON.parse(saved)
    wipeStorage()
    Object.keys(data).forEach((key) => localStorage.setItem(key, data[key]))
    localStorage.removeItem(SAVED_KEY)
    return true
  }

  // Keeps a copy of the current data, unless a copy from an interrupted run is
  // already there (that one is the real data).
  function protectStorage() {
    if (localStorage.getItem(SAVED_KEY) === null) localStorage.setItem(SAVED_KEY, JSON.stringify(snapshotStorage()))
  }

  // ------------------------------------------------------------------ UI
  const $ = (id) => document.getElementById(id)

  function h(tag, attrs, children) {
    const node = document.createElement(tag)
    Object.keys(attrs || {}).forEach((key) => {
      if (key === 'class') node.className = attrs[key]
      else if (key === 'text') node.textContent = attrs[key]
      else node.setAttribute(key, attrs[key])
    })
    ;[].concat(children || []).forEach((child) => node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child))
    return node
  }

  function show(detail) {
    if (detail === undefined) return ''
    try { return JSON.stringify(detail) } catch (err) { return String(detail) }
  }

  const totals = { passed: 0, failed: 0, skipped: 0 }
  const report = { done: false, passed: 0, failed: 0, skipped: 0, suites: [] }
  global.__testResults = report

  function renderTotals(note) {
    $('passed').textContent = totals.passed
    $('failed').textContent = totals.failed
    $('skipped').textContent = totals.skipped
    $('summary').className = 'summary' + (totals.failed ? ' bad' : totals.passed ? ' good' : '')
    if (note !== undefined) $('status').textContent = note
    report.passed = totals.passed
    report.failed = totals.failed
    report.skipped = totals.skipped
  }

  function buildSuiteCard(suite) {
    suite.counts = { passed: 0, failed: 0, skipped: 0 }
    suite.report = { name: suite.name, passed: 0, failed: 0, skipped: 0, failures: [] }
    suite.list = h('ol', { class: 'checks' })
    suite.badge = h('span', { class: 'badge' })
    suite.button = h('button', { type: 'button', class: 'run-one', text: 'Run' })
    suite.button.addEventListener('click', () => run([suite]))
    suite.card = h('details', { class: 'suite', 'data-suite': suite.name }, [
      h('summary', {}, [h('span', { class: 'suite-title', text: suite.title }), h('code', { text: 'suites/' + suite.name + '.js' }), suite.badge, suite.button]),
      suite.list,
    ])
    suite.card.open = false
    suite.badge.textContent = 'not run'
    return suite.card
  }

  function addLine(suite, kind, text, detail) {
    const line = h('li', { class: kind }, [h('span', { class: 'mark', text: kind === 'pass' ? '✓' : kind === 'fail' ? '✗' : '–' }), h('span', { class: 'name', text }), detail ? h('code', { class: 'detail', text: detail }) : ''])
    suite.list.appendChild(line)
    return line
  }

  function updateBadge(suite, finished) {
    const c = suite.counts
    suite.badge.className = 'badge' + (c.failed ? ' bad' : finished ? ' good' : '')
    suite.badge.textContent = `${c.passed} passed` + (c.failed ? `, ${c.failed} failed` : '') + (c.skipped ? `, ${c.skipped} skipped` : '')
  }

  // ------------------------------------------------------------- running
  async function runSuite(suite) {
    const preview = $('preview')
    const page = new PageDriver.Page(preview)
    suite.list.textContent = ''
    suite.counts.passed = suite.counts.failed = suite.counts.skipped = 0
    suite.report.failures.length = 0
    suite.card.open = true
    updateBadge(suite, false)
    wipeStorage()

    const record = (kind, name, detail) => {
      suite.counts[kind === 'pass' ? 'passed' : kind === 'fail' ? 'failed' : 'skipped']++
      totals[kind === 'pass' ? 'passed' : kind === 'fail' ? 'failed' : 'skipped']++
      suite.report[kind === 'pass' ? 'passed' : kind === 'fail' ? 'failed' : 'skipped']++
      if (kind === 'fail') suite.report.failures.push({ name, detail: show(detail) })
      const line = addLine(suite, kind, name, kind === 'pass' ? '' : show(detail))
      if (kind === 'fail') line.scrollIntoView({ block: 'nearest' })
      updateBadge(suite, false)
      renderTotals(`${suite.title}: ${name}`)
    }

    const t = {
      page,
      BASE: APP_BASE,
      sleep: PageDriver.sleep,
      same: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      check: (name, ok, detail) => record(ok ? 'pass' : 'fail', name, detail),
      skip: (name, why) => record('skip', name, why),
      section: (title) => suite.list.appendChild(h('li', { class: 'section', text: title })),
      artifact: (file, text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
        $('artifacts').appendChild(h('li', {}, [h('a', { href: url, download: file, text: file }), ' (from ' + suite.title + ')']))
        $('artifacts-box').hidden = false
      },
    }

    try {
      await suite.run(t)
    } catch (err) {
      record('fail', 'the suite ran to the end without an error', err && err.message ? err.message : String(err))
    } finally {
      page.dispose()
      wipeStorage()
      updateBadge(suite, true)
      suite.card.open = suite.counts.failed > 0
    }
  }

  async function run(selected) {
    if (running) return
    running = true
    document.querySelectorAll('button.run-one, #run-all').forEach((b) => { b.disabled = true })
    totals.passed = totals.failed = totals.skipped = 0
    report.done = false
    report.suites = selected.map((s) => s.report || { name: s.name })
    $('artifacts').textContent = ''
    $('artifacts-box').hidden = true
    const started = Date.now()
    try {
      protectStorage()
    } catch (err) {
      $('status').textContent = 'Not enough browser storage to keep a copy of your data, so nothing was run.'
      running = false
      document.querySelectorAll('button.run-one, #run-all').forEach((b) => { b.disabled = false })
      return
    }
    try {
      for (const suite of selected) {
        if (!suite.card) continue
        await runSuite(suite)
        report.suites = selected.map((s) => s.report)
      }
    } finally {
      restoreStorage()
      running = false
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      renderTotals(`Finished in ${seconds}s. Your own data in this browser was put back.`)
      document.title = (totals.failed ? '✗ FAILED' : '✓ PASSED') + ' — Univa tests'
      document.querySelectorAll('button.run-one, #run-all').forEach((b) => { b.disabled = false })
      $('recover').hidden = true
      report.done = true
    }
  }

  // --------------------------------------------------------------- start
  function start() {
    const list = $('suites')
    suites.forEach((suite) => list.appendChild(buildSuiteCard(suite)))
    $('run-all').addEventListener('click', () => run(suites))
    $('restore').addEventListener('click', () => {
      restoreStorage()
      $('recover').hidden = true
      $('status').textContent = 'Your data was restored.'
    })
    $('recover').hidden = localStorage.getItem(SAVED_KEY) === null
    renderTotals('Ready.')
    const wanted = new URLSearchParams(location.search).get('run')
    if (wanted) {
      const names = wanted.split(',')
      run(wanted === 'all' ? suites : suites.filter((s) => names.includes(s.name)))
    }
  }

  global.Tests = {
    suite(name, title, fn) { suites.push({ name, title, run: fn }) },
    start,
  }
})(window)
