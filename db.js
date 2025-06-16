// Socket.io wird über den Server geladen
let socket;

try {
  // Try to connect with multiple transports and fallback options
  socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  socket.on('connect', () => {
    console.log('Socket connected successfully');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('Socket reconnected after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_error', (error) => {
    console.error('Socket reconnection error:', error);
  });
} catch (e) {
  console.error('Error initializing socket:', e);
  // Create a dummy socket object to prevent errors
  socket = {
    emit: () => console.log('Socket not connected - emit ignored'),
    on: () => console.log('Socket not connected - on ignored')
  };
}

let loggedInUser = null;
// Removed local 'requests' array as it's now server-managed
// Removed sessionStorage.getItem('requests') initialization

// =====================================================================
// BENUTZER-KONFIGURATION - EINFACH ZU BEARBEITEN
// =====================================================================
// 
// ANLEITUNG ZUM HINZUFÜGEN NEUER BENUTZER:
// 1. Füge einen neuen Eintrag mit einer eindeutigen Security-ID als Schlüssel hinzu
// 2. Definiere die Eigenschaften: idName, designType
// 3. Speichere die Datei und starte den Server neu
//
// VERFÜGBARE DESIGN-TYPEN:
// - 'owner': Besondere Rechte und Styling (lila Farbverlauf, Glühen, Admin-Zugriff)
// - 'green-member': Grünes Styling ohne Glühen
// - Eigene Typen können definiert werden - füge sie einfach in der CSS-Definition hinzu
//
// BEISPIEL FÜR EINEN NEUEN BENUTZER:
// 'neue-id-123': { idName: 'Neuer-Benutzer', designType: 'custom-style' }
// 
// CSS-STYLING BEFINDET SICH IN index.html:
// - Für owner: .request-username.owner { ... }
// - Für green-member: .request-username.green-member { ... }
// - Für request-item: .request-item.owner, .request-item.green-member { ... }
// =====================================================================

const userAccounts = {
    // Admin-Benutzer
    '1357': { 
        idName: 'Amo',         // Angezeigter Name
        designType: 'owner'     // Design-Typ (bestimmt Styling und Rechte)
    },
    
    // Standard-Benutzer
    'test01': { 
        idName: 'Test-Member 1', 
        designType: 'green-member' 
    },
    
    // Weitere Benutzer hier hinzufügen...
    'testPremium': { 
        idName: 'Test-Premium 1', 
        designType: 'prem-gold-pulse' 
    }
    
    
    // Kopiere diesen Block, um einen neuen Benutzer hinzuzufügen:
    /*
    'security-id': { 
        idName: 'Anzeigename', 
        designType: 'design-typ' 
    },
    */
};

// CSS-STYLING-REFERENZ (aus index.html)
/*
.request-username.owner {
    font-weight: 600;
    background: linear-gradient(135deg, #1a1a2e, #0f3460, #533483, #2d0036, #000, #8e24aa);
    background-size: 400% 400%;
    animation: owner-gradient 3s ease-in-out infinite, request-glow 3s linear infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    border-radius: 6px;
    padding: 2px 10px;
    box-shadow: 0 0 4px 1px #1a1a2e, 0 0 6px 1px #533483, 0 0 3px 1px #2d0036;
}

.request-username.green-member {
    font-weight: 600;
    color: var(--glow-green);
    border-radius: 6px;
    padding: 2px 10px;
}

.request-item.green-member {
    box-shadow: none;
    animation: none;
    border-color: rgba(255, 255, 255, 0.1);
}
*/

// Function to get the current session token (security ID) for authentication
function getSessionToken() {
    const user = getLoggedInUser();
    return user ? user.securityId : null;
}

// Callbacks für Echtzeit-Updates
let albumItemUpdateCallback = () => {};
let requestUpdateCallback = () => {};
let antiTamperNotificationCallback = () => {};

function setAlbumItemUpdateCallback(callback) {
    albumItemUpdateCallback = callback;
}

function getLoggedInUser() {
    const storedSession = sessionStorage.getItem('loggedInSession');
    if (storedSession) {
        const { user, timestamp } = JSON.parse(storedSession);
        const now = Date.now();
        const threeMinutes = 3 * 60 * 1000; // 3 minutes in milliseconds

        if (now - timestamp < threeMinutes) {
            setLoggedInUser(user); // This will update the timestamp
            loggedInUser = user;
            return loggedInUser;
        } else {
            logoutUser();
            return null;
        }
    }
    loggedInUser = null;
    return null;
}

function setLoggedInUser(user) {
    loggedInUser = user;
    const timestamp = Date.now();
    sessionStorage.setItem('loggedInSession', JSON.stringify({ user, timestamp }));
}

function logoutUser() {
    loggedInUser = null;
    sessionStorage.removeItem('loggedInSession');
    // Removed sessionStorage.removeItem('requests') as requests are server-managed
}

function setRequestUpdateCallback(callback) {
    requestUpdateCallback = callback;
}

function setAntiTamperNotificationCallback(callback) {
    antiTamperNotificationCallback = callback;
}

// Listen for real-time events from server
if (socket) {
    socket.on('requestAdded', (newRequest) => {
        console.log('New request');
        if (requestUpdateCallback) requestUpdateCallback();
    });
    
    socket.on('requestDeleted', (deletedRequestId) => {
        console.log('Request deleted');
        if (requestUpdateCallback) requestUpdateCallback();
    });
    
    socket.on('sessionInvalidated', () => {
        console.log('Session invalid');
        // Force logout by clearing the user data
        localStorage.removeItem('loggedInUser');
        if (window.location.pathname !== '/login.html') {
            window.location.href = 'login.html';
        }
    });
    
    socket.on('antiTamperNotification', (message) => {
        console.log('Security alert');
        if (antiTamperNotificationCallback) antiTamperNotificationCallback(message);
    });
    
    socket.on('antiTamperLogsCleared', () => {
        console.log('Logs cleared');
        if (antiTamperNotificationCallback) antiTamperNotificationCallback();
    });
    
    socket.on('albumItemsChanged', () => {
        console.log('Albums updated');
        if (albumItemUpdateCallback) albumItemUpdateCallback();
    });
}

async function getRequests() {
    try {
        const response = await fetch('/api/requests');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching requests:', error);
        return [];
    }
}

async function addRequest(request) {
    try {
        const response = await fetch('/api/requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            },
            body: JSON.stringify(request)
        });
        
        const data = await response.json();
        console.log('Request added');
        return data;
    } catch (error) {
        console.error('Add error');
        throw error;
    }
}

async function deleteRequest(id) {
    try {
        const response = await fetch(`/api/requests/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        const data = await response.json();
        console.log('Request deleted');
        return data;
    } catch (error) {
        console.error('Delete error');
        throw error;
    }
}

async function registerSessionWithServer(user) {
    try {
        console.log('Registering');
        
        if (!socket || !socket.connected) {
            console.error('Socket not connected, cannot register session');
            return false;
        }
        
        // Emit the register session event to the server - use correct event name
        socket.emit('register_session', user);
        
        return true;
    } catch (error) {
        console.error('Register error', error);
        return false;
    }
}

async function getAntiTamperLogs() {
    try {
        const response = await fetch('/api/anti-tamper-logs', {
            headers: {
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (response.status === 403) {
            console.log('Not authorized');
            return { error: 'Unauthorized', logs: [] };
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const logs = await response.json();
        return { logs };
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        return { error: error.message, logs: [] };
    }
}

async function clearAntiTamperLogs() {
    try {
        const response = await fetch('/api/anti-tamper-logs', {
            method: 'DELETE',
            headers: {
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        throw error;
    }
}

async function deleteAntiTamperLog(id) {
    try {
        const response = await fetch(`/api/anti-tamper-logs/${id}`, {
            method: 'DELETE',
            headers: {
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        throw error;
    }
}

async function getAlbumItems() {
    try {
        const response = await fetch('/api/album-items');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching album items:', error);
        return [];
    }
}

async function addAlbumItem(albumItem) {
    try {
        const response = await fetch('/api/album-items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            },
            body: JSON.stringify(albumItem)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add album item');
        }
        
        const data = await response.json();
        console.log('Album added');
        return data;
    } catch (error) {
        console.error('Add album error');
        throw error;
    }
}

async function updateAlbumItem(id, albumItem) {
    try {
        const response = await fetch(`/api/album-items/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            },
            body: JSON.stringify(albumItem)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update album item');
        }
        
        const data = await response.json();
        console.log('Album updated');
        return data;
    } catch (error) {
        console.error('Update album error', error);
        throw error;
    }
}

