const express = require('express');
const bodyParser = require('body-parser');
const apiRoutes = require('./api/index');

// Express-App erstellen
const app = express();

// Für Vercel Logs
console.log('Serverless function startup. Node version:', process.version);

// Middleware
app.use(express.json());
app.use(bodyParser.json());

// Debug-Logging für Anfragen
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// CORS-Header für alle Anfragen setzen
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
  
  // Preflight-Anfragen direkt beantworten
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// API-Routen
app.use('/api', apiRoutes);

// Socket.io Endpunkt für Server-Sent Events Simulation
app.post('/socket-io-emulate', (req, res) => {
  // Hier empfangen wir eine Anfrage, die ein Socket.io Ereignis auslöst
  const { event, data } = req.body;
  console.log(`Socket.IO Event emuliert: ${event}`, data);
  
  // Erfolg zurückgeben
  res.json({ success: true, event, received: true });
});

// Gesundheitscheck
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: Date.now()
  });
});

// Error-Handler für Express
app.use((err, req, res, next) => {
  console.error('Express Error:', err);
  res.status(500).json({
    error: 'Interner Serverfehler',
    message: err.message,
    path: req.path
  });
});

// 404-Handler für unbekannte API-Routen
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'API-Endpunkt nicht gefunden',
      path: req.path
    });
  } else {
    // Für alle anderen Routen - lassen wir Vercel die statischen Dateien servieren
    res.status(404).send('Not found');
  }
});

// Für Vercel Serverless-Funktionen exportieren wir die Express-App
module.exports = app; 