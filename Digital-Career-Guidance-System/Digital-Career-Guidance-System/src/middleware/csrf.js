const crypto = require('crypto');

/**
 * CSRF Protection Middleware
 * Uses double-submit cookie pattern
 */

// Generate CSRF token
const generateCsrfToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Middleware to attach CSRF token to request
const csrfToken = (req, res, next) => {
    // Generate or retrieve token
    let token = req.cookies.csrfToken;
    
    if (!token) {
        token = generateCsrfToken();
        res.cookie('csrfToken', token, {
            httpOnly: false, // Client needs to read this
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
    }
    
    // Make token available to templates and requests
    res.locals.csrfToken = token;
    req.csrfToken = token;
    
    next();
};

// Middleware to validate CSRF token on state-changing requests
const validateCsrfToken = (req, res, next) => {
    // Skip CSRF validation for GET requests and other safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    
    // Get token from request (can be in header, body, or query)
    const token = 
        req.headers['x-csrf-token'] ||
        req.body?.csrfToken ||
        req.query?.csrfToken;
    
    // Get CSRF cookie
    const cookieToken = req.cookies.csrfToken;
    
    // Validate
    if (!token || !cookieToken || token !== cookieToken) {
        return res.status(403).json({ 
            error: 'CSRF token validation failed',
            code: 'CSRF_VALIDATION_FAILED'
        });
    }
    
    next();
};

module.exports = {
    generateCsrfToken,
    csrfToken,
    validateCsrfToken
};
