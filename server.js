const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
// Supabase statt SQLite
const { createClient } = require('@supabase/supabase-js');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Store active sessions: { securityId: { socketId: string, username: string, idName: string, designType: string } }
const activeSessions = new Map();
// Store mapping from socketId to securityId for easier cleanup on disconnect
const socketIdToSecurityId = {};

const PORT = process.env.PORT || 3000;

// Supabase client initialisieren
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
async function initializeDb() {
    try {
        // Create requests table
        await supabase.rpc('create_requests_table_if_not_exists');
        
        // Create anti_tamper_logs table
        await supabase.rpc('create_anti_tamper_logs_table_if_not_exists');
        
        // Create album_items table
        await supabase.rpc('create_album_items_table_if_not_exists');
        
        console.log('Database initialized');
        
        // Check if album_items table has any data
        const { data: albumCount, error: albumCountError } = await supabase
            .from('album_items')
            .select('id', { count: 'exact' });
            
        if (!albumCountError && (!albumCount || albumCount.length === 0)) {
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
            
            await supabase.from('album_items').insert([sampleAlbum]);
        }
        
        // Check if requests table has any data
        const { data: requestsCount, error: requestsCountError } = await supabase
            .from('requests')
            .select('id', { count: 'exact' });
            
        if (!requestsCountError && (!requestsCount || requestsCount.length === 0)) {
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
            
            await supabase.from('requests').insert([initialAmoRequest]);
        }
        
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Initialize database
initializeDb();

// Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname));

// API routes
app.get('/api/requests', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('requests')
            .select('*')
            .order('timestamp', { ascending: false });
            
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/requests', async (req, res) => {
    try {
        const { id, username, text, designType, idName, time, timestamp } = req.body;
        
        if (!id || !username || !text || !designType || !idName || !time || !timestamp) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const { data, error } = await supabase
            .from('requests')
            .insert([{ id, username, text, designType, idName, time, timestamp }]);
            
        if (error) throw error;
        
        // Broadcast the new request to all connected clients
        broadcastRequestUpdate();
        
        res.json({ success: true, id });
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/requests/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        const { data, error } = await supabase
            .from('requests')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        // Broadcast the deletion to all connected clients
        broadcastRequestUpdate();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Anti-tamper logs API routes
app.get('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('anti_tamper_logs')
            .select('*')
            .order('timestamp', { ascending: false });
            
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        const { id, message } = req.body;
        const timestamp = Date.now();
        
        const { data, error } = await supabase
            .from('anti_tamper_logs')
            .insert([{ id, message, timestamp }]);
            
        if (error) throw error;
        
        // Notify all clients
        io.emit('antiTamperNotification', message);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding anti-tamper log:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/anti-tamper-logs/:id', checkAuth, async (req, res) => {
    try {
        const id = req.params.id;
        
        const { data, error } = await supabase
            .from('anti_tamper_logs')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        // Notify all clients
        io.emit('antiTamperNotification', 'Log entry deleted');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/anti-tamper-logs', checkAuth, async (req, res) => {
    try {
        const { error } = await supabase
            .from('anti_tamper_logs')
            .delete()
            .neq('id', 'dummy'); // Delete all records
            
        if (error) throw error;
        
        // Notify all clients
        io.emit('antiTamperLogsCleared');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Album items API routes
app.get('/api/album-items', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('album_items')
            .select('*')
            .order('timestamp', { ascending: false });
            
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        console.error('Error fetching album items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/album-items', async (req, res) => {
    try {
        const { name, imageUrl, acc, pw } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const timestamp = Date.now();
        const id = timestamp.toString();
        
        const albumItem = {
            id,
            name,
            imageUrl: imageUrl || '',
            acc: acc || 'Empty',
            pw: pw || 'Empty',
            timestamp
        };
        
        const { data, error } = await supabase
            .from('album_items')
            .insert([albumItem]);
            
        if (error) throw error;
        
        // Broadcast update to all clients
        broadcastAlbumUpdate();
        
        res.json({ success: true, id });
    } catch (error) {
        console.error('Error adding album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/album-items/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { name, imageUrl, acc, pw } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        const { data, error } = await supabase
            .from('album_items')
            .update({
                name,
                imageUrl: imageUrl || '',
                acc: acc || 'Empty',
                pw: pw || 'Empty'
            })
            .eq('id', id);
            
        if (error) throw error;
        
        // Broadcast update to all clients
        broadcastAlbumUpdate();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/album-items/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        const { data, error } = await supabase
            .from('album_items')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        // Broadcast update to all clients
        broadcastAlbumUpdate();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Handle session registration
    socket.on('register_session', (userData) => {
        const { securityId, username, designType, idName } = userData;
        
        if (securityId) {
            // Store session data
            activeSessions.set(securityId, {
                socketId: socket.id,
                username,
                designType,
                idName
            });
            
            // Map socket ID to security ID for easier cleanup
            socketIdToSecurityId[socket.id] = securityId;
            
            console.log(`User ${username} registered session`);
        }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        
        // Clean up session data
        const securityId = socketIdToSecurityId[socket.id];
        if (securityId) {
            activeSessions.delete(securityId);
            delete socketIdToSecurityId[socket.id];
        }
    });
});

// Helper function to broadcast request updates
function broadcastRequestUpdate() {
    io.emit('requestAdded');
}

function broadcastAlbumUpdate() {
    io.emit('albumItemsChanged');
}

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 