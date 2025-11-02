// Postgres-only DB adapter
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please configure your Postgres connection string in your environment or .env file.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

async function init() {
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
  console.log('📦 Database initialized (Postgres-only)');
}
init().catch(err => console.error('Error initializing Postgres DB:', err));

const db = {
  async registerUser(discordId, username, tag, avatarUrl) {
    try {
      await pool.query(
        `
        INSERT INTO users (discord_id, discord_username, discord_tag, avatar_url)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (discord_id) DO UPDATE
        SET discord_username = EXCLUDED.discord_username,
            discord_tag = EXCLUDED.discord_tag,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = NOW()
        `,
        [discordId, username, tag, avatarUrl]
      );
      return { success: true };
    } catch (error) {
      console.error('Error registering user (pg):', error);
      return { success: false, error: error.message };
    }
  },

  async linkLolAccount(discordId, riotId) {
    try {
      const res = await pool.query(
        `
        UPDATE users
        SET lol_riot_id = $1,
            lol_region = 'euw',
            updated_at = NOW()
        WHERE discord_id = $2
        `,
        [riotId, discordId]
      );
      return res.rowCount > 0 ? { success: true } : { success: false, error: 'User not registered' };
    } catch (error) {
      console.error('Error linking LoL account (pg):', error);
      return { success: false, error: error.message };
    }
  },

  async getUser(discordId) {
    try {
      const { rows } = await pool.query(`SELECT * FROM users WHERE discord_id = $1`, [discordId]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error getting user (pg):', error);
      return null;
    }
  },

  async getAllUsers() {
    try {
      const { rows } = await pool.query(`SELECT * FROM users ORDER BY registered_at DESC`);
      return rows;
    } catch (error) {
      console.error('Error getting all users (pg):', error);
      return [];
    }
  },

  async isUserRegistered(discordId) {
    try {
      const { rows } = await pool.query(`SELECT 1 FROM users WHERE discord_id = $1 LIMIT 1`, [discordId]);
      return rows.length > 0;
    } catch (error) {
      console.error('Error checking user existence (pg):', error);
      return false;
    }
  },

  async updateUserStats(discordId, eloChange, won) {
    try {
      const winsInc = won ? 1 : 0;
      const lossesInc = won ? 0 : 1;
      await pool.query(
        `
        UPDATE users
        SET elo = elo + $1,
            games_played = games_played + 1,
            wins = wins + $2,
            losses = losses + $3,
            updated_at = NOW()
        WHERE discord_id = $4
        `,
        [eloChange, winsInc, lossesInc, discordId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error updating user stats (pg):', error);
      return { success: false, error: error.message };
    }
  },

  async adjustUserElo(discordId, eloChange) {
    try {
      const res = await pool.query(
        `
        UPDATE users
        SET elo = elo + $1,
            updated_at = NOW()
        WHERE discord_id = $2
        `,
        [eloChange, discordId]
      );
      return res.rowCount > 0 ? { success: true } : { success: false, error: 'User not found' };
    } catch (error) {
      console.error('Error adjusting user ELO (pg):', error);
      return { success: false, error: error.message };
    }
  },

  async revertGameStats(discordId, eloChange, hadWon) {
    try {
      const winsDec = hadWon ? 1 : 0;
      const lossesDec = hadWon ? 0 : 1;
      await pool.query(
        `
        UPDATE users
        SET elo = elo - $1,
            games_played = games_played - 1,
            wins = wins - $2,
            losses = losses - $3,
            updated_at = NOW()
        WHERE discord_id = $4
        `,
        [eloChange, winsDec, lossesDec, discordId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error reverting game stats (pg):', error);
      return { success: false, error: error.message };
    }
  },

  async removeWin(discordId) {
    try {
      const user = await this.getUser(discordId);
      if (!user) return { success: false, error: 'User not found' };
      if (user.wins <= 0) return { success: false, error: 'User has no wins to remove' };
      if (user.games_played <= 0) return { success: false, error: 'User has no games played' };

      await pool.query(
        `
        UPDATE users
        SET wins = wins - 1,
            games_played = games_played - 1,
            updated_at = NOW()
        WHERE discord_id = $1
        `,
        [discordId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error removing win (pg):', error);
      return { success: false, error: error.message };
    }
  },

  async removeLoss(discordId) {
    try {
      const user = await this.getUser(discordId);
      if (!user) return { success: false, error: 'User not found' };
      if (user.losses <= 0) return { success: false, error: 'User has no losses to remove' };
      if (user.games_played <= 0) return { success: false, error: 'User has no games played' };

      await pool.query(
        `
        UPDATE users
        SET losses = losses - 1,
            games_played = games_played - 1,
            updated_at = NOW()
        WHERE discord_id = $1
        `,
        [discordId]
      );
      return { success: true };
    } catch (error) {
      console.error('Error removing loss (pg):', error);
      return { success: false, error: error.message };
    }
  },
};

module.exports = db;

