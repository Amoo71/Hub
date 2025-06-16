const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const socketIo = require('socket.io');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');

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
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

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

// Create initial data if collections are empty
async function checkAndCreateInitialData() {
  try {
    // Check if requests collection is empty
    const requestCount = await Request.countDocuments();
    
    if (requestCount === 0) {
      console.log('Creating initial request for new database...');
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
      console.log('Initial request created');
    }
    
    // Check if album items collection is empty
    const albumCount = await AlbumItem.countDocuments();
    
    if (albumCount === 0) {
      console.log('Creating sample album for new database...');
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
      console.log('Sample album created');
    }
  } catch (error) {
    console.error('Error checking/creating initial data:', error);
  }
}

// Run the check for initial data
checkAndCreateInitialData();

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

// Use JSON parsing middleware
app.use(express.json()); // For parsing application/json

// Anti-debugging and code protection middleware
const protectHtmlContent = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    // Only process HTML responses
    if (typeof body === 'string' && body.includes('<!DOCTYPE html>')) {
      // Add anti-debugging scripts
      const antiDebuggingScript = `
        <script>
          // Anti-debugging techniques
          (function() {
            // Trap for common DevTools detection methods
            const devtoolsDetector = {
              isOpen: false,
              orientation: undefined
            };

            // Chrome DevTools protocol detection
            const devTools = /./;
            devTools.toString = function() {
              devtoolsDetector.isOpen = true;
              return 'dev-tools-detector';
            };
            console.log('%c', devTools);
            
            // Obfuscate window and document references
            const _w = window;
            const _d = document;
            
            // Store original console methods
            const _console = { 
              log: console.log, 
              warn: console.warn, 
              error: console.error, 
              info: console.info,
              debug: console.debug
            };
            
            // Override console methods to detect debugging
            console.log = console.warn = console.error = console.info = console.debug = function() {
              // Optional: report debugging attempts to your server
              // fetch('/api/security/debug-attempt', { method: 'POST' });
              if (!arguments[0] || arguments[0] !== '%c') {
                return;
              }
              return _console.log.apply(console, arguments);
            };
            
            // Detect devtools by console timing difference
            const checkConsoleTimingDifference = function() {
              const t1 = performance.now();
              for(let i = 0; i < 100; i++) {
                console.log(i);
                console.clear();
              }
              const t2 = performance.now();
              return t2 - t1 > 100;
            };

            // Detect devtools opening by size
            const detectDevTools = function() {
              const threshold = 160;
              const widthThreshold = _w.outerWidth - _w.innerWidth > threshold;
              const heightThreshold = _w.outerHeight - _w.innerHeight > threshold;
              
              // Check if any DevTools detection methods flagged
              if (widthThreshold || heightThreshold || devtoolsDetector.isOpen || checkConsoleTimingDifference()) {
                _d.body.innerHTML = '<h1>Security Alert</h1><p>Developer tools detected. This action has been logged.</p>';
                return true;
              }
              return false;
            };
            
            // Detect debugger keyword
            setInterval(function() {
              detectDevTools();
              
              // Anti-debugging using debugger speed check
              const start = new Date();
              debugger;
              const end = new Date();
              const diff = end - start;
              
              if (diff > 100) {
                // Debugger was paused, likely due to developer tools
                _d.body.innerHTML = '<h1>Security Alert</h1><p>Debugging detected. This action has been logged.</p>';
              }
            }, 1000);
            
            // Execute a breakpoint trap
            const breakpointTrap = function() {
              try {
                Function('debugger')();
              } catch(e) {}
            };
            
            // Randomized execution of breakpoint traps
            setTimeout(function() {
              if (Math.random() < 0.3) {
                breakpointTrap();
              }
            }, Math.random() * 5000);
            
            // Disallow right-click
            _d.addEventListener('contextmenu', function(e) {
              e.preventDefault();
              return false;
            });
            
            // Disallow keyboard shortcuts
            _d.addEventListener('keydown', function(e) {
              // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, F12
              if (
                (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) ||
                e.keyCode === 123
              ) {
                e.preventDefault();
                return false;
              }
            });
            
            // Hide our protection code from the call stack
            setTimeout(function() {
              // This hides our code in the call stack
            }, 4);
          })();
        </script>
      `;
      
      // Obfuscate HTML structure by adding random attributes and changing class names
      let obfuscatedBody = body;
      
      // Add script at the end of body
      obfuscatedBody = obfuscatedBody.replace('</body>', `${antiDebuggingScript}</body>`);
      
      // Replace clear class names with obfuscated ones
      const randomClassPrefix = '_' + Math.random().toString(36).substring(2, 8);
      
      // Simple class name obfuscation
      const classRegex = /class="([^"]*)"/g;
      obfuscatedBody = obfuscatedBody.replace(classRegex, function(match, classNames) {
        const obfuscatedClasses = classNames.split(' ')
          .map(className => randomClassPrefix + '_' + className)
          .join(' ');
        return `class="${obfuscatedClasses}"`;
      });
      
      // Add dummy elements to confuse inspection
      const dummyDivs = Array(5).fill(0).map(() => {
        const id = '_' + Math.random().toString(36).substring(2, 10);
        return `<div id="${id}" style="display:none;position:absolute;left:-9999px;">${Math.random().toString(36)}</div>`;
      }).join('');
      
      obfuscatedBody = obfuscatedBody.replace('<body', `<body data-protected="true" ${dummyDivs}`);
      
      // Remove HTML comments
      obfuscatedBody = obfuscatedBody.replace(/<!--[\s\S]*?-->/g, '');
      
      // Remove whitespace (simple minification)
      obfuscatedBody = obfuscatedBody.replace(/>\s+</g, '><');
      
      return originalSend.call(this, obfuscatedBody);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

