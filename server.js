const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');
const { connectToDatabase, getDb, client } = require('./db');
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

// Initialize MongoDB database
async function initializeDb() {
    try {
        const db = getDb();
        
        // Check if requests collection is empty
        const requestsCount = await db.collection('requests').countDocuments();
        if (requestsCount === 0) {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const time = `${hours}:${minutes}`;
            
            // Add initial request
            await db.collection('requests').insertOne({
                id: Date.now().toString(),
                username: 'Amo',
                text: 'Amo\'s initial fixed request.',
                designType: 'owner',
                idName: 'Amo',
                time: time,
                timestamp: now.getTime()
            });
        }
        
        // Check if album_items collection is empty
        const albumCount = await db.collection('album_items').countDocuments();
        if (albumCount === 0) {
            const now = Date.now();
            // Add sample album
            await db.collection('album_items').insertOne({
                id: now.toString(),
                name: 'Sample Album',
                imageUrl: '',
                acc: 'SAMPLE-ACC-001',
                pw: 'SAMPLE-PW-001',
                timestamp: now
            });
        }
        
        console.log('Database initialized');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// API Endpoints
app.get('/api/requests', async (req, res) => {
    try {
        const db = getDb();
        const requests = await db.collection('requests').find().sort({ timestamp: -1 }).toArray();
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// New API endpoint for anti-tamper logs
app.get('/api/anti-tamper-logs', async (req, res) => {
    try {
        const db = getDb();
        const logs = await db.collection('anti_tamper_logs').find().sort({ timestamp: -1 }).toArray();
        res.json(logs);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// New API endpoint to clear anti-tamper logs
app.delete('/api/anti-tamper-logs', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('anti_tamper_logs').deleteMany({});
        console.log(`Cleared ${result.deletedCount} anti-tamper logs.`);
        io.emit('antiTamperLogsCleared'); // Notify clients that logs have been cleared
        res.status(200).json({ message: `Cleared ${result.deletedCount} anti-tamper logs.` });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// New API endpoint to delete a single anti-tamper log
app.delete('/api/anti-tamper-logs/:id', async (req, res) => {
    const idToDelete = String(req.params.id); // Ensure ID is a string
    console.log(`Server: Received DELETE request for anti-tamper log with ID: ${idToDelete}`);
    
    try {
        const db = getDb();
        const result = await db.collection('anti_tamper_logs').deleteOne({ id: idToDelete });
        
        if (result.deletedCount > 0) {
            console.log(`Server: Successfully deleted anti-tamper log with ID: ${idToDelete}`);
            io.emit('antiTamperNotification'); // Trigger re-render for all clients
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
    console.log('GET /api/album-items: Redirecting to /api/albums');
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
    console.log(`PUT /api/album-items/${req.params.id}: Redirecting to /api/albums/${req.params.id}`);
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
        const db = getDb();
        const newAlbum = {
            id,
            name,
            imageUrl,
            acc,
            pw,
            timestamp
        };
        
        const result = await db.collection('album_items').insertOne(newAlbum);
        
        if (result.acknowledged) {
            console.log('Added new album:', newAlbum);
            
            // Broadcast the update to all clients
            broadcastAlbumUpdate();
            
            res.status(201).json(newAlbum);
        } else {
            res.status(500).json({ error: 'Failed to create album' });
        }
    } catch (error) {
        console.error('Database error creating album:', error.message);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

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

    try {
        // Insert the request into the database
        const db = getDb();
        await db.collection('requests').insertOne(newRequest);
        
        io.emit('requestAdded', newRequest); // Broadcast new request to all clients with consistent event name
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const db = getDb();
        const result = await db.collection('requests').deleteOne({ id });
        
        if (result.deletedCount > 0) {
            io.emit('requestDeleted', id); // Broadcast deleted request ID with consistent event name
            res.status(200).json({ message: 'Request deleted successfully' });
        } else {
            res.status(404).json({ message: 'Request not found' });
        }
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Connected');

    // Handle session registration
    socket.on('register_session', (data) => {
        const { securityId, username, idName, designType } = data;
        console.log('Registration');
        
        // Check if this securityId is already registered with a different socket
        if (activeSessions.has(securityId)) {
            const oldSocketId = activeSessions.get(securityId).socketId;
            const oldIdName = activeSessions.get(securityId).idName;
            console.log('Session exists');
            
            // Notify the old socket that it's been invalidated
            try {
                console.log('Invalidating old');
                io.to(oldSocketId).emit('session_invalidated', { message: 'Your session has been logged in elsewhere' });
            } catch (err) {
                console.log('Old socket gone');
            }
            
            // Clean up the old socket mapping
            delete socketIdToSecurityId[oldSocketId];
            
            // Create anti-tamper log for suspicious activity (multiple logins)
            const notificationMessage = `Multiple login attempt: ${idName}`;
            const logId = Date.now().toString();
            
            try {
                const db = getDb();
                db.collection('anti_tamper_logs').insertOne({
                    id: logId,
                    timestamp: Date.now(),
                    message: notificationMessage
                });
                console.log('Log created');
                
                // Notify all admin users about the suspicious activity
                activeSessions.forEach((session, key) => {
                    if (session.designType === 'owner' || session.idName === 'Amo') {
                        try {
                            io.to(session.socketId).emit('anti_tamper_notification', { 
                                id: logId,
                                timestamp: Date.now(),
                                message: notificationMessage
                            });
                            console.log('Admin notified');
                        } catch (err) {
                            // Ignore errors sending to potentially disconnected sockets
                        }
                    }
                });
            } catch (error) {
                console.error('Error creating anti-tamper log:', error);
            }
        }

        // Register the new session
        activeSessions.set(securityId, { socketId: socket.id, username, idName, designType });
        socketIdToSecurityId[socket.id] = securityId;
        
        console.log('Session registered');
        
        // Log current sessions (for debugging)
        console.log('Sessions updated');
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Disconnected');
        
        // Clean up session data
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
            console.log('Session removed');
        }
    });
});

// Route for the login page - MUST BE BEFORE express.static to take precedence for '/' 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve static files from the current directory for all other paths
app.use(express.static(path.join(__dirname)));

// Wait for database connection, then initialize and start server
connectToDatabase()
    .then(async () => {
        await initializeDb();
        
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    });

// Ensure database connection is closed on application exit
process.on('SIGINT', () => {
    console.log('Server is shutting down.');
    process.exit(0);
});

// GET /api/albums - Get all album items
app.get('/api/albums', async (req, res) => {
    try {
        const db = getDb();
        const albums = await db.collection('album_items').find().sort({ timestamp: -1 }).toArray();
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
        
        const db = getDb();
        
        // Check if album exists
        const album = await db.collection('album_items').findOne({ id });
        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }
        
        // Update the album
        const timestamp = Date.now(); // Update timestamp to make it the newest
        
        const result = await db.collection('album_items').updateOne(
            { id },
            { $set: {
                name: name || album.name,
                imageUrl: imageUrl !== undefined ? imageUrl : album.imageUrl,
                acc: acc !== undefined ? acc : album.acc,
                pw: pw !== undefined ? pw : album.pw,
                timestamp
            }}
        );
        
        if (result.modifiedCount > 0) {
            // Get the updated album
            const updatedAlbum = await db.collection('album_items').findOne({ id });
            
            // Broadcast update
            broadcastAlbumUpdate();
            
            res.json(updatedAlbum);
        } else {
            res.status(500).json({ error: 'Failed to update album' });
        }
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
        
        const db = getDb();
        
        // Check if album exists
        console.log('Checking album');
        const album = await db.collection('album_items').findOne({ id });
        
        if (!album) {
            console.log('Not found');
            return res.status(404).json({ error: 'Album not found' });
        }
        
        console.log('Found album');
        
        // Delete the album
        const result = await db.collection('album_items').deleteOne({ id });
        console.log('Deleted');
        
        // Broadcast the update to all connected clients
        broadcastAlbumUpdate();
        
        return res.status(200).json({ message: 'Album deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({ error: 'Failed to delete album' });
    }
});

// Helper function to broadcast album updates
function broadcastAlbumUpdate() {
    io.emit('albumItemsChanged');
}

// Special maintenance endpoints
app.get('/api/maintenance/fix-album-ids', checkAuth, async (req, res) => {
    try {
        console.log('Running album ID fix from maintenance endpoint...');
        const db = getDb();
        const albums = await db.collection('album_items').find().toArray();
        let updatedCount = 0;
        
        for (const album of albums) {
            // Always update all albums with a new ID
            const newId = Date.now() + '-' + updatedCount;
            await db.collection('album_items').updateOne(
                { _id: album._id },
                { $set: { id: newId } }
            );
            console.log(`Set ID for album "${album.name}" to ${newId}`);
            updatedCount++;
        }
        
        // Broadcast update to all clients
        broadcastAlbumUpdate();
        
        const updatedAlbums = await db.collection('album_items').find().sort({ timestamp: -1 }).toArray();
        
        res.json({ 
            success: true, 
            message: `Album IDs fixed: ${updatedCount} albums updated.`,
            albums: updatedAlbums
        });
    } catch (error) {
        console.error('Error fixing album IDs:', error);
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
        const db = getDb();
        
        // Create anti-tamper log entry for the report
        await db.collection('anti_tamper_logs').insertOne({
            id: logId,
            timestamp: Date.now(),
            message: message || `Album reported: "${albumName}" by ${reportedBy}`
        });
        
        console.log('Report created');
        
        // Notify all admin users about the report
        activeSessions.forEach((session, key) => {
            if (session.designType === 'owner' || session.idName === 'Amo') {
                try {
                    io.to(session.socketId).emit('anti_tamper_notification', { 
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