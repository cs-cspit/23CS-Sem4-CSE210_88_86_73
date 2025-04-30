// Smart Shelf Authentication and Utility Functions

// API Base URL - Update with your actual backend API URL
const API_BASE_URL = 'http://localhost:5000/api';

// Check if user is authenticated
function isAuthenticated() {
    return !!localStorage.getItem('auth_token');
}

// Get current user data
function getCurrentUser() {
    const userData = localStorage.getItem('user_data');
    return userData ? JSON.parse(userData) : null;
}

// Check if user is retailer
function isRetailer() {
    return localStorage.getItem('userRole') === 'retailer';
}

// Check if user is customer
function isCustomer() {
    return localStorage.getItem('userRole') === 'customer';
}

// Get authentication token
function getToken() {
    return localStorage.getItem('token');
}

// Logout user
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userRole');
    window.location.href = 'login-signup.html';
}

// Protected API call with authentication
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' // Include cookies for session-based auth
        };

        // Add auth token if available
        const token = localStorage.getItem('auth_token');
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        // Add request body for non-GET requests
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        const result = await response.json();

        // Check for auth errors
        if (response.status === 401) {
            // Clear auth data and redirect to login
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = 'login-signup.html';
            return null;
        }

        return result;
    } catch (error) {
        console.error('API call error:', error);
        return { success: false, message: 'Network error. Please try again.' };
    }
}

// Format date to YYYY-MM-DD
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Calculate days between two dates
function daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
    const firstDate = new Date(date1);
    const secondDate = new Date(date2);
    
    return Math.round(Math.abs((firstDate - secondDate) / oneDay));
}

// Determine product status based on expiry date
function getProductStatus(expiryDate) {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysLeft = daysBetween(today, expiry);
    
    if (expiry < today) {
        return 'expired';
    } else if (daysLeft <= 7) {
        return 'near_expiry';
    } else {
        return 'fresh';
    }
}

// Format currency
function formatCurrency(value) {
    return '₹' + parseFloat(value).toFixed(2);
}

// Protect page based on user role
function protectPage(allowedRoles = []) {
    if (!isAuthenticated()) {
        window.location.href = 'login-signup.html';
        return false;
    }
    
    const userRole = getCurrentUser().role;
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
        if (userRole === 'retailer') {
            window.location.href = 'retailer.html';
        } else {
            window.location.href = 'customer.html';
        }
        return false;
    }
    
    return true;
}

// Check if an element exists in the DOM
function elementExists(selector) {
    return document.querySelector(selector) !== null;
}

// Show loading spinner
function showLoading(container) {
    if (elementExists(container)) {
        document.querySelector(container).innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Loading...</p>
            </div>
        `;
    }
}

// Display error message
function showError(container, message) {
    if (elementExists(container)) {
        document.querySelector(container).innerHTML = `
            <div class="error-container">
                <p>${message}</p>
                <button onclick="window.location.reload()">Try Again</button>
            </div>
        `;
    }
}

// Login function
async function login(email, password) {
    const response = await apiCall('/auth/login', 'POST', { email, password });
    
    if (response && response.success) {
        // Store auth token and user data
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('user_data', JSON.stringify(response.data.user));
        
        // Also store individual fields for easy access
        localStorage.setItem('userId', response.data.user.id);
        localStorage.setItem('userName', response.data.user.name);
        localStorage.setItem('userEmail', response.data.user.email);
        localStorage.setItem('userRole', response.data.user.role);
        
        // Redirect based on role
        redirectBasedOnRole(response.data.user.role);
        return true;
    }
    
    return false;
}

// Signup function
async function signup(userData) {
    const response = await apiCall('/auth/signup', 'POST', userData);
    
    if (response && response.success) {
        // Store auth token and user data
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('user_data', JSON.stringify(response.data.user));
        
        // Also store individual fields for easy access
        localStorage.setItem('userId', response.data.user.id);
        localStorage.setItem('userName', response.data.user.name);
        localStorage.setItem('userEmail', response.data.user.email);
        localStorage.setItem('userRole', response.data.user.role);
        
        // Redirect based on role
        redirectBasedOnRole(response.data.user.role);
        return true;
    }
    
    return false;
}

// Redirect based on user role
function redirectBasedOnRole(role) {
    switch (role) {
        case 'admin':
            window.location.href = 'admin.html';
            break;
        case 'retailer':
            window.location.href = 'retailer.html';
            break;
        case 'customer':
            window.location.href = 'customer.html';
            break;
        default:
            window.location.href = 'login-signup.html';
    }
}

// Check if user has required role
function hasRole(requiredRoles) {
    const user = getCurrentUser();
    
    if (!user) return false;
    
    if (!Array.isArray(requiredRoles)) {
        requiredRoles = [requiredRoles];
    }
    
    return requiredRoles.includes(user.role);
}

// Protect page based on roles
function protectPage(allowedRoles) {
    if (!isAuthenticated()) {
        // Not authenticated, redirect to login
        window.location.href = '/Frontend/login-signup.html';
        return false;
    }
    
    if (!hasRole(allowedRoles)) {
        // Not authorized, redirect based on role
        const user = getCurrentUser();
        redirectBasedOnRole(user.role);
        return false;
    }
    
    return true;
}

// Add error message to form
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

// Clear error message from form
function clearError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
}