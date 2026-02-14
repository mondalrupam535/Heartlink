const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get matched connections
router.get('/', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;

        // Get user's profile for matching context
        const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [userId]);
        const userInterests = profile ? JSON.parse(profile.interests) : [];

        // Get all demo connections
        let connections = await db.all('SELECT * FROM connections ORDER BY match_score DESC');

        // Adjust match scores based on shared interests
        connections = connections.map(conn => {
            let score = conn.match_score;
            const sharedLower = (conn.shared_interest || '').toLowerCase();

            // Boost score if user has matching interest
            if (userInterests.some(i => sharedLower.includes(i.toLowerCase()))) {
                score = Math.min(99, score + 5);
            }

            return {
                id: conn.id,
                name: conn.name,
                avatar: conn.avatar,
                status: conn.status,
                moodEmoji: conn.mood_emoji,
                moodText: conn.mood_text,
                sharedInterest: conn.shared_interest,
                sharedInterestEmoji: conn.shared_interest_emoji,
                matchScore: score
            };
        });

        // Sort by score descending
        connections.sort((a, b) => b.matchScore - a.matchScore);

        res.json(connections);
    } catch (err) {
        console.error('Connections error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single connection
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const conn = await db.get('SELECT * FROM connections WHERE id = ?', [req.params.id]);

        if (!conn) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        res.json({
            id: conn.id,
            name: conn.name,
            avatar: conn.avatar,
            status: conn.status,
            moodEmoji: conn.mood_emoji,
            moodText: conn.mood_text,
            sharedInterest: conn.shared_interest,
            sharedInterestEmoji: conn.shared_interest_emoji,
            matchScore: conn.match_score
        });
    } catch (err) {
        console.error('Get connection error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
