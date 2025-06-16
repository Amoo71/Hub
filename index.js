const express = require('express');
const bodyParser = require('body-parser');
const apiRoutes = require('./api/index');
const path = require('path');

// Express-App erstellen
const app = express();

// Startup-Informationen für Fehlersuche
console.log('=== TRNT App Server Startup ===');
console.log('Node Version:', process.version);
console.log('Umgebung:', process.env.NODE_ENV || 'development');
console.log('MongoDB URI gesetzt:', !!process.env.MONGODB_URI);
console.log('Vercel Environment:', !!process.env.VERCEL);
console.log('==========================');

// Middleware für Request-Verarbeitung
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

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
    timestamp: Date.now(),
    vercel: !!process.env.VERCEL
  });
});

// Index-Seite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Login-Seite
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Fehlerbehandlung für nicht gefundene Routen
app.use((req, res, next) => {
  console.log(`404 Nicht gefunden: ${req.originalUrl}`);
  
  // Bei API-Anfragen JSON zurückgeben
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: 'API-Route nicht gefunden',
      path: req.path
    });
  }
  
  // Bei anderen Anfragen versuchen, die Datei zu senden
  res.status(404).send('Datei nicht gefunden');
});

// Globaler Fehlerhandler
app.use((err, req, res, next) => {
  console.error('Unbehandelter Fehler:', err);
  res.status(500).json({
    error: 'Interner Serverfehler',
    message: process.env.NODE_ENV === 'production' ? 'Ein Fehler ist aufgetreten' : err.message
  });
});

// Nur lokalen Server starten, wenn nicht in Vercel-Umgebung
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
}

// Serverless-Export
module.exports = app; 