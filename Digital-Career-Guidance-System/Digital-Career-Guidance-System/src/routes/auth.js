const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

// Rate limiters
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Too many attempts, please try again later' }
});

const standardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20
});

// Validation rules
const registerValidation = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('grade').isIn(['12', '11', 'gap-year', 'graduate']).withMessage('Invalid grade selection'),
    body('province').isIn(['EC', 'FS', 'GP', 'KZN', 'LP', 'MP', 'NC', 'NW', 'WC']).withMessage('Invalid province'),
    body('school').trim().isLength({ min: 2, max: 100 }).withMessage('School name required')
];

const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];

const passwordValidation = [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];

// ADDED: Profile validation for updateProfile
const profileValidation = [
    body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
    body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
    body('grade').isIn(['12', '11', 'gap-year', 'graduate']).withMessage('Invalid grade selection'),
    body('province').isIn(['EC', 'FS', 'GP', 'KZN', 'LP', 'MP', 'NC', 'NW', 'WC']).withMessage('Invalid province'),
    body('school').trim().isLength({ min: 2, max: 100 }).withMessage('School name required')
];

// Public routes
router.post('/register', strictLimiter, registerValidation, AuthController.register);
router.post('/login', strictLimiter, loginValidation, AuthController.login);
router.post('/refresh', standardLimiter, AuthController.refresh);
router.post('/logout', standardLimiter, AuthController.logout);
router.post('/forgot-password', strictLimiter, AuthController.forgotPassword);
router.post('/reset-password', strictLimiter, AuthController.resetPassword);

// Protected routes
router.get('/me', authenticate, AuthController.getMe);
router.put('/profile', authenticate, standardLimiter, profileValidation, AuthController.updateProfile);
router.post('/change-password', authenticate, strictLimiter, passwordValidation, AuthController.changePassword);

// Admin only
router.get('/users', authenticate, authorize('admin', 'superadmin'), AuthController.listUsers);

module.exports = router;