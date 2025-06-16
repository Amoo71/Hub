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

// User authentication function
export async function authenticateUser(securityId) {
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ securityId })
        });

        if (!response.ok) {
            return null;
        }

        const userData = await response.json();
        return userData;
    } catch (error) {
        console.error('Authentication error:', error);
        return null;
    }
}

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
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        const data = await response.json();
        console.log('Logs cleared');
        return data;
    } catch (error) {
        console.error('Clear error');
        throw error;
    }
}

export async function deleteAntiTamperLog(id) {
    try {
        const response = await fetch(`/api/anti-tamper-logs/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        const data = await response.json();
        console.log('Log deleted');
        return data;
    } catch (error) {
        console.error('Delete error');
        throw error;
    }
}

// Album Item Functions
export async function getAlbumItems() {
    try {
        const response = await fetch('/api/albums');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error fetching albums: ${errorData.error || response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error in getAlbumItems:', error);
        return [];
    }
}

export async function addAlbumItem(albumItem) {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
        console.error('No valid session token found when trying to add album item');
        throw new Error('Authentication required');
    }
    
    try {
        const response = await fetch('/api/albums', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify(albumItem)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to add album: ${errorData.error || response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error in addAlbumItem:', error);
        throw error;
    }
}

export async function updateAlbumItem(id, albumItem) {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
        console.error('No valid session token found when trying to update album item');
        throw new Error('Authentication required');
    }
    
    try {
        const response = await fetch(`/api/albums/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify(albumItem)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update album: ${errorData.error || response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error in updateAlbumItem:', error);
        throw error;
    }
}

export async function deleteAlbumItem(id) {
    try {
        console.log('Deleting album');
        
        // Ensure ID is properly formatted for the request
        const idString = id.toString();
        console.log('ID formatted');
        
        const response = await fetch(`/api/albums/${idString}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete album');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Delete error');
        throw error;
    }
} 