const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const { connectToDatabase, models } = require('./mongodb');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Database connection and models
let Request, AntiTamperLog, AlbumItem;

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

// Initialize database connection
async function initializeApp() {
    try {
        const db = await connectToDatabase();
        Request = db.Request;
        AntiTamperLog = db.AntiTamperLog;
        AlbumItem = db.AlbumItem;
        
        console.log('Database initialized');
        
        // Start server after database is connected
        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize app:', error);
        process.exit(1);
    }
}

// Function to broadcast album updates to all connected clients
function broadcastAlbumUpdate() {
    io.emit('albumItemsChanged');
}

// Middleware
app.use(bodyParser.json());

// Serve static files first
app.use(express.static(path.join(__dirname)));

// Specific routes for HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Routes
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
        const newRequest = req.body;
        const result = await Request.create(newRequest);
        
        // Broadcast to all connected clients
        io.emit('requestAdded', result);
        
        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Failed to add request' });
    }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Request.findOneAndDelete({ id });
        
        // Broadcast to all connected clients
        io.emit('requestDeleted', id);
        
        res.json({ success: true, message: 'Request deleted' });
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Failed to delete request' });
    }
});

app.get('/api/anti-tamper-logs', checkAuth, async (req, res) => {
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
        await AntiTamperLog.deleteMany({});
        
        // Broadcast to all connected clients
        io.emit('antiTamperLogsCleared');
        
        res.json({ success: true, message: 'Anti-tamper logs cleared' });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Failed to clear anti-tamper logs' });
    }
});

app.delete('/api/anti-tamper-logs/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await AntiTamperLog.findOneAndDelete({ id });
        
        // No broadcast needed as this is an admin-only operation
        
        res.json({ success: true, message: 'Anti-tamper log deleted' });
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        res.status(500).json({ error: 'Failed to delete anti-tamper log' });
    }
});

app.get('/api/album-items', async (req, res) => {
    try {
        const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albumItems);
    } catch (error) {
        console.error('Error fetching album items:', error);
        res.status(500).json({ error: 'Failed to fetch album items' });
    }
});

app.post('/api/album-items', checkAuth, async (req, res) => {
    try {
        const newAlbumItem = req.body;
        const result = await AlbumItem.create(newAlbumItem);
        
        // Broadcast to all connected clients
        broadcastAlbumUpdate();
        
        res.status(201).json(result);
    } catch (error) {
        console.error('Error adding album item:', error);
        res.status(500).json({ error: 'Failed to add album item' });
    }
});

app.put('/api/album-items/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updatedAlbumItem = req.body;
        
        const result = await AlbumItem.findOneAndUpdate(
            { id },
            updatedAlbumItem,
            { new: true }
        );
        
        if (!result) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        // Broadcast to all connected clients
        broadcastAlbumUpdate();
        
        res.json(result);
    } catch (error) {
        console.error('Error updating album item:', error);
        res.status(500).json({ error: 'Failed to update album item' });
    }
});

app.delete('/api/album-items/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await AlbumItem.findOneAndDelete({ id });
        
        // Broadcast to all connected clients
        broadcastAlbumUpdate();
        
        res.json({ success: true, message: 'Album item deleted' });
    } catch (error) {
        console.error('Error deleting album item:', error);
        res.status(500).json({ error: 'Failed to delete album item' });
    }
});

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('register_session', (user) => {
        if (!user || !user.securityId) {
            console.log('Invalid session registration attempt');
            return;
        }
        
        console.log(`Registering session for ${user.idName} (${user.securityId})`);
        
        // Store the session with socket ID for later reference
        activeSessions.set(user.securityId, {
            socketId: socket.id,
            username: user.username,
            idName: user.idName,
            designType: user.designType
        });
        
        // Store reverse mapping for easier cleanup on disconnect
        socketIdToSecurityId[socket.id] = user.securityId;
        
        console.log(`Active sessions: ${activeSessions.size}`);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        
        // Clean up session on disconnect
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
            console.log(`Session removed for ${securityId}`);
            console.log(`Active sessions: ${activeSessions.size}`);
        }
    });
});

// Catch-all route for SPA - must be after API routes
app.get('*', (req, res) => {
    // Check if the request is for a file with an extension
    if (req.path.match(/\.\w+$/)) {
        // Try to serve the file
        const filePath = path.join(__dirname, req.path);
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error(`Error serving file ${req.path}:`, err);
                res.status(404).send('File not found');
            }
        });
    } else {
        // For all other routes, serve the login page
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

// Start the application
initializeApp(); 