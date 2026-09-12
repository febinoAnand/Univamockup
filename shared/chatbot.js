/* ==========================================================================
   Univa — static HTML build. Floating AI assistant.

   Calls the real Anthropic Messages API directly from the browser (no
   backend exists in this project) so it can analyze the mock data in
   store.js and act on it — navigate pages, look things up, and make
   create/status/delete changes through tool use. Mounted by
   Layout.mount() (see shared/layout.js), so it's present on every
   authenticated page without a <script> tag per file.

   SECURITY: calling the API directly from client-side JS means the API key
   you enter is stored in this browser's localStorage and is visible to
   anyone with access to this browser/device or its devtools/network tab —
   there is no server here to hide it behind. Only use a key you're
   comfortable having exposed this way (a low-limit/test key is safest),
   and never commit one into this project's source.
   ========================================================================== */

const CHATBOT_MODEL = 'claude-opus-5'
const CHATBOT_API_URL = 'https://api.anthropic.com/v1/messages'
const CHATBOT_KEY_STORAGE = 'univa-chatbot-api-key'
const CHATBOT_HISTORY_STORAGE = 'univa-chatbot-history'
const CHATBOT_OPEN_STORAGE = 'univa-chatbot-open'
const CHATBOT_PENDING_STORAGE = 'univa-chatbot-pending-continuation'
const CHATBOT_MAX_HISTORY = 24
const CHATBOT_MAX_LOOP_STEPS = 6

// entity key -> Store.get() collection of the same name. `nameField` is
// what to show a human instead of a raw id; `remove`/`toggleStatus` are the
// exact Store method names this widget is allowed to call — kept to a
// verified subset of Store's real methods, not a generic "call anything".
const CHATBOT_ENTITIES = {
  devices: { nameField: 'name', remove: 'deleteDevice' },
  deviceProfiles: { nameField: 'name', remove: 'removeDeviceProfile' },
  applications: { nameField: 'name', remove: 'removeApplication', toggleStatus: 'toggleApplicationStatus' },
  assets: { nameField: 'name', remove: 'removeAsset', toggleStatus: 'toggleAssetStatus' },
  assetGroups: { nameField: 'name', remove: 'removeAssetGroup' },
  assetProfiles: { nameField: 'name', remove: 'removeAssetProfile' },
  ruleEngines: { nameField: 'name', remove: 'removeRuleEngine' },
  ruleEngineExecutions: { nameField: 'ruleEngineName' },
  tenants: { nameField: 'title', remove: 'removeTenant', toggleStatus: 'toggleTenantStatus' },
  tenantProfiles: { nameField: 'name', remove: 'removeTenantProfile' },
  users: { nameField: 'name', remove: 'deleteUser', toggleStatus: 'toggleUserStatus' },
  userGroups: { nameField: 'name', remove: 'removeUserGroup' },
  shifts: { nameField: 'name', remove: 'removeShift', toggleStatus: 'toggleShiftStatus' },
  shiftSchedules: { nameField: 'name', remove: 'removeShiftSchedule' },
  shiftInstances: { nameField: 'shiftName', remove: 'removeShiftInstance' },
}

const CHATBOT_SYSTEM_PROMPT = `You are the Univa Assistant, embedded as a floating widget in the Univa IoT/asset-management admin console. Everything you see is a local, static demo dataset (no real devices or customers) served by the browser's own mock data layer — be direct and don't caveat that it's a demo unless the user asks.

You can read and act on this data via tools. Field names by entity (only the fields relevant to you are listed):
- devices: name, endpointId, state ("online"/"offline"), profileName
- deviceProfiles, assetProfiles, tenantProfiles, userGroups, assetGroups: name, description
- applications, assets, tenants, users, shifts: name (tenants use "title" instead of "name"), status ("active"/"suspended", except users which also has "invited")
- ruleEngines: name, description, conditionMetric, conditionOperator, conditionValue, triggerType, actionType
- ruleEngineExecutions: ruleEngineName, triggeredAt, triggerType, outcome ("success"/"failed") — read-only history
- shiftSchedules: name, description, assignments (an object keyed Mon..Sun, each value an array of shift ids covering that day)
- shiftInstances: shiftName, scheduleName, date, day, status ("completed"/"upcoming") — read-only, generated occurrences

Rules:
- To act on a record the user names (e.g. "the Night shift", "user Alicia"), call query_data first to find its id by matching the name field (case-insensitive, partial match is fine). If you find zero or more than one plausible match, ask the user to clarify instead of guessing which one they mean.
- delete_record always shows the user a confirmation dialog before anything is removed — you don't need to ask permission yourself first, just call it and report whatever it comes back with (deleted, cancelled, or blocked).
- navigate_to_page ends your turn immediately (the page reloads) — say what you're opening in the same turn as the tool call, briefly.
- Keep replies short and plain text — no markdown formatting, it won't render.`

