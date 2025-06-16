const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trntapp';

// Improved MongoDB connection with error handling
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    // Continue running the app even if MongoDB connection fails
    // This allows the static files to be served
  });

// Define MongoDB Schemas and Models
const requestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  designType: { type: String, required: true },
  idName: { type: String, required: true },
  time: { type: String, required: true },
  timestamp: { type: Number, required: true }
});

const antiTamperLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: Number, required: true },
  message: { type: String, required: true }
});

const albumItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  acc: { type: String, default: 'Empty' },
  pw: { type: String, default: 'Empty' },
  timestamp: { type: Number, required: true }
});

// Only create models if mongoose connection is established
let Request, AntiTamperLog, AlbumItem;
if (mongoose.connection.readyState === 1) {
  Request = mongoose.model('Request', requestSchema);
  AntiTamperLog = mongoose.model('AntiTamperLog', antiTamperLogSchema);
  AlbumItem = mongoose.model('AlbumItem', albumItemSchema);
} else {
  console.log('MongoDB models not created due to connection issues');
}

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

// Initialize database with default data
async function initializeDb() {
    try {
        // Skip if mongoose connection isn't established
        if (mongoose.connection.readyState !== 1) {
            console.log('Skipping DB initialization due to connection issues');
            return;
        }
        
        // Check if there are any requests
        const requestCount = await Request.countDocuments();
        console.log(`Current request count: ${requestCount}`);
    
        // Add initial Amo request if collection is empty
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
            console.log('Added initial Amo request');
        }

        // Check if there are any album items
        const albumCount = await AlbumItem.countDocuments();
        console.log(`Current album count: ${albumCount}`);
        
        // Add sample album if collection is empty
        if (albumCount === 0) {
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

// Initialize database
setTimeout(initializeDb, 3000); // Delay initialization to ensure connection is established

// Handle serving static files
app.use(express.static(path.join(__dirname)));
app.use(bodyParser.json());

// Middleware to handle MongoDB connection errors
const handleDbErrors = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(500).json({ error: 'Database connection error' });
    }
    next();
};

// API endpoints for requests
app.get('/api/requests', handleDbErrors, async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/requests', handleDbErrors, async (req, res) => {
    try {
        const { username, text, designType, idName } = req.body;
        
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const time = `${hours}:${minutes}`;
        
        const newRequest = new Request({
            id: Date.now().toString(),
            username,
            text,
            designType,
            idName,
            time,
            timestamp: Date.now()
        });
        
        await newRequest.save();

        // Broadcast to all clients
        io.emit('requestAdded', newRequest);
        
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Rest of the API endpoints with handleDbErrors middleware
app.delete('/api/requests/:id', handleDbErrors, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await Request.findOneAndDelete({ id });
        
        if (!result) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        // Broadcast to all clients
        io.emit('requestDeleted', id);
            
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API endpoints for anti-tamper logs
app.get('/api/anti-tamper-logs', checkAuth, handleDbErrors, async (req, res) => {
    try {
        const logs = await AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/anti-tamper-logs', checkAuth, handleDbErrors, async (req, res) => {
    try {
        await AntiTamperLog.deleteMany({});
            
        // Broadcast to all clients
        io.emit('antiTamperLogsCleared');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/anti-tamper-logs/:id', checkAuth, handleDbErrors, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await AntiTamperLog.findOneAndDelete({ id });
        
        if (!result) {
            return res.status(404).json({ error: 'Log not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API endpoints for album items
app.get('/api/album-items', handleDbErrors, async (req, res) => {
    try {
        const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albumItems);
    } catch (error) {
        console.error('Error fetching album items:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/album-items', handleDbErrors, async (req, res) => {
    try {
        const { name, imageUrl, acc, pw } = req.body;
        
        const newAlbumItem = new AlbumItem({
            id: Date.now().toString(),
            name,
            imageUrl: imageUrl || '',
            acc: acc || 'Empty',
            pw: pw || 'Empty',
            timestamp: Date.now()
        });
        
        await newAlbumItem.save();
        
        // Broadcast to all clients
        io.emit('albumItemsChanged');
        
        res.status(201).json(newAlbumItem);
    } catch (error) {
        console.error('Error adding album item:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/album-items/:id', handleDbErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, imageUrl, acc, pw } = req.body;
        
        const updateData = {
            name,
            imageUrl: imageUrl || '',
            acc: acc || 'Empty',
            pw: pw || 'Empty'
        };
        
        const updatedAlbumItem = await AlbumItem.findOneAndUpdate(
            { id },
            updateData,
            { new: true }
        );
        
        if (!updatedAlbumItem) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        // Broadcast to all clients
        io.emit('albumItemsChanged');
        
        res.json(updatedAlbumItem);
    } catch (error) {
        console.error('Error updating album item:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/album-items/:id', handleDbErrors, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await AlbumItem.findOneAndDelete({ id });
        
        if (!result) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        // Broadcast to all clients
        io.emit('albumItemsChanged');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting album item:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    socket.on('register_session', (user) => {
        console.log('Registering session for user:', user.idName);
        
        if (user && user.securityId && user.idName) {
            // Store in our active sessions map
            activeSessions.set(user.securityId, {
                socketId: socket.id,
                username: user.username,
                idName: user.idName,
                designType: user.designType
            });
            
            // Store reverse mapping for easy cleanup
            socketIdToSecurityId[socket.id] = user.securityId;
        
            console.log('Session registered successfully');
        } else {
            console.log('Invalid user data for session registration');
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Clean up from our maps using the reverse mapping
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
            console.log('Session cleaned up for:', securityId);
        }
    });
});

// Catch-all route to serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 