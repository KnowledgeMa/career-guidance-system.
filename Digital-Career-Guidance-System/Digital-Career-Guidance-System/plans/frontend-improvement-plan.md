# Frontend Improvement Plan - DCGS System101

## Executive Summary

This document outlines a comprehensive plan to improve the functionality and UI/UX of the DCGS (Digital Career Guidance System) frontend. The current implementation has a solid foundation but suffers from code duplication, inconsistent styling, missing functionality, and opportunities for significant UX improvements.

---

## Current State Analysis

### Strengths
- Clean EJS template structure with layouts and partials
- Modern CSS with CSS variables and responsive design
- JWT-based authentication with CSRF protection
- Basic chat widget structure
- Drag-and-drop file upload

### Issues Identified

1. **Code Duplication**
   - `setLoading()` function exists in 4+ files
   - `showAlert()` implemented differently across files
   - `togglePassword()` duplicated with slight variations

2. **Missing Files**
   - `src/public/js/utils.js` - Referenced in layout but doesn't exist
   - `src/public/js/forgot-password.js` - Referenced but missing
   - `src/public/js/reset-password.js` - Referenced but missing

3. **CSS Inconsistency**
   - Two separate CSS files (`style.css` and `modern.css`) with overlapping styles
   - Inconsistent naming conventions
   - Duplicate component definitions

4. **UX Gaps**
   - Chat widget has no backend integration
   - Error pages are basic
   - No loading skeletons
   - Limited form validation feedback
   - Mobile menu needs improvement

---

## Detailed Improvement Plan

### Phase 1: Foundation & Code Organization

#### 1.1 Create Missing Utility File
**File:** `src/public/js/utils.js`

```javascript
// Shared utility functions for DCGS
const Utils = {
    // DOM Helpers
    getElement(selector) {
        return document.querySelector(selector);
    },
    
    getAll(selector) {
        return document.querySelectorAll(selector);
    },
    
    // Loading State
    setLoading(btn, loading) {
        if (!btn) return;
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        btn.disabled = loading;
        if (text) text.classList.toggle('hidden', loading);
        if (loader) loader.classList.toggle('hidden', !loading);
    },
    
    // Password Toggle
    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
    },
    
    // Format helpers
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // Validation helpers
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    
    validatePassword(password) {
        const requirements = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password)
        };
        return {
            valid: Object.values(requirements).every(v => v),
            requirements
        };
    }
};

// Export to global scope
window.Utils = Utils;
```

#### 1.2 Consolidate CSS Files
**Action:** Merge `style.css` and `modern.css` into a single unified stylesheet

**New Structure:**
```css
/* src/public/css/main.css */
:root { /* Unified CSS variables */ }
* { /* Reset */ }
body { /* Base styles */ }

/* Components */
.buttons { ... }
.forms { ... }
.cards { ... }
.modals { ... }
.alerts { ... }
.navigation { ... }

/* Layout */
.header { ... }
.footer { ... }
.hero { ... }

/* Pages */
.auth-pages { ... }
.dashboard { ... }
.upload { ... }
.profile { ... }

/* Utilities */
.utilities { ... }
.animations { ... }
.responsive { ... }
```

---

### Phase 2: Authentication Improvements

#### 2.1 Enhanced Login/Register Forms
**File:** `src/views/pages/index.ejs`

**Improvements:**
- Real-time email validation
- Password strength meter with visual indicators
- Better error messages with field-specific highlighting
- Remember me functionality with localStorage
- Social login placeholders with proper styling

#### 2.2 Password Reset Flow
**Files to Create:**
- `src/public/js/forgot-password.js`
- `src/public/js/reset-password.js`