let chatbotHistory = []
let chatbotNavSections = []
let chatbotBusy = false

// --------------------------------------------------------------- storage

function chatbotGetApiKey() {
  try {
    return localStorage.getItem(CHATBOT_KEY_STORAGE) || ''
  } catch (e) {
    return ''
  }
}

function chatbotSetApiKey(key) {
  try {
    if (key) localStorage.setItem(CHATBOT_KEY_STORAGE, key)
    else localStorage.removeItem(CHATBOT_KEY_STORAGE)
  } catch (e) {}
}

function chatbotLoadHistory() {
  try {
    const raw = sessionStorage.getItem(CHATBOT_HISTORY_STORAGE)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function chatbotTrimHistory(history) {
  while (history.length > CHATBOT_MAX_HISTORY) {
    history.shift()
    while (
      history.length &&
      history[0].role === 'user' &&
      Array.isArray(history[0].content) &&
      history[0].content.every((b) => b.type === 'tool_result')
    ) {
      history.shift()
    }
  }
  return history
}

function chatbotSaveHistory(history) {
  chatbotTrimHistory(history)
  try {
    sessionStorage.setItem(CHATBOT_HISTORY_STORAGE, JSON.stringify(history))
  } catch (e) {}
}

function chatbotSavePending(pending) {
  try {
    sessionStorage.setItem(CHATBOT_PENDING_STORAGE, JSON.stringify(pending))
  } catch (e) {}
}

function chatbotLoadPending() {
  try {
    const raw = sessionStorage.getItem(CHATBOT_PENDING_STORAGE)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function chatbotClearPending() {
  try {
    sessionStorage.removeItem(CHATBOT_PENDING_STORAGE)
  } catch (e) {}
}

// ------------------------------------------------------------------ tools

function chatbotNavigateEnum() {
  const pages = []
  chatbotNavSections.forEach((section) => {
    if (section.href) pages.push(section.href.replace('.html', ''))
    if (section.children) {
      section.children.forEach((child) => {
        if (child.href) pages.push(child.href.replace('.html', ''))
      })
    }
  })
  return Array.from(new Set(pages))
}

function chatbotBuildTools() {
  const statusEntities = Object.keys(CHATBOT_ENTITIES).filter((k) => CHATBOT_ENTITIES[k].toggleStatus)
  const removableEntities = Object.keys(CHATBOT_ENTITIES).filter((k) => CHATBOT_ENTITIES[k].remove)
  return [
    {
      name: 'navigate_to_page',
      description: 'Navigate the browser to a page in the app sidebar. Use when the user asks to open, go to, or show a section of the app.',
      input_schema: {
        type: 'object',
        properties: { page: { type: 'string', enum: chatbotNavigateEnum() } },
        required: ['page'],
      },
    },
    {
      name: 'query_data',
      description: "Read-only lookup against the app's mock dataset. Use for analysis questions (counts, lists, statuses) and to resolve a record's id from a name before calling an action tool.",
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: Object.keys(CHATBOT_ENTITIES) },
          filter: { type: 'object', description: 'Optional exact-match filters on top-level fields, e.g. {"status":"suspended"}', additionalProperties: true },
          limit: { type: 'integer', description: 'Max records to return (default 30, max 50)' },
        },
        required: ['entity'],
      },
    },
    {
      name: 'set_record_status',
      description: 'Activate or suspend a record by id. Only these entities support it: ' + statusEntities.join(', ') + '. Look the id up with query_data first.',
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: statusEntities },
          id: { type: 'string' },
          status: { type: 'string', enum: ['active', 'suspended'] },
        },
        required: ['entity', 'id', 'status'],
      },
    },
    {
      name: 'create_shift',
      description: 'Create a new shift definition.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          startTime: { type: 'string', description: '24h HH:MM, e.g. "08:00"' },
          endTime: { type: 'string', description: '24h HH:MM, e.g. "16:00"' },
          midnightCrossed: { type: 'boolean', description: 'true if the shift spans midnight' },
        },
        required: ['name', 'startTime', 'endTime'],
      },
    },
    {
      name: 'create_group',
      description: 'Create a new user group or asset group.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['userGroup', 'assetGroup'] },
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['kind', 'name'],
      },
    },
    {
      name: 'delete_record',
      description: 'Permanently delete a record by id. Look the id up with query_data first. Always shows the user a confirmation dialog before deleting.',
      input_schema: {
        type: 'object',
        properties: {
          entity: { type: 'string', enum: removableEntities },
          id: { type: 'string' },
        },
        required: ['entity', 'id'],
      },
    },
  ]
}

