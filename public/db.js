import { io } from 'https://cdn.socket.io/4.3.2/socket.io.esm.min.js';

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

export const userAccounts = {
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

export function setAlbumItemUpdateCallback(callback) {
    albumItemUpdateCallback = callback;
}

export function getLoggedInUser() {
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

export function setLoggedInUser(user) {
    loggedInUser = user;
    const timestamp = Date.now();
    sessionStorage.setItem('loggedInSession', JSON.stringify({ user, timestamp }));
}

export function logoutUser() {
    loggedInUser = null;
    sessionStorage.removeItem('loggedInSession');
    // Removed sessionStorage.removeItem('requests') as requests are server-managed
}

// Socket.IO client setup
const socket = io();

export function setRequestUpdateCallback(callback) {
    requestUpdateCallback = callback;
}

export function setAntiTamperNotificationCallback(callback) {
    antiTamperNotificationCallback = callback;
}

// Listen for real-time events from server
socket.on('requestUpdate', (requests) => {
    console.log('Request update received');
    if (requestUpdateCallback) requestUpdateCallback();
});

socket.on('albumUpdate', (albums) => {
    console.log('Album update received');
    if (albumItemUpdateCallback) albumItemUpdateCallback();
});

socket.on('session_invalidated', () => {
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

socket.on('authResult', (result) => {
    console.log('Authentication result:', result);
    // Handle authentication result if needed
});

socket.on('requestResult', (result) => {
    console.log('Request result:', result);
    // Handle request result if needed
});

socket.on('albumItemResult', (result) => {
    console.log('Album item result:', result);
    // Handle album item result if needed
});

socket.on('deleteAlbumItemResult', (result) => {
    console.log('Delete album item result:', result);
    // Handle delete album item result if needed
});

export async function getRequests() {
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

export async function addRequest(text) {
    try {
        const securityId = getSessionToken();
        if (!securityId) {
            throw new Error('Not authenticated');
        }
        
        // Use socket.io to send the request
        socket.emit('newRequest', { text, securityId });
        
        return true;
    } catch (error) {
        console.error('Add request error:', error);
        throw error;
    }
}

export async function deleteRequest(id) {
    try {
        const response = await fetch(`/api/requests/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getSessionToken() || ''
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

export async function registerSessionWithServer(user) {
    try {
        console.log('Registering');
        
        // Emit the authenticate event to the server with the user data
        socket.emit('authenticate', {
            username: user.username,
            securityId: user.securityId,
            designType: user.designType,
            idName: user.idName
        });
        
        return true;
    } catch (error) {
        console.error('Register error');
        return false;
    }
}

export async function getAntiTamperLogs() {
    try {
        const response = await fetch('/api/anti-tamper-logs');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        return [];
    }
}

export async function clearAntiTamperLogs() {
    try {
        const response = await fetch('/api/anti-tamper-logs', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getSessionToken() || ''
            }
        });
        
        const data = await response.json();
        console.log('Logs cleared');
        return data;
    } catch (error) {
        console.error('Clear logs error');
        throw error;
    }
}

export async function deleteAntiTamperLog(id) {
    try {
        const response = await fetch(`/api/anti-tamper-logs/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getSessionToken() || ''
            }
        });
        
        const data = await response.json();
        console.log('Log deleted');
        return data;
    } catch (error) {
        console.error('Delete log error');
        throw error;
    }
}

export async function getAlbumItems() {
    try {
        const response = await fetch('/api/albums');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error in getAlbumItems:', error);
        return [];
    }
}

export async function addAlbumItem(albumItem) {
    try {
        const securityId = getSessionToken();
        if (!securityId) {
            throw new Error('Not authenticated');
        }
        
        // Use socket.io to send the album item
        socket.emit('newAlbumItem', {
            name: albumItem.name,
            imageUrl: albumItem.imageUrl,
            acc: albumItem.acc,
            pw: albumItem.pw,
            securityId
        });
        
        return true;
    } catch (error) {
        console.error('Add album item error:', error);
        throw error;
    }
}

export async function updateAlbumItem(id, albumItem) {
    try {
        const response = await fetch(`/api/albums/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getSessionToken() || ''
            },
            body: JSON.stringify(albumItem)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Album item updated');
        return data;
    } catch (error) {
        console.error('Update album item error:', error);
        throw error;
    }
}

export async function deleteAlbumItem(id) {
    try {
        const securityId = getSessionToken();
        if (!securityId) {
            throw new Error('Not authenticated');
        }
        
        // Use socket.io to delete the album item
        socket.emit('deleteAlbumItem', { id, securityId });
        
        return true;
    } catch (error) {
        console.error('Delete album item error:', error);
        throw error;
    }
}

export async function reportAlbum(albumId, albumName, message) {
    try {
        const user = getLoggedInUser();
        if (!user) {
            throw new Error('Not authenticated');
        }
        
        const response = await fetch('/api/report-album', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': user.securityId || ''
            },
            body: JSON.stringify({
                albumId,
                albumName,
                reportedBy: user.idName,
                message: message || `Album reported: "${albumName}" by ${user.idName}`
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Album reported');
        return data;
    } catch (error) {
        console.error('Report album error:', error);
        throw error;
    }
} 