**forgot-password.js:**
```javascript
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgotPasswordForm');
    if (form) {
        form.addEventListener('submit', handleForgotPassword);
    }
});

async function handleForgotPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const email = document.getElementById('email').value;
    
    Utils.setLoading(btn, true);
    
    try {
        await API.auth.forgotPassword(email);
        showSuccessMessage(email);
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        Utils.setLoading(btn, false);
    }
}

function showSuccessMessage(email) {
    document.getElementById('forgotPasswordForm').classList.add('hidden');
    document.getElementById('successMessage').classList.remove('hidden');
    document.getElementById('emailDisplay').textContent = email;
}
```

**reset-password.js:**
```javascript
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('resetPasswordForm');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    
    if (form) form.addEventListener('submit', handleResetPassword);
    if (newPassword) newPassword.addEventListener('input', validatePassword);
    if (confirmPassword) confirmPassword.addEventListener('input', validateMatch);
});

function validatePassword(e) {
    const password = e.target.value;
    const validation = Utils.validatePassword(password);
    
    document.getElementById('req-length').classList.toggle('valid', validation.requirements.length);
    document.getElementById('req-upper').classList.toggle('valid', validation.requirements.uppercase);
    document.getElementById('req-lower').classList.toggle('valid', validation.requirements.lowercase);
    document.getElementById('req-number').classList.toggle('valid', validation.requirements.number);
    
    document.getElementById('submitBtn').disabled = !validation.valid;
}

function validateMatch() {
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    const errorEl = document.getElementById('matchError');
    
    if (confirmPass && newPass !== confirmPass) {
        errorEl.classList.remove('hidden');
        document.getElementById('submitBtn').disabled = true;
    } else {
        errorEl.classList.add('hidden');
        document.getElementById('submitBtn').disabled = false;
    }
}
```

---

### Phase 3: Dashboard Enhancements

#### 3.1 Improved Dashboard UI
**File:** `src/views/pages/dashboard.ejs`

**New Features:**
- Animated progress bar with percentage counter
- Loading skeletons for stats cards
- Real activity feed from database
- Quick action buttons with keyboard shortcuts

**Dashboard CSS Additions:**
```css
/* Loading Skeleton */
.skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
}

@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* Animated Progress */
.progress-fill {
    transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

.progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,0.3),
        transparent
    );
    animation: progressShine 2s infinite;
}

@keyframes progressShine {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

/* Activity Feed */
.activity-item {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    animation: slideIn 0.3s ease;
}

.activity-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
}

.activity-content {
    flex: 1;
}

.activity-time {
    font-size: 0.75rem;
    color: var(--text-light);
}
```

---

### Phase 4: Upload Results Improvements

#### 4.1 Enhanced Upload Zone
**File:** `src/views/pages/upload.ejs`

**Improvements:**
- Better visual feedback during drag-over
- File type icons for different formats
- Progress bar with percentage
- Estimated time remaining
- Retry mechanism for failed uploads

**CSS Additions:**
```css
.upload-zone {
    transition: all 0.3s ease;
}

.upload-zone.dragover {
    transform: scale(1.02);
    border-color: var(--primary);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}

.upload-prompt {
    cursor: pointer;
    transition: all 0.3s ease;
}

.upload-prompt:hover {
    transform: translateY(-2px);
}

/* Progress Steps */
.progress-steps {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2rem;
    position: relative;
}

.progress-steps::before {
    content: '';
    position: absolute;
    top: 20px;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--border);
    z-index: 0;
}

.step {
    position: relative;
    z-index: 1;
    text-align: center;
}

.step-number {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    margin: 0 auto 0.5rem;
    transition: all 0.3s ease;
}

.step.active .step-number {
    background: var(--primary);
    color: white;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}

.step.complete .step-number {
    background: var(--success);
    color: white;
}
```

---

### Phase 5: AI Counsellor Chat Widget

#### 5.1 Functional Chat Implementation
**File:** `src/public/js/dashboard.js` (update)

**Features:**
- Real-time chat with AI backend
- Typing indicators
- Message history
- Suggested questions
- Minimize/maximize functionality

