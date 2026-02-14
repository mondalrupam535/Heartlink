const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: 'heartlink-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    }
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// Static files
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/mood', require('./routes/mood'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/reflection', require('./routes/reflection'));
app.use('/api/report', require('./routes/report'));

// Page routes - serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'loginpage.html'));
});

// Socket.IO for real-time chat
const botResponses = {
    greeting: [
        "Hey! It's really nice to meet you 😊",
        "Hi there! I'm glad you reached out. How are you?",
        "Hello! Thanks for connecting with me. What's on your mind?"
    ],
    empathy: [
        "I completely understand how you feel. That must be really tough.",
        "Thank you for sharing that with me. It takes courage to open up.",
        "I hear you. Your feelings are completely valid. 💙",
        "That sounds really challenging. I'm here for you."
    ],
    positive: [
        "That's wonderful to hear! What made it so special?",
        "I love that! It's the little things that matter most.",
        "That really warms my heart. You deserve happiness! ✨"
    ],
    question: [
        "What do you think helps you cope when things get tough?",
        "Is there something specific you'd like to talk about?",
        "What does a perfect day look like for you?",
        "What's something that always makes you smile?"
    ],
    encouragement: [
        "You're doing great by being here and talking. That takes real strength.",
        "Remember, it's okay to not be okay sometimes. You're human. 💜",
        "I'm proud of you for reaching out. Every step counts.",
        "You matter more than you know. Don't forget that."
    ],
    music: [
        "I love music too! What genre do you usually listen to?",
        "Music has such a powerful way of connecting us to our emotions.",
        "Do you play any instruments, or do you enjoy just listening?"
    ],
    general: [
        "That's really interesting! Tell me more about that.",
        "I appreciate you sharing that with me.",
        "How does that make you feel when you think about it?",
        "What would make today even better for you?"
    ]
};

function generateBotResponse(userMessage) {
    const lower = userMessage.toLowerCase();

    if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
        return pickRandom(botResponses.greeting);
    }
    if (lower.includes('sad') || lower.includes('lonely') || lower.includes('stressed') || lower.includes('anxious') || lower.includes('tired') || lower.includes('overwhelmed')) {
        return pickRandom(botResponses.empathy);
    }
    if (lower.includes('happy') || lower.includes('good') || lower.includes('great') || lower.includes('amazing') || lower.includes('wonderful')) {
        return pickRandom(botResponses.positive);
    }
    if (lower.includes('music') || lower.includes('song') || lower.includes('listen')) {
        return pickRandom(botResponses.music);
    }
    if (lower.endsWith('?')) {
        return pickRandom(botResponses.encouragement);
    }

    // Mix of general and questions
    const pool = [...botResponses.general, ...botResponses.question, ...botResponses.encouragement];
    return pickRandom(pool);
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

io.on('connection', (socket) => {
    const session = socket.request.session;
    const userId = session ? session.userId : null;

    if (!userId) {
        socket.disconnect();
        return;
    }

    console.log(`User ${userId} connected to chat`);

    socket.on('join_room', (data) => {
        const room = `chat_${userId}_${data.partnerId}`;
        socket.join(room);
        console.log(`User ${userId} joined room ${room}`);
    });

    // Initialize OpenAI for Hugging Face
    const { OpenAI } = require("openai");
    require('dotenv').config();

    const client = new OpenAI({
        baseURL: "https://router.huggingface.co/v1",
        apiKey: process.env.HF_TOKEN
    });

    const MODEL_NAME = "zai-org/GLM-5:novita";

    // Helper to get chat history for context
    async function getChatHistory(userId, partnerId) {
        const messages = await db.all(
            'SELECT sender, content FROM messages WHERE user_id = ? AND partner_id = ? ORDER BY created_at ASC',
            [userId, partnerId]
        );

        // Format for OpenAI/HF history
        const history = messages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.content
        }));

        // Add system instruction for persona
        return [
            { role: "system", content: "You are a warm, empathetic, and supportive friend. Keep your responses short, conversational, and encouraging. Use emojis occasionally. Do not show your internal reasoning or thoughts. Just output the final response directly to the user." },
            ...history
        ];
    }

    socket.on('send_message', async (data) => {
        try {
            const { partnerId, content } = data;

            // Save user message to DB
            await db.run(
                'INSERT INTO messages (user_id, partner_id, sender, content) VALUES (?, ?, ?, ?)',
                [userId, partnerId, 'user', content]
            );

            // Generate AI response
            const typingDelay = 1000 + Math.random() * 1000;
            socket.emit('typing_start', { partnerId });

            setTimeout(async () => {
                try {
                    // Get history for context
                    const history = await getChatHistory(userId, partnerId);

                    // Call HF Inference API
                    const completion = await client.chat.completions.create({
                        model: MODEL_NAME,
                        messages: history,
                        max_tokens: 1000
                    });

                    const botReply = completion.choices[0].message.content || "I'm here for you! 💙";

                    // Save AI message
                    await db.run(
                        'INSERT INTO messages (user_id, partner_id, sender, content) VALUES (?, ?, ?, ?)',
                        [userId, partnerId, 'partner', botReply]
                    );

                    socket.emit('typing_stop', { partnerId });
                    socket.emit('receive_message', {
                        sender: 'partner',
                        content: botReply,
                        createdAt: new Date().toISOString()
                    });
                } catch (err) {
                    console.error('HF API error:', err);
                    // Fallback to simple response if API fails
                    const fallback = "I'm having trouble connecting right now, but I'm listening. 💙";
                    socket.emit('typing_stop', { partnerId });
                    socket.emit('receive_message', {
                        sender: 'partner',
                        content: fallback,
                        createdAt: new Date().toISOString()
                    });
                }
            }, typingDelay);
        } catch (err) {
            console.error('Socket message error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User ${userId} disconnected from chat`);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`\n🫀 HeartLink server running at http://localhost:${PORT}\n`);
    console.log('  📄 Login:       http://localhost:' + PORT);
    console.log('  📄 Profile:     http://localhost:' + PORT + '/page2.html');
    console.log('  📄 Check-in:    http://localhost:' + PORT + '/page3.html');
    console.log('  📄 Insight:     http://localhost:' + PORT + '/page4.html');
    console.log('  📄 Connections: http://localhost:' + PORT + '/page5.html');
    console.log('  📄 Chat:        http://localhost:' + PORT + '/page6.html');
    console.log('  📄 Reflect:     http://localhost:' + PORT + '/page7.html');
    console.log('  📄 Report:      http://localhost:' + PORT + '/page8.html');
    console.log('');
});