function chatbotToolQueryData(input) {
  const data = Store.get()
  const rows = data[input.entity]
  if (!Array.isArray(rows)) return { error: 'Unknown entity: ' + input.entity }
  let filtered = rows
  if (input.filter && typeof input.filter === 'object') {
    const keys = Object.keys(input.filter)
    filtered = filtered.filter((row) =>
      keys.every((key) => String(row[key]).toLowerCase() === String(input.filter[key]).toLowerCase()),
    )
  }
  const limit = Math.min(input.limit || 30, 50)
  return JSON.stringify({ total: filtered.length, returned: Math.min(filtered.length, limit), records: filtered.slice(0, limit) })
}

function chatbotToolSetStatus(input) {
  const registryEntry = CHATBOT_ENTITIES[input.entity]
  if (!registryEntry || !registryEntry.toggleStatus) return { error: 'That entity does not support status changes.' }
  const record = (Store.get()[input.entity] || []).find((r) => r.id === input.id)
  if (!record) return { error: 'No record with that id. Call query_data first to find it.' }
  const label = record[registryEntry.nameField] || record.id
  if (record.status === input.status) return `"${label}" is already ${input.status}.`
  Store[registryEntry.toggleStatus](input.id)
  return `"${label}" set to ${input.status}.`
}

function chatbotToolCreateShift(input) {
  const record = Store.addShift({
    name: input.name,
    startTime: input.startTime,
    endTime: input.endTime,
    midnightCrossed: !!input.midnightCrossed,
  })
  return `Created shift "${record.name}" (${record.startTime}–${record.endTime}).`
}

function chatbotToolCreateGroup(input) {
  if (input.kind === 'userGroup') {
    const record = Store.addUserGroup({ name: input.name, description: input.description || '' })
    return `Created user group "${record.name}".`
  }
  const record = Store.addAssetGroup({ name: input.name, description: input.description || '' })
  return `Created asset group "${record.name}".`
}

function chatbotToolDeleteRecord(input) {
  return new Promise((resolve) => {
    const registryEntry = CHATBOT_ENTITIES[input.entity]
    if (!registryEntry || !registryEntry.remove) {
      resolve({ error: 'That entity cannot be deleted.' })
      return
    }
    const record = (Store.get()[input.entity] || []).find((r) => r.id === input.id)
    if (!record) {
      resolve({ error: 'No record with that id. Call query_data first to find it.' })
      return
    }
    const label = record[registryEntry.nameField] || record.id

    if (input.entity === 'shifts') {
      const inUseBy = Store.shiftInUseBy(input.id)
      if (inUseBy.length > 0) {
        resolve(`Can't delete "${label}" — it's still assigned in schedule(s): ${inUseBy.join(', ')}.`)
        return
      }
    }

    UI.confirm({
      message: `Delete <strong>${label}</strong>? This can't be undone.`,
      onConfirm: () => {
        Store[registryEntry.remove](input.id)
        resolve(`Deleted "${label}".`)
      },
      onCancel: () => resolve(`Cancelled — "${label}" was not deleted.`),
    })
  })
}

