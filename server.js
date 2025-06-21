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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amo:<db_password>@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs';

// Connect to MongoDB
mongoose.connect(MONGODB_URI.replace('<db_password>', process.env.DB_PASSWORD || '<db_password>'))
  .then(() => {})
  .catch(err => {});

// Create MongoDB Schemas and Models
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

// New schema for chat messages with expiration
const chatMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  designType: { type: String, required: true },
  idName: { type: String, required: true },
  time: { type: String, required: true },
  timestamp: { type: Number, required: true },
  expiresAt: { type: Number, required: true } // Timestamp when the message expires (24 hours after creation)
});

const albumItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  acc: { type: String, default: 'Empty' },
  pw: { type: String, default: 'Empty' },
  timestamp: { type: Number, required: true }
});

const Request = mongoose.model('Request', requestSchema);
const AntiTamperLog = mongoose.model('AntiTamperLog', antiTamperLogSchema);
const AlbumItem = mongoose.model('AlbumItem', albumItemSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema); // New model for chat messages

// Check and remove expired chat messages
async function cleanupExpiredChatMessages() {
  try {
    const now = Date.now();
    const result = await ChatMessage.deleteMany({ expiresAt: { $lte: now } });
    if (result.deletedCount > 0) {
      io.emit('chatMessagesChanged'); // Notify clients about deleted messages
    }
  } catch (error) {
    // Error handling silently to avoid console logs
  }
}

// Run expired message cleanup every minute
setInterval(cleanupExpiredChatMessages, 60 * 1000);

// Create initial data if collections are empty
async function checkAndCreateInitialData() {
  try {
    // Check if requests collection is empty
    const requestCount = await Request.countDocuments();
    
    if (requestCount === 0) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const time = `${hours}:${minutes}`;
      
      const initialRequest = new Request({
        id: Date.now().toString(),
        username: 'Amo',
        text: 'Amo\'s initial request.',
        designType: 'owner',
        idName: 'Amo',
        time: time,
        timestamp: now.getTime()
      });
      
      await initialRequest.save();
    }
    
    // Check if album items collection is empty
    const albumCount = await AlbumItem.countDocuments();
    
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
    }
    
    // Check if chat messages collection is empty
    const chatCount = await ChatMessage.countDocuments();
    
    if (chatCount === 0) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const time = `${hours}:${minutes}`;
      
      const initialMessage = new ChatMessage({
        id: Date.now().toString(),
        username: 'Amo',
        text: 'Welcome to the chat! Messages here will automatically delete after 24 hours.',
        designType: 'owner',
        idName: 'Amo',
        time: time,
        timestamp: now.getTime(),
        expiresAt: now.getTime() + (24 * 60 * 60 * 1000) // 24 hours from now
      });
      
      await initialMessage.save();
    }
  } catch (error) {
    // Error handling silently to avoid console logs
  }
}

// Run the check for initial data
checkAndCreateInitialData();

// Middleware to check authentication for admin routes
const checkAuth = (req, res, next) => {
    try {
        const sessionToken = req.headers['x-session-token'];
        
        if (!sessionToken) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Check if the token matches any of our activeSessions
        let isAdmin = false;
        let sessionFound = false;
        
        // The sessionToken is actually the securityId in our implementation
        const session = activeSessions.get(sessionToken);
        if (session) {
            sessionFound = true;
            isAdmin = session.designType === 'owner' || session.idName === 'Amo';
        }
        
        if (!sessionFound) {
            return res.status(403).json({ error: 'Invalid session' });
        }
        
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin privileges required' });
        }
        
        next();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error during authentication' });
    }
};

// Use JSON parsing middleware
app.use(express.json()); // For parsing application/json

// User accounts with security IDs - moved from client to server for security
const userAccounts = {
    // Admin-Benutzer
    '1357': { 
        idName: 'Amo',
        designType: 'owner'
    },
    
    // Standard-Benutzer
    '1256': { 
        idName: 'Member', 
        designType: 'green-member' 
    },
    '3478': {
      idName: 'Member',
      designType: 'green-member'
    },
    '8745': {
      idName: 'Member',
      designType: 'green-member'
    },
    '9375': {
      idName: 'Member',
      designType: 'green-member'
    },
    '5294': {
      idName: 'Member',
      designType: 'green-member'
    },
    '6923': {
      idName: 'Member',
      designType: 'green-member'
    },
    '9983': {
      idName: 'Member',
      designType: 'green-member'
    },
    '9583': {
      idName: 'Member',
      designType: 'green-member'
    },
    '6634': {
      idName: 'Member',
      designType: 'green-member'
    },
    '3263': {
      idName: 'Member',
      designType: 'green-member'
    },
    '6126': {
      idName: 'Member',
      designType: 'green-member'
    },
    '7634': {
      idName: 'Member',
      designType: 'green-member'
    },
    '7422': {
      idName: 'Member',
      designType: 'green-member'
    },
    '7754': {
      idName: 'Member',
      designType: 'green-member'
    },
    
    // Premium Benutze
    'testPremium': { 
        idName: 'Test-Premium 1', 
        designType: 'prem-gold-pulse' 
    },

    'J5343': { 
        idName: 'Moderator', 
        designType: 'prem-gold-pulse' 
    },
    'partners666': {
        idName: 'Partner',
        designType: 'prem-gold-pulse'
    }
};