**JavaScript Implementation:**
```javascript
class ChatWidget {
    constructor() {
        this.widget = document.getElementById('chatWidget');
        this.messagesEl = document.getElementById('chatMessages');
        this.inputEl = document.getElementById('chatInput');
        this.isOpen = false;
        this.isLoading = false;
        this.init();
    }
    
    init() {
        this.loadHistory();
        this.addEventListeners();
    }
    
    addEventListeners() {
        this.inputEl?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }
    
    async sendMessage() {
        const message = this.inputEl.value.trim();
        if (!message || this.isLoading) return;
        
        // Add user message
        this.addMessage(message, 'user');
        this.inputEl.value = '';
        this.showTypingIndicator();
        
        try {
            const response = await API.request('/chat', {
                method: 'POST',
                body: { message }
            });
            
            this.hideTypingIndicator();
            this.addMessage(response.reply, 'ai');
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessage('Sorry, I encountered an error. Please try again.', 'ai');
        }
    }
    
    addMessage(text, type) {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${type}`;
        msgEl.textContent = text;
        this.messagesEl.appendChild(msgEl);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        this.saveToHistory(text, type);
    }
    
    showTypingIndicator() {
        this.isLoading = true;
        const indicator = document.createElement('div');
        indicator.className = 'chat-message ai typing';
        indicator.id = 'typingIndicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        this.messagesEl.appendChild(indicator);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
    
    hideTypingIndicator() {
        this.isLoading = false;
        document.getElementById('typingIndicator')?.remove();
    }
    
    toggle() {
        this.isOpen = !this.isOpen;
        this.widget?.classList.toggle('hidden', !this.isOpen);
        if (this.isOpen) this.inputEl?.focus();
    }
    
    saveToHistory(message, type) {
        const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        history.push({ message, type, timestamp: Date.now() });
        localStorage.setItem('chatHistory', JSON.stringify(history.slice(-50)));
    }
    
    loadHistory() {
        const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
        history.forEach(({ message, type }) => this.addMessage(message, type));
    }
}

// Initialize chat widget
const chatWidget = new ChatWidget();
function openChat() { chatWidget.toggle(); }
function closeChat() { chatWidget.toggle(); }
```

**CSS for Chat:**
```css
.chat-widget {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    width: 380px;
    height: 500px;
    background: var(--card);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    z-index: 1000;
    overflow: hidden;
}

.chat-header {
    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
    color: white;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.chat-message {
    max-width: 80%;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    font-size: 0.9rem;
    animation: messageSlide 0.3s ease;
}

@keyframes messageSlide {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.chat-message.user {
    align-self: flex-end;
    background: var(--primary);
    color: white;
    border-bottom-right-radius: 4px;
}

.chat-message.ai {
    align-self: flex-start;
    background: var(--bg);
    color: var(--text);
    border-bottom-left-radius: 4px;
}

/* Typing Indicator */
.typing span {
    display: inline-block;
    width: 6px;
    height: 6px;
    background: var(--text-light);
    border-radius: 50%;
    margin: 0 2px;
    animation: typing 1.4s infinite;
}

.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}

.chat-input {
    padding: 1rem;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 0.5rem;
}

.chat-input input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.9rem;
}

.chat-input input:focus {
    outline: none;
    border-color: var(--primary);
}

.chat-input button {
    padding: 0.75rem 1.25rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
}

.chat-input button:hover {
    background: var(--primary-dark);
}

.chat-input button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Suggested Questions */
.suggested-questions {
    padding: 0.75rem 1rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
}

.suggested-question {
    padding: 0.5rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
}

.suggested-question:hover {
    background: var(--primary-light);
    border-color: var(--primary);
}
```

---

### Phase 6: Error Pages

#### 6.1 Enhanced 404 Page
**File:** `src/views/errors/404.ejs`

```html
<div class="error-page">
    <div class="error-content">
        <div class="error-icon">🔍</div>
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <div class="error-actions">
            <a href="/" class="btn btn-primary">Go Home</a>
            <a href="/dashboard" class="btn btn-secondary">Dashboard</a>
        </div>
    </div>
