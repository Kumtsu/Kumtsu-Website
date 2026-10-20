# Kumtsu ALL preview

Start URL: `/internal/dashboard.html`. App identity and worker scope: `/internal/`.
Existing login and server authorization remain in use. No database changes.

The worker stores only three logo files and a public offline notice. Internal HTML is network-only; API requests and other subresources pass through normally. This feature does not introduce background synchronization, polling, or push notifications.

Preview locally over localhost HTTP. Production requires HTTPS. A static preview can show the login/install UI, but authenticated API flows require the existing backend. Test installation with Safari on iPhone and Chrome on Android after an approved HTTPS deployment. Browser installation availability varies.

The source logo is currently 128px, resized for the required icon dimensions. A higher-resolution original can replace these assets later.

Install: iPhone Safari → Share → Add to Home Screen. Android Chrome → menu → Install app. Desktop Chrome/Edge → install action in the address bar or browser menu.

Before publishing, apply the scoped PWA changes to the current production branch and validate its current dashboard/login changes. This preview is isolated from unrelated work in the main checkout.