// Authentication endpoint
app.post('/api/auth', (req, res) => {
    const { securityId } = req.body;
    
    if (!securityId) {
        return res.status(400).json({ error: 'Security ID is required' });
    }
    
    const user = userAccounts[securityId];
    
    if (!user) {
        // Return 401 to avoid exposing which IDs exist
        return res.status(401).json({ error: 'Authentication failed' });
    }
    
    // Return user data without exposing the security ID itself in the response
    return res.status(200).json({
        securityId, // Client already knows this value since they sent it
        idName: user.idName,
        designType: user.designType
    });
});

// API Endpoints for MongoDB
// GET /api/requests - Get all requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// New API endpoint for anti-tamper logs
app.get('/api/anti-tamper-logs', async (req, res) => {
    try {
        const logs = await AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// New API endpoint to clear anti-tamper logs
app.delete('/api/anti-tamper-logs', async (req, res) => {
    try {
        const result = await AntiTamperLog.deleteMany({});
        console.log(`Cleared ${result.deletedCount} anti-tamper logs.`);
        io.emit('anti_tamper_logs_cleared'); // Notify clients that logs have been cleared
        res.status(200).json({ message: `Cleared ${result.deletedCount} anti-tamper logs.` });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// New API endpoint to delete a single anti-tamper log
app.delete('/api/anti-tamper-logs/:id', async (req, res) => {
    const idToDelete = String(req.params.id); // Ensure ID is a string
    console.log(`Server: Received DELETE request for anti-tamper log with ID: ${idToDelete}`);
    
    try {
        const result = await AntiTamperLog.deleteOne({ id: idToDelete });
        
        if (result.deletedCount > 0) {
            console.log(`Server: Successfully deleted anti-tamper log with ID: ${idToDelete}`);
            io.emit('anti_tamper_notification'); // Trigger re-render for all clients
            res.status(200).json({ message: `Anti-tamper log ${idToDelete} deleted successfully` });
        } else {
            console.log(`Server: Failed to delete anti-tamper log with ID: ${idToDelete}. Log not found.`);
            res.status(404).json({ message: `Anti-tamper log with ID ${idToDelete} not found` });
        }
    } catch (error) {
        console.error(`Server: Error during deletion of anti-tamper log ${idToDelete}:`, error);
        res.status(500).json({ message: `Internal server error during deletion: ${error.message}` });
    }
});

// API Endpoints for Album Items
app.get('/api/album-items', (req, res) => {
    // Forward to the new endpoint
    req.url = '/api/albums';
    app.handle(req, res);
});

app.post('/api/album-items', (req, res) => {
    console.log('POST /api/album-items: Redirecting to /api/albums');
    // Forward to the new endpoint
    req.url = '/api/albums';
    app.handle(req, res);
});

app.put('/api/album-items/:id', (req, res) => {
    console.log(`PUT /api/album-items/:id: Redirecting to /api/albums/:id`);
    // Forward to the new endpoint
    req.url = `/api/albums/${req.params.id}`;
    app.handle(req, res);
});

app.delete('/api/album-items/:id', (req, res) => {
    console.log(`DELETE /api/album-items/${req.params.id}: Redirecting to /api/albums/${req.params.id}`);
    // Forward to the new endpoint
    req.url = `/api/albums/${req.params.id}`;
    app.handle(req, res);
});

// POST /api/albums - Create a new album
app.post('/api/albums', checkAuth, async (req, res) => {
    // Validate required fields
    if (!req.body.name) {
        return res.status(400).json({ error: 'Album name is required' });
    }

    // Extract data from request
    let { name, imageUrl, acc, pw } = req.body;
    
    // Set default values for empty fields
    imageUrl = imageUrl || '';
    acc = acc || 'Empty';
    pw = pw || 'Empty';
    
    // Create a unique ID for the album
    const id = Date.now().toString();
    
    // Add timestamp for sorting
    const timestamp = Date.now();
    
    // Create the album entry
    try {
        const newAlbum = new AlbumItem({
            id, name, imageUrl, acc, pw, timestamp
        });
        
        await newAlbum.save();
        console.log('Added new album:', newAlbum);
        
        // Broadcast the update to all clients
        broadcastAlbumUpdate();
        
        res.status(201).json(newAlbum);
    } catch (error) {
        console.error('Database error creating album:', error.message);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// POST /api/requests - Create a new request
app.post('/api/requests', async (req, res) => {
    const { username, text, designType, idName } = req.body;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;
    const newRequest = {
        id: Date.now().toString(),
        username, text, designType, idName, time,
        timestamp: now.getTime()
    };

    // Insert the request into the database
    try {
        const request = new Request(newRequest);
        await request.save();
        io.emit('requestAdded', newRequest); // Broadcast new request to all clients
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// DELETE /api/requests/:id - Delete a request
app.delete('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const result = await Request.deleteOne({ id: id });
        
        if (result.deletedCount > 0) {
            io.emit('requestDeleted', id); // Broadcast deleted request ID
            res.status(200).json({ message: 'Request deleted successfully' });
        } else {
            res.status(404).json({ message: 'Request not found' });
        }
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// GET /api/albums - Get all album items
app.get('/api/albums', async (req, res) => {
    try {
        const albums = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albums);
    } catch (error) {
        console.error('Error fetching albums:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// PUT /api/albums/:id - Update an album
app.put('/api/albums/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, imageUrl, acc, pw } = req.body;
        
        // Check if album exists
        const album = await AlbumItem.findOne({ id: id });
        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }
        
        // Update the album
        const timestamp = Date.now(); // Update timestamp to make it the newest
        
        const updatedAlbum = await AlbumItem.findOneAndUpdate(
            { id: id },
            { 
                name: name || album.name,
                imageUrl: imageUrl !== undefined ? imageUrl : album.imageUrl,
                acc: acc !== undefined ? acc : album.acc,
                pw: pw !== undefined ? pw : album.pw,
                timestamp: timestamp
            },
            { new: true } // Return the updated document
        );
        
        // Broadcast update
        broadcastAlbumUpdate();
        
        res.json(updatedAlbum);
    } catch (error) {
        console.error('Error updating album:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// DELETE /api/albums/:id - Delete an album
app.delete('/api/albums/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Delete album');
        
        if (!id) {
            return res.status(400).json({ error: 'Album ID is required' });
        }
        
        // Check if album exists
        console.log('Checking album');
        const album = await AlbumItem.findOne({ id: id });
        
        if (!album) {
            console.log('Not found');
            return res.status(404).json({ error: 'Album not found' });
        }
        
        console.log('Found album');
        
        // Delete the album
        await AlbumItem.deleteOne({ id: id });
        console.log('Deleted');
        
        // Broadcast the update to all connected clients
        broadcastAlbumUpdate();
        
        return res.status(200).json({ message: 'Album deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ error: 'Failed to delete album' });
    }
});

// API Endpoints for Chat Messages
// GET /api/chat-messages - Get all chat messages
app.get('/api/chat-messages', async (req, res) => {
  try {
    const messages = await ChatMessage.find().sort({ timestamp: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// POST /api/chat-messages - Create a new chat message
app.post('/api/chat-messages', async (req, res) => {
  const { username, text, designType, idName } = req.body;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  const expiresAt = now.getTime() + (24 * 60 * 60 * 1000); // 24 hours from now
  
  const newMessage = {
    id: Date.now().toString(),
    username, text, designType, idName, time,
    timestamp: now.getTime(),
    expiresAt: expiresAt
  };

  try {
    const message = new ChatMessage(newMessage);
    await message.save();
    io.emit('chatMessagesChanged'); // Broadcast to all clients
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// DELETE /api/chat-messages/:id - Delete a chat message
app.delete('/api/chat-messages/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await ChatMessage.deleteOne({ id: id });
    
    if (result.deletedCount > 0) {
      io.emit('chatMessagesChanged'); // Broadcast delete to all clients
      res.status(200).json({ message: 'Chat message deleted successfully' });
    } else {
      res.status(404).json({ message: 'Chat message not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    let isRegisteredSocket = false;

    // Handle session registration
    socket.on('register_session', (data) => {
        const { securityId, username, idName, designType } = data;
        
        // Ignore if no valid security ID provided
        if (!securityId) {
            return;
        }
        
        // If this socket is already registered to this security ID, it's just a heartbeat/check
        // Don't treat it as a new login attempt
        if (isRegisteredSocket && socketIdToSecurityId[socket.id] === securityId) {
            
            // Update last active timestamp
            const existingSession = activeSessions.get(securityId);
            if (existingSession) {
                activeSessions.set(securityId, {
                    ...existingSession,
                    lastActive: Date.now()
                });
            }
            return;
        }
        
        // Check if this securityId is already registered with a different socket
        if (activeSessions.has(securityId)) {
            const oldSessionInfo = activeSessions.get(securityId);
            const oldSocketId = oldSessionInfo.socketId;
            
            // If it's the same socket ID, it's just a re-registration (shouldn't happen with our logic)
            if (oldSocketId === socket.id) {
                activeSessions.set(securityId, { 
                    socketId: socket.id, 
                    username, 
                    idName, 
                    designType,
                    lastActive: Date.now()
                });
                return;
            }
            
            // This is a multiple login attempt as the securityId is already in use by another socket
            // Notify the existing session that it's being invalidated
            io.to(oldSocketId).emit('sessionInvalidated', { 
                message: 'Your session has been logged in elsewhere'
            });
            
            // Create anti-tamper log for suspicious activity (multiple logins)
            const notificationMessage = `Multiple login attempt detected: ${idName} (Security ID: ${securityId.substring(0, 2)}***)`;
            const logId = Date.now().toString();
            
            // Create log in MongoDB
            const log = new AntiTamperLog({
                id: logId,
                timestamp: Date.now(),
                message: notificationMessage
            });
            log.save();
            
            // Notify all admin users about the suspicious activity
            activeSessions.forEach((session, key) => {
                if (session.designType === 'owner' || session.idName === 'Amo') {
                    try {
                        io.to(session.socketId).emit('anti_tamper_notification', { 
                            id: logId,
                            timestamp: Date.now(),
                            message: notificationMessage
                        });
                    } catch (err) {
                        // Silent error handling
                    }
                }
            });
            
            // Clean up the old socket mapping
            delete socketIdToSecurityId[oldSocketId];
        }

        // Register the new session (replacing any existing one)
        activeSessions.set(securityId, { 
            socketId: socket.id, 
            username, 
            idName, 
            designType,
            lastActive: Date.now()
        });
        socketIdToSecurityId[socket.id] = securityId;
        isRegisteredSocket = true;
    });

    // Handle ping/heartbeat to keep session alive
    socket.on('heartbeat', (securityId) => {
        if (!securityId || !activeSessions.has(securityId)) {
            return; // Ignore invalid heartbeats
        }
        
        // Verify this socket owns this session
        if (socketIdToSecurityId[socket.id] !== securityId) {
            return;
        }
        
        const session = activeSessions.get(securityId);
        if (session) {
            // Update last active timestamp
            activeSessions.set(securityId, {
                ...session,
                lastActive: Date.now()
            });
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        
        // Clean up session data
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            // Immediately remove the session when socket disconnects
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
        }
    });
});

// Helper function to broadcast album updates
function broadcastAlbumUpdate() {
    io.emit('albumItemsChanged');
}

// Special maintenance endpoints
app.get('/api/maintenance/fix-album-ids', checkAuth, async (req, res) => {
    try {
        const albums = await AlbumItem.find();
        let updatedCount = 0;
        
        // Update albums with new IDs
        for (const album of albums) {
            const newId = Date.now() + '-' + album._id.toString();
            await AlbumItem.updateOne({ _id: album._id }, { id: newId });
            updatedCount++;
        }
        
        // Broadcast update to all clients
        broadcastAlbumUpdate();
        
        const updatedAlbums = await AlbumItem.find().sort({ timestamp: -1 });
        res.json({ 
            success: true, 
            message: `Album IDs fixed: ${updatedCount} albums updated.`,
            albums: updatedAlbums
        });
    } catch (error) {
        res.status(500).json({ error: 'Error fixing album IDs: ' + error.message });
    }
});

// API Endpoint for reporting albums
app.post('/api/report-album', async (req, res) => {
    try {
        const { albumId, albumName, reportedBy, message } = req.body;
        
        if (!albumId || !albumName || !reportedBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Create a unique ID for the report
        const logId = Date.now().toString();
        const reportMessage = message || `Album reported: "${albumName}" by ${reportedBy}`;
        
        // Create anti-tamper log entry for the report
        const log = new AntiTamperLog({
            id: logId,
            timestamp: Date.now(),
            message: reportMessage
        });
        await log.save();
        
        console.log('Report created');
        
        // Notify all admin users about the report
        activeSessions.forEach((session, key) => {
            if (session.designType === 'owner' || session.idName === 'Amo') {
                try {
                    io.to(session.socketId).emit('anti_tamper_notification', { 
                        id: logId,
                        timestamp: Date.now(),
                        message: reportMessage
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

// Add ping endpoint to prevent Render from spinning down
app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

// Route for the login page - MUST BE BEFORE express.static to take precedence for '/' 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve static files from the current directory for all other paths
app.use(express.static(path.join(__dirname)));

// Start the server - Update to explicitly listen on all interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

// Ensure database connection is closed on application exit
process.on('SIGINT', () => {
    mongoose.connection.close();
    process.exit(0);
});

process.on('exit', (code) => {
    mongoose.connection.close();
});