async function deleteAlbumItem(id) {
    try {
        const response = await fetch(`/api/album-items/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete album item');
        }
        
        const data = await response.json();
        console.log('Album deleted');
        return data;
    } catch (error) {
        console.error('Delete album error');
        throw error;
    }
}

// Export all functions to global scope
window.userAccounts = userAccounts;
window.getSessionToken = getSessionToken;
window.setAlbumItemUpdateCallback = setAlbumItemUpdateCallback;
window.getLoggedInUser = getLoggedInUser;
window.setLoggedInUser = setLoggedInUser;
window.logoutUser = logoutUser;
window.setRequestUpdateCallback = setRequestUpdateCallback;
window.setAntiTamperNotificationCallback = setAntiTamperNotificationCallback;
window.getRequests = getRequests;
window.addRequest = addRequest;
window.deleteRequest = deleteRequest;
window.registerSessionWithServer = registerSessionWithServer;
window.getAntiTamperLogs = getAntiTamperLogs;
window.clearAntiTamperLogs = clearAntiTamperLogs;
window.deleteAntiTamperLog = deleteAntiTamperLog;
window.getAlbumItems = getAlbumItems;
window.addAlbumItem = addAlbumItem;
window.updateAlbumItem = updateAlbumItem;
window.deleteAlbumItem = deleteAlbumItem; 