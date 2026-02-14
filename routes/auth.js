const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        // Check if user exists
        const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        // Hash password and create user
        const hashedPassword = bcrypt.hashSync(password, 10);
        const result = await db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);

        // Auto-login after register
        req.session.userId = result.lastInsertRowid;

        res.json({ success: true, userId: result.lastInsertRowid });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        req.session.userId = user.id;

        // Check if profile exists
        const profile = await db.get('SELECT user_id FROM profiles WHERE user_id = ?', [user.id]);

        res.json({
            success: true,
            userId: user.id,
            hasProfile: !!profile
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await db.get('SELECT id, email, created_at FROM users WHERE id = ?', [req.session.userId]);
        const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [req.session.userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                createdAt: user.created_at
            },
            profile: profile ? {
                name: profile.name,
                interests: JSON.parse(profile.interests),
                goals: JSON.parse(profile.goals)
            } : null
        });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