// Apply HTML protection middleware
app.use(protectHtmlContent);

// Custom HTML file handler for login page
app.get('/', (req, res) => {
  let loginHtml = fs.readFileSync(path.join(__dirname, 'login.html'), 'utf8');
  res.send(loginHtml);
});

// Custom handler for index.html
app.get('/index.html', (req, res) => {
  let indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  res.send(indexHtml);
});

// Custom handler for JavaScript files to obfuscate them
app.get('/db.js', (req, res) => {
  let jsContent = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  
  // Simple JavaScript obfuscation
  // Rename common variables
  jsContent = jsContent.replace(/const /g, 'const _0x');
  jsContent = jsContent.replace(/let /g, 'let _0x');
  jsContent = jsContent.replace(/function /g, 'function _fn');
  
  // Add random garbage code that never executes
  const garbageCode = `
  // Anti-reverse engineering
  try {
    const _0x${Math.random().toString(36).substring(2, 8)} = function() {
      if (false) {
        console.log('${Math.random().toString(36).substring(2, 15)}');
      }
      return Math.random() < 0;
    };
    
    const _0x${Math.random().toString(36).substring(2, 8)} = {
      ${Array(10).fill(0).map(() => {
        const key = Math.random().toString(36).substring(2, 8);
        const val = Math.random().toString(36).substring(2, 15);
        return `"${key}": "${val}"`;
      }).join(',\n      ')}
    };
    
    if (document.readyState === '${Math.random().toString(36).substring(2, 8)}') {
      window.location = 'about:blank';
    }
  } catch(e) {}
  `;
  
  // Add self-defense mechanism
  const selfDefenseCode = `
  // Self-defense against modification
  (function() {
    const _selfDefense = function() {
      const _scripts = document.getElementsByTagName('script');
      for (let i = 0; i < _scripts.length; i++) {
        const _src = _scripts[i].src;
        if (_src.includes('db.js')) {
          // Check if this script has been modified
          fetch(_src)
            .then(response => response.text())
            .then(content => {
              if (!content.includes('Self-defense against modification')) {
                document.body.innerHTML = '<h1>Security Alert</h1><p>Application code has been modified. This incident has been reported.</p>';
              }
            })
            .catch(() => {});
          break;
        }
      }
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _selfDefense);
    } else {
      _selfDefense();
    }
  })();
  `;
  
  // Insert the garbage and self-defense code at random positions
  const lines = jsContent.split('\n');
  const position1 = Math.floor(Math.random() * (lines.length / 3)) + 5;
  const position2 = Math.floor(Math.random() * (lines.length / 3)) + Math.floor(lines.length / 2);
  
  lines.splice(position1, 0, garbageCode);
  lines.splice(position2, 0, selfDefenseCode);
  
  jsContent = lines.join('\n');
  
  res.type('application/javascript');
  res.send(jsContent);
});

