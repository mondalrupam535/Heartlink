const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get latest session report
router.get('/latest', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;

        const session = await db.get(
            'SELECT * FROM sessions_log WHERE user_id = ? ORDER BY start_time DESC LIMIT 1',
            [userId]
        );

        if (!session) {
            return res.status(404).json({ error: 'No session report found' });
        }

        const reflection = await db.get(
            'SELECT * FROM reflections WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1',
            [userId]
        );

        const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [userId]);

        // Mood insight mapping
        const moodEmojis = {
            happy: '😊', calm: '😌', lonely: '😔', stressed: '😣', overwhelmed: '😵', unknown: '😐'
        };

        const moodLabels = {
            happy: 'Happy', calm: 'Calmer', lonely: 'Lonely', stressed: 'Stressed', overwhelmed: 'Overwhelmed', unknown: 'Neutral'
        };

        // Generate communication insights based on message count
        const msgCount = session.messages_count || 0;
        const communicationBadge = msgCount >= 10 ? 'Strong Communicator' :
            msgCount >= 5 ? 'Growing Communicator' : 'Getting Started';

        const insights = [];
        if (msgCount >= 5) insights.push('Shared personal experiences');
        if (msgCount >= 3) insights.push('Asked meaningful questions');
        if (msgCount >= 1) insights.push('Took the first step to connect');
        if (reflection && reflection.feelings) insights.push('Practiced self-reflection');
        if (reflection && reflection.gratitude) insights.push('Expressed gratitude');
        insights.push('Practiced active listening');

        // Connection quality description
        const score = session.connection_score || 0;
        const qualityDesc = score >= 85 ? 'Exceptional Emotional Connection' :
            score >= 70 ? 'Strong Emotional Connection' :
                score >= 50 ? 'Meaningful Connection' : 'Beginning of a Connection';

        // Initialize OpenAI for Hugging Face
        const { OpenAI } = require("openai");
        require('dotenv').config();

        const client = new OpenAI({
            baseURL: "https://router.huggingface.co/v1",
            apiKey: process.env.HF_TOKEN
        });
        const MODEL_NAME = "zai-org/GLM-5:novita";

        // Fix: Extract moods from session
        const startMood = session.start_mood || 'unknown';
        const endMood = session.end_mood || 'unknown';


        // Get full chat transcript
        const messages = await db.all(
            'SELECT sender, content FROM messages WHERE user_id = ? AND partner_id = ? ORDER BY created_at ASC',
            [userId, session.partner_id || 1] // Fallback if partner_id missing
        );

        const transcript = messages.map(m => `${m.sender}: ${m.content}`).join('\n');

        let aiInsights = {
            emotionalJourney: {
                startEmoji: moodEmojis[startMood] || '😐',
                startLabel: moodLabels[startMood] || 'Unknown',
                endEmoji: moodEmojis[endMood] || '😌',
                endLabel: moodLabels[endMood] || 'Calmer',
                insight: "You explored your emotions." // Default fallback
            },
            communication: {
                style: communicationBadge,
                highlights: insights
            },
            connectionQuality: {
                score: score,
                descriptor: qualityDesc,
                impact: "You established a genuine connection."
            }
        };

        if (transcript.length > 50) {
            try {
                const prompt = `
                Analyze this conversation transcript between a user and a supportive partner/AI.
                Transcript:
                ${transcript}

                User's reflection:
                Feelings: ${reflection ? reflection.feelings : 'None'}
                Gratitude: ${reflection ? reflection.gratitude : 'None'}

                Provide a JSON response with the following structure (no markdown code blocks, just raw JSON):
                {
                    "emotional_shift_insight": "1 sentence describing how the user's mood changed based on the conversation tone.",
                    "communication_highlights": ["3 bullet points of positive communication behaviors shown by the user"],
                    "connection_impact": "1 sentence on the depth of connection established.",
                    "personalized_action": "1 specific, actionable suggestion for the user based on their specific conversation topics."
                }
                `;

                const completion = await client.chat.completions.create({
                    model: MODEL_NAME,
                    messages: [
                        { role: "system", content: "You are an empathetic emotional intelligence analyst. Output ONLY valid JSON. Do not show reasoning." },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 1000
                });

                const text = completion.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
                const analysis = JSON.parse(text);

                // Merge AI insights
                aiInsights.emotionalJourney.insight = analysis.emotional_shift_insight;
                aiInsights.communication.highlights = analysis.communication_highlights;
                aiInsights.connectionQuality.impact = analysis.connection_impact;
                if (analysis.personalized_action) {
                    aiInsights.actionSuggestion = analysis.personalized_action;
                }

            } catch (err) {
                console.error("AI Insight Generation Failed:", err);
                // Keep default/mock insights on failure
            }
        }

        res.json({
            session: {
                partnerName: session.partner_name || 'Partner',
                date: session.start_time,
                durationMinutes: session.duration_minutes || 10,
                messagesCount: msgCount,
                connectionScore: score
            },
            emotionalJourney: aiInsights.emotionalJourney,
            communication: aiInsights.communication,
            connectionQuality: aiInsights.connectionQuality,
            wellbeingMessage: aiInsights.emotionalJourney.insight,
            actionSuggestion: aiInsights.actionSuggestion || "Reflect on your growth.",
            userName: profile ? profile.name : 'Friend'
        });
    } catch (err) {
        console.error('Report error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get session history
router.get('/history', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const sessions = await db.all(
            'SELECT id, partner_name, start_time, end_mood, connection_score FROM sessions_log WHERE user_id = ? ORDER BY start_time DESC',
            [userId]
        );
        res.json(sessions);
    } catch (err) {
        console.error('History error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get specific report by ID
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const sessionId = req.params.id;

        const session = await db.get(
            'SELECT * FROM sessions_log WHERE id = ? AND user_id = ?',
            [sessionId, userId]
        );

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Reuse the logic from /latest (simplified for brevity, realistically should refactor into helper)
        // For now, let's just return the session data and basic insights to ensure it works
        const profile = await db.get('SELECT * FROM profiles WHERE user_id = ?', [userId]);

        res.json({
            session: {
                partnerName: session.partner_name || 'Partner',
                date: session.start_time,
                durationMinutes: session.duration_minutes || 10,
                messagesCount: session.messages_count,
                connectionScore: session.connection_score
            },
            emotionalJourney: {
                startEmoji: '😐', // Simplification for now
                endEmoji: '😌',
                insight: "You reviewed a past session."
            },
            communication: {
                style: "Reflective",
                highlights: ["Reviewed past insights"]
            },
            connectionQuality: {
                score: session.connection_score,
                descriptor: "Past Connection",
                impact: "Reviewing past connections helps growth."
            },
            wellbeingMessage: "Looking back helps you move forward.",
            actionSuggestion: "Keep building on this progress.",
            userName: profile ? profile.name : 'Friend'
        });

    } catch (err) {
        console.error('Get report error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
