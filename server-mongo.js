const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const { connectDB, Request, AntiTamperLog, AlbumItem } = require('./db-mongo');
require('dotenv').config();

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
        // Check if we have any requests
        const requestCount = await Request.countDocuments();
        
        if (requestCount === 0) {
            // Add initial Amo request if table is empty
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
            console.log('Added initial Amo request');
        }
        
        // Check if we have any album items
        const albumCount = await AlbumItem.countDocuments();
        
        if (albumCount === 0) {
            // Add sample album
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
            console.log('Added sample album');
        }
        
        console.log('Database initialized');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Handle user registration
    socket.on('register_session', (user) => {
        if (user && user.securityId) {
            console.log(`User ${user.idName} registered with security ID ${user.securityId}`);
            
            // Store the session with socket ID
            activeSessions.set(user.securityId, {
                socketId: socket.id,
                username: user.username,
                idName: user.idName,
                designType: user.designType
            });
            
            // Store reverse mapping for easy cleanup
            socketIdToSecurityId[socket.id] = user.securityId;
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        
        // Clean up session if it exists
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
        }
    });
});

// API Routes
// Get all requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new request
app.post('/api/requests', async (req, res) => {
    try {
        const newRequest = new Request(req.body);
        await newRequest.save();
        
        // Broadcast to all clients
        io.emit('requestAdded', newRequest);
        
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a request
app.delete('/api/requests/:id', async (req, res) => {
    try {
        const result = await Request.findOneAndDelete({ id: req.params.id });
        
        if (!result) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        // Broadcast to all clients
        io.emit('requestDeleted', req.params.id);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Anti-tamper logs routes
app.get('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        const logs = await AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        await AntiTamperLog.deleteMany({});
        
        // Broadcast to all clients
        io.emit('antiTamperLogsCleared');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/anti-tamper-logs/:id', checkAuth, async (req, res) => {
    try {
        const result = await AntiTamperLog.findOneAndDelete({ id: req.params.id });
        
        if (!result) {
            return res.status(404).json({ error: 'Log not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Album items routes
app.get('/api/album-items', async (req, res) => {
    try {
        const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albumItems);
    } catch (error) {
        console.error('Error fetching album items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/album-items', async (req, res) => {
    try {
        const newAlbumItem = new AlbumItem(req.body);
        await newAlbumItem.save();
        
        // Broadcast to all clients
        io.emit('albumItemsChanged');
        
        res.status(201).json(newAlbumItem);
    } catch (error) {
        console.error('Error adding album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/album-items/:id', async (req, res) => {
    try {
        const result = await AlbumItem.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true }
        );
        
        if (!result) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        // Broadcast to all clients
        io.emit('albumItemsChanged');
        
        res.json(result);
    } catch (error) {
        console.error('Error updating album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/album-items/:id', async (req, res) => {
    try {
        const result = await AlbumItem.findOneAndDelete({ id: req.params.id });
        
        if (!result) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        // Broadcast to all clients
        io.emit('albumItemsChanged');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Start the server
async function startServer() {
    try {
        // Connect to MongoDB
        await connectDB();
        
        // Initialize database with sample data if needed
        await initializeDb();
        
        // Start the server
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 