/* ==========================================================================
   Univa — static HTML build. Small UI helpers: modal open/close, a
   reusable confirm dialog, and toast notifications. Mirrors
   src/shared/dialogs/Modal.jsx + ConfirmDialog.jsx + Toast.jsx.
   ========================================================================== */

const UI = {
  openModal(id) {
    const overlay = document.getElementById(id)
    if (overlay) overlay.classList.add('open')
  },

  closeModal(id) {
    const overlay = document.getElementById(id)
    if (overlay) overlay.classList.remove('open')
  },

  // Matches the real app's RowMenu.jsx: it portals the dropdown into
  // document.body and positions it with getBoundingClientRect so it always
  // escapes any ancestor's overflow clipping (table wrappers, cards, etc).
  // We don't reparent the node (pages re-render their table innerHTML, which
  // would orphan a moved node) — position: fixed achieves the same escape
  // from ancestor overflow without needing a real DOM portal.
  openRowMenu(btn) {
    const menu = btn.closest('.row-menu')
    const dropdown = menu && menu.querySelector('.row-menu-dropdown')
    if (!menu || !dropdown) return
    const rect = btn.getBoundingClientRect()
    dropdown.classList.add('row-menu-dropdown-portal')
    dropdown.style.top = rect.bottom + 6 + 'px'
    dropdown.style.right = window.innerWidth - rect.right + 'px'
    menu.classList.add('open')
  },

  closeRowMenus(root) {
    ;(root || document).querySelectorAll('.row-menu.open').forEach((menu) => {
      menu.classList.remove('open')
      const dropdown = menu.querySelector('.row-menu-dropdown')
      if (dropdown) dropdown.classList.remove('row-menu-dropdown-portal')
    })
  },

  EXPAND_ICON:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  COLLAPSE_ICON:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  // Maximize a panel in place — never reparents the element (this codebase's
  // pages re-render containers via wholesale innerHTML swaps, which would
  // orphan a moved node and strand the overlay). Instead it toggles a class
  // that makes the panel position:fixed over most of the viewport, behind a
  // backdrop, leaving it exactly where it lives in the DOM so its own
  // content reflows naturally at the larger size (a viewBox SVG gauge, a
  // table, etc. — whatever the panel's CSS already does when it's resized).
  //
  // Pass `onRestore` if the caller needs to know when the panel leaves the
  // maximized state via a path other than its own toggle call — Escape or
  // clicking the backdrop both restore directly, bypassing whatever button
  // triggered toggleMaximize in the first place.
  toggleMaximize(panelEl, opts) {
    if (panelEl.classList.contains('panel-maximized')) {
      UI._restoreMaximized(panelEl)
      return false
    }
    UI._enterMaximized(panelEl, opts || {})
    return true
  },

  _enterMaximized(panelEl, opts) {
    let backdrop = document.getElementById('maximize-backdrop')
    if (!backdrop) {
      backdrop = document.createElement('div')
      backdrop.id = 'maximize-backdrop'
      backdrop.className = 'maximize-backdrop'
      document.body.appendChild(backdrop)
    }
    backdrop.classList.add('open')
    backdrop.onclick = function () { UI._restoreMaximized(panelEl) }
    panelEl._maximizeOnRestore = opts.onRestore || null
    panelEl.classList.add('panel-maximized')

    function onKey(event) {
      if (event.key === 'Escape') UI._restoreMaximized(panelEl)
    }
    panelEl._maximizeKeyHandler = onKey
    document.addEventListener('keydown', onKey)
  },

  _restoreMaximized(panelEl) {
    panelEl.classList.remove('panel-maximized')
    const backdrop = document.getElementById('maximize-backdrop')
    if (backdrop) backdrop.classList.remove('open')
    if (panelEl._maximizeKeyHandler) {
      document.removeEventListener('keydown', panelEl._maximizeKeyHandler)
      panelEl._maximizeKeyHandler = null
    }
    const onRestore = panelEl._maximizeOnRestore
    panelEl._maximizeOnRestore = null
    if (onRestore) onRestore()
  },

  // Wires a maximize/restore toggle onto `btn` for `panelEl`, swapping the
  // button's icon and label to match state. Safe to call every render — it
  // always (re)binds to the current DOM nodes.
  wireMaximizeButton(btn, panelEl, opts) {
    if (!btn || !panelEl) return
    btn.addEventListener('click', function (event) {
      event.stopPropagation()
      const nowMaximized = UI.toggleMaximize(panelEl, opts)
      btn.innerHTML = nowMaximized ? UI.COLLAPSE_ICON : UI.EXPAND_ICON
      btn.setAttribute('aria-label', nowMaximized ? 'Restore' : 'Expand')
    })
  },

  confirm({ title = 'Confirm delete', message, confirmLabel = 'Delete', danger = true, onConfirm }) {
    let root = document.getElementById('confirm-dialog-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'confirm-dialog-root'
      document.body.appendChild(root)
    }
    root.innerHTML = `
      <div class="modal-overlay open" id="confirm-dialog-overlay">
        <div class="modal-card" style="max-width:420px">
          <div class="modal-header">
            <h2>${title}</h2>
            <button type="button" class="modal-close" id="confirm-dialog-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <p class="confirm-dialog-message">${message}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="modal-button secondary" id="confirm-dialog-cancel">Cancel</button>
            <button type="button" class="modal-button ${danger ? 'danger' : 'primary'}" id="confirm-dialog-confirm">${confirmLabel}</button>
          </div>
        </div>
      </div>`

    function close() {
      root.innerHTML = ''
    }

    document.getElementById('confirm-dialog-close').addEventListener('click', close)
    document.getElementById('confirm-dialog-cancel').addEventListener('click', close)
    document.getElementById('confirm-dialog-confirm').addEventListener('click', () => {
      close()
      onConfirm && onConfirm()
    })
  },

  // Matches the real app's shared Toast.jsx (.device-toast) — a top-right
  // white card with a green left border, used by nearly every list page.
  toast(message, duration = 3000) {
    let el = document.getElementById('toast-root')
    if (!el) {
      el = document.createElement('div')
      el.id = 'toast-root'
      document.body.appendChild(el)
    }
    el.innerHTML = `
      <div class="device-toast">
        <span class="device-toast-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span class="device-toast-message">${message}</span>
        <button type="button" class="device-toast-close" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
        </button>
      </div>`
    el.querySelector('.device-toast-close').addEventListener('click', () => {
      el.innerHTML = ''
      clearTimeout(el._timer)
    })
    clearTimeout(el._timer)
    el._timer = setTimeout(() => {
      el.innerHTML = ''
    }, duration)
  },

  // ---------------------------------------------------- password requirements
  PASSWORD_REQUIREMENTS: [
    { key: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
    { key: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
    { key: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
    { key: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
    { key: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  ],

  CHECK_ICON:
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  CROSS_ICON:
    '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>',

  passwordRequirementsHtml(password) {
    return UI.PASSWORD_REQUIREMENTS.map((req) => {
      const met = req.test(password)
      return `<li class="requirement">
        <span class="requirement-icon ${met ? 'met' : 'unmet'}">${met ? UI.CHECK_ICON : UI.CROSS_ICON}</span>
        ${req.label}
      </li>`
    }).join('')
  },

  allPasswordRequirementsMet(password) {
    return UI.PASSWORD_REQUIREMENTS.every((req) => req.test(password))
  },

  EYE_ICON:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8"/></svg>',
  EYE_OFF_ICON:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18" stroke-linecap="round"/><path d="M10.6 5.6A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a15.8 15.8 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.5 6.5 10 6.5c1.4 0 2.7-.3 3.9-.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  wireShowHideToggle(inputId, buttonId) {
    const input = document.getElementById(inputId)
    const button = document.getElementById(buttonId)
    if (!input || !button) return
    button.addEventListener('click', () => {
      const showing = input.type === 'text'
      input.type = showing ? 'password' : 'text'
      button.innerHTML = showing ? UI.EYE_ICON : UI.EYE_OFF_ICON
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password')
    })
  },
}

window.UI = UI
