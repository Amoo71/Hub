const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
require('dotenv').config();

// Import MongoDB models
const { connectDB, Request, AntiTamperLog, AlbumItem } = require('./models/db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
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

// Initialize database with sample data if needed
async function initializeDb() {
    try {
        // Check if there are any album items
        const albumCount = await AlbumItem.countDocuments();
        
        if (albumCount === 0) {
            console.log('Adding sample album to album_items');
            const now = Date.now();
            const sampleAlbum = new AlbumItem({
                id: now.toString(),
                name: 'Sample Album',
                imageUrl: '',
                acc: 'SAMPLE-ACC-001',
                pw: 'SAMPLE-PW-001',
                timestamp: now
            });
            
            await sampleAlbum.save();
            console.log('Sample album added');
        }
        
        // Check if there are any requests
        const requestCount = await Request.countDocuments();
        
        if (requestCount === 0) {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            
            const initialAmoRequest = new Request({
                id: Date.now().toString(),
                username: 'Amo',
                text: 'Amo\'s initial fixed request.',
                designType: 'owner',
                idName: 'Amo',
                time: time,
                timestamp: now.getTime()
            });
            
            await initialAmoRequest.save();
            console.log('Initial request added');
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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Handle client authentication
    socket.on('authenticate', async (data) => {
        try {
            const { username, securityId, designType, idName } = data;
            console.log(`User ${username} authenticated with security ID ${securityId}`);
            
            // Store session information
            activeSessions.set(securityId, { socketId: socket.id, username, idName, designType });
            socketIdToSecurityId[socket.id] = securityId;
            
            // Send current requests and albums to the newly connected client
            const requests = await Request.find().sort({ timestamp: -1 });
            socket.emit('requestUpdate', requests);
            
            const albums = await AlbumItem.find().sort({ timestamp: -1 });
            socket.emit('albumUpdate', albums);
            
            // Acknowledge successful authentication
            socket.emit('authResult', { success: true });
        } catch (error) {
            console.error('Error during authentication:', error);
            socket.emit('authResult', { success: false, error: 'Authentication failed' });
        }
    });
    
    // Handle new request submission
    socket.on('newRequest', async (data) => {
        try {
            const { text, securityId } = data;
            console.log(`New request from security ID ${securityId}: ${text}`);
            
            const session = activeSessions.get(securityId);
            if (!session) {
                socket.emit('requestResult', { success: false, error: 'Not authenticated' });
                return;
            }
            
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            
            // Create new request in MongoDB
            const newRequest = new Request({
                id: Date.now().toString(),
                username: session.username,
                text: text,
                designType: session.designType,
                idName: session.idName,
                time: time,
                timestamp: now.getTime()
            });
            
            await newRequest.save();
            
            // Broadcast update to all clients
            broadcastRequestUpdate();
            
            // Acknowledge successful request submission
            socket.emit('requestResult', { success: true });
        } catch (error) {
            console.error('Error processing new request:', error);
            socket.emit('requestResult', { success: false, error: 'Failed to process request' });
        }
    });
    
    // Handle album item submission
    socket.on('newAlbumItem', async (data) => {
        try {
            const { name, imageUrl, acc, pw, securityId } = data;
            console.log(`New album item from security ID ${securityId}: ${name}`);
            
            const session = activeSessions.get(securityId);
            if (!session) {
                socket.emit('albumItemResult', { success: false, error: 'Not authenticated' });
                return;
            }
            
            // Check admin privileges
            const isAdmin = session.designType === 'owner' || session.idName === 'Amo';
            if (!isAdmin) {
                socket.emit('albumItemResult', { success: false, error: 'Admin privileges required' });
                return;
            }
            
            // Create new album item in MongoDB
            const newAlbumItem = new AlbumItem({
                id: Date.now().toString(),
                name: name,
                imageUrl: imageUrl || '',
                acc: acc || 'Empty',
                pw: pw || 'Empty',
                timestamp: Date.now()
            });
            
            await newAlbumItem.save();
            
            // Broadcast update to all clients
            broadcastAlbumUpdate();
            
            // Acknowledge successful album item submission
            socket.emit('albumItemResult', { success: true });
        } catch (error) {
            console.error('Error processing new album item:', error);
            socket.emit('albumItemResult', { success: false, error: 'Failed to process album item' });
        }
    });
    
    // Handle album item deletion
    socket.on('deleteAlbumItem', async (data) => {
        try {
            const { id, securityId } = data;
            console.log(`Delete album item request from security ID ${securityId} for item ${id}`);
            
            const session = activeSessions.get(securityId);
            if (!session) {
                socket.emit('deleteAlbumItemResult', { success: false, error: 'Not authenticated' });
                return;
            }
            
            // Check admin privileges
            const isAdmin = session.designType === 'owner' || session.idName === 'Amo';
            if (!isAdmin) {
                socket.emit('deleteAlbumItemResult', { success: false, error: 'Admin privileges required' });
                return;
            }
            
            // Delete album item from MongoDB
            await AlbumItem.deleteOne({ id: id });
            
            // Log anti-tamper event
            const antiTamperLog = new AntiTamperLog({
                id: Date.now().toString(),
                timestamp: Date.now(),
                message: `Album item ${id} deleted by ${session.username}`
            });
            
            await antiTamperLog.save();
            
            // Broadcast update to all clients
            broadcastAlbumUpdate();
            
            // Acknowledge successful deletion
            socket.emit('deleteAlbumItemResult', { success: true });
        } catch (error) {
            console.error('Error deleting album item:', error);
            socket.emit('deleteAlbumItemResult', { success: false, error: 'Failed to delete album item' });
        }
    });
    
    // Handle client disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Clean up session data
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
        }
    });
});

