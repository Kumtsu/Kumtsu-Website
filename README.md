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
