// Chat State
let currentSessionId = null;
let eventSource = null;
let isStreaming = false;

// Initialize chat
document.addEventListener('DOMContentLoaded', () => {
    loadSuggestedPrompts();
    
    const input = document.getElementById('chat-input');
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    input.addEventListener('input', () => {
        document.getElementById('send-btn').disabled = input.value.trim().length === 0 || isStreaming;
    });
});

function toggleChat() {
    const widget = document.getElementById('chat-widget');
    widget.classList.toggle('minimized');
    const btn = document.getElementById('chat-toggle-btn');
    btn.textContent = widget.classList.contains('minimized') ? '+' : '−';
}

async function loadSuggestedPrompts() {
    try {
        const res = await fetch('/api/chat/suggested-prompts', { credentials: 'include' });
        const data = await res.json();
        
        const container = document.getElementById('suggested-prompts');
        container.innerHTML = data.prompts.map(p => 
            `<button class="prompt-chip" onclick="usePrompt('${p.prompt_text.replace(/'/g, "\\'")}')">${p.prompt_text}</button>`
        ).join('');
    } catch (err) {
        console.error('Failed to load prompts:', err);
    }
}

function usePrompt(text) {
    document.getElementById('chat-input').value = text;
    document.getElementById('send-btn').disabled = false;
    sendMessage();
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message || isStreaming) return;
    
    // Add user message to UI
    addMessageToUI('user', message);
    input.value = '';
    document.getElementById('send-btn').disabled = true;
    
    // Show typing indicator
    document.getElementById('typing-indicator').classList.remove('hidden');
    isStreaming = true;
    
    // Start SSE stream
    const response = await fetch('/api/chat/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId: currentSessionId })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = '';
    let messageDiv = null;
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                    const chunk = JSON.parse(data);
                    
                    if (chunk.type === 'content') {
                        if (!messageDiv) {
                            messageDiv = addMessageToUI('system', '');
                        }
                        assistantMessage += chunk.content;
                        messageDiv.querySelector('.message-content').textContent = assistantMessage;
                        scrollToBottom();
                    } else if (chunk.type === 'done') {
                        currentSessionId = chunk.sessionId;
                        
                        // Show safety banner if needed
                        if (chunk.metadata?.hasSafetyFlags) {
                            showSafetyBanner();
                        }
                    } else if (chunk.type === 'error') {
                        addMessageToUI('system', 'Sorry, I encountered an error. Please try again.');
                    }
                } catch (e) {
                    // Ignore parse errors for [DONE] markers
                }
            }
        }
    }
    
    document.getElementById('typing-indicator').classList.add('hidden');
    isStreaming = false;
    document.getElementById('send-btn').disabled = false;
    
    // Refresh prompts based on new context
    loadSuggestedPrompts();
}

function addMessageToUI(role, content) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    div.innerHTML = `
        <div class="message-content">${content}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

function showSafetyBanner() {
    const container = document.getElementById('chat-messages');
    const banner = document.createElement('div');
    banner.className = 'safety-banner';
    banner.innerHTML = `
        <strong>You mentioned something concerning</strong>
        If you're in crisis, please contact Suicide Crisis Line: 0800 567 567
    `;
    container.appendChild(banner);
    scrollToBottom();
}

function showHelplines() {
    document.getElementById('helpline-modal').classList.remove('hidden');
}

function closeHelplines() {
    document.getElementById('helpline-modal').classList.add('hidden');
}

// Close modal on outside click
document.getElementById('helpline-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'helpline-modal') closeHelplines();
});