async function chatbotExecuteTool(name, input) {
  try {
    switch (name) {
      case 'query_data':
        return chatbotToolQueryData(input)
      case 'set_record_status':
        return chatbotToolSetStatus(input)
      case 'create_shift':
        return chatbotToolCreateShift(input)
      case 'create_group':
        return chatbotToolCreateGroup(input)
      case 'delete_record':
        return await chatbotToolDeleteRecord(input)
      default:
        return { error: 'Unknown tool: ' + name }
    }
  } catch (err) {
    return { error: String((err && err.message) || err) }
  }
}

// -------------------------------------------------------------------- API

async function chatbotCallClaude(messages) {
  const apiKey = chatbotGetApiKey()
  const res = await fetch(CHATBOT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CHATBOT_MODEL,
      max_tokens: 4096,
      system: CHATBOT_SYSTEM_PROMPT,
      tools: chatbotBuildTools(),
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      output_config: { effort: 'low' },
      messages,
    }),
  })
  if (!res.ok) {
    let message = 'Request failed (' + res.status + ')'
    try {
      const body = await res.json()
      if (body && body.error && body.error.message) message = body.error.message
    } catch (e) {}
    if (res.status === 401) message = 'That API key was rejected. Open settings and check it.'
    throw new Error(message)
  }
  return res.json()
}

// ----------------------------------------------------------------- loop

async function chatbotContinueLoop(history) {
  chatbotSetBusy(true)
  let steps = 0
  while (steps++ < CHATBOT_MAX_LOOP_STEPS) {
    chatbotShowTyping(true)
    let response
    try {
      response = await chatbotCallClaude(history)
    } catch (err) {
      chatbotShowTyping(false)
      chatbotAppendMessage('error', err.message)
      chatbotSaveHistory(history)
      chatbotSetBusy(false)
      return
    }
    chatbotShowTyping(false)

    if (response.stop_reason === 'refusal') {
      chatbotAppendMessage('assistant', "I'm not able to help with that request.")
      chatbotSaveHistory(history)
      chatbotSetBusy(false)
      return
    }

    history.push({ role: 'assistant', content: response.content })

    const leadingText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (leadingText) chatbotAppendMessage('assistant', leadingText)

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (!toolUse) {
      chatbotSaveHistory(history)
      chatbotSetBusy(false)
      return
    }

    chatbotAppendToolNote(toolUse.name)

    if (toolUse.name === 'navigate_to_page') {
      const page = toolUse.input.page
      chatbotSaveHistory(history)
      chatbotSavePending({ toolUseId: toolUse.id, result: 'Navigated to the ' + page + ' page.' })
      window.location.href = page + '.html'
      return
    }

    const result = await chatbotExecuteTool(toolUse.name, toolUse.input)
    const isError = result && typeof result === 'object' && result.error
    const content = isError ? result.error : typeof result === 'string' ? result : JSON.stringify(result)
    history.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content, is_error: !!isError }] })
    chatbotSaveHistory(history)
  }
  chatbotAppendMessage('error', "That's a lot of steps — let's pause here. Try rephrasing or breaking the request into smaller pieces.")
  chatbotSetBusy(false)
}

// Uses the module-level chatbotHistory (already reloaded from storage by
// mount() before this runs) rather than a snapshot taken before navigating
// — that snapshot would otherwise diverge from chatbotHistory and get
// silently overwritten on the next save.
function chatbotResumePending() {
  const pending = chatbotLoadPending()
  if (!pending) return
  if (!chatbotGetApiKey()) return // resume next time a key is set; leave pending saved
  chatbotClearPending()
  chatbotHistory.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: pending.toolUseId, content: pending.result }] })
  chatbotContinueLoop(chatbotHistory)
}

// ------------------------------------------------------------------- UI

function chatbotAppendMessage(role, text) {
  const body = document.getElementById('chatbot-body')
  if (!body) return
  const el = document.createElement('div')
  el.className = 'chatbot-msg ' + role
  el.textContent = text
  body.appendChild(el)
  body.scrollTop = body.scrollHeight
}

