const chatService = require('../services/chatService');

class ChatController {
    
    async streamChat(req, res) {
        try {
            // DEFENSIVE: Ensure user is authenticated
            if (!req.user?.id) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { message, sessionId } = req.body;
            
            if (!message || message.trim().length === 0) {
                return res.status(400).json({ error: 'Message required' });
            }

            const cleanSessionId = sessionId === 'current' ? null : sessionId;

            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); 

            // Handle client disconnect
            req.on('close', () => {
                console.log('[ChatController] Client disconnected');
            });

            const stream = chatService.streamChat(req.user.id, message.trim(), cleanSessionId);
            
            for await (const chunk of stream) {
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                
                if (chunk.type === 'done' || chunk.type === 'error') {
                    res.write(`data: [DONE]\n\n`);
                    break;
                }
            }
            
            res.end();

        } catch (error) {
            console.error('[ChatController] Stream error:', error);
            res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream failed' })}\n\n`);
            res.end();
        }
    }
    
    async getSessions(req, res) {
        try {
            const sessions = await chatService.getUserSessions(req.user.id);
            res.json({
                success: true,
                sessions: sessions
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch sessions' });
        }
    }

    async getSession(req, res) {
        try {
            const messages = await chatService.getSessionHistory(
                req.params.id, 
                req.user.id
            );
            
            res.json({
                success: true,
                sessionId: req.params.id,
                messages: messages
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to fetch session' });
        }
    }

    async getSuggestedPrompts(req, res) {
        try {
            const prompts = await chatService.getSuggestedPrompts(req.user.id);
            res.json({
                success: true,
                prompts: prompts
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch prompts' });
        }
    }

    async endSession(req, res) {
        try {
            await chatService.endSession(req.params.id, req.user.id);
            res.json({ success: true, message: 'Session ended' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to end session' });
        }
    }
}

module.exports = new ChatController();