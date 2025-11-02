# CustomsBot - Discord LoL Integration Bot

A Discord bot that allows users to register their Discord profile and link their League of Legends accounts.

## Features

- ✅ User registration with Discord profile storage
- 🎮 League of Legends account linking (Riot ID format)
- 👤 Profile viewing with ELO, wins/losses, and stats
- 🎯 5v5 Custom game lobby system with team reactions
- 🏆 ELO ranking system (starts at 1500)
- 📊 Win/loss tracking and statistics
- 📈 Automatic ELO calculation based on team average
- 📦 SQLite database (no server needed!)
- 🖼️ Stores user profile pictures and names
- ⚔️ Automatic game finalization when teams are full

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" → "Add Bot"
4. Enable these intents under "Privileged Gateway Intents":
   - ✅ `MESSAGE CONTENT INTENT` ⚠️ **Required!**
   - ✅ `SERVER MEMBERS INTENT` (Recommended)
5. Copy your bot token

### 3. Configure the Bot

1. Copy `.env.example` to `.env`
2. Paste your bot token:
   ```env
   DISCORD_TOKEN=your_actual_token_here
   ```

### 4. Invite Bot to Your Server

1. Go to OAuth2 → URL Generator
2. Scopes: Check `bot`
3. Bot Permissions: 
   - ✅ Send Messages
   - ✅ Read Messages/View Channels
   - ✅ Embed Links
   - ✅ Add Reactions
   - ✅ Read Message History
   - ✅ Manage Messages
4. Copy the generated URL and open it to invite the bot

### 5. Run the Bot

```bash
npm start
```

The bot will automatically create a `users.db` database file on first run.

## Commands

### `!ping`
Test if the bot is online.
```
!ping
```

### `!register [@user]`
Register your Discord account with the bot. This saves your:
- Discord username and tag
- Profile picture
- User ID

**Admin Feature:** Admins can register other users by mentioning them.

**Examples:**
```
!register              # Register yourself
!register @username    # Admin registers another user
```

### `!link <RiotID#TAG>`
Link your League of Legends account (must register first). Region is always **EUW**.

**Format:** Your Riot ID must include the # tag (e.g., SummonerName#TAG)

**Examples:**
```
!link Faker#KR1
!link Doublelift#NA1
!link "Hide on bush#KR1"
```
*Use quotes for Riot IDs with spaces in the name*

### `!profile [@user]`
View your profile or mention another user to view theirs. Shows:
- Discord information
- Riot ID and region
- **ELO Rating** (starting at 1500)
- **Games Played**
- **Win Rate** with wins/losses breakdown

```
!profile
!profile @username
```

### `!elo @user <integer>` *(Admin Only)*
Manually adjust a user's ELO rating.

**Permissions:** Administrator or Manage Messages

**Usage:**
- Positive number = Add ELO
- Negative number = Remove ELO

**Examples:**
```
!elo @username 50    # Add 50 ELO
!elo @username -25   # Remove 25 ELO
!elo @username 100   # Add 100 ELO
```

### `!makegame`
Create a 5v5 custom game lobby. Players can react with 1️⃣ or 2️⃣ to join Team 1 or Team 2.

**Requirements:**
- Must be registered (`!register`)
- Must have a linked LoL account (`!link`)

**How it works:**
1. React with 1️⃣ to join Team 1
2. React with 2️⃣ to join Team 2
3. You can switch teams by reacting to the other emoji
4. When both teams have 5 players, a **confirmation message appears**
5. **Admins must react with ✅ to confirm** or ❌ to cancel
6. Once confirmed, the game starts and a final overview is posted
7. **After the game:** Admins react with 1️⃣ or 2️⃣ to select the winning team
8. **ELO is automatically calculated and updated** for all players

```
!makegame
```

### `!makegamebalanced`
Create a balanced game lobby where teams are automatically assigned based on ELO.

**Requirements:**
- Must be registered (`!register`)
- Must have a linked LoL account (`!link`)

