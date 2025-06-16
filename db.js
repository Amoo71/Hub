import { io } from 'https://cdn.socket.io/4.3.2/socket.io.esm.min.js';

let loggedInUser = null;

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
};

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
}

// Socket.IO client setup - verbessert für Vercel-Kompatibilität
console.log("Verbinde mit Socket.IO auf", window.location.origin);
const socketOptions = {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5
};
const socket = io(window.location.origin, socketOptions);

// Log Socket.IO Verbindungsstatus
socket.on('connect', () => {
    console.log('Socket.IO verbunden:', socket.id);
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO Verbindungsfehler:', error);
});

socket.on('disconnect', (reason) => {
    console.log('Socket.IO getrennt:', reason);
});

export function setRequestUpdateCallback(callback) {
    requestUpdateCallback = callback;
}

export function setAntiTamperNotificationCallback(callback) {
    antiTamperNotificationCallback = callback;
}

// Listen for real-time events from server
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

export async function addRequest(request) {
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

export async function deleteRequest(id) {
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

export async function registerSessionWithServer(user) {
    try {
        console.log('Registering');
        
        // Emit the register session event to the server - use correct event name
        socket.emit('register_session', user);
        
        return true;
    } catch (error) {
        console.error('Register error');
        return false;
    }
}

export async function getAntiTamperLogs() {
    try {
        const response = await fetch('/api/anti-tamper-logs', {
            headers: {
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
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
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        return false;
    }
}

export async function deleteAntiTamperLog(id) {
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
        
        return true;
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        return false;
    }
}

export async function getAlbumItems() {
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

export async function addAlbumItem(albumItem) {
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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Unknown error');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error adding album item:', error);
        throw error;
    }
}

export async function updateAlbumItem(id, albumItem) {
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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Unknown error');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating album item:', error);
        throw error;
    }
}

export async function deleteAlbumItem(id) {
    try {
        const response = await fetch(`/api/album-items/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Unknown error');
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting album item:', error);
        throw error;
    }
} 