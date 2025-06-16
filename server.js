const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Initialize SQLite database
const db = new Database('requests.db', { verbose: console.log });

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

// Initialize database
function initializeDb() {
    // Create requests table if not exists
    db.prepare(`
        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY,
            title TEXT,
            message TEXT,
            status TEXT DEFAULT 'pending',
            timestamp INTEGER
        )
    `).run();

    // Create anti_tamper_logs table if not exists
    db.prepare(`
        CREATE TABLE IF NOT EXISTS anti_tamper_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            details TEXT,
            timestamp INTEGER
        )
    `).run();
    
    // Check if album_items table exists and has correct structure
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='album_items'").get();
    
    if (!tableExists) {
        console.log('Creating album_items table');
        // Create album_items table if not exists
        db.prepare(`
            CREATE TABLE album_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                imageUrl TEXT DEFAULT '',
                acc TEXT DEFAULT 'Empty',
                pw TEXT DEFAULT 'Empty',
                timestamp INTEGER NOT NULL
            )
        `).run();
    } else {
        // Check if timestamp column exists, and add it if missing
        const columns = db.prepare("PRAGMA table_info(album_items)").all();
        const hasTimestamp = columns.some(col => col.name === 'timestamp');
        
        if (!hasTimestamp) {
            console.log('Adding timestamp column to album_items table');
            try {
                // Add timestamp column
                db.prepare("ALTER TABLE album_items ADD COLUMN timestamp INTEGER").run();
                
                // Update existing records with current timestamp
                const now = Date.now();
                db.prepare("UPDATE album_items SET timestamp = ? WHERE timestamp IS NULL").run(now);
            } catch (error) {
                console.error('Error updating album_items schema:', error);
            }
        }
    }
    
    // Fix missing IDs in existing albums
    migrateAlbumIds();
    
    console.log('Database initialized');
}

// Function to migrate existing albums to have proper IDs
function migrateAlbumIds() {
    try {
        console.log('Checking for albums with missing or null IDs...');
        const albums = db.prepare("SELECT rowid, * FROM album_items").all();
        let updatedCount = 0;
        
        for (const album of albums) {
            if (!album.id || album.id === 'null' || album.id === 'undefined') {
                console.log(`Found album with missing ID: ${JSON.stringify(album)}`);
                // Create a new unique ID based on timestamp + rowid to ensure uniqueness
                const newId = Date.now() + '-' + album.rowid;
                
                // Update the album with the new ID
                db.prepare('UPDATE album_items SET id = ? WHERE rowid = ?').run(newId, album.rowid);
                console.log(`Updated album ID for rowid ${album.rowid} to ${newId}`);
                updatedCount++;
            }
        }
        
        console.log(`Album ID migration complete. Updated ${updatedCount} albums.`);
    } catch (error) {
        console.error('Error migrating album IDs:', error);
    }
}

// Initialize database
initializeDb();

// Create requests table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, username TEXT NOT NULL, text TEXT NOT NULL, designType TEXT NOT NULL, idName TEXT NOT NULL, time TEXT NOT NULL, timestamp INTEGER NOT NULL);
`);

// Create anti_tamper_logs table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS anti_tamper_logs (id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, message TEXT NOT NULL);
`);

// Create album_items table if it doesn't exist - first drop the existing table if there's a mismatch
try {
    console.log('Checking if album_items table structure needs to be updated...');
    // Check if the table exists and has the right columns
    const tableInfo = db.prepare("PRAGMA table_info(album_items)").all();
    
    // Check if timestamp column exists
    const hasTimestamp = tableInfo.some(column => column.name === 'timestamp');
    if (!hasTimestamp && tableInfo.length > 0) {
        console.log('album_items table exists but is missing timestamp column, dropping and recreating...');
        db.prepare('DROP TABLE album_items').run();
        console.log('Dropped album_items table');
    }
} catch (error) {
    console.error('Error checking/fixing album_items table structure:', error);
}

// Create album_items table with correct structure
db.exec(`
    CREATE TABLE IF NOT EXISTS album_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        imageUrl TEXT NOT NULL,
        acc TEXT NOT NULL,
        pw TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    );
`);

// Check if album_items table exists and has the correct structure
try {
    console.log('Checking album_items table structure...');
    const tableInfo = db.prepare("PRAGMA table_info(album_items)").all();
    console.log('album_items table info:', tableInfo);
    if (tableInfo.length === 0) {
        console.error('album_items table does not exist or has no columns');
    }
} catch (error) {
    console.error('Error checking album_items table:', error);
}

