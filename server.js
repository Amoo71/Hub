const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
require('dotenv').config();

// Import MongoDB connection
const connectDB = require('./models/db');
const Request = require('./models/Request');
const AlbumItem = require('./models/AlbumItem');
const AntiTamperLog = require('./models/AntiTamperLog');

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

// Initialize database and add initial data if needed
async function initializeDb() {
    try {
        // Connect to MongoDB
        await connectDB();
        
        // Check if we have any requests
        const requestCount = await Request.countDocuments();
        
        // Add initial Amo request if collection is empty
        if (requestCount === 0) {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            
            await Request.create({
                id: Date.now().toString(),
                username: 'Amo',
                text: 'Amo\'s initial fixed request.',
                designType: 'owner',
                idName: 'Amo',
                time: time,
                timestamp: now.getTime()
            });
            
            console.log('Added initial request');
        }
        
        // Check if we have any album items
        const albumCount = await AlbumItem.countDocuments();
        
        // Add sample album if collection is empty
        if (albumCount === 0) {
            const now = Date.now();
            
            await AlbumItem.create({
                id: now.toString(),
                name: 'Sample Album',
                imageUrl: '',
                acc: 'SAMPLE-ACC-001',
                pw: 'SAMPLE-PW-001',
                timestamp: now
            });
            
            console.log('Added sample album');
        }
        
        console.log('Database initialized');
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

// Initialize database
initializeDb();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API routes for requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.post('/api/requests', async (req, res) => {
    try {
        const { id, username, text, designType, idName, time, timestamp } = req.body;
        
        const newRequest = await Request.create({
            id, 
            username, 
            text, 
            designType, 
            idName, 
            time, 
            timestamp
        });
        
        // Broadcast to all clients
        io.emit('newRequest', newRequest);
        
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

// API routes for album items
app.get('/api/albums', async (req, res) => {
    try {
        const albums = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albums);
    } catch (error) {
        console.error('Error fetching albums:', error);
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});

app.post('/api/albums', checkAuth, async (req, res) => {
    try {
        const { id, name, imageUrl, acc, pw, timestamp } = req.body;
        
        const newAlbum = await AlbumItem.create({
            id,
            name,
            imageUrl,
            acc,
            pw,
            timestamp
        });
        
        // Broadcast album update to all clients
        broadcastAlbumUpdate();
        
        res.status(201).json(newAlbum);
    } catch (error) {
        console.error('Error creating album:', error);
        res.status(500).json({ error: 'Failed to create album' });
    }
});

app.put('/api/albums/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, imageUrl, acc, pw } = req.body;
        
        const updatedAlbum = await AlbumItem.findOneAndUpdate(
            { id },
            { name, imageUrl, acc, pw },
            { new: true }
        );
        
        if (!updatedAlbum) {
            return res.status(404).json({ error: 'Album not found' });
        }
        
        // Broadcast album update to all clients
        broadcastAlbumUpdate();
        
        res.json(updatedAlbum);
    } catch (error) {
        console.error('Error updating album:', error);
        res.status(500).json({ error: 'Failed to update album' });
    }
});

app.delete('/api/albums/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const deletedAlbum = await AlbumItem.findOneAndDelete({ id });
        
        if (!deletedAlbum) {
            return res.status(404).json({ error: 'Album not found' });
        }
        
        // Broadcast album update to all clients
        broadcastAlbumUpdate();
        
        res.json({ message: 'Album deleted successfully' });
    } catch (error) {
        console.error('Error deleting album:', error);
        res.status(500).json({ error: 'Failed to delete album' });
    }
});

// API routes for anti-tamper logs
app.post('/api/logs', async (req, res) => {
    try {
        const { id, message, timestamp } = req.body;
        
        await AntiTamperLog.create({
            id,
            message,
            timestamp
        });
        
        res.status(201).json({ message: 'Log created successfully' });
    } catch (error) {
        console.error('Error creating log:', error);
        res.status(500).json({ error: 'Failed to create log' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Handle client registration
    socket.on('register', (data) => {
        const { securityId, username, idName, designType } = data;
        
        // Store the session data
        activeSessions.set(securityId, {
            socketId: socket.id,
            username,
            idName,
            designType
        });
        
        // Map socket ID to security ID for easier cleanup
        socketIdToSecurityId[socket.id] = securityId;
        
        console.log(`Client registered: ${username} (${idName}) with security ID ${securityId}`);
        
        // Send current active sessions to all clients
        broadcastActiveSessions();
    });
    
    // Handle client disconnection
    socket.on('disconnect', () => {
        const securityId = socketIdToSecurityId[socket.id];
        
        if (securityId) {
            // Remove the session
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
            
            console.log(`Client disconnected: ${securityId}`);
            
            // Update all clients about the active sessions
            broadcastActiveSessions();
        } else {
            console.log('Unregistered client disconnected');
        }
    });
});

// Function to broadcast active sessions to all clients
function broadcastActiveSessions() {
    const sessions = Array.from(activeSessions.entries()).map(([securityId, session]) => ({
        securityId,
        username: session.username,
        idName: session.idName,
        designType: session.designType
    }));
    
    io.emit('activeSessions', sessions);
}

// Function to broadcast album updates to all clients
async function broadcastAlbumUpdate() {
    try {
        const albums = await AlbumItem.find().sort({ timestamp: -1 });
        io.emit('albumUpdate', albums);
    } catch (error) {
        console.error('Error broadcasting album update:', error);
    }
}

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 