// API routes
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

app.get('/api/albums', async (req, res) => {
    try {
        const albums = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albums);
    } catch (error) {
        console.error('Error fetching albums:', error);
        res.status(500).json({ error: 'Failed to fetch albums' });
    }
});

// Add missing API endpoints for anti-tamper logs
app.get('/api/anti-tamper-logs', async (req, res) => {
    try {
        const logs = await AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Failed to fetch anti-tamper logs' });
    }
});

app.delete('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        const result = await AntiTamperLog.deleteMany({});
        console.log(`Cleared ${result.deletedCount} anti-tamper logs.`);
        io.emit('antiTamperLogsCleared'); // Notify clients that logs have been cleared
        res.status(200).json({ message: `Cleared ${result.deletedCount} anti-tamper logs.` });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Failed to clear anti-tamper logs' });
    }
});

app.delete('/api/anti-tamper-logs/:id', checkAuth, async (req, res) => {
    try {
        const idToDelete = String(req.params.id);
        console.log(`Server: Received DELETE request for anti-tamper log with ID: ${idToDelete}`);
        
        const result = await AntiTamperLog.deleteOne({ id: idToDelete });
        
        if (result.deletedCount > 0) {
            console.log(`Server: Successfully deleted anti-tamper log with ID: ${idToDelete}`);
            io.emit('antiTamperNotification'); // Trigger re-render for all clients
            res.status(200).json({ message: `Anti-tamper log ${idToDelete} deleted successfully` });
        } else {
            console.log(`Server: Failed to delete anti-tamper log with ID: ${idToDelete}. Log not found.`);
            res.status(404).json({ message: `Anti-tamper log with ID ${idToDelete} not found` });
        }
    } catch (error) {
        console.error(`Server: Error during deletion of anti-tamper log ${req.params.id}:`, error);
        res.status(500).json({ message: `Internal server error during deletion: ${error.message}` });
    }
});

// API endpoint for reporting albums
app.post('/api/report-album', async (req, res) => {
    try {
        const { albumId, albumName, reportedBy, message } = req.body;
        
        if (!albumId || !albumName || !reportedBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Create a unique ID for the report
        const logId = Date.now().toString();
        
        // Create anti-tamper log entry for the report
        const antiTamperLog = new AntiTamperLog({
            id: logId,
            timestamp: Date.now(),
            message: message || `Album reported: "${albumName}" by ${reportedBy}`
        });
        
        await antiTamperLog.save();
        console.log('Report created');
        
        // Notify all admin users about the report
        activeSessions.forEach((session, key) => {
            if (session.designType === 'owner' || session.idName === 'Amo') {
                try {
                    io.to(session.socketId).emit('antiTamperNotification', { 
                        id: logId,
                        timestamp: Date.now(),
                        message: message || `Album reported: "${albumName}" by ${reportedBy}`
                    });
                    console.log('Admin notified');
                } catch (err) {
                    // Ignore errors sending to potentially disconnected sockets
                }
            }
        });
        
        return res.status(201).json({ success: true, message: 'Album reported successfully' });
    } catch (error) {
        console.error('Report error:', error);
        return res.status(500).json({ error: 'Failed to report album' });
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Replace the broadcastAlbumUpdate function
async function broadcastAlbumUpdate() {
    try {
        // Get all album items from MongoDB
        const albums = await AlbumItem.find().sort({ timestamp: -1 });
        // Broadcast the updated album list to all connected clients
        io.emit('albumUpdate', albums);
        console.log('Album update broadcast sent');
    } catch (error) {
        console.error('Error broadcasting album update:', error);
    }
}

// Replace the broadcastRequestUpdate function
async function broadcastRequestUpdate() {
    try {
        // Get all requests from MongoDB
        const requests = await Request.find().sort({ timestamp: -1 });
        // Broadcast the updated request list to all connected clients
        io.emit('requestUpdate', requests);
        console.log('Request update broadcast sent');
    } catch (error) {
        console.error('Error broadcasting request update:', error);
    }
} 