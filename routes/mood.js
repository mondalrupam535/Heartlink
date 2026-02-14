const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Save mood check-in
router.post('/', requireAuth, async (req, res) => {
    try {
        const { dayMood, currentMood, thoughts } = req.body;
        const userId = req.session.userId;

        if (!dayMood && !currentMood) {
            return res.status(400).json({ error: 'At least one mood selection is required' });
        }

        const result = await db.run(
            'INSERT INTO moods (user_id, day_mood, current_mood, thoughts) VALUES (?, ?, ?, ?)',
            [userId, dayMood || null, currentMood || null, thoughts || null]
        );

        res.json({ success: true, moodId: result.lastInsertRowid });
    } catch (err) {
        console.error('Mood error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get latest mood
router.get('/latest', requireAuth, async (req, res) => {
    try {
        const mood = await db.get(
            'SELECT * FROM moods WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1',
            [req.session.userId]
        );

        if (!mood) {
            return res.status(404).json({ error: 'No mood check-in found' });
        }

        res.json({
            dayMood: mood.day_mood,
            currentMood: mood.current_mood,
            thoughts: mood.thoughts,
            createdAt: mood.timestamp
        });
    } catch (err) {
        console.error('Get mood error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get mood history (optional)
router.get('/history', requireAuth, async (req, res) => {
    try {
        const moods = await db.all(
            'SELECT * FROM moods WHERE user_id = ? ORDER BY timestamp DESC LIMIT 30',
            [req.session.userId]
        );

        res.json(moods.map(m => ({
            dayMood: m.day_mood,
            currentMood: m.current_mood,
            thoughts: m.thoughts,
            createdAt: m.timestamp
        })));
    } catch (err) {
        console.error('Mood history error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
