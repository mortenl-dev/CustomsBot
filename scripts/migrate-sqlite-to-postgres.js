const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { Pool } = require('pg');

// Validate env
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Add it to your .env or environment before running the migration.');
  process.exit(1);
}

// Open SQLite
const sqlite = new Database(path.join(__dirname, '..', 'users.db'));

// Connect Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    // Ensure schema exists in Postgres
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        discord_username TEXT NOT NULL,
        discord_tag TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        lol_riot_id TEXT,
        lol_region TEXT DEFAULT 'euw',
        elo INTEGER DEFAULT 1500,
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        registered_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_elo ON users (elo DESC);`);

    // Read all users from SQLite
    const rows = sqlite.prepare('SELECT * FROM users').all();
    console.log(`Migrating ${rows.length} users...`);

    let ok = 0, fail = 0;
    for (const u of rows) {
      try {
        await pool.query(
          `
          INSERT INTO users (discord_id, discord_username, discord_tag, avatar_url, lol_riot_id, lol_region, elo, games_played, wins, losses, registered_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW(), NOW())
          ON CONFLICT (discord_id) DO UPDATE
          SET discord_username = EXCLUDED.discord_username,
              discord_tag = EXCLUDED.discord_tag,
              avatar_url = EXCLUDED.avatar_url,
              lol_riot_id = EXCLUDED.lol_riot_id,
              lol_region = EXCLUDED.lol_region,
              elo = EXCLUDED.elo,
              games_played = EXCLUDED.games_played,
              wins = EXCLUDED.wins,
              losses = EXCLUDED.losses,
              updated_at = NOW()
          `,
          [
            u.discord_id, u.discord_username, u.discord_tag, u.avatar_url,
            u.lol_riot_id, u.lol_region || 'euw', u.elo || 1500,
            u.games_played || 0, u.wins || 0, u.losses || 0
          ]
        );
        ok++;
      } catch (err) {
        fail++;
        console.error(`Row failed for ${u.discord_id}:`, err.message);
      }
    }
    console.log(`✅ Migration complete. Success: ${ok}, Failed: ${fail}`);
  } catch (e) {
    console.error('Migration error:', e);
  } finally {
    await pool.end();
  }
})();