// Add initial album if table is empty
try {
    const albumCount = db.prepare('SELECT COUNT(*) as count FROM album_items').get().count;
    console.log(`Current album count: ${albumCount}`);
    
    if (albumCount === 0) {
        console.log('Adding sample album to album_items');
        const now = Date.now();
        const sampleAlbum = {
            id: now.toString(),
            name: 'Sample Album',
            imageUrl: '',
            acc: 'SAMPLE-ACC-001',
            pw: 'SAMPLE-PW-001',
            timestamp: now
        };
        
        db.prepare('INSERT INTO album_items (id, name, imageUrl, acc, pw, timestamp) VALUES (?, ?, ?, ?, ?, ?)')
          .run(sampleAlbum.id, sampleAlbum.name, sampleAlbum.imageUrl, sampleAlbum.acc, sampleAlbum.pw, sampleAlbum.timestamp);
    }
} catch (error) {
    console.error('Error adding sample album:', error);
}

// Add initial Amo request if table is empty
const initialRequestCount = db.prepare('SELECT COUNT(*) as count FROM requests').get().count;
if (initialRequestCount === 0) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;
    const initialAmoRequest = {
        id: Date.now().toString(),
        username: 'Amo',
        text: 'Amo\'s initial fixed request.',
        designType: 'owner',
        idName: 'Amo',
        time: time,
        timestamp: now.getTime()
    };
    db.prepare('INSERT INTO requests (id, username, text, designType, idName, time, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(initialAmoRequest.id, initialAmoRequest.username, initialAmoRequest.text, initialAmoRequest.designType, initialAmoRequest.idName, initialAmoRequest.time, initialAmoRequest.timestamp);
}

app.use(express.json()); // For parsing application/json

// API Endpoints
app.get('/api/requests', (req, res) => {
    const requests = db.prepare('SELECT * FROM requests ORDER BY timestamp DESC').all();
    res.json(requests);
});

// New API endpoint for anti-tamper logs
app.get('/api/anti-tamper-logs', (req, res) => {
    const logs = db.prepare('SELECT * FROM anti_tamper_logs ORDER BY timestamp DESC').all();
    res.json(logs);
});

// New API endpoint to clear anti-tamper logs
app.delete('/api/anti-tamper-logs', (req, res) => {
    const result = db.prepare('DELETE FROM anti_tamper_logs').run();
    console.log(`Cleared ${result.changes} anti-tamper logs.`);
    io.emit('antiTamperLogsCleared'); // Notify clients that logs have been cleared
    res.status(200).json({ message: `Cleared ${result.changes} anti-tamper logs.` });
});

