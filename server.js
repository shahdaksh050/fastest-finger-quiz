const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname);

// Serve static files
app.use(express.static(PUBLIC_DIR));

// Endpoint to serve env variables to the client as a JS file
app.get('/env.js', (req, res) => {
  const clientEnv = {
    APP_ID: process.env.APP_ID || 'fastest-finger-quiz',
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || 'demo-api-key',
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'demo-project',
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || '1:123456789:web:abcdef123456789',
    ADMIN_UID: process.env.ADMIN_UID || ''
  };

  const js = `window.__env = ${JSON.stringify(clientEnv)};`;
  res.setHeader('Content-Type', 'application/javascript');
  res.send(js);
});

// Debug endpoint - returns the same client env and some process info
app.get('/debug', (req, res) => {
  const clientEnv = {
    APP_ID: process.env.APP_ID || 'fastest-finger-quiz',
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || 'demo-api-key',
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'demo-project',
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || 'demo-project.appspot.com',
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || '1:123456789:web:abcdef123456789',
    ADMIN_UID: process.env.ADMIN_UID || ''
  };

  res.json({
    ok: true,
    pid: process.pid,
    uptime: process.uptime(),
    env: clientEnv
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
