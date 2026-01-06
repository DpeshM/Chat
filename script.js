class WiFiChat {
    constructor() {
        this.peers = {};
        this.localConnection = null;
        this.dataChannel = null;
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.state = {
            isHost: false,
            roomName: '',
            username: '',
            deviceId: this.generateDeviceId(),
            users: new Set()
        };
        
        this.init();
    }
    
    generateDeviceId() {
        return 'device-' + Math.random().toString(36).substr(2, 9);
    }
    
    init() {
        this.setupEventListeners();
        this.updateDeviceId();
        this.setupNetworkDiscovery();
    }
    
    setupEventListeners() {
        // Setup buttons
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('clearChatBtn').addEventListener('click', () => this.clearChat());
        document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyJoinLink());
        
        // Input validation
        document.getElementById('username').addEventListener('input', (e) => {
            this.state.username = e.target.value.trim();
        });
        
        document.getElementById('roomName').addEventListener('input', (e) => {
            this.state.roomName = e.target.value.trim();
        });
    }
    
    updateDeviceId() {
        document.getElementById('deviceId').textContent = this.state.deviceId;
    }
    
    setupNetworkDiscovery() {
        // Try to use WebRTC for local network discovery
        this.broadcastPresence();
    }
    
    broadcastPresence() {
        // Periodically broadcast presence using localStorage (works on same origin)
        setInterval(() => {
            if (this.state.roomName) {
                const presence = {
                    type: 'presence',
                    deviceId: this.state.deviceId,
                    username: this.state.username,
                    room: this.state.roomName,
                    timestamp: Date.now()
                };
                localStorage.setItem('wifi_chat_presence', JSON.stringify(presence));
            }
        }, 3000);
        
        // Listen for other devices
        window.addEventListener('storage', (e) => {
            if (e.key === 'wifi_chat_presence') {
                try {
                    const presence = JSON.parse(e.newValue);
                    if (presence.room === this.state.roomName && presence.deviceId !== this.state.deviceId) {
                        this.handlePresence(presence);
                    }
                } catch (error) {
                    console.error('Error parsing presence:', error);
                }
            }
        });
    }
    
    handlePresence(presence) {
        if (!this.state.users.has(presence.deviceId)) {
            this.state.users.add(presence.deviceId);
            this.updateUserList();
            this.showNotification(`${presence.username || 'Unknown'} joined the room`);
        }
    }
    
    createRoom() {
        const username = document.getElementById('username').value.trim();
        const roomName = document.getElementById('roomName').value.trim();
        
        if (!username) {
            this.showNotification('Please enter your name');
            return;
        }
        
        if (!roomName) {
            this.showNotification('Please enter a room name');
            return;
        }
        
        this.state.username = username;
        this.state.roomName = roomName;
        this.state.isHost = true;
        
        this.startChat();
        this.showNotification(`Room "${roomName}" created! Share the room name with others.`);
    }
    
    joinRoom() {
        const username = document.getElementById('username').value.trim();
        const roomName = document.getElementById('roomName').value.trim();
        
        if (!username) {
            this.showNotification('Please enter your name');
            return;
        }
        
        if (!roomName) {
            this.showNotification('Please enter a room name');
            return;
        }
        
        this.state.username = username;
        this.state.roomName = roomName;
        this.state.isHost = false;
        
        this.startChat();
        this.showNotification(`Joined room "${roomName}"`);
    }
    
    startChat() {
        // Update UI
        document.getElementById('setupPanel').style.display = 'none';
        document.getElementById('chatContainer').style.display = 'flex';
        document.getElementById('currentRoom').textContent = this.state.roomName;
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('statusIndicator').classList.add('connected');
        
        // Add yourself to users list
        this.state.users.add(this.state.deviceId);
        this.updateUserList();
        
        // Setup signaling simulation using localStorage
        this.setupSignaling();
    }
    
    setupSignaling() {
        // Use localStorage as a simple signaling mechanism
        setInterval(() => {
            this.broadcastSignal({
                type: 'chat',
                sender: this.state.deviceId,
                username: this.state.username,
                room: this.state.roomName,
                action: 'heartbeat'
            });
        }, 2000);
        
        // Listen for signals
        window.addEventListener('storage', (e) => {
            if (e.key === 'wifi_chat_signals') {
                try {
                    const signal = JSON.parse(e.newValue);
                    if (signal.room === this.state.roomName && signal.sender !== this.state.deviceId) {
                        this.handleSignal(signal);
                    }
                } catch (error) {
                    console.error('Error parsing signal:', error);
                }
            }
        });
    }
    
    broadcastSignal(signal) {
        localStorage.setItem('wifi_chat_signals', JSON.stringify(signal));
        setTimeout(() => {
            localStorage.removeItem('wifi_chat_signals');
        }, 100);
    }
    
    handleSignal(signal) {
        switch (signal.action) {
            case 'heartbeat':
                if (!this.state.users.has(signal.sender)) {
                    this.state.users.add(signal.sender);
                    this.updateUserList();
                    this.showNotification(`${signal.username} joined the room`);
                }
                break;
                
            case 'message':
                this.displayMessage({
                    sender: signal.sender,
                    username: signal.username,
                    content: signal.content,
                    timestamp: signal.timestamp,
                    type: 'received'
                });
                break;
                
            case 'user_left':
                this.state.users.delete(signal.sender);
                this.updateUserList();
                this.showNotification(`${signal.username} left the room`);
                break;
        }
    }
    
    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content) return;
        
        // Create message object
        const message = {
            type: 'chat',
            sender: this.state.deviceId,
            username: this.state.username,
            room: this.state.roomName,
            action: 'message',
            content: content,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        // Broadcast to other devices
        this.broadcastSignal(message);
        
        // Display locally
        this.displayMessage({
            sender: this.state.deviceId,
            username: this.state.username,
            content: content,
            timestamp: message.timestamp,
            type: 'sent'
        });
        
        // Clear input
        input.value = '';
        input.focus();
    }
    
    displayMessage(message) {
        const messagesDiv = document.getElementById('messages');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type}`;
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-sender">${message.username}</span>
                <span class="message-time">${message.timestamp}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message.content)}</div>
        `;
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // Update user count
        this.updateUserCount();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    updateUserList() {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';
        
        this.state.users.forEach(deviceId => {
            const username = deviceId === this.state.deviceId ? `${this.state.username} (You)` : 'User';
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-user"></i> ${username}`;
            usersList.appendChild(li);
        });
        
        this.updateUserCount();
    }
    
    updateUserCount() {
        document.getElementById('userCount').textContent = this.state.users.size;
    }
    
    clearChat() {
        document.getElementById('messages').innerHTML = '';
    }
    
    leaveRoom() {
        // Notify other users
        this.broadcastSignal({
            type: 'chat',
            sender: this.state.deviceId,
            username: this.state.username,
            room: this.state.roomName,
            action: 'user_left'
        });
        
        // Reset state
        this.state.users.clear();
        this.state.roomName = '';
        this.state.isHost = false;
        
        // Update UI
        document.getElementById('chatContainer').style.display = 'none';
        document.getElementById('setupPanel').style.display = 'block';
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('statusIndicator').classList.remove('connected');
        document.getElementById('messages').innerHTML = '';
        document.getElementById('usersList').innerHTML = '';
        
        this.showNotification('Left the room');
    }
    
    copyJoinLink() {
        const roomInfo = {
            room: this.state.roomName,
            host: window.location.href
        };
        
        navigator.clipboard.writeText(
            `Join WiFi Chat Room: ${this.state.roomName}\n` +
            `Open ${window.location.href} and enter room name: "${this.state.roomName}"`
        ).then(() => {
            this.showNotification('Join instructions copied to clipboard!');
        });
    }
    
    showNotification(message, duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }
}

// Initialize the chat when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new WiFiChat();
});
