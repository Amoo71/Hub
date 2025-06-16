const express = require('express');
const path = require('path');
const router = express.Router();
const dbConfig = require('../db-config');

// Debug-Ausgabe zum Start
console.log('API-Router wird initialisiert');
console.log('Mongoose-Modelle geladen:', Object.keys(dbConfig.models));

// Middleware zur Datenbankverbindung mit Fehlerbehandlung
async function connectDb(req, res, next) {
  console.log(`[API ${req.method}] ${req.path} - Verbindung herstellen...`);
  try {
    // Verbindung herstellen (oder existierende verwenden)
    const { instance, models, error } = await dbConfig.connectToDatabase();
    
    if (error) {
      console.error(`[API] DB-Verbindungsfehler: ${error}`);
      return res.status(500).json({
        error: 'Datenbankverbindungsfehler',
        details: error
      });
    }
    
    // Models an Request anhängen
    req.models = models || dbConfig.models;
    next();
  } catch (error) {
    console.error(`[API] Unbehandelte Exception: ${error.message}`);
    res.status(500).json({
      error: 'Interner Serverfehler',
      details: error.message,
      path: req.path
    });
  }
}

// Debug-Middleware für alle Anfragen
router.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path} - Anfrage empfangen`);
  next();
});

// CORS-Header für alle API-Routen
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Fehlerbehandlung bei fehlenden Headern oder Body
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.body) {
      return res.status(400).json({ error: 'Request body fehlt' });
    }
  }
  next();
});

// Gesundheitscheck ohne Datenbankverbindung
router.get('/health', (req, res) => {
  console.log('[API] Gesundheitscheck');
  res.status(200).json({
    status: 'API aktiv',
    timestamp: Date.now(),
    dbConnected: dbConfig.isConnected(),
    models: Object.keys(dbConfig.models)
  });
});

// GET all requests
router.get('/requests', connectDb, async (req, res) => {
  try {
    console.log('[API] Abrufen aller Anfragen');
    const requests = await req.models.Request.find().sort({ timestamp: -1 }).lean().exec();
    console.log(`[API] ${requests.length} Anfragen gefunden`);
    return res.json(requests);
  } catch (error) {
    console.error(`[API] Fehler beim Abrufen der Anfragen: ${error.message}`);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      details: error.message 
    });
  }
});

// GET all anti-tamper logs
router.get('/anti-tamper-logs', connectDb, async (req, res) => {
  try {
    console.log('[API] Abrufen aller Anti-Tamper-Logs');
    const logs = await req.models.AntiTamperLog.find().sort({ timestamp: -1 }).lean().exec();
    console.log(`[API] ${logs.length} Logs gefunden`);
    return res.json(logs);
  } catch (error) {
    console.error(`[API] Fehler beim Abrufen der Anti-Tamper-Logs: ${error.message}`);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      details: error.message 
    });
  }
});

// GET all album items
router.get('/album-items', connectDb, async (req, res) => {
  try {
    console.log('[API] Abrufen aller Album-Items');
    const items = await req.models.AlbumItem.find().sort({ timestamp: -1 }).lean().exec();
    console.log(`[API] ${items.length} Album-Items gefunden`);
    return res.json(items);
  } catch (error) {
    console.error(`[API] Fehler beim Abrufen der Album-Items: ${error.message}`);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      details: error.message 
    });
  }
});

// Add a new request
router.post('/requests', connectDb, async (req, res) => {
  try {
    console.log('[API] Neue Anfrage hinzufügen:', req.body);
    const request = req.body;
    request.timestamp = Date.now();
    
    const newRequest = new req.models.Request(request);
    const saved = await newRequest.save();
    
    console.log('[API] Anfrage gespeichert:', saved.id);
    return res.status(201).json(saved);
  } catch (error) {
    console.error(`[API] Fehler beim Hinzufügen einer Anfrage: ${error.message}`);
    return res.status(500).json({ 
      error: 'Datenbankfehler', 
      details: error.message 
    });
  }
});

// Delete a request
router.delete('/requests/:id', connectDb, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Lösche Request mit ID:', id);
    const result = await req.models.Request.deleteOne({ id });
    
    // Falls io vorhanden ist, Event auslösen
    const io = req.app.get('io');
    if (io) {
      io.emit('requestDeleted', id);
      console.log('API: Socket.io Event requestDeleted ausgelöst');
    }
    
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('API Fehler - DELETE request:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Clear all anti-tamper logs
router.delete('/anti-tamper-logs', connectDb, async (req, res) => {
  try {
    console.log('API: Lösche alle Anti-Tamper-Logs...');
    const result = await req.models.AntiTamperLog.deleteMany({});
    
    // Falls io vorhanden ist, Event auslösen
    const io = req.app.get('io');
    if (io) {
      io.emit('antiTamperLogsCleared');
    }
    
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('API Fehler - DELETE anti-tamper-logs:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Add a new album item
router.post('/album-items', connectDb, async (req, res) => {
  try {
    console.log('API: Neues Album-Item wird erstellt:', req.body);
    const albumItem = req.body;
    albumItem.timestamp = Date.now();
    
    // Speichern des Album-Items in MongoDB
    const newAlbumItem = new req.models.AlbumItem(albumItem);
    await newAlbumItem.save();
    console.log('API: Album-Item gespeichert mit ID:', newAlbumItem.id);
    
    // Falls io vorhanden ist, Event auslösen
    const io = req.app.get('io');
    if (io) {
      io.emit('albumItemsChanged');
    }
    
    res.status(201).json(newAlbumItem);
  } catch (error) {
    console.error('API Fehler - POST album-item:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Update an album item
router.put('/album-items/:id', connectDb, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Aktualisiere Album-Item mit ID:', id);
    const albumItem = req.body;
    albumItem.timestamp = Date.now();
    
    // Aktualisieren des Album-Items in MongoDB
    const result = await req.models.AlbumItem.updateOne({ id }, albumItem);
    
    // Falls io vorhanden ist, Event auslösen
    const io = req.app.get('io');
    if (io) {
      io.emit('albumItemsChanged');
    }
    
    res.json({ 
      success: true, 
      modified: result.modifiedCount,
      item: albumItem 
    });
  } catch (error) {
    console.error('API Fehler - PUT album-item:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Delete an album item
router.delete('/album-items/:id', connectDb, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Lösche Album-Item mit ID:', id);
    const result = await req.models.AlbumItem.deleteOne({ id });
    
    // Falls io vorhanden ist, Event auslösen
    const io = req.app.get('io');
    if (io) {
      io.emit('albumItemsChanged');
    }
    
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('API Fehler - DELETE album-item:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// 404-Handler für nicht existierende Routen
router.use((req, res, next) => {
  res.status(404).json({
    error: 'API-Endpunkt nicht gefunden',
    path: req.originalUrl,
    availableEndpoints: [
      '/api/requests',
      '/api/anti-tamper-logs',
      '/api/album-items'
    ]
  });
});

// Globaler Error-Handler
router.use((err, req, res, next) => {
  console.error('[API] Unbehandelte Exception:', err);
  res.status(500).json({
    error: 'Interner Serverfehler',
    message: err.message
  });
});

// Exportiere den Router
module.exports = router; 