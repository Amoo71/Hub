const express = require('express');
const http = require('http');
const path = require('path');
const bodyParser = require('body-parser');
const apiRoutes = require('./api/index');

// Express-App erstellen
const app = express();

// In einer Serverless-Umgebung wie Vercel funktioniert Socket.io nicht wie gewohnt
// Stattdessen verwenden wir eine einfachere Konfiguration
// Die Socket.io-Funktionalität wird auf der Client-Seite simuliert

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(bodyParser.json());

// Debug-Logging für Anfragen
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
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

// Error-Handler für Express
app.use((err, req, res, next) => {
  console.error('Express Error:', err);
  res.status(500).json({
    error: 'Interner Serverfehler',
    message: err.message,
    path: req.path
  });
});

// API-Routen
app.use('/api', apiRoutes);

// Socket.io Endpunkt für Server-Sent Events Simulation
app.post('/socket-io-emulate', (req, res) => {
  // Hier empfangen wir eine Anfrage, die ein Socket.io Ereignis auslöst
  // Da wir in einer Serverless-Umgebung sind, verwenden wir diesen Endpunkt,
  // um die Ereignisse zu verarbeiten und zu loggen
  const { event, data } = req.body;
  console.log(`Socket.IO Event emuliert: ${event}`, data);
  
  // Erfolg zurückgeben
  res.json({ success: true, event, received: true });
});

// Root-Route für Statusinformationen
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Login-Route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// db.js-Route für Frontend
app.get('/db.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'db.js'));
});

// Catch-all für statische Dateien
app.get('*', (req, res, next) => {
  try {
    const filePath = path.join(__dirname, req.path);
    // Prüfen, ob die Datei existiert
    if (require('fs').existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// 404-Handler für nicht gefundene Routen
app.use((req, res) => {
  res.status(404).json({
    error: 'Route nicht gefunden',
    path: req.path,
    method: req.method
  });
});

// Server starten, wenn wir nicht in Vercel's Serverless-Umgebung sind
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  const server = http.createServer(app);
  
  // Hier können wir in einer nicht-serverless Umgebung Socket.io verwenden
  const socketIo = require('socket.io');
  const io = socketIo(server);
  
  io.on('connection', (socket) => {
    console.log('Socket.io Verbindung hergestellt:', socket.id);
    
    // Hier können die Socket-Events wie gewohnt implementiert werden
  });
  
  server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
  });
} else {
  console.log('Server läuft im Serverless-Modus auf Vercel');
}

// Für Vercel Serverless-Funktionen exportieren wir die Express-App
module.exports = app; 