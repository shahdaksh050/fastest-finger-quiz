# Fastest Finger First - Local Dev Server

This folder contains a small static React app (no build step) and a tiny Express server that injects environment variables into the client via `/env.js`.

How it works

- The server serves static files from the project root.
- It exposes `/env.js` which renders `window.__env` using values from your `.env` file.
- The client (index.html / app.js) reads `window.__env` at runtime.

Setup

1. Install dependencies:

```powershell
npm install
```

2. Copy `.env.example` to `.env` and fill in your Firebase config and `ADMIN_UID`.

3. Start the server:

```powershell
npm start
```

4. Open http://localhost:3000 in your browser.

Notes

- This is intended for local development only. Never commit real secrets to source control.
- For production, serve a built bundle and provide env variables using a safe mechanism (server-side rendering, CI injection, or a secrets manager).
