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
- `/internal/forgot-password.html` — sends a Supabase recovery email
- `/internal/reset-password.html` — securely sets a new password from the recovery link
- `/internal/profile.html` — protected employee profile and private avatar upload

Configure these additional Vercel variables:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
PUBLIC_SITE_URL=https://www.kumtsu.com
```

Setup:

1. Create a Supabase project and run `database/internal-members.sql` in its SQL Editor.
2. In Supabase Authentication URL Configuration, set the Site URL to `https://www.kumtsu.com` and allow `https://www.kumtsu.com/internal/reset-password.html` as a Redirect URL.
3. Configure custom SMTP for production recovery emails.
4. Add the three variables above to Vercel for Production and Preview, then redeploy.
5. Create each approved employee in Supabase Authentication and add a matching `public.internal_profiles` row using the Auth user UUID (see the SQL example).

The publishable key is safe in browser requests only because database and Storage RLS are enabled. Never expose `SUPABASE_SERVICE_ROLE_KEY`. Supabase Auth hashes and salts passwords. Avatars are private, limited to JPG/PNG/WEBP and 5 MB, and each user can access only their own folder.
