/* Client-seitige Datenbank-Schnittstelle (ohne direkte Socket.io-Abhängigkeit) */

let loggedInUser = null;

// =====================================================================
// BENUTZER-KONFIGURATION
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

// Session-Token abrufen
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

// Simulierte Socket.io-Kommunikation für Serverless-Umgebung
console.log("Socket.io-Simulation wird initialisiert für Serverless-Umgebung");

// Wir verwenden eine einfache Polling-Strategie, um Updates zu erhalten
class ServerlessSocketSimulation {
    constructor() {
        this.eventHandlers = {};
        this.connected = false;
        this.id = 'sim-' + Date.now();
        this.pollInterval = 5000; // 5 Sekunden
        this.pollTimeoutId = null;
        
        // Bei Start direkt verbinden
        this.connect();
    }
    
    connect() {
        this.connected = true;
        console.log("Socket.io-Simulation verbunden mit ID:", this.id);
        
        // Polling starten für Event-Prüfung (bei Bedarf)
        this.startPolling();
        
        // Emit connect event
        this._triggerEvent('connect');
    }
    
    startPolling() {
        // In einer vollständigen Implementierung würden wir hier 
        // regelmäßig den Server nach neuen Events fragen
        if (this.pollTimeoutId) clearTimeout(this.pollTimeoutId);
        
        const poll = async () => {
            if (!this.connected) return;
            
            try {
                // Hier könnte ein API-Endpoint abgefragt werden, der Events zurückgibt
                // In diesem Fall simulieren wir das Verhalten
                console.log("Socket.io-Simulation: Polling für Events");
                
                // Nächstes Polling planen
                this.pollTimeoutId = setTimeout(poll, this.pollInterval);
                
            } catch (error) {
                console.error("Socket.io-Simulation: Polling-Fehler", error);
                // Bei Fehler trotzdem weiter pollen
                this.pollTimeoutId = setTimeout(poll, this.pollInterval);
            }
        };
        
        // Ersten Poll starten
        this.pollTimeoutId = setTimeout(poll, this.pollInterval);
    }
    
    on(eventName, callback) {
        if (!this.eventHandlers[eventName]) {
            this.eventHandlers[eventName] = [];
        }
        this.eventHandlers[eventName].push(callback);
        console.log(`Socket.io-Simulation: Event-Handler für '${eventName}' registriert`);
    }
    
    emit(eventName, data) {
        if (eventName === 'register_session') {
            console.log("Sende Sitzung an Server", data);
            // Simulierter Server-Empfang
            this._triggerEvent('session_registered', { success: true });
            
            // Bei einer vollständigen Implementierung würden wir hier einen API-Call machen
            fetch('/socket-io-emulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: eventName, data })
            }).catch(err => console.error("Socket.io-Emulation API-Fehler:", err));
        }
        
        return true;
    }
    
    _triggerEvent(eventName, data) {
        const handlers = this.eventHandlers[eventName] || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Socket.io-Simulation: Fehler beim Auslösen des Events '${eventName}'`, error);
            }
        });
    }
}

// Socket.io-Simulation erstellen
const socket = new ServerlessSocketSimulation();

export function setRequestUpdateCallback(callback) {
    requestUpdateCallback = callback;
}

export function setAntiTamperNotificationCallback(callback) {
    antiTamperNotificationCallback = callback;
}

// Listen for real-time events (simuliert) 
socket.on('requestAdded', (newRequest) => {
    console.log('New request event');
    if (requestUpdateCallback) requestUpdateCallback();
});

socket.on('requestDeleted', (deletedRequestId) => {
    console.log('Request deleted event');
    if (requestUpdateCallback) requestUpdateCallback();
});

socket.on('sessionInvalidated', () => {
    console.log('Session invalid event');
    localStorage.removeItem('loggedInUser');
    if (window.location.pathname !== '/login.html') {
        window.location.href = 'login.html';
    }
});

socket.on('antiTamperNotification', (message) => {
    console.log('Security alert event');
    if (antiTamperNotificationCallback) antiTamperNotificationCallback(message);
});

socket.on('antiTamperLogsCleared', () => {
    console.log('Logs cleared event');
    if (antiTamperNotificationCallback) antiTamperNotificationCallback();
});

socket.on('albumItemsChanged', () => {
    console.log('Albums updated event');
    if (albumItemUpdateCallback) albumItemUpdateCallback();
});

// Manuelle Event-Auslösung bei API-Calls
function triggerEvent(eventName, data) {
    if (socket && socket._triggerEvent) {
        socket._triggerEvent(eventName, data);
        return true;
    }
    return false;
}

// API-Funktionen
export async function getRequests() {
    try {
        console.log("API-Aufruf: Anfragen abrufen");
        const response = await fetch('/api/requests');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`${data.length} Anfragen erhalten`);
        return data;
    } catch (error) {
        console.error('Error fetching requests:', error);
        throw error;
    }
}

export async function addRequest(request) {
    try {
        console.log("API-Aufruf: Anfrage hinzufügen", request);
        const response = await fetch('/api/requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            },
            body: JSON.stringify(request)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Request added:', data);
        
        // Lokale Event-Auslösung
        triggerEvent('requestAdded', data);
        
        return data;
    } catch (error) {
        console.error('Add request error:', error);
        throw error;
    }
}

export async function deleteRequest(id) {
    try {
        console.log("API-Aufruf: Anfrage löschen", id);
        const response = await fetch(`/api/requests/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Request deleted:', data);
        
        // Lokale Event-Auslösung
        triggerEvent('requestDeleted', id);
        
        return data;
    } catch (error) {
        console.error('Delete request error:', error);
        throw error;
    }
}

export async function registerSessionWithServer(user) {
    try {
        console.log('Registering session with server', user);
        
        // Simulierte Socket-Registrierung
        socket.emit('register_session', user);
        
        return true;
    } catch (error) {
        console.error('Register session error:', error);
        return false;
    }
}

export async function getAntiTamperLogs() {
    try {
        console.log("API-Aufruf: Anti-Tamper-Logs abrufen");
        const response = await fetch('/api/anti-tamper-logs');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`${data.length} Anti-Tamper-Logs erhalten`);
        return data;
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        throw error;
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
        console.log("API-Aufruf: Album-Items abrufen");
        const response = await fetch('/api/album-items');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`${data.length} Album-Items erhalten`);
        return data;
    } catch (error) {
        console.error('Error fetching album items:', error);
        throw error;
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