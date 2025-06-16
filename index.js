const express = require('express');
const bodyParser = require('body-parser');
const apiRoutes = require('./api/index');

// Express-App erstellen
const app = express();

// Startup-Informationen für Fehlersuche
console.log('=== TRNT App Server Startup ===');
console.log('Node Version:', process.version);
console.log('Umgebung:', process.env.NODE_ENV || 'development');
console.log('MongoDB URI gesetzt:', !!process.env.MONGODB_URI);
console.log('==========================');

// Middleware für Request-Verarbeitung
app.use(express.json());
app.use(bodyParser.json());

// Debug-Middleware für alle Anfragen
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

// CORS-Header für alle Anfragen
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token, Authorization');
  
  // Preflight-Anfragen sofort beantworten
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// API-Router einbinden
app.use('/api', apiRoutes);

// Socket.io Simulation Endpunkt
app.post('/socket-io-emulate', (req, res) => {
  try {
    const { event, data } = req.body;
    console.log(`Socket-Emulation: Event '${event}' empfangen`);
    res.json({ success: true, event });
  } catch (error) {
    console.error('Socket-Emulation Fehler:', error);
    res.status(500).json({ error: 'Socket-Emulation fehlgeschlagen' });
  }
});

// Haupt-Statusendpunkt
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    api: '/api/health für API-Status',
    timestamp: Date.now()
  });
});

// Fehlerbehandlung für nicht gefundene Routen
app.use((req, res, next) => {
  // Nur API-Anfragen behandeln
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'Route nicht gefunden',
      path: req.path
    });
  } else {
    // Bei anderen Anfragen - einfach 404 zurückgeben, damit Vercel die statischen Dateien servieren kann
    res.status(404).send('Not found');
  }
});

// Globaler Fehlerhandler
app.use((err, req, res, next) => {
  console.error('Unbehandelter Fehler:', err);
  res.status(500).json({
    error: 'Interner Serverfehler',
    message: process.env.NODE_ENV === 'production' ? 'Ein Fehler ist aufgetreten' : err.message
  });
});

// Serverless-Export
module.exports = app; 