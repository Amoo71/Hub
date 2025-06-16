const express = require('express');
const http = require('http');
const path = require('path');
const bodyParser = require('body-parser');
const socketIo = require('socket.io');
const { connectToDatabase } = require('./db-config');
const apiRoutes = require('./api/index');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());

// Verwende die API-Routen unter /api
app.use('/api', apiRoutes);

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

// Weitergabe der Socket.io-Instanz an den Rest der Anwendung
app.set('io', io);

// Hauptrouten für HTML-Seiten
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Datenbankinitalisierung
connectToDatabase()
    .then(() => console.log('MongoDB verbunden - Server bereit'))
    .catch(err => console.error('DB-Verbindungsfehler:', err));

// Starte den Server, wenn wir nicht in Vercel's Serverless-Umgebung sind
if (process.env.NODE_ENV !== 'production') {
    server.listen(PORT, () => {
        console.log(`Server läuft auf Port ${PORT}`);
    });
}

// Exportiere für Vercel
module.exports = app; 