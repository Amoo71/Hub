const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const { connectDB, Request, AntiTamperLog, AlbumItem } = require('./db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Initialize MongoDB connection
connectDB();

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

// Initialize database with MongoDB - replace SQLite initialization
async function initializeDb() {
    try {
        // Check if we have any album items
        const albumCount = await AlbumItem.countDocuments();
        
        // Add sample album if none exist
        if (albumCount === 0) {
            console.log('Adding sample album to MongoDB');
            const now = Date.now();
            await AlbumItem.create({
                id: now.toString(),
                name: 'Sample Album',
                imageUrl: '',
                acc: 'SAMPLE-ACC-001',
                pw: 'SAMPLE-PW-001',
                timestamp: now
            });
        }
        
        // Check if we have any requests
        const requestCount = await Request.countDocuments();
        
        // Add initial Amo request if none exist
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
        }
        
        console.log('Database initialized');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Initialize database
initializeDb();

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Socket.io connection handling
io.on('connection', async (socket) => {
    console.log('New client connected');
    
    // Handle login
    socket.on('login', async (data) => {
        try {
            const { username, designType, idName } = data;
            const securityId = Date.now().toString();
            
            // Store session info
            activeSessions.set(securityId, {
                socketId: socket.id,
                username,
                idName,
                designType
            });
            
            // Store reverse mapping for cleanup
            socketIdToSecurityId[socket.id] = securityId;
            
            // Send session token back to client
            socket.emit('loginSuccess', { securityId });
            
            // Broadcast updated user list
            broadcastActiveUsers();
            
            // Send existing requests to the new user
            const requests = await Request.find().sort({ timestamp: -1 });
            socket.emit('initialRequests', requests);
            
            // Send existing album items
            const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
            socket.emit('initialAlbumItems', albumItems);
            
            console.log(`User ${username} (${idName}) logged in with security ID: ${securityId}`);
        } catch (error) {
            console.error('Login error:', error);
            socket.emit('loginError', { message: 'Failed to log in' });
        }
    });
    
    // Handle new request
    socket.on('newRequest', async (data) => {
        try {
            const { securityId, text } = data;
            const session = activeSessions.get(securityId);
            
            if (!session) {
                socket.emit('requestError', { message: 'Invalid session' });
                return;
            }
            
            const { username, idName, designType } = session;
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            
            const requestData = {
                id: Date.now().toString(),
                username,
                text,
                designType,
                idName,
                time,
                timestamp: now.getTime()
            };
            
            // Save to database
            await Request.create(requestData);
            
            // Broadcast to all clients
            io.emit('newRequest', requestData);
            
            console.log(`New request from ${username}: ${text}`);
        } catch (error) {
            console.error('New request error:', error);
            socket.emit('requestError', { message: 'Failed to create request' });
        }
    });
    
    // Handle delete request
    socket.on('deleteRequest', async (data) => {
        try {
            const { securityId, requestId } = data;
            const session = activeSessions.get(securityId);
            
            if (!session) {
                socket.emit('deleteError', { message: 'Invalid session' });
                return;
            }
            
            const { username, idName, designType } = session;
            const isAdmin = designType === 'owner' || idName === 'Amo';
            
            // Get the request to check ownership
            const request = await Request.findOne({ id: requestId });
            
            if (!request) {
                socket.emit('deleteError', { message: 'Request not found' });
                return;
            }
            
            // Check if user is admin or owns the request
            if (!isAdmin && request.idName !== idName) {
                socket.emit('deleteError', { message: 'Not authorized to delete this request' });
                return;
            }
            
            // Delete from database
            await Request.deleteOne({ id: requestId });
            
            // Log anti-tamper event
            await AntiTamperLog.create({
                id: Date.now().toString(),
                timestamp: Date.now(),
                message: `Request ${requestId} deleted by ${username} (${idName})`
            });
            
            // Broadcast deletion to all clients
            io.emit('requestDeleted', { id: requestId });
            
            console.log(`Request ${requestId} deleted by ${username}`);
        } catch (error) {
            console.error('Delete request error:', error);
            socket.emit('deleteError', { message: 'Failed to delete request' });
        }
    });
    
    // Handle new album item
    socket.on('newAlbumItem', async (data) => {
        try {
            const { securityId, name, imageUrl, acc, pw } = data;
            const session = activeSessions.get(securityId);
            
            if (!session) {
                socket.emit('albumError', { message: 'Invalid session' });
                return;
            }
            
            const { username, idName, designType } = session;
            const isAdmin = designType === 'owner' || idName === 'Amo';
            
            if (!isAdmin) {
                socket.emit('albumError', { message: 'Not authorized to add album items' });
                return;
            }
            
            const albumData = {
                id: Date.now().toString(),
                name,
                imageUrl: imageUrl || '',
                acc: acc || 'Empty',
                pw: pw || 'Empty',
                timestamp: Date.now()
            };
            
            // Save to database
            await AlbumItem.create(albumData);
            
            // Broadcast to all clients
            broadcastAlbumUpdate();
            
            console.log(`New album item added: ${name}`);
        } catch (error) {
            console.error('New album item error:', error);
            socket.emit('albumError', { message: 'Failed to create album item' });
        }
    });
    
    // Handle delete album item
    socket.on('deleteAlbumItem', async (data) => {
        try {
            const { securityId, albumId } = data;
            const session = activeSessions.get(securityId);
            
            if (!session) {
                socket.emit('albumError', { message: 'Invalid session' });
                return;
            }
            
            const { username, idName, designType } = session;
            const isAdmin = designType === 'owner' || idName === 'Amo';
            
            if (!isAdmin) {
                socket.emit('albumError', { message: 'Not authorized to delete album items' });
                return;
            }
            
            // Delete from database
            await AlbumItem.deleteOne({ id: albumId });
            
            // Broadcast update to all clients
            broadcastAlbumUpdate();
            
            console.log(`Album item ${albumId} deleted by ${username}`);
        } catch (error) {
            console.error('Delete album item error:', error);
            socket.emit('albumError', { message: 'Failed to delete album item' });
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            const session = activeSessions.get(securityId);
            if (session) {
                console.log(`User ${session.username} disconnected`);
                activeSessions.delete(securityId);
            }
            delete socketIdToSecurityId[socket.id];
            
            // Broadcast updated user list
            broadcastActiveUsers();
        }
        console.log('Client disconnected');
    });
});

// Function to broadcast active users
function broadcastActiveUsers() {
    const users = Array.from(activeSessions.entries()).map(([securityId, session]) => ({
        securityId,
        username: session.username,
        idName: session.idName,
        designType: session.designType
    }));
    
    io.emit('activeUsers', users);
}

// Function to broadcast album updates
async function broadcastAlbumUpdate() {
    try {
        const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
        io.emit('albumUpdate', albumItems);
    } catch (error) {
        console.error('Error broadcasting album update:', error);
    }
}

// API routes
// Get all requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error getting requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all album items
app.get('/api/album', async (req, res) => {
    try {
        const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albumItems);
    } catch (error) {
        console.error('Error getting album items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin routes
app.get('/api/admin/logs', checkAuth, async (req, res) => {
    try {
        const logs = await AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 