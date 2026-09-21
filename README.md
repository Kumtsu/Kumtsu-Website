# Kumtsu Website — Static Export

Static HTML/CSS/JavaScript export of the public Kumtsu company website.

## Files

- `index.html` — page structure and content
- `styles.css` — responsive design and branding
- `script.js` — sliders, menus, language switching, and interactions
- `assets/` — images, logos, icons, review media, and map data

## Local preview

Open `index.html` directly, or serve this directory with any static web server.

## Deployment

This folder can be deployed to GitHub Pages or any static hosting provider.

The “เฉพาะภายในองค์กร” link opens `/internal/`. Access requests are submitted to the Vercel Function at `/api/internal-register` and delivered through Resend.

## Internal access email setup

Configure these Vercel Production environment variables and redeploy:

- `RESEND_API_KEY` — a current Resend API key; keep it server-side only.
- `APPROVAL_EMAIL_FROM` — verified sender, for example `Kumtsu Admin <account.it@kumtsu.com>`.
- `INTERNAL_EMAIL_TO` — notification recipient; defaults to `account.it@kumtsu.com`.

The `kumtsu.com` sending domain must be verified in Resend (SPF and DKIM) before a custom sender can be used.

## Internal member and profile system

Pages:

- `/internal/login.html` — employee login using a `@kumtsu.com` email
- `/internal/dashboard.html` — protected Internal Workspace with approved dashboard links
- `/internal/forgot-password.html` — sends a Supabase recovery email
- `/internal/reset-password.html` — securely sets a new password from the recovery link
- `/internal/profile.html` — protected employee profile and private avatar upload
- `/internal/admin/` — protected member-management dashboard (restricted to `pachara.r@kumtsu.com`)

Successful login opens `/internal/dashboard.html`. Its system-link data is not embedded in public HTML: `/api/internal-dashboard` returns it only after verifying the Supabase token and an Active profile. Approved external systems open in new tabs and unfinished systems remain disabled. Public registration/login pages and the protected workspace display the internal-data security warning.

Every internal HTML entry point declares `<base href="/internal/">`. This keeps CSS, JavaScript, images, navigation, and authentication redirects under the `/internal/` namespace even when visitors enter the route without a trailing slash.

Configure these additional Vercel variables:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
PUBLIC_SITE_URL=https://www.kumtsu.com
```

Setup:

1. Create a Supabase project and run `database/internal-members.sql`, followed by `database/admin-members.sql`, in its SQL Editor.
2. In Supabase Authentication URL Configuration, set the Site URL to `https://www.kumtsu.com` and allow `https://www.kumtsu.com/internal/reset-password.html` as a Redirect URL.
3. Configure custom SMTP for production recovery emails.
4. Add the three variables above to Vercel for Production and Preview, then redeploy.
5. Create or invite `pachara.r@kumtsu.com` in Supabase Authentication and insert a matching `internal_profiles` row with `status = 'active'`. This exact email is the only account accepted by the Admin API.

## Admin approval workflow

- Registration creates an `internal_member_requests` row with `pending` status and emails both `pachara.r@kumtsu.com` and `account.it@kumtsu.com`.
- Admin endpoints verify the Supabase access token server-side and compare the authenticated email exactly with `pachara.r@kumtsu.com`.
- Approving a request creates the Supabase Auth user, creates an Active profile, and sends the employee a secure password-setup link.
- Pending or Rejected accounts cannot sign in. Profile APIs also re-check Active status.
- Admin supports search, status filters, member creation/editing, profile-photo replacement, approval/rejection, and confirmed deletion.

Required server-only variables for Admin and email:

```text
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
RESEND_API_KEY=YOUR_RESEND_API_KEY
APPROVAL_EMAIL_FROM=Kumtsu Admin <account.it@kumtsu.com>
INTERNAL_EMAIL_TO=pachara.r@kumtsu.com,account.it@kumtsu.com
```

The publishable key is safe in browser requests only because database and Storage RLS are enabled. `SUPABASE_SERVICE_ROLE_KEY` must exist only in Vercel server environment variables and must never be placed in HTML or client JavaScript. Supabase Auth hashes and salts passwords. Avatars are private, limited to JPG/PNG/WEBP and 5 MB, and each user can access only their own folder.
