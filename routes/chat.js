const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get chat history with a partner
router.get('/history/:partnerId', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const partnerId = parseInt(req.params.partnerId);

        const messages = await db.all(
            'SELECT * FROM messages WHERE user_id = ? AND partner_id = ? ORDER BY created_at ASC',
            [userId, partnerId]
        );

        res.json(messages.map(m => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            createdAt: m.created_at
        })));
    } catch (err) {
        console.error('Chat history error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save a message
router.post('/message', requireAuth, async (req, res) => {
    try {
        const { partnerId, sender, content } = req.body;
        const userId = req.session.userId;

        const result = await db.run(
            'INSERT INTO messages (user_id, partner_id, sender, content) VALUES (?, ?, ?, ?)',
            [userId, partnerId, sender, content]
        );

        res.json({
            success: true,
            messageId: result.lastInsertRowid
        });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
