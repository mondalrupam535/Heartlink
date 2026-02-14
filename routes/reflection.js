const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Save reflection
router.post('/', requireAuth, async (req, res) => {
    try {
        const { feelings, gratitude } = req.body;
        const userId = req.session.userId;

        const result = await db.run(
            'INSERT INTO reflections (user_id, feelings, gratitude) VALUES (?, ?, ?)',
            [userId, feelings || '', gratitude || '']
        );

        // Also create/update session log
        const latestMood = await db.get(
            'SELECT * FROM moods WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1',
            [userId]
        );

        // Get the partner they chatted with (most recent messages)
        const latestMessage = await db.get(
            'SELECT partner_id FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId]
        );

        const partnerId = latestMessage ? latestMessage.partner_id : null;
        let partnerName = 'Someone';

        if (partnerId) {
            const partner = await db.get('SELECT name FROM connections WHERE id = ?', [partnerId]);
            if (partner) partnerName = partner.name;
        }

        // Count messages in this session (last hour)
        const msgCount = await db.get(
            "SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND created_at > datetime('now', '-1 hour')",
            [userId]
        );

        // Determine end mood based on feelings text
        let endMood = 'calm';
        if (feelings) {
            const lower = feelings.toLowerCase();
            if (lower.includes('happy') || lower.includes('great') || lower.includes('joy') || lower.includes('wonderful')) endMood = 'happy';
            else if (lower.includes('heard') || lower.includes('supported') || lower.includes('better') || lower.includes('good')) endMood = 'calm';
            else if (lower.includes('sad') || lower.includes('lonely')) endMood = 'lonely';
            else if (lower.includes('stress') || lower.includes('anxious')) endMood = 'stressed';
        }

        // Calculate connection score
        const countVal = msgCount ? msgCount.count : 0;
        const connectionScore = Math.min(100, 60 + (countVal * 2) + (feelings ? Math.min(20, feelings.length / 10) : 0) + (gratitude ? 10 : 0));

        await db.run(
            `INSERT INTO sessions_log (user_id, partner_id, partner_name, start_mood, end_mood, messages_count, duration_minutes, connection_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                partnerId,
                partnerName,
                latestMood ? (latestMood.current_mood || latestMood.day_mood) : 'unknown',
                endMood,
                countVal,
                Math.max(5, Math.floor(Math.random() * 20) + 10),
                Math.round(connectionScore)
            ]
        );

        res.json({ success: true, reflectionId: result.lastInsertRowid });
    } catch (err) {
        console.error('Reflection error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get latest reflection
router.get('/latest', requireAuth, async (req, res) => {
    try {
        const reflection = await db.get(
            'SELECT * FROM reflections WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1',
            [req.session.userId]
        );

        if (!reflection) {
            return res.status(404).json({ error: 'No reflection found' });
        }

        res.json({
            feelings: reflection.feelings,
            gratitude: reflection.gratitude,
            createdAt: reflection.timestamp
        });
    } catch (err) {
        console.error('Get reflection error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
