const express = require('express');
const path = require('path');
const router = express.Router();
const { connectToDatabase, models, isConnected } = require('../db-config');

// Middleware zur Datenbankverbindung mit Cache und Fehlerbehandlung
async function initDb(req, res, next) {
  try {
    console.log('API: Datenbankverbindung prüfen...');
    if (!isConnected()) {
      console.log('API: Keine aktive Verbindung, stelle neue her...');
      const db = await connectToDatabase();
      if (!db) {
        throw new Error('Datenbankverbindung konnte nicht hergestellt werden');
      }
    }
    next();
  } catch (error) {
    console.error('API Middleware: Datenbankfehler:', error.message);
    return res.status(500).json({ 
      error: 'Datenbankverbindungsfehler', 
      details: error.message,
      path: req.path,
      method: req.method 
    });
  }
}

// Debug-Middleware, um Anfragen zu loggen
router.use((req, res, next) => {
  console.log(`API-Anfrage: ${req.method} ${req.path}`);
  next();
});

// CORS-Header für alle API-Routen
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
  
  // Preflight OPTIONS-Anfragen direkt beantworten
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
  res.status(200).json({ 
    status: 'OK', 
    timestamp: Date.now(),
    dbConnected: isConnected()
  });
});

// Ab hier Middleware für Datenbankverbindung für alle folgenden Routen
router.use(initDb);

// GET all requests
router.get('/requests', async (req, res) => {
  try {
    console.log('API: Hole alle Requests...');
    const requests = await models.Request.find().sort({ timestamp: -1 });
    console.log(`API: ${requests.length} Requests gefunden`);
    res.json(requests);
  } catch (error) {
    console.error('API Fehler - GET requests:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Add a new request
router.post('/requests', async (req, res) => {
  try {
    console.log('API: Neuer Request wird erstellt:', req.body);
    const request = req.body;
    const currentDate = new Date();
    request.timestamp = currentDate.getTime();

    // Speichern des Requests in MongoDB
    const newRequest = new models.Request(request);
    await newRequest.save();
    console.log('API: Request gespeichert mit ID:', newRequest.id);
    
    // Falls io vorhanden ist, Event auslösen
    const io = req.app.get('io');
    if (io) {
      io.emit('requestAdded', newRequest);
      console.log('API: Socket.io Event requestAdded ausgelöst');
    }
    
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('API Fehler - POST request:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Delete a request
router.delete('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Lösche Request mit ID:', id);
    const result = await models.Request.deleteOne({ id });
    
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

// GET all anti-tamper logs
router.get('/anti-tamper-logs', async (req, res) => {
  try {
    console.log('API: Hole alle Anti-Tamper-Logs...');
    const logs = await models.AntiTamperLog.find().sort({ timestamp: -1 });
    res.json(logs);
  } catch (error) {
    console.error('API Fehler - GET anti-tamper-logs:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Clear all anti-tamper logs
router.delete('/anti-tamper-logs', async (req, res) => {
  try {
    console.log('API: Lösche alle Anti-Tamper-Logs...');
    const result = await models.AntiTamperLog.deleteMany({});
    
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

// GET all album items
router.get('/album-items', async (req, res) => {
  try {
    console.log('API: Hole alle Album-Items...');
    const albumItems = await models.AlbumItem.find().sort({ timestamp: -1 });
    console.log(`API: ${albumItems.length} Album-Items gefunden`);
    res.json(albumItems);
  } catch (error) {
    console.error('API Fehler - GET album-items:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
  }
});

// Add a new album item
router.post('/album-items', async (req, res) => {
  try {
    console.log('API: Neues Album-Item wird erstellt:', req.body);
    const albumItem = req.body;
    albumItem.timestamp = Date.now();
    
    // Speichern des Album-Items in MongoDB
    const newAlbumItem = new models.AlbumItem(albumItem);
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
router.put('/album-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Aktualisiere Album-Item mit ID:', id);
    const albumItem = req.body;
    albumItem.timestamp = Date.now();
    
    // Aktualisieren des Album-Items in MongoDB
    const result = await models.AlbumItem.updateOne({ id }, albumItem);
    
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
router.delete('/album-items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('API: Lösche Album-Item mit ID:', id);
    const result = await models.AlbumItem.deleteOne({ id });
    
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

// Fallback für nicht existierende API-Routen
router.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'API-Endpunkt nicht gefunden',
    path: req.baseUrl + req.path,
    method: req.method
  });
});

// Exportiere den Router
module.exports = router; 