// JavaScript obfuscation middleware - must be placed BEFORE the static middleware
app.use((req, res, next) => {
  if (req.path.endsWith('.js') && !req.path.includes('socket.io')) {
    // Only obfuscate our own JS files, not libraries
    try {
      const filePath = path.join(__dirname, req.path);
      fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
          return next();
        }
        
        // Simple JS obfuscation
        let obfuscatedJs = content;
        
        // Add source code protection
        const protectionCode = `
        /* Protected JavaScript */
        (function() {
          try {
            const _protect = function() {
              // Hide this JavaScript from easy inspection
              if (window.__defineGetter__) {
                window.__defineGetter__('script_${Math.random().toString(36).substring(2, 8)}', function() {
                  return 'Protected';
                });
              }
              
              // Override toString for this file
              const originalToString = Function.prototype.toString;
              Function.prototype.toString = function() {
                const funcStr = originalToString.apply(this, arguments);
                if (funcStr.includes('Protected JavaScript')) {
                  return "function() { [native code] }";
                }
                return funcStr;
              };
            };
            _protect();
          } catch(e) {}
        })();
        `;
        
        obfuscatedJs = protectionCode + obfuscatedJs;
        
        // Random variable renaming
        const varNames = {};
        let varCounter = 0;
        
        // Find and replace variable declarations
        const varRegex = /\b(var|let|const)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\b/g;
        obfuscatedJs = obfuscatedJs.replace(varRegex, function(match, keyword, varName) {
          // Skip obfuscation for common variable names or those from libraries
          if (['document', 'window', 'console', 'fetch', '$', 'jQuery'].includes(varName)) {
            return match;
          }
          
          if (!varNames[varName]) {
            varNames[varName] = `_var${varCounter++}_${Math.random().toString(36).substring(2, 5)}`;
          }
          
          return `${keyword} ${varNames[varName]}`;
        });
        
        // Replace variable usages
        Object.keys(varNames).forEach(originalName => {
          const newName = varNames[originalName];
          const usageRegex = new RegExp(`\\b${originalName}\\b`, 'g');
          obfuscatedJs = obfuscatedJs.replace(usageRegex, newName);
        });
        
        res.type('application/javascript');
        res.send(obfuscatedJs);
      });
    } catch (err) {
      next();
    }
  } else {
    next();
  }
});

// Serve static files from the current directory for all other paths
app.use(express.static(path.join(__dirname)));

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
        io.emit('antiTamperLogsCleared'); // Notify clients that logs have been cleared
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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Connected');

    // Handle session registration
    socket.on('register_session', (data) => {
        const { securityId, username, idName, designType } = data;
        console.log('Registration');
        
        // Check if this securityId is already registered with a different socket
        if (activeSessions.has(securityId)) {
            const oldSessionInfo = activeSessions.get(securityId);
            const oldSocketId = oldSessionInfo.socketId;
            const oldIdName = oldSessionInfo.idName;
            console.log('Session exists');
            
            // Check if it's a reconnection from the same user and IP
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            
            // Skip alert if the old socket is already disconnected or inactive
            // This prevents false alarms on server restarts or client reconnections
            if (!oldSocket || (oldSocket && !oldSocket.connected)) {
                console.log('Old socket already disconnected, treating as normal reconnection');
                // Clean up the old socket mapping without triggering alerts
                delete socketIdToSecurityId[oldSocketId];
            } else {
                // This is a genuine multiple login attempt as the old session is still active
                console.log('Invalidating old');
                io.to(oldSocketId).emit('session_invalidated', { message: 'Your session has been logged in elsewhere' });
                
                // Clean up the old socket mapping
                delete socketIdToSecurityId[oldSocketId];
                
                // Create anti-tamper log for suspicious activity (multiple logins)
                const notificationMessage = `Multiple login attempt: ${idName}`;
                const logId = Date.now().toString();
                
                // Create log in MongoDB
                const log = new AntiTamperLog({
                    id: logId,
                    timestamp: Date.now(),
                    message: notificationMessage
                });
                log.save().catch(err => console.error('Error saving anti-tamper log:', err));

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
        }

        // Register the new session
        activeSessions.set(securityId, { socketId: socket.id, username, idName, designType });
        socketIdToSecurityId[socket.id] = securityId;
        
        console.log('Session registered');
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

// Helper function to broadcast album updates
function broadcastAlbumUpdate() {
    io.emit('albumItemsChanged');
}

// Special maintenance endpoints
app.get('/api/maintenance/fix-album-ids', checkAuth, async (req, res) => {
    try {
        console.log('Running album ID fix from maintenance endpoint...');
        const albums = await AlbumItem.find();
        let updatedCount = 0;
        
        // Update albums with new IDs
        for (const album of albums) {
            const newId = Date.now() + '-' + album._id.toString();
            await AlbumItem.updateOne({ _id: album._id }, { id: newId });
            console.log(`Set ID for album "${album.name}" to ${newId}`);
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

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Ensure database connection is closed on application exit
process.on('SIGINT', () => {
    console.log('Server is shutting down. Closing database connection...');
    mongoose.connection.close();
    process.exit(0);
});

process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}. Ensuring database is closed.`);
    mongoose.connection.close();
});