const express = require('express');
const path = require('path');

const app = express();

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '..')));

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

// Debug endpoint
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

// Export the Express app as a serverless function
module.exports = app;
