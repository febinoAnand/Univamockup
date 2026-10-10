// Getting in and out: the sign-in page, signing up, resetting a password, the
// system administrator's sign-in, and being sent to the login page when you are
// not signed in. Each flow is driven through the real page, field by field.

const AUTH_PROTECTED_PAGES = [
  'dashboard.html', 'applications.html', 'application-detail.html#app0', 'application-detail.html#app_ems', 'application-detail.html#app_cms',
  'notion.html#app_notion', 'email-tracking.html#app_email', 'forklift-tracking.html#app_forklift', 'devices.html', 'device-detail.html#d1', 'device-data.html', 'device-profiles.html', 'credentials.html',
  'software-ota.html', 'assets.html', 'asset-detail.html#a1', 'asset-groups.html', 'asset-profiles.html', 'shift-management.html',
  'shift-schedules.html', 'shift-instances.html', 'rule-engines.html', 'rule-engine-reports.html', 'users.html', 'user-groups.html',
  'roles.html', 'settings.html', 'ems-meter-dashboard.html#m1', 'cms-machine-dashboard.html#cm1',
]

Tests.suite('auth', 'Signing in, signing up and signing out', async ({ page, BASE, check, section, same }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`))

  const open = async (url) => {
    await page.goto('about:blank')
    await page.goto(BASE + url)
  }
  const reset = async () => {
    await page.goto(BASE + 'login.html')
    await page.evaluate(() => { Store.reset(); try { sessionStorage.clear() } catch (err) { /* none */ } })
  }
  const visible = (selector) => page.locator(selector).isVisible()
  const disabled = (selector) => page.locator(selector).isDisabled()
  const signInForm = async (org, user, password) => {
    await page.fill('#organizationId', org)
    await page.fill('#username', user)
    await page.fill('#password', password)
    await page.click('.login-button')
  }

  // ---------------------------------------------------------------- sign in
  section('The sign-in page')
  await reset()
  await open('login.html')
  check('the form asks for an organization ID, a username and a password', (await page.locator('#organizationId').count()) === 1 && (await page.locator('#username').count()) === 1 && (await page.locator('#password').count()) === 1 && (await page.getAttribute('#password', 'type')) === 'password')
  check('it links to sign up and to a password reset', (await page.getAttribute('a[href="signup.html"]', 'href')) === 'signup.html' && (await page.getAttribute('a[href="forgot-password.html"]', 'href')) === 'forgot-password.html')
  check('no error shows before anything is tried', !(await visible('#login-error')) && !(await visible('#login-notice')))

  await signInForm('', 'admin', 'not-the-password')
  await page.waitForSelector('#login-error')
  check('a wrong password shows an error and stays on the page', /login\.html/.test(page.url()) && (await page.textContent('#login-error')).includes('Invalid username or password'), page.url())
  check('and does not sign anyone in', (await page.evaluate(() => Store.isLoggedIn())) === false)

  await open('login.html')
  await signInForm('', 'nobody', 'admin')
  await page.waitForSelector('#login-error')
  check('an unknown user is told the same thing', (await page.textContent('#login-error')).includes('Invalid username or password'))

  await open('login.html')
  await signInForm('', 'adminapprove', 'admin')
  await page.waitForSelector('#login-notice')
  check('an account that is waiting for approval is told so, not "invalid"', (await page.textContent('#login-notice')).includes('awaiting approval') && !(await visible('#login-error')) && /login\.html/.test(page.url()))
  check('and is not signed in', (await page.evaluate(() => Store.isLoggedIn())) === false)

  await open('login.html')
  await signInForm('', '  ADMIN  ', 'admin')
  await page.waitForURL(/dashboard\.html/)
  check('the demo administrator signs in (the username is not case-sensitive and spaces are ignored)', (await page.evaluate(() => Store.isLoggedIn() && Store.get().auth.role)) === 'Owner')

  section('Signing in to a tenant')
  await reset()
  await open('login.html')
  await signInForm('northbridge', 'Dana.Whitfield@Northbridge.com', '12345')
  await page.waitForURL(/dashboard\.html/)
  const dana = await page.evaluate(() => { const a = Store.get().auth; return { role: a.role, tenant: a.tenantId, user: a.tenantUserId } })
  check('a tenant user signs in with the organization ID (any case) and their email', same(dana, { role: 'Owner', tenant: 't1', user: 'tu1' }), dana)

  const refused = []
  for (const [label, org, user, password] of [
    ['the wrong password', 'NORTHBRIDGE', 'dana.whitfield@northbridge.com', 'admin'],
    ['another tenant\'s organization ID', 'CRADLEWELL', 'dana.whitfield@northbridge.com', '12345'],
    ['no organization ID', '', 'dana.whitfield@northbridge.com', '12345'],
    ['an organization that is not there', 'NOSUCH', 'dana.whitfield@northbridge.com', '12345'],
  ]) {
    await reset()
    await open('login.html')
    await signInForm(org, user, password)
    await page.waitForSelector('#login-error')
    refused.push([label, await page.evaluate(() => Store.isLoggedIn())])
  }
  check('a tenant user is refused with: ' + refused.map((r) => r[0]).join('; '), refused.every((r) => r[1] === false), refused)

  await reset()
  await page.evaluate(() => { Store.toggleTenantUserStatus('t1', 'tu2') })
  await open('login.html')
  await signInForm('NORTHBRIDGE', 'omar.salim@northbridge.com', '12345')
  await page.waitForSelector('#login-error')
  check('a suspended user is refused', (await page.evaluate(() => Store.isLoggedIn())) === false)

  await reset()
  await page.evaluate(() => { Store.addTenantUser('t3', { name: 'Hal', email: 'hal@harbordock.com', role: 'Owner' }) })
  await open('login.html')
  await signInForm('HARBORDOCK', 'hal@harbordock.com', '12345')
  await page.waitForSelector('#login-error')
  check('so is everyone in a suspended tenant', (await page.evaluate(() => Store.isLoggedIn())) === false)

  section('Staying signed in, and signing out')
  await reset()
  await page.evaluate(() => Store.login('admin', 'admin'))
  await open('login.html')
  await page.waitForURL(/dashboard\.html/)
  check('someone already signed in is taken past the login page to the dashboard', /dashboard\.html/.test(page.url()), page.url())
  await page.waitForSelector('#logout-button')
  await page.click('#logout-button')
  await page.waitForURL(/login\.html/)
  check('signing out goes back to the login page', /login\.html/.test(page.url()))
  check('and really signs out', (await page.evaluate(() => Store.isLoggedIn())) === false)
  await open('devices.html')
  await page.waitForURL(/login\.html/)
  check('after that, a signed-in page sends you back to login', /login\.html/.test(page.url()), page.url())

  section('Signed out, every signed-in page sends you to the login page')
  await reset()
  const notSent = []
  for (const url of AUTH_PROTECTED_PAGES) {
    await open(url)
    try { await page.waitForURL(/login\.html/, { timeout: 2500 }) } catch (err) { notSent.push(url + ' stayed at ' + page.url().replace(BASE, '')) }
  }
  check(`all ${AUTH_PROTECTED_PAGES.length} pages redirect`, notSent.length === 0, notSent)

  // ----------------------------------------------------------------- sign up
  section('Signing up')
  await reset()
  await open('signup.html')
  check('"Create account" is off until the form is complete', await disabled('#create-account-btn'))
  check('"Check availability" is off until a username is typed', await disabled('#check-availability-btn'))
  await page.fill('#username', 'admin')
  check('typing a username turns the check on', !(await disabled('#check-availability-btn')))
  await page.click('#check-availability-btn')
  await page.waitForSelector('#username-status.taken')
  check('a reserved username (admin) is "already taken"', (await page.textContent('#username-status')).includes('already taken'))
  const free = await page.evaluate(() => { for (let i = 1; ; i++) { const name = 'plant' + i; if (!isUsernameTaken(name)) return name } })
  await page.fill('#username', free)
  check('changing the username clears the answer', !(await visible('#username-status')))
  await page.click('#check-availability-btn')
  await page.waitForSelector('#username-status.available')
  check('a free username is "available"', (await page.textContent('#username-status')).includes('available'), free)
  check('but the form is still not complete', await disabled('#create-account-btn'))

  await page.fill('#email', 'sam@example.test')
  check('a valid email is marked valid', await page.evaluate(() => document.getElementById('email-wrap').classList.contains('is-valid')))
  await page.fill('#email', 'not-an-email')
  check('and a bad one is not', !(await page.evaluate(() => document.getElementById('email-wrap').classList.contains('is-valid'))))
  await page.fill('#email', 'sam@example.test')
  await page.fill('#companyName', 'Sam & Sons')
  await page.fill('#contactNumber', '555 0100')

  const met = () => page.$$eval('#requirements-list .requirement-icon.met', (els) => els.length)
  await page.fill('#password', 'abc')
  check('the password list ticks what is met: "abc" has a lowercase letter and nothing else', (await met()) === 1)
  await page.fill('#password', 'Abcdef1!')
  check('"Abcdef1!" meets all five rules', (await met()) === 5)
  await page.fill('#password', 'Abcdefg1')
  check('without a special character, four of five', (await met()) === 4)
  await page.fill('#password', 'Abcdef1!')
  await page.fill('#confirmPassword', 'Abcdef1')
  check('a confirmation that differs shows "do not match" and keeps the button off', (await visible('#password-mismatch')) && (await disabled('#create-account-btn')))
  await page.fill('#confirmPassword', 'Abcdef1!')
  check('a matching one hides the warning and turns the button on', !(await visible('#password-mismatch')) && !(await disabled('#create-account-btn')))

  await page.click('#toggle-password')
  check('the eye button shows the password, then hides it again', (await page.getAttribute('#password', 'type')) === 'text' && (await page.getAttribute('#toggle-password', 'aria-label')) === 'Hide password')
  await page.click('#toggle-password')
  check('and back', (await page.getAttribute('#password', 'type')) === 'password' && (await page.getAttribute('#toggle-password', 'aria-label')) === 'Show password')

  await page.click('#create-account-btn')
  await page.waitForURL(/verify-email\.html/)
  check('submitting goes to the verify-email page, carrying the address', decodeURIComponent(page.url().split('#')[1]) === 'sam@example.test', page.url())
  check('and shows that address', (await page.textContent('#verify-email-value')) === 'sam@example.test')

  await page.click('#edit-email-btn')
  await page.waitForURL(/signup\.html/)
  const restored = await page.evaluate(() => ({ username: document.getElementById('username').value, email: document.getElementById('email').value, company: document.getElementById('companyName').value, button: document.getElementById('create-account-btn').disabled, status: document.getElementById('username-status').className }))
  check('going back to edit the email finds what was typed still there, and the form still complete', restored.email === 'sam@example.test' && restored.company === 'Sam & Sons' && restored.username === free && restored.button === false && /available/.test(restored.status), restored)

  section('Verifying the email')
  await open('verify-email.html')
  await page.waitForURL(/signup\.html/)
  check('the verify page with no address sends you back to sign up', /signup\.html/.test(page.url()))
  await open('verify-email.html#' + encodeURIComponent('lee+test@example.test'))
  check('an address with a plus sign or an @ shows as typed', (await page.textContent('#verify-email-value')) === 'lee+test@example.test')
  await page.click('#resend-email-btn')
  await page.waitForSelector('.toast')
  check('"Resend" says it was resent', (await page.textContent('.toast')).includes('resent'))
  await page.click('#clicked-verification-btn')
  await page.waitForURL(/organization-created\.html/)
  const orgId = await page.textContent('#org-id-value')
  check('then the organisation is created, with an 8-character ID in capitals and digits', /^[A-Z0-9]{8}$/.test(orgId), orgId)
  await open('organization-created.html')
  check('opening the page again shows the same ID', (await page.textContent('#org-id-value')) === orgId)
  check('and the sign-up draft is cleared', (await page.evaluate(() => sessionStorage.getItem('univa-signup-draft'))) === null)
  await page.click('#return-to-login-btn')
  await page.waitForURL(/login\.html/)
  check('"Return to login" goes to the login page and forgets the ID', (await page.evaluate(() => sessionStorage.getItem('univa-demo-org-id'))) === null)

  // ------------------------------------------------------------- passwords
  section('Password rules')
  await open('login.html')
  const rules = await page.evaluate(() => ({
    none: UI.PASSWORD_REQUIREMENTS.map((r) => r.test('')),
    all: UI.allPasswordRequirementsMet('Abcdef1!'),
    short: UI.allPasswordRequirementsMet('Ab1!'),
    noUpper: UI.allPasswordRequirementsMet('abcdef1!'),
    noLower: UI.allPasswordRequirementsMet('ABCDEF1!'),
    noDigit: UI.allPasswordRequirementsMet('Abcdefg!'),
    noSpecial: UI.allPasswordRequirementsMet('Abcdefg1'),
    spaceIsSpecial: UI.allPasswordRequirementsMet('Abcdef 1'),
    long: UI.allPasswordRequirementsMet('Correct-Horse-Battery-9'),
    html: UI.passwordRequirementsHtml('abc').split('requirement-icon').length - 1,
  }))
  check('an empty password meets no rule', rules.none.every((r) => r === false), rules.none)
  check('a password with all five is accepted, and a long one too', rules.all && rules.long, rules)
  check('missing any one of length, upper, lower, number or special is not accepted', !rules.short && !rules.noUpper && !rules.noLower && !rules.noDigit && !rules.noSpecial, rules)
  check('a space counts as the special character', rules.spaceIsSpecial, rules)
  check('the list has one line for each of the five rules', rules.html === 5, rules.html)

  section('Forgot password')
  await open('forgot-password.html')
  check('"Send reset link" is off until both fields are filled', await disabled('#send-reset-btn'))
  await page.fill('#organizationId', 'NORTHBRIDGE')
  check('and still off with only one', await disabled('#send-reset-btn'))
  await page.fill('#email', 'dana.whitfield@northbridge.com')
  check('on with both', !(await disabled('#send-reset-btn')))
  await page.click('#send-reset-btn')
  await page.waitForSelector('#sent-view')
  check('sending shows the "sent" view with the address and hides the form', (await page.textContent('#sent-email-display')) === 'dana.whitfield@northbridge.com' && !(await visible('#request-view')))
  await page.click('#retry-button')
  await page.waitForSelector('#request-view')
  check('"try again" brings the form back', (await visible('#request-view')) && !(await visible('#sent-view')))

  section('Reset password')
  await open('reset-password.html')
  check('the first step asks for the organization ID and email', (await visible('#verify-form')) && !(await visible('#password-form')) && (await disabled('#verify-btn')))
  await page.fill('#organizationId', 'NORTHBRIDGE')
  await page.fill('#email', 'dana.whitfield@northbridge.com')
  await page.click('#verify-btn')
  await page.waitForSelector('#password-form')
  check('after that, the new-password step shows them read-only', (await page.inputValue('#org-id-display')) === 'NORTHBRIDGE' && (await page.inputValue('#email-display')) === 'dana.whitfield@northbridge.com' && (await page.locator('#org-id-display').isDisabled()))
  check('"Reset password" is off at first', await disabled('#reset-password-btn'))
  await page.fill('#newPassword', 'Abcdef1!')
  await page.fill('#confirmPassword', 'Abcdef1?')
  check('and off while the two differ', await disabled('#reset-password-btn'))
  await page.fill('#confirmPassword', 'Abcdef1!')
  check('on when they match and meet the rules', !(await disabled('#reset-password-btn')))
  await page.click('#reset-password-btn')
  await page.waitForSelector('#success-view')
  check('then it says the password was reset', (await visible('#success-view')) && !(await visible('#form-view')))

  section('Create password')
  await open('create-password.html')
  await page.fill('#organizationId', 'orgwvlyiy')
  await page.click('#verify-btn')
  await page.waitForSelector('#password-form')
  check('a known organization ID (any case) shows its name', (await page.textContent('#verified-org-name')) === 'Innospace')
  await open('create-password.html')
  await page.fill('#organizationId', 'SOMETHING')
  await page.click('#verify-btn')
  await page.waitForSelector('#password-form')
  check('any other ID gets a general name', (await page.textContent('#verified-org-name')) === 'Your Organization')
  await page.fill('#newPassword', 'Abcdef1!')
  await page.fill('#confirmPassword', 'Abcdef1!')
  await page.click('#create-password-btn')
  await page.waitForSelector('#success-view')
  check('a good password creates it', await visible('#success-view'))

  // ------------------------------------------------- system administrator
  section('The system administrator')
  await open('sysadmin-login.html')
  check('"Sign in as administrator" is off until both fields are filled', await disabled('#sysadmin-submit'))
  await page.fill('#sysadmin-username', 'root')
  check('and off with only the username', await disabled('#sysadmin-submit'))
  await page.fill('#sysadmin-password', 'secret')
  check('on with both', !(await disabled('#sysadmin-submit')))
  await page.click('#sysadmin-submit')
  await page.waitForURL(/admin-dashboard\.html/)
  check('it goes to the administrator dashboard', /admin-dashboard\.html/.test(page.url()))
  const adminLinks = await page.$$eval('.sidebar .sidebar-link', (els) => els.map((el) => el.textContent.trim()))
  check('which has its own menu: dashboard, tenants, tenant profiles, sign out', same(adminLinks, ['Dashboard', 'Tenants', 'Tenant profiles', 'Sign out']), adminLinks)
  check('the "Sign out" link goes to the administrator\'s sign-in page', (await page.getAttribute('.sidebar a[title="Sign out"]', 'href')) === 'sysadmin-login.html')

  section('Waiting for approval')
  await open('awaiting-approval.html')
  const before = await page.evaluate(() => ({ disabled: document.getElementById('get-approval-btn').disabled, active: document.getElementById('step2-circle').classList.contains('active') }))
  await page.click('#get-approval-btn')
  const after = await page.evaluate(() => ({ disabled: document.getElementById('get-approval-btn').disabled, active: document.getElementById('step2-circle').classList.contains('active'), label: document.getElementById('step2-label').classList.contains('active') }))
  check('"Get approval" moves the second step along and can only be pressed once', before.disabled === false && before.active === false && after.disabled === true && after.active === true && after.label === true, { before, after })

  check('no JavaScript errors on the way', errors.length === 0, errors.slice(0, 5))
})
