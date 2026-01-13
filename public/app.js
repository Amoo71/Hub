// Security: All sensitive operations are done server-side
// Client only stores JWT token in memory (not localStorage to prevent XSS)

class VaultApp {
    constructor() {
        this.token = null;
        this.isAdmin = false;
        this.currentCredential = null;
        this.editMode = null;
        this.credentials = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
    }

    setupEventListeners() {
        // Gate code input - check after 1.5 seconds
        const gateInput = document.getElementById('gate-code-input');
        let gateTimeout;
        
        gateInput.addEventListener('input', () => {
            clearTimeout(gateTimeout);
            if (gateInput.value.length > 0) {
                gateTimeout = setTimeout(() => {
                    this.handleMainAuth();
                }, 1500);
            }
        });
        
        gateInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(gateTimeout);
                this.handleMainAuth();
            }
        });

        // Settings button
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showAdminModal();
        });

        // Admin modal
        document.getElementById('admin-cancel').addEventListener('click', () => {
            this.hideAdminModal();
        });
        
        document.getElementById('admin-submit').addEventListener('click', () => {
            this.handleAdminAuth();
        });

        // Admin code input - check after 1.5 seconds
        const adminInput = document.getElementById('admin-code-input');
        let adminTimeout;
        
        adminInput.addEventListener('input', () => {
            clearTimeout(adminTimeout);
            if (adminInput.value.length > 0) {
                adminTimeout = setTimeout(() => {
                    this.handleAdminAuth();
                }, 1500);
            }
        });
        
        adminInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(adminTimeout);
                this.handleAdminAuth();
            }
        });

        // Add button
        document.getElementById('add-btn').addEventListener('click', () => {
            this.showEditModal('add');
        });

        // Detail modal
        document.getElementById('detail-close').addEventListener('click', () => {
            this.hideDetailModal();
        });

        document.getElementById('detail-edit').addEventListener('click', () => {
            if (this.currentCredential) {
                this.editMode = 'edit';
                this.showEditModal('edit', this.currentCredential);
            }
        });

        document.getElementById('detail-delete').addEventListener('click', () => {
            this.deleteCredential(this.currentCredential.id);
        });

        document.getElementById('detail-report').addEventListener('click', () => {
            this.reportCredential(this.currentCredential.id);
        });

        document.getElementById('detail-clear-report').addEventListener('click', () => {
            this.clearReport(this.currentCredential.id);
        });

        // Copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const type = e.currentTarget.getAttribute('data-copy');
                this.copyToClipboard(type, e);
            });
        });

        // Edit modal
        document.getElementById('edit-close').addEventListener('click', () => {
            this.hideEditModal();
        });

        document.getElementById('edit-cancel').addEventListener('click', () => {
            this.hideEditModal();
        });

        document.getElementById('edit-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveCredential();
        });

        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    checkAuth() {
        // On page load, show gate screen
        // Token is stored in memory only for security
    }

    async handleMainAuth() {
        const code = document.getElementById('gate-code-input').value;
        const errorEl = document.getElementById('gate-error');
        
        if (!code) {
            errorEl.textContent = 'Please enter a code';
            return;
        }

        try {
            const response = await fetch('/api/auth/main', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.showVault();
                this.loadCredentials();
            } else {
                errorEl.textContent = data.error || 'Invalid code';
                document.getElementById('gate-code-input').value = '';
            }
        } catch (err) {
            errorEl.textContent = 'Connection error';
        }
    }

    showVault() {
        document.getElementById('code-gate').style.display = 'none';
        document.getElementById('vault-screen').style.display = 'block';
    }

    async loadCredentials() {
        try {
            const response = await fetch('/api/credentials', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.credentials = await response.json();
                this.renderCredentials();
            }
        } catch (err) {
            console.error('Failed to load credentials');
        }
    }

    renderCredentials() {
        const grid = document.getElementById('credentials-grid');
        grid.innerHTML = '';

        this.credentials.forEach((cred, index) => {
            const card = document.createElement('div');
            card.className = 'credential-card' + (cred.reported ? ' reported' : '');
            card.dataset.id = cred.id;
            card.dataset.index = index;
            
            // Make draggable for admin
            if (this.isAdmin) {
                card.draggable = true;
                card.classList.add('draggable');
                this.setupDragAndDrop(card);
            }
            
            card.onclick = (e) => {
                // Don't open if dragging
                if (!card.classList.contains('dragging')) {
                    this.showDetailModal(cred.id);
                }
            };
            
            card.innerHTML = `
                <img src="${this.escapeHtml(cred.cover)}" alt="Cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 200%22%3E%3Crect fill=%22%23333%22 width=%22400%22 height=%22200%22/%3E%3C/svg%3E'" />
                ${this.isAdmin ? '<div class="drag-handle">⋮⋮</div>' : ''}
            `;
            
            grid.appendChild(card);
        });
    }

    setupDragAndDrop(card) {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', card.innerHTML);
        });

        card.addEventListener('dragend', (e) => {
            card.classList.remove('dragging');
            this.saveOrder();
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.dragging');
            if (draggingCard && draggingCard !== card) {
                const grid = document.getElementById('credentials-grid');
                const allCards = [...grid.querySelectorAll('.credential-card:not(.dragging)')];
                const nextCard = allCards.find(c => {
                    const box = c.getBoundingClientRect();
                    const offset = e.clientY - box.top - box.height / 2;
                    return offset < 0;
                });
                
                if (nextCard) {
                    grid.insertBefore(draggingCard, nextCard);
                } else {
                    grid.appendChild(draggingCard);
                }
            }
        });
    }

    async saveOrder() {
        const grid = document.getElementById('credentials-grid');
        const cards = [...grid.querySelectorAll('.credential-card')];
        const newOrder = cards.map(card => card.dataset.id);
        
        // Reorder credentials array
        const orderedCredentials = [];
        newOrder.forEach(id => {
            const cred = this.credentials.find(c => c.id === id);
            if (cred) orderedCredentials.push(cred);
        });
        this.credentials = orderedCredentials;
        
        // Save to server
        try {
            const response = await fetch('/api/credentials/order', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ order: newOrder })
            });
            
            if (response.ok) {
                console.log('Order saved to server');
            }
        } catch (err) {
            console.error('Failed to save order:', err);
        }
    }

    async showDetailModal(id) {
        try {
            const response = await fetch(`/api/credentials/${id}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const cred = await response.json();
                this.currentCredential = cred;
                
                document.getElementById('detail-cover').src = cred.cover;
                document.getElementById('detail-acc').textContent = cred.acc;
                document.getElementById('detail-pass').textContent = '********';
                
                // Show report status
                const reportStatus = document.getElementById('report-status');
                if (cred.reported) {
                    reportStatus.textContent = 'Already reported';
                    document.getElementById('detail-report').disabled = true;
                } else {
                    reportStatus.textContent = '';
                    document.getElementById('detail-report').disabled = false;
                }
                
                // Show admin actions if admin
                if (this.isAdmin) {
                    document.getElementById('detail-admin-actions').style.display = 'flex';
                    if (cred.reported) {
                        document.getElementById('detail-clear-report').style.display = 'block';
                    } else {
                        document.getElementById('detail-clear-report').style.display = 'none';
                    }
                }
                
                document.getElementById('detail-modal').style.display = 'flex';
            }
        } catch (err) {
            console.error('Failed to load credential details');
        }
    }

    hideDetailModal() {
        document.getElementById('detail-modal').style.display = 'none';
        // Don't clear currentCredential here - it might be needed for edit
        // this.currentCredential = null;
    }

    showAdminModal() {
        if (this.isAdmin) {
            return;
        }
        document.getElementById('admin-modal').style.display = 'flex';
        document.getElementById('admin-code-input').value = '';
        document.getElementById('admin-error').textContent = '';
    }

    hideAdminModal() {
        document.getElementById('admin-modal').style.display = 'none';
    }

    async handleAdminAuth() {
        const code = document.getElementById('admin-code-input').value;
        const errorEl = document.getElementById('admin-error');
        
        if (!code) {
            errorEl.textContent = 'Please enter admin code';
            return;
        }

        try {
            const response = await fetch('/api/auth/admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.isAdmin = true;
                this.hideAdminModal();
                document.getElementById('add-btn').style.display = 'flex';
                // Reload credentials to show drag handles
                this.loadCredentials();
            } else {
                errorEl.textContent = data.error || 'Invalid admin code';
                document.getElementById('admin-code-input').value = '';
            }
        } catch (err) {
            errorEl.textContent = 'Connection error';
        }
    }

    async reportCredential(id) {
        try {
            const response = await fetch(`/api/credentials/${id}/report`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                alert('Thank you for reporting. Admin will be notified.');
                this.hideDetailModal();
                this.loadCredentials();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to report credential');
            }
        } catch (err) {
            alert('Connection error');
        }
    }

    async clearReport(id) {
        try {
            const response = await fetch(`/api/credentials/${id}/report`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                alert('Report cleared');
                this.hideDetailModal();
                this.loadCredentials();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to clear report');
            }
        } catch (err) {
            alert('Connection error');
        }
    }

    showEditModal(mode, credential = null) {
        console.log('showEditModal called with mode:', mode, 'credential:', credential);
        
        // Don't close detail modal yet - keep currentCredential
        const currentCred = credential || this.currentCredential;
        
        if (!currentCred && mode === 'edit') {
            alert('Error: No credential selected for editing');
            return;
        }
        
        // Set edit mode and credential BEFORE hiding detail modal
        this.editMode = mode;
        if (mode === 'edit') {
            this.currentCredential = currentCred;
        } else {
            this.currentCredential = null;
        }
        
        console.log('Edit mode set to:', this.editMode, 'currentCredential:', this.currentCredential);
        
        // Now close detail modal
        this.hideDetailModal();
        
        const title = document.getElementById('edit-title');
        const coverInput = document.getElementById('edit-cover');
        const accInput = document.getElementById('edit-acc');
        const passInput = document.getElementById('edit-pass');
        
        if (mode === 'add') {
            title.textContent = 'Add Credential';
            coverInput.value = '';
            accInput.value = '';
            passInput.value = '';
        } else {
            title.textContent = 'Edit Credential';
            coverInput.value = currentCred.cover || '';
            accInput.value = currentCred.acc || '';
            passInput.value = currentCred.pass || '';
        }
        
        document.getElementById('edit-modal').style.display = 'flex';
    }

    hideEditModal() {
        document.getElementById('edit-modal').style.display = 'none';
    }

    async handleSaveCredential() {
        const cover = document.getElementById('edit-cover').value.trim();
        const acc = document.getElementById('edit-acc').value.trim();
        const pass = document.getElementById('edit-pass').value.trim();
        
        if (!cover || !acc || !pass) {
            alert('All fields are required');
            return;
        }

        try {
            let response;
            let url;
            let method;
            
            if (this.editMode === 'add') {
                url = '/api/credentials';
                method = 'POST';
            } else if (this.editMode === 'edit' && this.currentCredential) {
                url = `/api/credentials/${this.currentCredential.id}`;
                method = 'PUT';
            } else {
                alert('Error: Invalid edit mode');
                return;
            }

            response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ cover, acc, pass })
            });

            if (response.ok) {
                alert('Saved successfully!');
                this.hideEditModal();
                await this.loadCredentials();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to save credential');
            }
        } catch (err) {
            console.error('Save error:', err);
            alert('Connection error: ' + err.message);
        }
    }

    async deleteCredential(id) {
        if (!confirm('Are you sure you want to delete this credential?')) {
            return;
        }

        try {
            const response = await fetch(`/api/credentials/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                this.hideDetailModal();
                this.loadCredentials();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to delete credential');
            }
        } catch (err) {
            alert('Connection error');
        }
    }

    async copyToClipboard(type, event) {
        if (!this.currentCredential) {
            alert('Error: No credential loaded');
            return;
        }
        
        try {
            let textToCopy = '';
            
            if (type === 'acc') {
                textToCopy = this.currentCredential.acc;
            } else if (type === 'pass') {
                textToCopy = this.currentCredential.pass;
            }
            
            if (!textToCopy) {
                alert('Error: Nothing to copy');
                return;
            }
            
            // Use the Clipboard API with fallback
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                // Fallback for non-HTTPS or older browsers
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    textArea.remove();
                } catch (err) {
                    textArea.remove();
                    throw err;
                }
            }
            
            // Visual feedback
            const btn = event ? event.target.closest('.copy-btn') : null;
            if (btn) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<span style="font-size:12px;">✓</span>';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                }, 1000);
            }
        } catch (err) {
            console.error('Copy error:', err);
            alert('Failed to copy to clipboard: ' + err.message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new VaultApp();
    });
} else {
    new VaultApp();
}

// Security: Prevent right-click and DevTools shortcuts in production
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    document.addEventListener('contextmenu', e => e.preventDefault());
    
    document.addEventListener('keydown', e => {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'u')) {
            e.preventDefault();
            return false;
        }
    });
}