function chatbotAppendToolNote(toolName) {
  const body = document.getElementById('chatbot-body')
  if (!body) return
  const labels = {
    navigate_to_page: 'Opening page…',
    query_data: 'Looking up data…',
    set_record_status: 'Updating status…',
    create_shift: 'Creating shift…',
    create_group: 'Creating group…',
    delete_record: 'Requesting confirmation…',
  }
  const el = document.createElement('div')
  el.className = 'chatbot-tool-note'
  el.textContent = labels[toolName] || toolName
  body.appendChild(el)
  body.scrollTop = body.scrollHeight
}

function chatbotShowTyping(show) {
  const existing = document.getElementById('chatbot-typing')
  if (show) {
    if (existing) return
    const body = document.getElementById('chatbot-body')
    if (!body) return
    const el = document.createElement('div')
    el.id = 'chatbot-typing'
    el.className = 'chatbot-typing'
    el.innerHTML = '<span></span><span></span><span></span>'
    body.appendChild(el)
    body.scrollTop = body.scrollHeight
  } else if (existing) {
    existing.remove()
  }
}

function chatbotSetBusy(busy) {
  chatbotBusy = busy
  const sendBtn = document.getElementById('chatbot-send-btn')
  if (sendBtn) sendBtn.disabled = busy
}

function chatbotRenderHistory(history) {
  const body = document.getElementById('chatbot-body')
  if (!body) return
  body.innerHTML = ''
  history.forEach((message) => {
    if (typeof message.content === 'string') {
      chatbotAppendMessage(message.role, message.content)
      return
    }
    message.content.forEach((block) => {
      if (block.type === 'text' && block.text.trim()) chatbotAppendMessage(message.role, block.text)
      else if (block.type === 'tool_use') chatbotAppendToolNote(block.name)
    })
  })
  if (history.length === 0) {
    chatbotAppendMessage(
      'assistant',
      "Hi, I'm the Univa Assistant. Ask me things like \"how many devices are offline\", \"open shift schedule\", or \"suspend user Alicia\".",
    )
  }
}

function chatbotSend(text) {
  if (chatbotBusy || !text.trim()) return
  if (!chatbotGetApiKey()) {
    chatbotOpenSettings()
    return
  }
  chatbotAppendMessage('user', text.trim())
  chatbotHistory.push({ role: 'user', content: text.trim() })
  chatbotSaveHistory(chatbotHistory)
  chatbotContinueLoop(chatbotHistory)
}

function chatbotOpenSettings() {
  const settings = document.getElementById('chatbot-settings')
  const body = document.getElementById('chatbot-body')
  const inputRow = document.getElementById('chatbot-input-row')
  const suggestions = document.getElementById('chatbot-suggestions')
  if (!settings) return
  document.getElementById('chatbot-key-input').value = chatbotGetApiKey()
  settings.style.display = 'flex'
  if (body) body.style.display = 'none'
  if (inputRow) inputRow.style.display = 'none'
  if (suggestions) suggestions.style.display = 'none'
}

function chatbotCloseSettings() {
  const settings = document.getElementById('chatbot-settings')
  const body = document.getElementById('chatbot-body')
  const inputRow = document.getElementById('chatbot-input-row')
  const suggestions = document.getElementById('chatbot-suggestions')
  if (settings) settings.style.display = 'none'
  if (body) body.style.display = 'flex'
  if (inputRow) inputRow.style.display = 'flex'
  if (suggestions) suggestions.style.display = 'flex'
}

function chatbotSetOpen(open) {
  const panel = document.getElementById('chatbot-panel')
  const launcher = document.getElementById('chatbot-launcher')
  if (!panel || !launcher) return
  panel.classList.toggle('open', open)
  launcher.classList.toggle('hidden', open)
  try {
    sessionStorage.setItem(CHATBOT_OPEN_STORAGE, open ? '1' : '0')
  } catch (e) {}
  if (open) {
    const textarea = document.getElementById('chatbot-textarea')
    if (textarea) textarea.focus()
  }
}

