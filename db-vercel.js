// db-vercel.js - Angepasste Version für Vercel ohne Socket.IO

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

export function setRequestUpdateCallback(callback) {
    requestUpdateCallback = callback;
}

export function setAntiTamperNotificationCallback(callback) {
    antiTamperNotificationCallback = callback;
}

// Polling function to replace Socket.IO
let pollingInterval = null;
let pollingErrors = 0;
const MAX_ERRORS = 5;

export function startPolling() {
    if (pollingInterval) return;
    
    console.log('Starting polling for updates...');
    
    // Sofort erste Abfrage durchführen
    if (requestUpdateCallback) {
        getRequests()
            .then(data => {
                if (data && data.length >= 0) {
                    console.log(`Initial poll: Loaded ${data.length} requests`);
                    requestUpdateCallback(data);
                    pollingErrors = 0;
                }
            })
            .catch(err => {
                console.error('Error in initial polling:', err);
                pollingErrors++;
            });
    }
    
    if (albumItemUpdateCallback) {
        getAlbumItems()
            .then(data => {
                if (data && data.length >= 0) {
                    console.log(`Initial poll: Loaded ${data.length} album items`);
                    albumItemUpdateCallback(data);
                    pollingErrors = 0;
                }
            })
            .catch(err => {
                console.error('Error in initial album polling:', err);
                pollingErrors++;
            });
    }
    
    pollingInterval = setInterval(() => {
        if (pollingErrors > MAX_ERRORS) {
            console.error(`Too many polling errors (${pollingErrors}). Stopping polling.`);
            stopPolling();
            return;
        }
        
        if (requestUpdateCallback) {
            getRequests()
                .then(data => {
                    if (data && data.length >= 0) {
                        requestUpdateCallback(data);
                        pollingErrors = 0;
                    }
                })
                .catch(err => {
                    console.error('Error in polling:', err);
                    pollingErrors++;
                });
        }
        
        if (albumItemUpdateCallback) {
            getAlbumItems()
                .then(data => {
                    if (data && data.length >= 0) {
                        albumItemUpdateCallback(data);
                        pollingErrors = 0;
                    }
                })
                .catch(err => {
                    console.error('Error in album polling:', err);
                    pollingErrors++;
                });
        }
    }, 5000); // Poll every 5 seconds
}

export function stopPolling() {
    console.log('Stopping polling');
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

export async function getRequests() {
    try {
        console.log('Fetching requests...');
        const response = await fetch('/api/requests');
        if (!response.ok) {
            console.error(`Error response: ${response.status} ${response.statusText}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Fetched ${data.length} requests`);
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
        // In serverless, we don't need to register the session with the server
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
        
        const data = await response.json();
        if (antiTamperNotificationCallback) antiTamperNotificationCallback();
        return data;
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        throw error;
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
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        throw error;
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
            throw new Error(`HTTP error! status: ${response.status}`);
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
                'X-Session-Token': getLoggedInUser()?.securityId || ''
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting album item:', error);
        throw error;
    }
} 