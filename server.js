const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
// MongoDB statt SQLite
const { connectToDatabase, models } = require('./db-config');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Middleware to check authentication for admin routes
const checkAuth = (req, res, next) => {
    try {
        const sessionToken = req.headers['x-session-token'];
        console.log('Auth check');
        
        if (!sessionToken) {
            console.log('No session');
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Check if the token matches any of our activeSessions
        let isAdmin = false;
        let sessionFound = false;
        
        // Log the current state of active sessions for debugging
        console.log('Sessions active');
        
        // The sessionToken is actually the securityId in our implementation
        const session = activeSessions.get(sessionToken);
        if (session) {
            sessionFound = true;
            isAdmin = session.designType === 'owner' || session.idName === 'Amo';
            console.log('Session valid');
        }
        
        if (!sessionFound) {
            console.log('Invalid session');
            return res.status(403).json({ error: 'Invalid session' });
        }
        
        if (!isAdmin) {
            console.log('Not admin');
            return res.status(403).json({ error: 'Admin privileges required' });
        }
        
        next();
    } catch (error) {
        console.error('Auth error');
        return res.status(500).json({ error: 'Internal server error during authentication' });
    }
};

// Initialisierung der Datenbankverbindung und Anlegen von Beispieldaten, wenn nötig
async function initializeDb() {
    try {
        await connectToDatabase();
        console.log('MongoDB-Verbindung initialisiert');
        
        // Prüfen, ob Beispiel-Album existiert
        const albumCount = await models.AlbumItem.countDocuments();
        console.log(`Aktuell vorhandene Albums: ${albumCount}`);
        
        if (albumCount === 0) {
            console.log('Füge Beispiel-Album hinzu');
            const now = Date.now();
            const sampleAlbum = new models.AlbumItem({
                id: now.toString(),
                name: 'Sample Album',
                imageUrl: '',
                acc: 'SAMPLE-ACC-001',
                pw: 'SAMPLE-PW-001',
                timestamp: now
            });
            await sampleAlbum.save();
        }
        
        // Prüfen, ob initialer Request existiert
        const requestCount = await models.Request.countDocuments();
        if (requestCount === 0) {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            const initialAmoRequest = new models.Request({
                id: Date.now().toString(),
                username: 'Amo',
                text: 'Amo\'s initial fixed request.',
                designType: 'owner',
                idName: 'Amo',
                time: time,
                timestamp: now.getTime()
            });
            await initialAmoRequest.save();
        }
        
        console.log('Datenbank erfolgreich initialisiert');
    } catch (error) {
        console.error('Fehler bei der Datenbankinitialisierung:', error);
    }
}

// Initialisierung ausführen
initializeDb();

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Neue Socket-Verbindung:', socket.id);
    
    // Client registriert seine Session
    socket.on('register_session', (userInfo) => {
        if (userInfo && userInfo.securityId) {
            console.log(`Session registriert für ${userInfo.idName} (${userInfo.securityId})`);
            
            // Speichere die Session
            activeSessions.set(userInfo.securityId, {
                socketId: socket.id,
                username: userInfo.username || userInfo.securityId,
                idName: userInfo.idName || 'Unbekannt',
                designType: userInfo.designType || 'standard'
            });
            
            // Speichere Mapping für einfacheres Aufräumen
            socketIdToSecurityId[socket.id] = userInfo.securityId;
        }
    });

    // Verbindung getrennt
    socket.on('disconnect', () => {
        console.log(`Socket getrennt: ${socket.id}`);
        const securityId = socketIdToSecurityId[socket.id];
        
        if (securityId) {
            console.log(`Entferne Session für securityId: ${securityId}`);
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
        }
    });
});

// API-Routen

// GET all requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await models.Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Fehler beim Abrufen der Anfragen:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Add a new request
app.post('/api/requests', async (req, res) => {
    try {
        const request = req.body;
        const currentDate = new Date();
        request.timestamp = currentDate.getTime();

        // Speichern des Requests in MongoDB
        const newRequest = new models.Request(request);
        await newRequest.save();
        
        // Echtzeit-Update an alle verbundenen Clients
        io.emit('requestAdded', newRequest);
        res.json(newRequest);
    } catch (error) {
        console.error('Fehler beim Hinzufügen der Anfrage:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Delete a request
app.delete('/api/requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await models.Request.deleteOne({ id });
        
        // Echtzeit-Update an alle verbundenen Clients
        io.emit('requestDeleted', id);
        res.json({ success: true });
    } catch (error) {
        console.error('Fehler beim Löschen der Anfrage:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// GET all anti-tamper logs
app.get('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        const logs = await models.AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Fehler beim Abrufen der Anti-Tamper-Logs:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Clear all anti-tamper logs
app.delete('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        await models.AntiTamperLog.deleteMany({});
        
        // Echtzeit-Update an alle verbundenen Clients
        io.emit('antiTamperLogsCleared');
        res.json({ success: true });
    } catch (error) {
        console.error('Fehler beim Löschen der Anti-Tamper-Logs:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Delete a specific anti-tamper log
app.delete('/api/anti-tamper-logs/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await models.AntiTamperLog.deleteOne({ id });
        res.json({ success: true });
    } catch (error) {
        console.error('Fehler beim Löschen des Anti-Tamper-Logs:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// GET all album items
app.get('/api/album-items', async (req, res) => {
    try {
        const albumItems = await models.AlbumItem.find().sort({ timestamp: -1 });
        res.json(albumItems);
    } catch (error) {
        console.error('Fehler beim Abrufen der Album-Items:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Add a new album item
app.post('/api/album-items', checkAuth, async (req, res) => {
    try {
        const albumItem = req.body;
        albumItem.timestamp = Date.now();
        
        // Speichern des Album-Items in MongoDB
        const newAlbumItem = new models.AlbumItem(albumItem);
        await newAlbumItem.save();
        
        // Echtzeit-Update an alle verbundenen Clients
        broadcastAlbumUpdate();
        res.json(newAlbumItem);
    } catch (error) {
        console.error('Fehler beim Hinzufügen des Album-Items:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Update an album item
app.put('/api/album-items/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const albumItem = req.body;
        albumItem.timestamp = Date.now();
        
        // Aktualisieren des Album-Items in MongoDB
        await models.AlbumItem.updateOne({ id }, albumItem);
        
        // Echtzeit-Update an alle verbundenen Clients
        broadcastAlbumUpdate();
        res.json(albumItem);
    } catch (error) {
        console.error('Fehler beim Aktualisieren des Album-Items:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Delete an album item
app.delete('/api/album-items/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await models.AlbumItem.deleteOne({ id });
        
        // Echtzeit-Update an alle verbundenen Clients
        broadcastAlbumUpdate();
        res.json({ success: true });
    } catch (error) {
        console.error('Fehler beim Löschen des Album-Items:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// Function to broadcast album updates to all connected clients
function broadcastAlbumUpdate() {
    io.emit('albumItemsChanged');
}

// Start the server
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
}); 