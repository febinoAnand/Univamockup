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