**How it works:**
1. React with ✅ to join the lobby (up to 10 players)
2. Players are shown sorted by ELO
3. Admins use `!startbalanced` to start the game
4. **Bot automatically balances teams** using a greedy algorithm
5. Teams are assigned to minimize ELO difference between sides
6. Shows average ELO for each team
7. **After the game:** Admins react with 1️⃣ or 2️⃣ to select the winning team

```
!makegamebalanced
```

### `!startbalanced` *(Admin Only)*
Start a balanced game lobby and assign teams.

**Permissions:** Game creator or Administrator/Manage Messages

**Requirements:**
- Minimum 2 players in the lobby
- Active balanced game lobby in the channel

```
!startbalanced
```

### `!forcestartgame`
Request to start the game without waiting for both teams to be full.

**Permissions:**
- Only the game creator or server admins can request force start
- Requires at least 1 player in the lobby

**How it works:**
1. Admin types `!forcestartgame`
2. A **confirmation message appears**
3. **Another admin must react with ✅** to confirm or ❌ to cancel
4. Once confirmed, the game starts with current teams
5. After the game, admins select the winning team
6. ELO will be calculated and updated for all players

```
!forcestartgame
```

### `!help`
Display all available commands.

```
!help
```

## Database

The bot uses **SQLite** - a simple, file-based database that requires no setup or server.

- Database file: `users.db`
- Automatically created on first run
- Stores:
  - Discord ID (primary key)
  - Discord username & tag
  - Avatar URL
  - League of Legends Riot ID (Name#TAG)
  - LoL region (always EUW)
  - **ELO rating** (default: 1500)
  - **Games played, wins, and losses**
  - Registration timestamp

## Project Structure

```
CustomsBot/
├── index.js          # Main bot file with commands
├── database.js       # Database functions and schema
├── package.json      # Dependencies
├── .env              # Your bot token (create this)
├── .env.example      # Example configuration
├── users.db          # SQLite database (auto-created)
└── README.md         # This file
```

## Adding Custom Features

The database module (`database.js`) provides these functions:

```javascript
const db = require('./database');

// Register a user
db.registerUser(discordId, username, tag, avatarUrl);

// Link LoL account (region is always EUW)
db.linkLolAccount(discordId, riotId); // riotId format: "Name#TAG"

// Get user data
const user = db.getUser(discordId);

// Check if registered
const isRegistered = db.isUserRegistered(discordId);

// Get all users
const allUsers = db.getAllUsers();
```

## ELO System

The bot uses a standard ELO rating system:

- **Starting ELO:** 1500 for all new players
- **ELO Calculation:** Based on team average ELO
- **K-Factor:** 32 (standard chess rating)
- **Formula:** Uses expected score calculation based on 400-point rating difference
- **Updates:** Automatic after admins confirm game results

### How ELO Changes:
- If you beat a higher-rated team, you gain more ELO
- If you beat a lower-rated team, you gain less ELO
- Losses result in corresponding ELO decreases
- Team average ELO is used to calculate expected outcome

### Example:
- Team 1 average: 1500 ELO
- Team 2 average: 1600 ELO
- If Team 1 wins (upset): They gain ~22 ELO, Team 2 loses 22 ELO
- If Team 2 wins (expected): They gain ~10 ELO, Team 1 loses 10 ELO

## Troubleshooting

### Bot not responding
- Make sure `MESSAGE CONTENT INTENT` is enabled
- Check that the bot has permissions in your server
- Verify your token in `.env`

### Database errors
- Delete `users.db` and restart to recreate the database
- Make sure the bot has write permissions in the folder

### Commands not working
- Commands are case-insensitive
- Make sure to register before linking LoL account
- Riot ID must include the # tag (e.g., Name#TAG)
- Use quotes for Riot IDs with spaces in the name

## Future Features

Ideas for expansion:
- Riot API integration for live stats
- Match history lookup
- Rank tracking
- Custom game organization
- Team formation

## License

MIT

