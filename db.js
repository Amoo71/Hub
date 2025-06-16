import { io } from 'https://cdn.socket.io/4.3.2/socket.io.esm.min.js';

let loggedInUser = null;

// =====================================================================
// SICHERHEITSHINWEIS
// =====================================================================
// Die Benutzerkonten werden jetzt sicher auf dem Server gespeichert
// und nicht mehr im Frontend-Code, um die Sicherheit zu erhöhen.
// Neue Benutzer müssen über den Server konfiguriert werden.
// =====================================================================

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
            // Update timestamp only if user is active (not just checking session)
            const isActiveCheck = new Error().stack.includes('trackUserActivity');
            if (isActiveCheck) {
                setLoggedInUser(user); // This will update the timestamp only on actual activity
            }
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
    console.log('New request received');
    if (requestUpdateCallback) requestUpdateCallback();
});

socket.on('requestDeleted', (deletedRequestId) => {
    console.log('Request deletion notification received');
    if (requestUpdateCallback) requestUpdateCallback();
});

socket.on('sessionInvalidated', (data) => {
    console.log('Session invalidated by server:', data?.message || 'Your session was invalidated');
    // Force logout by clearing the user data
    logoutUser();
    // Redirect to login page if not already there
    if (window.location.pathname !== '/login.html') {
        window.location.href = 'login.html?reason=session_invalidated';
    }
});

socket.on('anti_tamper_notification', (notification) => {
    console.log('Anti-tamper notification received:', notification);
    if (antiTamperNotificationCallback) antiTamperNotificationCallback(notification);
});

socket.on('anti_tamper_logs_cleared', () => {
    console.log('Anti-tamper logs cleared notification received');
    if (antiTamperNotificationCallback) antiTamperNotificationCallback();
});

socket.on('albumItemsChanged', () => {
    console.log('Album items update notification received');
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
        console.log('Registering session with server');
        
        // Only register if we have a valid session
        if (user && user.securityId) {
            // Emit the register session event to the server
            socket.emit('register_session', user);
            
            // Set up automatic re-registration if the socket reconnects
            // Remove previous listener first to avoid duplicates
            socket.off('reconnect');
            socket.on('reconnect', () => {
                console.log('Socket reconnected, re-registering session');
                const currentUser = getLoggedInUser();
                if (currentUser && currentUser.securityId) {
                    socket.emit('register_session', currentUser);
                }
            });
            
            return true;
        } else {
            console.warn('Cannot register session: Missing user data or securityId');
            return false;
        }
    } catch (error) {
        console.error('Session registration error:', error);
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