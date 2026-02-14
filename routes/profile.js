const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Save/update profile
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, interests, goals } = req.body;
        const userId = req.session.userId;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const existing = await db.get('SELECT user_id FROM profiles WHERE user_id = ?', [userId]);

        if (existing) {
            await db.run(
                'UPDATE profiles SET name = ?, interests = ?, goals = ? WHERE user_id = ?',
                [name.trim(), JSON.stringify(interests || []), JSON.stringify(goals || []), userId]
            );
        } else {
            await db.run(
                'INSERT INTO profiles (user_id, name, interests, goals) VALUES (?, ?, ?, ?)',
                [userId, name.trim(), JSON.stringify(interests || []), JSON.stringify(goals || [])]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get profile
router.get('/', requireAuth, async (req, res) => {
    try {
        const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [req.session.userId]);

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json({
            name: profile.name,
            interests: JSON.parse(profile.interests),
            goals: JSON.parse(profile.goals)
        });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