function chatbotBuildDom() {
  const launcher = document.createElement('button')
  launcher.type = 'button'
  launcher.id = 'chatbot-launcher'
  launcher.className = 'chatbot-launcher'
  launcher.setAttribute('aria-label', 'Open assistant')
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1.2-3.6A8 8 0 0 1 4 12Z" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/></svg>'

  const panel = document.createElement('div')
  panel.id = 'chatbot-panel'
  panel.className = 'chatbot-panel'
  panel.innerHTML = `
    <div class="chatbot-header">
      <div class="chatbot-header-title">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1.2-3.6A8 8 0 0 1 4 12Z" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Univa Assistant
      </div>
      <div class="chatbot-header-actions">
        <button type="button" class="chatbot-icon-button" id="chatbot-settings-btn" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.4a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.4a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="chatbot-icon-button" id="chatbot-close-btn" aria-label="Close">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="chatbot-body" id="chatbot-body"></div>
    <div class="chatbot-suggestions" id="chatbot-suggestions">
      <button type="button" class="chatbot-suggestion-chip" data-suggestion="How many devices are offline?">How many devices are offline?</button>
      <button type="button" class="chatbot-suggestion-chip" data-suggestion="Open shift schedule">Open shift schedule</button>
      <button type="button" class="chatbot-suggestion-chip" data-suggestion="List suspended users">List suspended users</button>
    </div>
    <div class="chatbot-input-row" id="chatbot-input-row">
      <textarea id="chatbot-textarea" rows="1" placeholder="Ask about your data or tell it what to do…"></textarea>
      <button type="button" class="chatbot-send-button" id="chatbot-send-btn" aria-label="Send">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12l16-8-6 8 6 8-16-8Z" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="chatbot-settings" id="chatbot-settings" style="display:none;">
      <p class="chatbot-settings-note">
        This app has no backend, so the API key you enter is stored in this browser's localStorage and calls the Anthropic API directly from this page. Anyone with access to this browser/device or its devtools can read that key. Use a key you're comfortable exposing this way — a low-limit or test key is safest — and never share this browser session with anyone you wouldn't hand the key to.
      </p>
      <label for="chatbot-key-input">Anthropic API key</label>
      <input type="password" id="chatbot-key-input" placeholder="sk-ant-..." autocomplete="off" />
      <div class="chatbot-settings-actions">
        <button type="button" class="chatbot-settings-cancel" id="chatbot-settings-cancel-btn">Cancel</button>
        <button type="button" class="chatbot-settings-save" id="chatbot-settings-save-btn">Save</button>
      </div>
    </div>
  `

  document.body.appendChild(launcher)
  document.body.appendChild(panel)

  launcher.addEventListener('click', () => chatbotSetOpen(true))
  document.getElementById('chatbot-close-btn').addEventListener('click', () => chatbotSetOpen(false))
  document.getElementById('chatbot-settings-btn').addEventListener('click', chatbotOpenSettings)
  document.getElementById('chatbot-settings-cancel-btn').addEventListener('click', chatbotCloseSettings)
  document.getElementById('chatbot-settings-save-btn').addEventListener('click', () => {
    const value = document.getElementById('chatbot-key-input').value.trim()
    chatbotSetApiKey(value)
    chatbotCloseSettings()
  })

  const textarea = document.getElementById('chatbot-textarea')
  const sendBtn = document.getElementById('chatbot-send-btn')
  sendBtn.addEventListener('click', () => {
    const value = textarea.value
    textarea.value = ''
    chatbotSend(value)
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const value = textarea.value
      textarea.value = ''
      chatbotSend(value)
    }
  })

  document.querySelectorAll('[data-suggestion]').forEach((chip) => {
    chip.addEventListener('click', () => chatbotSend(chip.getAttribute('data-suggestion')))
  })
}

// ----------------------------------------------------------------- mount

const Chatbot = {
  mount(navSections) {
    chatbotNavSections = navSections || []
    if (document.getElementById('chatbot-panel')) return // already mounted this page load
    chatbotBuildDom()
    chatbotHistory = chatbotLoadHistory()
    chatbotRenderHistory(chatbotHistory)
    if (!chatbotGetApiKey()) chatbotOpenSettings()

    let wasOpen = false
    try {
      wasOpen = sessionStorage.getItem(CHATBOT_OPEN_STORAGE) === '1'
    } catch (e) {}
    if (wasOpen) chatbotSetOpen(true)

    chatbotResumePending()
  },
}

window.Chatbot = Chatbot
