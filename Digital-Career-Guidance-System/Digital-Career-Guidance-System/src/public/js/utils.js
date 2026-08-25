// CSRF Token Helper
const getCsrfToken = () => {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
};

// API Helper
const api = {
    async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCsrfToken(),
                ...options.headers
            },
            credentials: 'same-origin'
        };

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            defaultOptions.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json().catch(() => ({}));
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            showFlash(error.message, 'error');
            throw error;
        }
    },

    get: (url) => api.request(url, { method: 'GET' }),
    post: (url, body) => api.request(url, { method: 'POST', body }),
    put: (url, body) => api.request(url, { method: 'PUT', body }),
    delete: (url) => api.request(url, { method: 'DELETE' })
};

// Flash Messages
function showFlash(message, type = 'success') {
    const container = document.getElementById('flash-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `flash-message px-6 py-3 rounded-lg shadow-lg text-white transform transition-all duration-300 ${
        type === 'error' ? 'bg-red-500' : type === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
    }`;
    div.textContent = message;

    container.appendChild(div);

    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 5000);
}

// Navigation Menu Toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    menu.classList.toggle('hidden');
}

// User Dropdown
document.addEventListener('click', function(e) {
    const menu = document.getElementById('user-menu');
    const dropdown = document.getElementById('user-dropdown');
    
    if (menu && dropdown) {
        if (menu.contains(e.target)) {
            dropdown.classList.toggle('hidden');
        } else {
            dropdown.classList.add('hidden');
        }
    }
});

// Logout
async function logout() {
    try {
        await api.post('/api/auth/logout');
        window.location.href = '/';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Tab Switching Helper
window.switchTab = function(tabName) {
    // Hide all forms
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    
    // Reset tab styles
    document.getElementById('tab-login').classList.remove('border-indigo-600', 'bg-gray-50');
    document.getElementById('tab-login').classList.add('border-transparent', 'text-gray-500');
    document.getElementById('tab-register').classList.remove('border-indigo-600', 'bg-gray-50');
    document.getElementById('tab-register').classList.add('border-transparent', 'text-gray-500');
    
    // Show selected
    document.getElementById(`${tabName}-form`).classList.remove('hidden');
    const activeTab = document.getElementById(`tab-${tabName}`);
    activeTab.classList.remove('border-transparent', 'text-gray-500');
    activeTab.classList.add('border-indigo-600', 'bg-gray-50', 'text-gray-900');
    
    // Update URL without reload
    if (history.replaceState) {
        history.replaceState(null, null, `?tab=${tabName}`);
    }
};

// Check URL params on load
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && (tab === 'login' || tab === 'register')) {
        switchTab(tab);
    }
});
