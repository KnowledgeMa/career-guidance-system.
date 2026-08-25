const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// SSE streaming endpoint
router.post('/stream', ChatController.streamChat.bind(ChatController));

// Session management
router.get('/sessions', ChatController.getSessions.bind(ChatController));
router.get('/sessions/:id', ChatController.getSession.bind(ChatController));
router.post('/sessions/:id/end', ChatController.endSession.bind(ChatController));

// Suggested prompts
router.get('/suggested-prompts', ChatController.getSuggestedPrompts.bind(ChatController));

// AI Counselor page - renders the new ai-counselor view
router.get('/counsellor', authenticate, (req, res) => {
    try {
        res.render('pages/ai-counselor', {
            title: 'AI Counselor',
            activePage: 'counselor',
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (error) {
        console.error('Counselor page error:', error);
        res.status(500).send('Error loading page');
    }
});

// Alternative route: /counselor (American spelling)
router.get('/counselor', authenticate, (req, res) => {
    try {
        res.render('pages/ai-counselor', {
            title: 'AI Counselor',
            activePage: 'counselor',
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (error) {
        console.error('Counselor page error:', error);
        res.status(500).send('Error loading page');
    }
});

module.exports = router;