const Database = require('better-sqlite3');
const path = require('path');

// Create/open database
const db = new Database(path.join(__dirname, 'users.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create users table
db.exec(`
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
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log('📦 Database initialized');

// Prepared statements for better performance
const statements = {
    // Register or update a user
    registerUser: db.prepare(`
        INSERT INTO users (discord_id, discord_username, discord_tag, avatar_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(discord_id) DO UPDATE SET
            discord_username = excluded.discord_username,
            discord_tag = excluded.discord_tag,
            avatar_url = excluded.avatar_url,
            updated_at = CURRENT_TIMESTAMP
    `),

    // Link League of Legends account
    linkLolAccount: db.prepare(`
        UPDATE users
        SET lol_riot_id = ?,
            lol_region = 'euw',
            updated_at = CURRENT_TIMESTAMP
        WHERE discord_id = ?
    `),

    // Get user by Discord ID
    getUser: db.prepare(`
        SELECT * FROM users WHERE discord_id = ?
    `),

    // Get all registered users
    getAllUsers: db.prepare(`
        SELECT * FROM users ORDER BY registered_at DESC
    `),

    // Check if user exists
    userExists: db.prepare(`
        SELECT COUNT(*) as count FROM users WHERE discord_id = ?
    `),
};

// Database functions
const dbFunctions = {
    /**
     * Register a Discord user
     */
    registerUser(discordId, username, tag, avatarUrl) {
        try {
            statements.registerUser.run(discordId, username, tag, avatarUrl);
            return { success: true };
        } catch (error) {
            console.error('Error registering user:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Link a League of Legends account to a Discord user
     */
    linkLolAccount(discordId, riotId) {
        try {
            const result = statements.linkLolAccount.run(riotId, discordId);
            if (result.changes === 0) {
                return { success: false, error: 'User not registered' };
            }
            return { success: true };
        } catch (error) {
            console.error('Error linking LoL account:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get user information
     */
    getUser(discordId) {
        try {
            return statements.getUser.get(discordId);
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    },

    /**
     * Get all registered users
     */
    getAllUsers() {
        try {
            return statements.getAllUsers.all();
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    },

    /**
     * Check if user is registered
     */
    isUserRegistered(discordId) {
        try {
            const result = statements.userExists.get(discordId);
            return result.count > 0;
        } catch (error) {
            console.error('Error checking user existence:', error);
            return false;
        }
    },

    /**
     * Update ELO and stats for a user
     */
    updateUserStats(discordId, eloChange, won) {
        try {
            const updateStmt = db.prepare(`
                UPDATE users
                SET elo = elo + ?,
                    games_played = games_played + 1,
                    wins = wins + ?,
                    losses = losses + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ?
            `);
            
            const winsIncrement = won ? 1 : 0;
            const lossesIncrement = won ? 0 : 1;
            
            updateStmt.run(eloChange, winsIncrement, lossesIncrement, discordId);
            return { success: true };
        } catch (error) {
            console.error('Error updating user stats:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Manually adjust a user's ELO (admin command)
     */
    adjustUserElo(discordId, eloChange) {
        try {
            const updateStmt = db.prepare(`
                UPDATE users
                SET elo = elo + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ?
            `);
            
            const result = updateStmt.run(eloChange, discordId);
            if (result.changes === 0) {
                return { success: false, error: 'User not found' };
            }
            return { success: true };
        } catch (error) {
            console.error('Error adjusting user ELO:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Revert game stats for a user (undo functionality)
     */
    revertGameStats(discordId, eloChange, hadWon) {
        try {
            const updateStmt = db.prepare(`
                UPDATE users
                SET elo = elo - ?,
                    games_played = games_played - 1,
                    wins = wins - ?,
                    losses = losses - ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ?
            `);
            
            const winsDecrement = hadWon ? 1 : 0;
            const lossesDecrement = hadWon ? 0 : 1;
            
            updateStmt.run(eloChange, winsDecrement, lossesDecrement, discordId);
            return { success: true };
        } catch (error) {
            console.error('Error reverting game stats:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Manually remove a win from a user (admin command)
     */
    removeWin(discordId) {
        try {
            const user = this.getUser(discordId);
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            
            if (user.wins === 0) {
                return { success: false, error: 'User has no wins to remove' };
            }
            
            if (user.games_played === 0) {
                return { success: false, error: 'User has no games played' };
            }

            const updateStmt = db.prepare(`
                UPDATE users
                SET wins = wins - 1,
                    games_played = games_played - 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ?
            `);
            
            updateStmt.run(discordId);
            return { success: true };
        } catch (error) {
            console.error('Error removing win:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Manually remove a loss from a user (admin command)
     */
    removeLoss(discordId) {
        try {
            const user = this.getUser(discordId);
            if (!user) {
                return { success: false, error: 'User not found' };
            }
            
            if (user.losses === 0) {
                return { success: false, error: 'User has no losses to remove' };
            }
            
            if (user.games_played === 0) {
                return { success: false, error: 'User has no games played' };
            }

            const updateStmt = db.prepare(`
                UPDATE users
                SET losses = losses - 1,
                    games_played = games_played - 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE discord_id = ?
            `);
            
            updateStmt.run(discordId);
            return { success: true };
        } catch (error) {
            console.error('Error removing loss:', error);
            return { success: false, error: error.message };
        }
    },
};

// Export database functions
module.exports = dbFunctions;

