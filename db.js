const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'heartlink.db');
const dbConnection = new sqlite3.Database(dbPath);

const db = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      dbConnection.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastInsertRowid: this.lastID });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      dbConnection.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      dbConnection.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

async function initDb() {
  try {
    await db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await db.run(`
            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY,
                name TEXT,
                interests TEXT, 
                goals TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);

    await db.run(`
            CREATE TABLE IF NOT EXISTS moods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                day_mood TEXT,
                current_mood TEXT,
                thoughts TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);

    await db.run(`
            CREATE TABLE IF NOT EXISTS connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                avatar TEXT,
                status TEXT,
                mood_emoji TEXT,
                mood_text TEXT,
                shared_interest TEXT,
                shared_interest_emoji TEXT,
                match_score INTEGER,
                user1_id INTEGER, 
                user2_id INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                partner_id INTEGER,
                sender TEXT,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

    await db.run(`
            CREATE TABLE IF NOT EXISTS reflections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                feelings TEXT,
                gratitude TEXT,
                connection_score INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);

    // Added missing columns based on reflection.js usage
    await db.run(`
            CREATE TABLE IF NOT EXISTS sessions_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                partner_id INTEGER,
                partner_name TEXT,
                start_mood TEXT,
                end_mood TEXT,
                messages_count INTEGER,
                duration_minutes INTEGER,
                connection_score INTEGER,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);

    // Seed demo connections if empty
    const count = await db.get("SELECT count(*) as c FROM connections");
    if (count && count.c === 0) {
      console.log("Seeding connections...");
      const seeds = [
        ['Sarah M.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', 'active', '😌', 'Calm', 'Meditation', '🧘‍♀️', 95],
        ['Alex R.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', 'online', '⚡', 'Energetic', 'Hiking', '🥾', 88],
        ['Jamie L.', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jamie', 'offline', '🤔', 'Reflective', 'Journaling', '✍️', 82]
      ];

      for (const s of seeds) {
        await db.run(`
                    INSERT INTO connections 
                    (name, avatar, status, mood_emoji, mood_text, shared_interest, shared_interest_emoji, match_score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, s);
      }
    }

  } catch (err) {
    console.error("Database initialization failed:", err);
  }
}

initDb();

module.exports = db;