</div>

<style>
.error-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    padding: 2rem;
}

.error-content {
    text-align: center;
    max-width: 500px;
}

.error-icon {
    font-size: 5rem;
    margin-bottom: 1rem;
    animation: bounce 2s infinite;
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
}

.error-content h1 {
    font-size: 6rem;
    font-weight: 700;
    color: var(--primary);
    margin: 0;
    line-height: 1;
}

.error-content h2 {
    font-size: 1.5rem;
    margin: 1rem 0 0.5rem;
    color: var(--text);
}

.error-content p {
    color: var(--text-light);
    margin-bottom: 2rem;
}

.error-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
}
</style>
```

#### 6.2 Enhanced 500 Page
**File:** `src/views/errors/500.ejs`

```html
<div class="error-page">
    <div class="error-content">
        <div class="error-icon">⚠️</div>
        <h1>500</h1>
        <h2>Server Error</h2>
        <p>Something went wrong on our end. Please try again later.</p>
        <div class="error-actions">
            <a href="/" class="btn btn-primary">Go Home</a>
            <button onclick="window.location.reload()" class="btn btn-secondary">Retry</button>
        </div>
    </div>
</div>
```

---

### Phase 7: Header & Navigation

#### 7.1 Improved Header
**File:** `src/views/partials/header.ejs`

**Improvements:**
- Smooth mobile menu animation
- Better user dropdown with profile image support
- Notification badge placeholder
- Keyboard-accessible navigation

**CSS Additions:**
```css
/* Mobile Menu */
.mobile-menu-toggle {
    display: none;
    flex-direction: column;
    gap: 4px;
    padding: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
}

.mobile-menu-toggle span {
    width: 24px;
    height: 2px;
    background: var(--text);
    transition: all 0.3s ease;
}

.mobile-menu-toggle.active span:nth-child(1) {
    transform: rotate(45deg) translate(5px, 5px);
}

.mobile-menu-toggle.active span:nth-child(2) {
    opacity: 0;
}

.mobile-menu-toggle.active span:nth-child(3) {
    transform: rotate(-45deg) translate(7px, -6px);
}

@media (max-width: 768px) {
    .mobile-menu-toggle {
        display: flex;
    }
    
    .main-nav {
        position: fixed;
        top: 60px;
        left: 0;
        right: 0;
        background: var(--card);
        padding: 1rem;
        transform: translateY(-100%);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .main-nav.active {
        transform: translateY(0);
        opacity: 1;
        visibility: visible;
    }
}

/* User Dropdown Animation */
.user-dropdown {
    transform: translateY(-10px);
    opacity: 0;
    transition: all 0.2s ease;
}

.user-dropdown.show {
    transform: translateY(0);
    opacity: 1;
}
```

---

### Phase 8: Profile Page Improvements

#### 8.1 Enhanced Profile Form
**File:** `src/views/pages/profile.ejs`

**Improvements:**
- Real-time validation
- Password requirements checklist
- Profile picture upload placeholder
- Better modal animations

**Password Requirements CSS:**
```css
.password-requirements {
    list-style: none;
    padding: 0;
    margin-top: 0.5rem;
    font-size: 0.8rem;
}

.password-requirements li {
    padding: 0.25rem 0.5rem;
    margin: 0.25rem 0;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-light);
}

.password-requirements li.valid {
    color: var(--success);
    background: rgba(16, 185, 129, 0.1);
}

.password-requirements li.valid::before {
    content: '✓';
    font-weight: bold;
}

.password-requirements li::before {
    content: '○';
}
```

---

### Phase 9: Accessibility Improvements

#### 9.1 ARIA Labels & Keyboard Navigation

**Add to all interactive elements:**
```html
<!-- Buttons -->
<button aria-label="Close dialog" class="modal-close">×</button>

<!-- Forms -->
<input type="email" aria-label="Email address" required>
<input type="password" aria-label="Password" aria-describedby="password-help">