// New API endpoint to delete a single anti-tamper log
app.delete('/api/anti-tamper-logs/:id', (req, res) => {
    const idToDelete = String(req.params.id); // Ensure ID is a string
    console.log(`Server: Received DELETE request for anti-tamper log with ID: ${idToDelete}`);
    try {
        const stmt = db.prepare('DELETE FROM anti_tamper_logs WHERE id = ?');
        const result = stmt.run(idToDelete);
        
        if (result.changes > 0) {
            console.log(`Server: Successfully deleted anti-tamper log with ID: ${idToDelete}. Changes: ${result.changes}`);
            io.emit('antiTamperNotification'); // Trigger re-render for all clients
            res.status(200).json({ message: `Anti-tamper log ${idToDelete} deleted successfully` });
        } else {
            console.log(`Server: Failed to delete anti-tamper log with ID: ${idToDelete}. Log not found or no changes.`);
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

app.post('/api/albums', checkAuth, (req, res) => {
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
        const stmt = db.prepare('INSERT INTO album_items (id, name, imageUrl, acc, pw, timestamp) VALUES (?, ?, ?, ?, ?, ?)');
        const result = stmt.run(id, name, imageUrl, acc, pw, timestamp);
        
        if (result) {
            // Get the newly created album
            const newAlbum = db.prepare('SELECT * FROM album_items WHERE id = ?').get(id);
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

app.post('/api/requests', (req, res) => {
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
    db.prepare('INSERT INTO requests (id, username, text, designType, idName, time, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newRequest.id, newRequest.username, newRequest.text, newRequest.designType, newRequest.idName, newRequest.time, newRequest.timestamp);

    io.emit('requestAdded', newRequest); // Broadcast new request to all clients with consistent event name
    res.status(201).json(newRequest);
});

app.delete('/api/requests/:id', (req, res) => {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM requests WHERE id = ?').run(id);
    if (result.changes > 0) {
        io.emit('requestDeleted', id); // Broadcast deleted request ID with consistent event name
        res.status(200).json({ message: 'Request deleted successfully' });
    } else {
        res.status(404).json({ message: 'Request not found' });
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
            
            db.prepare('INSERT INTO anti_tamper_logs (id, timestamp, message) VALUES (?, ?, ?)')
              .run(logId, Date.now(), notificationMessage);
              
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

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Ensure database connection is closed on application exit
process.on('SIGINT', () => {
    console.log('Server is shutting down. Closing database connection...');
    db.close();
    process.exit(0);
});

process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}. Ensuring database is closed.`);
    db.close();
});

// GET /api/albums - Get all album items
app.get('/api/albums', (req, res) => {
    try {
        const albums = db.prepare('SELECT * FROM album_items ORDER BY timestamp DESC').all();
        res.json(albums);
    } catch (error) {
        console.error('Error fetching albums:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// PUT /api/albums/:id - Update an album
app.put('/api/albums/:id', checkAuth, (req, res) => {
    try {
        const { id } = req.params;
        const { name, imageUrl, acc, pw } = req.body;
        
        // Check if album exists
        const album = db.prepare('SELECT * FROM album_items WHERE id = ?').get(id);
        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }
        
        // Update the album
        const stmt = db.prepare(
            'UPDATE album_items SET name = ?, imageUrl = ?, acc = ?, pw = ?, timestamp = ? WHERE id = ?'
        );
        
        // Keep the original timestamp for sorting consistency or update if needed
        // Updating timestamp would move the item to the front of the list
        const timestamp = Date.now(); // Update timestamp to make it the newest
        
        stmt.run(
            name || album.name,
            imageUrl !== undefined ? imageUrl : album.imageUrl,
            acc !== undefined ? acc : album.acc,
            pw !== undefined ? pw : album.pw,
            timestamp,
            id
        );
        
        // Get the updated album
        const updatedAlbum = db.prepare('SELECT * FROM album_items WHERE id = ?').get(id);
        
        // Broadcast update
        broadcastAlbumUpdate();
        
        res.json(updatedAlbum);
    } catch (error) {
        console.error('Error updating album:', error);
        res.status(500).json({ error: 'Database error: ' + error.message });
    }
});

// DELETE /api/albums/:id - Delete an album
app.delete('/api/albums/:id', checkAuth, (req, res) => {
    try {
        const { id } = req.params;
        console.log('Delete album');
        
        if (!id) {
            return res.status(400).json({ error: 'Album ID is required' });
        }
        
        // Check if album exists
        console.log('Checking album');
        const album = db.prepare('SELECT * FROM album_items WHERE id = ?').get(id);
        
        if (!album) {
            console.log('Not found');
            return res.status(404).json({ error: 'Album not found' });
        }
        
        console.log('Found album');
        
        // Delete the album
        const result = db.prepare('DELETE FROM album_items WHERE id = ?').run(id);
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
app.get('/api/maintenance/fix-album-ids', checkAuth, (req, res) => {
    try {
        console.log('Running album ID fix from maintenance endpoint...');
        const albums = db.prepare("SELECT rowid, * FROM album_items").all();
        let updatedCount = 0;
        
        // Create transaction for batch update
        const update = db.prepare('UPDATE album_items SET id = ? WHERE rowid = ?');
        
        db.transaction(() => {
            for (const album of albums) {
                // Always update all albums with a new ID
                const newId = Date.now() + '-' + album.rowid;
                update.run(newId, album.rowid);
                console.log(`Set ID for album "${album.name}" (rowid: ${album.rowid}) to ${newId}`);
                updatedCount++;
            }
        })();
        
        // Broadcast update to all clients
        broadcastAlbumUpdate();
        
        res.json({ 
            success: true, 
            message: `Album IDs fixed: ${updatedCount} albums updated.`,
            albums: db.prepare("SELECT * FROM album_items ORDER BY timestamp DESC").all()
        });
    } catch (error) {
        console.error('Error fixing album IDs:', error);
        res.status(500).json({ error: 'Error fixing album IDs: ' + error.message });
    }
});

// API Endpoint for reporting albums
app.post('/api/report-album', (req, res) => {
    try {
        const { albumId, albumName, reportedBy, message } = req.body;
        
        if (!albumId || !albumName || !reportedBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Create a unique ID for the report
        const logId = Date.now().toString();
        
        // Create anti-tamper log entry for the report
        db.prepare('INSERT INTO anti_tamper_logs (id, timestamp, message) VALUES (?, ?, ?)')
          .run(logId, Date.now(), message || `Album reported: "${albumName}" by ${reportedBy}`);
        
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