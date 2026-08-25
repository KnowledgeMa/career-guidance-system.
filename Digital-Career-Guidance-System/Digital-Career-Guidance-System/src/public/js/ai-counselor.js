/**
 * AI Counselor - Chat Interface
 * Handles messaging, sessions, and safety features
 */

class AICounselor {
    constructor() {
        this.currentSessionId = 'current';
        this.messages = [];
        this.isLoading = false;
        this.suggestedPrompts = [];
        this.eventSource = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadSessions();
        this.loadSuggestedPrompts();
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.counselorInput = document.getElementById('counselor-input');
        this.sendBtn = document.getElementById('sendBtn');
        this.sessionsList = document.getElementById('sessionsList');
        this.suggestedPromptsContainer = document.getElementById('suggestedPrompts');
        this.safetyBanner = document.getElementById('safetyBanner');
        this.helplineModal = document.getElementById('helplineModal');
        this.menuToggle = document.getElementById('menuToggle');
    }

    attachEventListeners() {
        // Input handling
        this.counselorInput.addEventListener('input', this.handleInput.bind(this));
        this.counselorInput.addEventListener('keydown', this.handleKeydown.bind(this));
        this.sendBtn.addEventListener('click', this.sendMessage.bind(this));

        // Textarea auto-expand
        this.counselorInput.addEventListener('input', () => {
            this.counselorInput.style.height = 'auto';
            this.counselorInput.style.height = Math.min(this.counselorInput.scrollHeight, 120) + 'px';
        });

        // Menu toggle for mobile
        if (this.menuToggle) {
            this.menuToggle.addEventListener('click', this.toggleMenu.bind(this));
        }

        // Scroll to bottom on resize
        window.addEventListener('resize', () => {
            this.scrollToBottom();
        });

        // Stop propagation on modal
        document.getElementById('helplineModal')?.addEventListener('click', (e) => {
            if (e.target === this.helplineModal) {
                this.closeHelplines();
            }
        });
    }

    handleInput(e) {
        const hasText = e.target.value.trim().length > 0;
        this.sendBtn.disabled = !hasText;
    }

    handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.sendBtn.disabled) {
                this.sendMessage();
            }
        }
    }

    async sendMessage() {
        const message = this.counselorInput.value.trim();
        if (!message || this.isLoading) return;

        try {
            this.isLoading = true;
            this.sendBtn.disabled = true;

            // Add user message to chat
            this.addMessage({
                role: 'user',
                content: message,
                timestamp: new Date()
            });

            // Clear input
            this.counselorInput.value = '';
            this.counselorInput.style.height = 'auto';
            this.sendBtn.disabled = true;

            // Show typing indicator
            this.showTypingIndicator();

            // Stream response from API
            await this.streamResponse(message);

        } catch (error) {
            console.error('Error sending message:', error);
            // Error already handled in streamResponse fallback, but ensure cleanup
            this.isLoading = false;
        }
    }

    async streamResponse(message) {
        try {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.getCsrfToken()
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.currentSessionId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let fullResponse = '';
            let assistantMessageAdded = false;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.type === 'start') {
                            // Backend signaled start — remove typing indicator
                            const typing = this.chatMessages.querySelector('.typing-indicator');
                            if (typing) typing.remove();
                        } 
                        else if (parsed.type === 'content') {
                            fullResponse += parsed.content || '';
                            
                            if (!assistantMessageAdded) {
                                const typing = this.chatMessages.querySelector('.typing-indicator');
                                if (typing) typing.remove();
                                
                                this.addMessage({
                                    role: 'assistant',
                                    content: fullResponse,
                                    timestamp: new Date()
                                });
                                assistantMessageAdded = true;
                            } else {
                                this.updateLastMessage(fullResponse);
                            }
                        } 
                        else if (parsed.type === 'safetyFlag') {
                            this.handleSafetyFlag(parsed);
                        } 
                        else if (parsed.type === 'done') {
                            // CRITICAL FIX: Persist the real session UUID
                            if (parsed.sessionId && parsed.sessionId !== 'current') {
                                this.currentSessionId = parsed.sessionId;
                            }
                            if (parsed.metadata?.hasSafetyFlags) {
                                this.safetyBanner.classList.add('show');
                            }
                        } 
                        else if (parsed.type === 'error') {
                            const typing = this.chatMessages.querySelector('.typing-indicator');
                            if (typing) typing.remove();
                            
                            this.addMessage({
                                role: 'assistant',
                                content: parsed.error || 'Sorry, I encountered an error. Please try again.',
                                timestamp: new Date()
                            });
                            assistantMessageAdded = true;
                            break;
                        }
                    } catch (e) {
                        console.error('Error parsing SSE chunk:', e, 'Raw:', line);
                    }
                }
            }

            // Final fallback: if stream ended without ever adding a message
            if (!assistantMessageAdded) {
                const typing = this.chatMessages.querySelector('.typing-indicator');
                if (typing) typing.remove();
                
                this.addMessage({
                    role: 'assistant',
                    content: fullResponse || 'Sorry, I did not receive a response. Please try again.',
                    timestamp: new Date()
                });
            }

            this.scrollToBottom();

        } catch (error) {
            console.error('Stream error:', error);
            const typing = this.chatMessages.querySelector('.typing-indicator');
            if (typing) typing.remove();
            
            this.addMessage({
                role: 'assistant',
                content: 'Sorry, the connection was interrupted. Please try again.',
                timestamp: new Date()
            });
            this.scrollToBottom();
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = this.counselorInput.value.trim().length === 0;
        }
    }

    addMessage(message) {
        this.messages.push(message);

        // Hide suggested prompts when conversation starts
        if (this.suggestedPromptsContainer && this.messages.length > 0) {
            this.suggestedPromptsContainer.style.display = 'none';
        }

        // Remove empty state if first message
        const emptyState = this.chatMessages.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        // Create message element
        const messageEl = this.createMessageElement(message);
        this.chatMessages.appendChild(messageEl);
        this.scrollToBottom();
    }


    createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.role}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = message.role === 'user' ? '👤' : '🎓';

        const wrapper = document.createElement('div');
        wrapper.className = 'message-content-wrapper';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.innerHTML = this.formatMessageContent(message.content);

        const timeEl = document.createElement('div');
        timeEl.className = 'message-time';
        timeEl.textContent = this.formatTime(message.timestamp);

        wrapper.appendChild(bubble);
        wrapper.appendChild(timeEl);

        div.appendChild(avatar);
        div.appendChild(wrapper);

        return div;
    }

    updateLastMessage(content) {
        let lastBubble = this.chatMessages.querySelector('.message.assistant:last-child .message-bubble');
        
        if (!lastBubble) {
            // Create new message if doesn't exist
            this.addMessage({
                role: 'assistant',
                content: content,
                timestamp: new Date()
            });
        } else {
            lastBubble.innerHTML = this.formatMessageContent(content);
        }
    }

    formatMessageContent(content) {
        // Basic markdown-like formatting
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        return `<p>${formatted}</p>`;
    }

    showTypingIndicator() {
        const typing = document.createElement('div');
        typing.className = 'message assistant';
        typing.innerHTML = `
            <div class="message-avatar">🎓</div>
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        this.chatMessages.appendChild(typing);
        this.scrollToBottom();
    }

    handleSafetyFlag(flag) {
        if (flag.confidence > 0.7) {
            this.safetyBanner.classList.add('show');
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 0);
    }

    async loadSessions() {
        try {
            const response = await fetch('/api/chat/sessions', {
                headers: {
                    'X-CSRF-Token': this.getCsrfToken()
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.sessions && data.sessions.length > 0) {
                this.renderSessions(data.sessions);
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    // TEMPORARY: Remove this.escapeHtml calls if you just want it working now
    renderSessions(sessions) {
        const sessionsList = document.getElementById('sessionsList');
        if (!sessionsList) return;

        sessionsList.innerHTML = sessions.map(session => `
            <button 
                class="session-item ${session.id === this.currentSessionId ? 'active' : ''}" 
                onclick="counselor.switchSession('${session.id}')"
                data-session-id="${session.id}"
            >
                <div class="session-title">${session.title || 'Untitled'}</div>
                <div class="session-preview">${session.preview || 'No messages'}</div>
                <div class="session-time">${this.formatSessionTime(session.created_at)}</div>
            </button>
        `).join('');
    }

    async switchSession(sessionId) {
        try {
            const response = await fetch(`/api/chat/sessions/${sessionId}`, {
                headers: {
                    'X-CSRF-Token': this.getCsrfToken()
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            this.currentSessionId = sessionId;
            this.messages = data.messages || [];
            
            this.renderMessages();
            this.updateActiveSession(sessionId);
        } catch (error) {
            console.error('Error switching session:', error);
        }
    }

    renderMessages() {
        this.chatMessages.innerHTML = '';
        
        if (this.messages.length === 0) {
            this.chatMessages.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎓</div>
                    <div class="empty-title">Welcome to AI Counselor</div>
                    <div class="empty-description">Ask questions about courses, careers, and your future</div>
                </div>
            `;
            return;
        }

        this.messages.forEach(message => {
            const messageEl = this.createMessageElement(message);
            this.chatMessages.appendChild(messageEl);
        });

        this.scrollToBottom();
    }

    updateActiveSession(sessionId) {
        document.querySelectorAll('.session-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.sessionId === sessionId) {
                item.classList.add('active');
            }
        });
    }

    async loadSuggestedPrompts() {
        try {
            const response = await fetch('/api/chat/suggested-prompts', {
                headers: {
                    'X-CSRF-Token': this.getCsrfToken()
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.prompts && data.prompts.length > 0) {
                this.renderSuggestedPrompts(data.prompts);
            }
        } catch (error) {
            console.error('Error loading prompts:', error);
        }
    }

    renderSuggestedPrompts(prompts) {
        if (!this.suggestedPromptsContainer) return;

        this.suggestedPromptsContainer.innerHTML = prompts
            .slice(0, 4)
            .map(promptData => {
                // Extract the text string from the object
                const text = typeof promptData === 'object' ? promptData.prompt_text : promptData;
                
                // Escape single quotes for the inline onclick handler
                const escapedText = text.replace(/'/g, "\\'");

                return `
                    <button 
                        class="prompt-chip" 
                        onclick="counselor.usePrompt('${escapedText}')"
                    >
                        ${text}
                    </button>
                `;
            }).join('');

        if (this.messages.length === 0) {
            this.suggestedPromptsContainer.style.display = 'flex';
        }
    }

    usePrompt(prompt) {
        this.counselorInput.value = prompt;
        this.counselorInput.focus();
        this.sendBtn.disabled = false;
    }

    async startNewChat() {
        // If we have a real session ID, end it on the backend first.
        // This prevents getOrCreateSession() from recycling the old chat.
        if (this.currentSessionId && this.currentSessionId !== 'current') {
            try {
                await fetch(`/api/chat/sessions/${this.currentSessionId}/end`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.getCsrfToken()
                    }
                });
            } catch (e) {
                console.error('Failed to end previous session:', e);
            }
        }

        this.currentSessionId = 'current';
        this.messages = [];
        this.chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎓</div>
                <div class="empty-title">Welcome to AI Counselor</div>
                <div class="empty-description">Ask questions about courses, careers, and your future</div>
            </div>
        `;
        this.counselorInput.value = '';
        this.counselorInput.style.height = 'auto';
        this.sendBtn.disabled = true;
        this.safetyBanner.classList.remove('show');
        
        // Show prompts again
        if (this.suggestedPromptsContainer) {
            this.suggestedPromptsContainer.style.display = 'flex';
        }
        
        this.loadSuggestedPrompts();
    }


    // Modal functions
    openHelplines() {
        this.helplineModal.classList.add('show');
    }

    closeHelplines() {
        this.helplineModal.classList.remove('show');
    }

    toggleMenu() {
        // This would toggle sidebar on mobile
        document.querySelector('[class*="sidebar"]')?.classList.toggle('collapsed');
    }

    // Utility functions
    getCsrfToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }

    formatTime(date) {
        const d = new Date(date);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    formatSessionTime(date) {
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(mins / 60);
        const days = Math.floor(hours / 24);

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString();
    }
}

// Global instance
let counselor;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    counselor = new AICounselor();
});

// Global functions for HTML onclick handlers
function sendMessage() {
    counselor.sendMessage();
}

function openHelplines() {
    counselor.openHelplines();
}

function closeHelplines() {
    counselor.closeHelplines();
}

function startNewChat() {
    counselor.startNewChat();
}