<!-- Navigation -->
<nav aria-label="Main navigation">
<a href="/dashboard" aria-current="page">Dashboard</a>

<!-- Alerts -->
<div role="alert" aria-live="polite" class="alert">...</div>
```

**Focus Management:**
```css
/* Focus Visible */
*:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}

button:focus-visible,
a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}

/* Skip Link */
.skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: var(--primary);
    color: white;
    padding: 0.5rem 1rem;
    z-index: 9999;
    transition: top 0.2s;
}

.skip-link:focus {
    top: 0;
}
```

---

### Phase 10: Responsive Design

#### 10.1 Mobile-First Improvements

**CSS Additions:**
```css
/* Tablet */
@media (max-width: 1024px) {
    .hero-container {
        grid-template-columns: 1fr;
        gap: 2rem;
    }
    
    .features-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .dashboard-header {
        flex-direction: column;
        gap: 1.5rem;
    }
}

/* Mobile */
@media (max-width: 768px) {
    .action-grid {
        grid-template-columns: 1fr;
    }
    
    .form-row {
        grid-template-columns: 1fr;
    }
    
    .hero-stats {
        justify-content: center;
        flex-wrap: wrap;
    }
    
    .chat-widget {
        width: calc(100% - 2rem);
        height: calc(100vh - 4rem);
        bottom: 1rem;
        right: 1rem;
        left: 1rem;
    }
    
    .results-table-container {
        overflow-x: auto;
    }
    
    .results-table {
        min-width: 600px;
    }
}

/* Small Mobile */
@media (max-width: 480px) {
    .hero-title {
        font-size: 1.75rem;
    }
    
    .section-title {
        font-size: 1.5rem;
    }
    
    .btn {
        padding: 0.75rem 1rem;
        font-size: 0.9rem;
    }
}
```

---

## Implementation Order

1. **Week 1: Foundation**
   - Create `utils.js` with shared functions
   - Create `forgot-password.js` and `reset-password.js`
   - Consolidate CSS files into unified `main.css`

2. **Week 2: Authentication**
   - Enhanced login/register forms
   - Password reset flow
   - Better validation feedback

3. **Week 3: Dashboard & Upload**
   - Dashboard improvements with animations
   - Upload page enhancements
   - Loading skeletons

4. **Week 4: Chat & Error Pages**
   - Functional chat widget
   - Enhanced error pages
   - Accessibility improvements

5. **Week 5: Polish**
   - Responsive design refinements
   - Performance optimization
   - Cross-browser testing

---

## Success Metrics

- **Performance**: Page load time < 3s, First Contentful Paint < 1.5s
- **Accessibility**: WCAG 2.1 AA compliance, Lighthouse accessibility score > 90
- **Usability**: Reduced form errors, improved completion rates
- **Code Quality**: Eliminated duplicate functions, consistent naming conventions
- **Mobile**: Fully responsive on all screen sizes

---

## Files to Create/Modify

### Create:
- `src/public/js/utils.js`
- `src/public/js/forgot-password.js`
- `src/public/js/reset-password.js`
- `src/public/css/main.css` (consolidated)

### Modify:
- `src/public/css/style.css` (merge into main.css)
- `src/public/css/modern.css` (merge into main.css)
- `src/public/js/auth.js` (use Utils)
- `src/public/js/dashboard.js` (add chat widget)
- `src/public/js/upload.js` (improve UX)
- `src/public/js/profile.js` (better validation)
- `src/public/js/landing.js` (use Utils)
- `src/public/js/header.js` (mobile improvements)
- `src/views/pages/index.ejs` (enhanced forms)
- `src/views/pages/dashboard.ejs` (improved UI)
- `src/views/pages/upload.ejs` (better feedback)
- `src/views/pages/profile.ejs` (validation)
- `src/views/errors/404.ejs` (redesign)
- `src/views/errors/500.ejs` (redesign)
- `src/views/partials/header.ejs` (mobile menu)
