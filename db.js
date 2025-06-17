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
let chatMessageUpdateCallback = () => {};

export function setAlbumItemUpdateCallback(callback) {
    albumItemUpdateCallback = callback;
}

export function setRequestUpdateCallback(callback) {
    requestUpdateCallback = callback;
}

export function setAntiTamperNotificationCallback(callback) {
    antiTamperNotificationCallback = callback;
}

export function setChatMessageUpdateCallback(callback) {
    chatMessageUpdateCallback = callback;
}

// Socket.IO client setup
const socket = io();

// Heartbeat interval to keep session alive (every 30 seconds)
let heartbeatInterval = null;

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
    // Stop heartbeat
    stopHeartbeat();
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

socket.on('chatMessageAdded', (message) => {
    console.log('New chat message received');
    if (chatMessageUpdateCallback) chatMessageUpdateCallback();
});

socket.on('chatMessageDeleted', (deletedMessageId) => {
    console.log('Chat message deletion notification received');
    if (chatMessageUpdateCallback) chatMessageUpdateCallback();
});

socket.on('chatMessagesExpired', () => {
    console.log('Chat messages expired notification received');
    if (chatMessageUpdateCallback) chatMessageUpdateCallback();
});

// Start sending heartbeats to keep the session alive
function startHeartbeat(securityId) {
    // Clear any existing heartbeat interval
    stopHeartbeat();
    
    // Set up new heartbeat interval (every 30 seconds)
    heartbeatInterval = setInterval(() => {
        const user = getLoggedInUser();
        if (user && user.securityId) {
            // Send heartbeat to server
            // WICHTIG: Wir senden nur den Heartbeat, aktualisieren aber NICHT den Timestamp
            // Dadurch wird die Inaktivitätserkennung nicht zurückgesetzt
            socket.emit('heartbeat', user.securityId);
        } else {
            // If no user is logged in, stop the heartbeat
            stopHeartbeat();
        }
    }, 30000); // 30 seconds
}

// Stop sending heartbeats
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

export function getLoggedInUser() {
    const storedSession = sessionStorage.getItem('loggedInSession');
    if (storedSession) {
        try {
            const { user, timestamp } = JSON.parse(storedSession);
            const now = Date.now();
            const threeMinutes = 3 * 60 * 1000; // 3 minutes in milliseconds

            if (now - timestamp < threeMinutes) {
                // Update the timestamp to extend the session
                loggedInUser = user;
                return loggedInUser;
            } else {
                console.log('Session expired due to 3-minute inactivity timeout');
                logoutUser();
                return null;
            }
        } catch (error) {
            console.error('Error parsing stored session:', error);
            logoutUser();
            return null;
        }
    }
    loggedInUser = null;
    return null;
}

export function setLoggedInUser(user) {
    if (!user) return;
    
    loggedInUser = user;
    const timestamp = Date.now();
    sessionStorage.setItem('loggedInSession', JSON.stringify({ user, timestamp }));
}

export function logoutUser() {
    // Stop heartbeat when logging out
    stopHeartbeat();
    
    // Clear user data
    loggedInUser = null;
    sessionStorage.removeItem('loggedInSession');
}

export async function registerSessionWithServer(user) {
    try {
        console.log('Registering session with server');
        
        // Only register if we have a valid session
        if (user && user.securityId) {
            // Emit the register session event to the server
            socket.emit('register_session', user);
            
            // Start heartbeat to keep session alive
            startHeartbeat(user.securityId);
            
            // Set up automatic re-registration if the socket reconnects
            // Remove previous listener first to avoid duplicates
            socket.off('reconnect');
            socket.on('reconnect', () => {
                console.log('Socket reconnected, re-registering session');
                const currentUser = getLoggedInUser();
                if (currentUser && currentUser.securityId) {
                    socket.emit('register_session', currentUser);
                    // Restart heartbeat
                    startHeartbeat(currentUser.securityId);
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
        const sessionToken = getSessionToken();
        
        if (!sessionToken) {
            console.error('Authentication required for album deletion');
            return { error: 'Authentication required' };
        }
        
        const response = await fetch(`/api/albums/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401 || response.status === 403) {
            alert('You are not authorized to delete albums');
            return { error: 'Authentication required' };
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error deleting album:', error);
        return { error: error.message };
    }
}

export async function getChatMessages() {
    try {
        const response = await fetch('/api/chat-messages');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        return [];
    }
}

export async function addChatMessage(message) {
    try {
        const user = getLoggedInUser();
        
        if (!user) {
            return { error: 'Authentication required' };
        }
        
        const { username, text } = message;
        
        if (!text || text.trim() === '') {
            return { error: 'Message text cannot be empty' };
        }
        
        const messageData = {
            username: username || user.idName,
            text: text.trim(),
            designType: user.designType,
            idName: user.idName
        };

        const response = await fetch('/api/chat-messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messageData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error adding chat message:', error);
        return { error: error.message };
    }
}

export async function deleteChatMessage(id) {
    try {
        const response = await fetch(`/api/chat-messages/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error deleting chat message:', error);
        return { error: error.message };
    }
}

// User authentication function
export async function authenticateUser(securityId) {
    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ securityId })
        });

        if (!response.ok) {
            return { error: 'Authentication failed' };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Authentication error:', error);
        return { error: 'Authentication service unavailable' };
    }
}

// Function to check for inactivity and logout if needed
export function checkInactivity() {
    const storedSession = sessionStorage.getItem('loggedInSession');
    if (storedSession) {
        try {
            const { timestamp } = JSON.parse(storedSession);
            const now = Date.now();
            const threeMinutes = 3 * 60 * 1000; // 3 minutes in milliseconds

            if (now - timestamp >= threeMinutes) {
                console.log('User inactive for 3 minutes, logging out');
                logoutUser();
                return true; // Benutzer wurde aufgrund Inaktivität ausgeloggt
            }
        } catch (error) {
            console.error('Error processing stored session:', error);
        }
    }
    return false; // Benutzer ist noch aktiv oder nicht eingeloggt
} 