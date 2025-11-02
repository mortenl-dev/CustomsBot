require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ]
});

// Store active game lobbies
const activeGames = new Map();

// Store completed games for undo functionality (channelId -> game history)
const completedGames = new Map();

// Bot is ready
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online!`);
});

// Ensures a user exists in DB, auto-register if missing
async function ensureRegisteredUser(user) {
  const existing = await db.getUser(user.id);
  if (existing) return existing;

  const tag = user.tag || `${user.username}#${user.discriminator || '0000'}`;
  const avatar = user.displayAvatarURL ? user.displayAvatarURL({ size: 256, extension: 'png' }) : '';
  await db.registerUser(user.id, user.username, tag, avatar);
  return await db.getUser(user.id);
}

// Listen for messages
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // !ping command
    if (command === '!ping') {
        message.channel.send('Test');
    }

    // !register command - Register the user (or another user if admin)
    else if (command === '!register') {
        // Check if a user is mentioned (admin registering someone else)
        const mentionedUser = message.mentions.users.first();
        
        let targetUser;
        let isAdminRegistering = false;

        if (mentionedUser) {
            // Admin is trying to register another user
            const member = await message.guild.members.fetch(message.author.id);
            const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

            if (!isAdmin) {
                const botMessage = await message.channel.send('❌ Only admins can register other users! Use `!register` to register yourself.');
                setTimeout(() => {
                    message.delete().catch(() => {});
                    botMessage.delete().catch(() => {});
                }, 10000);
                return;
            }

            targetUser = mentionedUser;
            isAdminRegistering = true;
        } else {
            // User is registering themselves
            targetUser = message.author;
        }

        const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 256 });
        
        const result = await db.registerUser(
            targetUser.id,
            targetUser.username,
            targetUser.tag,
            avatarUrl
        );

        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Registration Successful!')
                .setDescription(isAdminRegistering 
                    ? `Admin <@${message.author.id}> registered <@${targetUser.id}>!` 
                    : `Welcome, ${targetUser.username}!`)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: '👤 Username', value: targetUser.tag, inline: true },
                    { name: '🆔 Discord ID', value: targetUser.id, inline: true },
                )
                .setFooter({ text: 'Use !link <RiotID#TAG> to link your LoL account (EUW) | This message will auto-delete in 10s' })
                .setTimestamp();

            const botMessage = await message.channel.send({ embeds: [embed] });
            
            // Delete both messages after 10 seconds
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
        } else {
            const botMessage = await message.channel.send('❌ Registration failed. Please try again.');
            
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
        }
    }

    // !link command - Link League of Legends account
    else if (command === '!link') {
        // Usage: !link <RiotID#TAG>
        if (args.length < 2) {
            const botMessage = await message.channel.send('❌ Usage: `!link <RiotID#TAG>`\nExample: `!link Faker#KR1` or `!link "Hide on bush#KR1"`');
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
            return;
        }

    // Ensure user is registered (auto-register if not)
    await ensureRegisteredUser(message.author);

        // Parse Riot ID (handle spaces in names)
        let riotId;
        
        // Get everything after "!link "
        const inputText = message.content.substring(6).trim(); // 6 is length of "!link "
        
        // Remove quotes if present
        if (inputText.startsWith('"') && inputText.includes('"')) {
            const endQuote = inputText.indexOf('"', 1);
            riotId = inputText.substring(1, endQuote);
        } else {
            riotId = inputText;
        }

        // Validate format (must contain #)
        if (!riotId.includes('#')) {
            const botMessage = await message.channel.send('❌ Invalid format! Riot ID must include the # tag.\nExample: `!link Faker#KR1`');
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
            return;
        }

        // Split into name and tag
        const parts = riotId.split('#');
        if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
            const botMessage = await message.channel.send('❌ Invalid Riot ID format.\nExample: `!link SummonerName#TAG`');
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
            return;
        }

        // Linking
        const linkRes = await db.linkLolAccount(message.author.id, riotId);
        if (!linkRes.success) {
            const botMessage = await message.channel.send(`❌ Failed to link account: ${linkRes.error}`);
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
        } else {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🎮 LoL Account Linked!')
                .setDescription(`Successfully linked your League of Legends account!`)
                .addFields(
                    { name: '🎯 Riot ID', value: riotId, inline: true },
                    { name: '🌍 Region', value: 'EUW', inline: true },
                )
                .setFooter({ text: 'Use !profile to view your complete profile | This message will auto-delete in 10s' })
                .setTimestamp();

            const botMessage = await message.channel.send({ embeds: [embed] });
            
            // Delete both messages after 10 seconds
            setTimeout(() => {
                message.delete().catch(() => {});
                botMessage.delete().catch(() => {});
            }, 10000);
        }
    }

    // !profile command - View user profile
    else if (command === '!profile') {
        // Check if mentioning another user
    const targetUser = message.mentions.users.first() || message.author;
    let userData = await db.getUser(targetUser.id);

        if (!userData) {
            if (targetUser.id === message.author.id) {
                // Auto-register the author and continue
                userData = await ensureRegisteredUser(targetUser);
            } else {
                message.channel.send('❌ This user is not registered.');
                return;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`${userData.discord_username}'s Profile`)
            .setThumbnail(userData.avatar_url)
            .addFields(
                { name: '👤 Discord', value: userData.discord_tag, inline: true },
                { name: '🆔 ID', value: userData.discord_id, inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // Spacer
            );

        if (userData.lol_riot_id) {
            embed.addFields(
                { name: '🎮 Riot ID', value: userData.lol_riot_id, inline: true },
                { name: '🌍 Region', value: 'EUW', inline: true },
                { name: '\u200B', value: '\u200B', inline: true }, // Spacer
            );
        } else {
            embed.addFields(
                { name: '🎮 League of Legends', value: 'Not linked yet', inline: false }
            );
        }

        // Calculate win rate
        const winRate = userData.games_played > 0 
            ? ((userData.wins / userData.games_played) * 100).toFixed(1)
            : '0.0';

        embed.addFields(
            { name: '🏆 ELO Rating', value: `${userData.elo}`, inline: true },
            { name: '🎯 Games Played', value: `${userData.games_played}`, inline: true },
            { name: '📊 Win Rate', value: `${winRate}% (${userData.wins}W/${userData.losses}L)`, inline: true },
        );

        message.channel.send({ embeds: [embed] });
        // Delete the user's command message after success
        message.delete().catch(() => {});
    }

    // !elo command - Manually adjust user ELO (admin only)
    else if (command === '!elo') {
        // Check if user is admin
        const member = await message.guild.members.fetch(message.author.id);
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isAdmin) {
            message.channel.send('❌ You need Administrator or Manage Messages permission to use this command!');
            return;
        }

        // Parse arguments: !elo @user <integer>
        const targetUser = message.mentions.users.first();
        const eloChangeStr = args[2];

        if (!targetUser || !eloChangeStr) {
            message.channel.send('❌ Usage: `!elo @user <integer>`\nExample: `!elo @username 50` (add 50) or `!elo @username -25` (remove 25)');
            return;
        }

        const eloChange = parseInt(eloChangeStr);

        if (isNaN(eloChange)) {
            message.channel.send('❌ ELO change must be a valid integer!');
            return;
        }

        // Check if target user is registered
    const userData = await db.getUser(targetUser.id);
        if (!userData) {
            message.channel.send('❌ This user is not registered!');
            return;
        }

        // Adjust ELO
    const result = await db.adjustUserElo(targetUser.id, eloChange);

        if (result.success) {
            const newUserData = await db.getUser(targetUser.id);
            const changeText = eloChange > 0 ? `+${eloChange}` : `${eloChange}`;
            
            const embed = new EmbedBuilder()
                .setColor(eloChange > 0 ? 0x00FF00 : 0xFF0000)
                .setTitle('⚙️ ELO Adjusted')
                .setDescription(`Admin <@${message.author.id}> adjusted ELO for <@${targetUser.id}>`)
                .addFields(
                    { name: '📊 Change', value: `${changeText} ELO`, inline: true },
                    { name: '🏆 New ELO', value: `${newUserData.elo}`, inline: true },
                )
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
            console.log(`[ADMIN] ${message.author.username} adjusted ${targetUser.username}'s ELO by ${eloChange}`);
            // Delete the user's command message after success
            message.delete().catch(() => {});
        } else {
            message.channel.send(`❌ Failed to adjust ELO: ${result.error}`);
        }
    }

    // !removewin command - Manually remove a win from a user (admin only)
    else if (command === '!removewin') {
        // Check if user is admin
        const member = await message.guild.members.fetch(message.author.id);
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isAdmin) {
            message.channel.send('❌ You need Administrator or Manage Messages permission to use this command!');
            return;
        }

        // Parse arguments: !removewin @user
        const targetUser = message.mentions.users.first();

        if (!targetUser) {
            message.channel.send('❌ Usage: `!removewin @user`\nExample: `!removewin @username`');
            return;
        }

        // Check if target user is registered
    const userData = await db.getUser(targetUser.id);
        if (!userData) {
            message.channel.send('❌ This user is not registered!');
            return;
        }

        // Remove win
    const result = await db.removeWin(targetUser.id);

        if (result.success) {
            const newUserData = await db.getUser(targetUser.id);
            
            const embed = new EmbedBuilder()
                .setColor(0xFF8800)
                .setTitle('📉 Win Removed')
                .setDescription(`Admin <@${message.author.id}> removed a win from <@${targetUser.id}>`)
                .addFields(
                    { name: '🎯 Games Played', value: `${newUserData.games_played}`, inline: true },
                    { name: '✅ Wins', value: `${newUserData.wins}`, inline: true },
                    { name: '❌ Losses', value: `${newUserData.losses}`, inline: true },
                )
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
            console.log(`[ADMIN] ${message.author.username} removed a win from ${targetUser.username}`);
            // Delete the user's command message after success
            message.delete().catch(() => {});
        } else {
            message.channel.send(`❌ Failed to remove win: ${result.error}`);
        }
    }

    // !removeloss command - Manually remove a loss from a user (admin only)
    else if (command === '!removeloss') {
        // Check if user is admin
        const member = await message.guild.members.fetch(message.author.id);
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isAdmin) {
            message.channel.send('❌ You need Administrator or Manage Messages permission to use this command!');
            return;
        }

        // Parse arguments: !removeloss @user
        const targetUser = message.mentions.users.first();

        if (!targetUser) {
            message.channel.send('❌ Usage: `!removeloss @user`\nExample: `!removeloss @username`');
            return;
        }

        // Check if target user is registered
    const userData = await db.getUser(targetUser.id);
        if (!userData) {
            message.channel.send('❌ This user is not registered!');
            return;
        }

        // Remove loss
    const result = await db.removeLoss(targetUser.id);

        if (result.success) {
            const newUserData = await db.getUser(targetUser.id);
            
            const embed = new EmbedBuilder()
                .setColor(0xFF8800)
                .setTitle('📉 Loss Removed')
                .setDescription(`Admin <@${message.author.id}> removed a loss from <@${targetUser.id}>`)
                .addFields(
                    { name: '🎯 Games Played', value: `${newUserData.games_played}`, inline: true },
                    { name: '✅ Wins', value: `${newUserData.wins}`, inline: true },
                    { name: '❌ Losses', value: `${newUserData.losses}`, inline: true },
                )
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
            console.log(`[ADMIN] ${message.author.username} removed a loss from ${targetUser.username}`);
            // Delete the user's command message after success
            message.delete().catch(() => {});
        } else {
            message.channel.send(`❌ Failed to remove loss: ${result.error}`);
        }
    }

    // !leaderboard command - Show Top 5 by ELO and Top 5 by Win Rate
    else if (command === '!leaderboard') {
        // Fetch all users
    const users = await db.getAllUsers();

        if (!users || users.length === 0) {
            message.channel.send('❌ No registered users yet. Use `!register` to get started.');
            return;
        }

        // Top 5 by ELO
        const topElo = [...users]
            .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
            .slice(0, 5);

        const topEloLines = topElo.length > 0
            ? topElo.map((u, i) => {
                const wr = u.games_played > 0 ? ((u.wins / u.games_played) * 100).toFixed(1) : '0.0';
                return `${i + 1}. <@${u.discord_id}> — ${u.elo} ELO  (${u.wins}W/${u.losses}L, ${wr}%)`;
            }).join('\n')
            : 'No players found';

        // Top 5 by Win Rate (min 1 game)
        const withGames = users.filter(u => (u.games_played ?? 0) > 0);
        const topWr = withGames
            .map(u => ({ ...u, _wr: u.games_played > 0 ? u.wins / u.games_played : 0 }))
            .sort((a, b) => {
                const diff = b._wr - a._wr;
                if (diff !== 0) return diff;
                // tie-breaker: more games first
                return (b.games_played ?? 0) - (a.games_played ?? 0);
            })
            .slice(0, 5);

        const topWrLines = topWr.length > 0
            ? topWr.map((u, i) => {
                const wr = u.games_played > 0 ? ((u.wins / u.games_played) * 100).toFixed(1) : '0.0';
                return `${i + 1}. <@${u.discord_id}> — ${wr}% (${u.wins}W/${u.losses}L)`;
            }).join('\n')
            : 'No players with games yet';

        const embed = new EmbedBuilder()
            .setColor(0x00CED1)
            .setTitle('🏆 Leaderboard')
            .setDescription('Top players by ELO and by Win Rate (min 1 game)')
            .addFields(
                { name: '🥇 Top 5 by ELO', value: topEloLines, inline: false },
                { name: '🎯 Top 5 by Win Rate', value: topWrLines, inline: false },
            )
            .setFooter({ text: 'Win Rate board requires at least 1 game' })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
        // Delete the user's command message after success
        message.delete().catch(() => {});
    }

    // !makegame command - Create a custom game lobby
    else if (command === '!makegame') {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎮 Custom Game Lobby')
            .setDescription('React with 1️⃣ or 2️⃣ to join a team!\n\n**Note:** You must be registered. Linking your LoL account is optional.')
            .addFields(
                { name: '🔵 Team 1', value: 'No players yet (0/5)', inline: true },
                { name: '🔴 Team 2', value: 'No players yet (0/5)', inline: true },
            )
            .setFooter({ text: 'Game will start when both teams have 5 players | Use !forcestartgame to start early' })
            .setTimestamp();

        const gameMessage = await message.channel.send({ embeds: [embed] });
        
        // Add reactions
        await gameMessage.react('1️⃣');
        await gameMessage.react('2️⃣');

        // Store game state
        activeGames.set(gameMessage.id, {
            messageId: gameMessage.id,
            channelId: message.channel.id,
            team1: [],
            team2: [],
            createdBy: message.author.id,
            awaitingConfirmation: false,
        });

        console.log(`[GAME] Created new game lobby: ${gameMessage.id}`);
        // Delete the user's command message after success
        message.delete().catch(() => {});
    }

    // !makegamebalanced command - Create a balanced game lobby
    else if (command === '!makegamebalanced') {
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('⚖️ Ranked Game Lobby')
            .setDescription('React with ✅ to join the game! Teams will be automatically balanced by ELO.\n\n**Note:** You must be registered. Linking your LoL account is optional.')
            .addFields(
                { name: '👥 Players', value: 'No players yet (0/10)', inline: false },
            )
            .setFooter({ text: 'Admins can start with any number of players (min 2) | Use !startbalanced' })
            .setTimestamp();

        const balancedMessage = await message.channel.send({ embeds: [embed] });
        
        // Add reaction
        await balancedMessage.react('✅');

        // Store balanced game state
        if (!client.balancedGames) {
            client.balancedGames = new Map();
        }

        client.balancedGames.set(balancedMessage.id, {
            messageId: balancedMessage.id,
            channelId: message.channel.id,
            players: [],
            createdBy: message.author.id,
        });

        console.log(`[BALANCED] Created new balanced game lobby: ${balancedMessage.id}`);
        // Delete the user's command message after success
        message.delete().catch(() => {});
    }

    // !startbalanced command - Start the balanced game
    else if (command === '!startbalanced') {
        // Find balanced game in this channel
        let balancedGame = null;
        let balancedMessageId = null;

        if (client.balancedGames) {
            for (const [messageId, game] of client.balancedGames.entries()) {
                if (game.channelId === message.channel.id) {
                    balancedGame = game;
                    balancedMessageId = messageId;
                    break;
                }
            }
        }

        if (!balancedGame) {
            message.channel.send('❌ No active balanced game lobby found in this channel!');
            return;
        }

        // Check if user is the game creator or has admin permissions
        const member = await message.guild.members.fetch(message.author.id);
        const isCreator = balancedGame.createdBy === message.author.id;
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isCreator && !isAdmin) {
            message.channel.send(`❌ Only the game creator (<@${balancedGame.createdBy}>) or admins can start the balanced game!`);
            return;
        }

        // Check if there are enough players
        if (balancedGame.players.length < 2) {
            message.channel.send('❌ Need at least 2 players to start a balanced game!');
            return;
        }

        // Balance teams and start game
        try {
            const channel = await client.channels.fetch(balancedGame.channelId);
            const balancedGameMessage = await channel.messages.fetch(balancedMessageId);
            
            message.channel.send(`⚖️ <@${message.author.id}> is starting the balanced game!`);
            await startBalancedGame(balancedGameMessage, balancedGame);
            // Delete the user's command message after success
            message.delete().catch(() => {});
        } catch (error) {
            console.error('[ERROR] Failed to start balanced game:', error);
            message.channel.send('❌ Failed to start the game. The original message may have been deleted.');
        }
    }

    // !forcestartgame command - Force start the game without full teams
    else if (command === '!forcestartgame') {
        // Find active game in this channel
        let gameToStart = null;
        let gameMessageId = null;

        for (const [messageId, game] of activeGames.entries()) {
            if (game.channelId === message.channel.id) {
                gameToStart = game;
                gameMessageId = messageId;
                break;
            }
        }

        if (!gameToStart) {
            message.channel.send('❌ No active game lobby found in this channel!');
            return;
        }

        // Check if user is the game creator or has admin permissions
        const member = await message.guild.members.fetch(message.author.id);
        const isCreator = gameToStart.createdBy === message.author.id;
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isCreator && !isAdmin) {
            message.channel.send(`❌ Only the game creator (<@${gameToStart.createdBy}>) or admins can force start the game!`);
            return;
        }

        // Check if there are any players
        const totalPlayers = gameToStart.team1.length + gameToStart.team2.length;
        if (totalPlayers === 0) {
            message.channel.send('❌ Cannot start a game with no players!');
            return;
        }

        // Fetch the game message and request confirmation
        try {
            const channel = await client.channels.fetch(gameToStart.channelId);
            const gameMessage = await channel.messages.fetch(gameMessageId);
            
            message.channel.send(`⚡ <@${message.author.id}> is requesting to force start the game!`);
            gameToStart.awaitingConfirmation = true;
            await requestGameConfirmation(gameMessage, gameToStart);
            // Delete the user's command message after success
            message.delete().catch(() => {});
        } catch (error) {
            console.error('[ERROR] Failed to force start game:', error);
            message.channel.send('❌ Failed to start the game. The original message may have been deleted.');
        }
    }

    // !help command - Show available commands
    else if (command === '!help') {
        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('📋 Available Commands')
            .setDescription('Here are all the commands you can use:')
            .addFields(
                { name: '!ping', value: 'Test if the bot is online', inline: false },
                { name: '!register [@user]', value: 'Register your Discord account (or mention a user if admin)', inline: false },
                { name: '!link <RiotID#TAG>', value: 'Link your League of Legends account (EUW)\nExample: `!link Faker#KR1`', inline: false },
                { name: '!profile [@user]', value: 'View your profile or another user\'s profile', inline: false },
                { name: '!elo @user <integer>', value: 'Manually adjust a user\'s ELO (admins only)\nExample: `!elo @user 50` or `!elo @user -25`', inline: false },
                { name: '!leaderboard', value: 'Show the Top 5 players by ELO and by Win Rate', inline: false },
                { name: '!removewin @user', value: 'Remove a win from a user (admins only)', inline: false },
                { name: '!removeloss @user', value: 'Remove a loss from a user (admins only)', inline: false },
                { name: '!makegame', value: 'Create a custom game lobby for 5v5', inline: false },
                { name: '!makegamebalanced', value: 'Create a balanced game with auto team assignment by ELO', inline: false },
                { name: '!startbalanced', value: 'Start the balanced game (admins only)', inline: false },
                { name: '!forcestartgame', value: 'Force start the game without waiting for full teams', inline: false },
                { name: '!undogame', value: 'Undo the last game result in this channel (admins only)', inline: false },
                { name: '!help', value: 'Show this help message', inline: false },
            )
            .setFooter({ text: 'CustomsBot - League of Legends Integration' })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }

    // !undogame command - Undo the last game result (admin only)
    else if (command === '!undogame') {
        // Check if user is admin
        const member = await message.guild.members.fetch(message.author.id);
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isAdmin) {
            message.channel.send('❌ You need Administrator or Manage Messages permission to use this command!');
            return;
        }

        // Check if there's a game to undo in this channel
        const channelHistory = completedGames.get(message.channel.id);
        
        if (!channelHistory || channelHistory.length === 0) {
            message.channel.send('❌ No game results found in this channel to undo!');
            return;
        }

        // Get the most recent game
        const lastGame = channelHistory[channelHistory.length - 1];

        // Confirm before undoing
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('⚠️ Confirm Undo')
            .setDescription(`Are you sure you want to undo the last game result?\n\n**Game Info:**\n• Winner: Team ${lastGame.winningTeam}\n• ELO Change: ±${lastGame.eloChange}\n• Time: <t:${Math.floor(lastGame.timestamp.getTime() / 1000)}:R>`)
            .addFields(
                { 
                    name: '🔵 Team 1', 
                    value: lastGame.team1.map(p => {
                        const mention = `<@${p.userId}>`;
                        return p.riotId ? `${mention} (${p.riotId})` : `${mention}`;
                    }).join('\n') || 'Empty',
                    inline: true 
                },
                { 
                    name: '🔴 Team 2', 
                    value: lastGame.team2.map(p => {
                        const mention = `<@${p.userId}>`;
                        return p.riotId ? `${mention} (${p.riotId})` : `${mention}`;
                    }).join('\n') || 'Empty',
                    inline: true 
                },
            )
            .setFooter({ text: 'React with ✅ to confirm or ❌ to cancel' });

    const confirmMessage = await message.channel.send({ embeds: [confirmEmbed] });
        await confirmMessage.react('✅');
        await confirmMessage.react('❌');
    // Delete the user's command message after success (confirmation posted)
    message.delete().catch(() => {});

        // Create a collector for the confirmation
        const filter = (reaction, user) => {
            return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
        };

        const collector = confirmMessage.createReactionCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async (reaction) => {
            if (reaction.emoji.name === '✅') {
                // Undo the game
                await undoGameResult(message, lastGame);
                
                // Remove from history
                channelHistory.pop();
                
                // Delete confirmation message
                await confirmMessage.delete().catch(() => {});
                
                console.log(`[ADMIN] ${message.author.username} undid game result`);
            } else {
                // Cancelled
                const cancelEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Undo Cancelled')
                    .setDescription('The game result was not undone.');

                await confirmMessage.edit({ embeds: [cancelEmbed] });
                await confirmMessage.reactions.removeAll().catch(() => {});
                
                setTimeout(() => confirmMessage.delete().catch(() => {}), 5000);
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                // Timeout
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle('⏱️ Undo Timeout')
                    .setDescription('Confirmation timed out. The game result was not undone.');

                await confirmMessage.edit({ embeds: [timeoutEmbed] });
                await confirmMessage.reactions.removeAll().catch(() => {});
                
                setTimeout(() => confirmMessage.delete().catch(() => {}), 5000);
            }
        });
    }
});

// Handle reaction add
client.on('messageReactionAdd', async (reaction, user) => {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
        }
    }

    // Check if this is a pending game confirmation (admin confirming game start)
    if (client.pendingConfirmations && client.pendingConfirmations.has(reaction.message.id)) {
        const confirmation = client.pendingConfirmations.get(reaction.message.id);

        // Check if user is admin
        const member = await reaction.message.guild.members.fetch(user.id);
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isAdmin) {
            reaction.users.remove(user.id);
            const channel = await client.channels.fetch(confirmation.channelId);
            const msg = await channel.send(`❌ <@${user.id}>, only admins can confirm games!`);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        // Handle confirmation
        if (reaction.emoji.name === '✅') {
            // Admin confirmed - start the game
            client.pendingConfirmations.delete(reaction.message.id);
            
            const channel = await client.channels.fetch(confirmation.channelId);
            const gameMessage = await channel.messages.fetch(confirmation.gameMessageId);
            
            // Delete confirmation message
            await reaction.message.delete().catch(() => {});
            
            // Send confirmation
            await channel.send(`✅ Admin <@${user.id}> confirmed! Starting the game...`);
            
            // Start the game
            await finalizeGame(gameMessage, confirmation.game);
            
        } else if (reaction.emoji.name === '❌') {
            // Admin cancelled
            client.pendingConfirmations.delete(reaction.message.id);
            
            const channel = await client.channels.fetch(confirmation.channelId);
            
            // Update confirmation message
            const cancelEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Game Cancelled')
                .setDescription(`Admin <@${user.id}> cancelled the game. Players can continue adjusting teams.`)
                .setTimestamp();
            
            await reaction.message.edit({ embeds: [cancelEmbed] });
            await reaction.message.reactions.removeAll().catch(() => {});
            
            // Reset game state
            confirmation.game.awaitingConfirmation = false;
            
            setTimeout(() => reaction.message.delete().catch(() => {}), 10000);
        }
        return;
    }

    // Check if this is a pending game result (admin selecting winner)
    if (client.pendingGameResults && client.pendingGameResults.has(reaction.message.id)) {
        const pendingGame = client.pendingGameResults.get(reaction.message.id);
        
        if (pendingGame.resolved) return; // Already processed

        // Check if user is admin
        const member = await reaction.message.guild.members.fetch(user.id);
        const isAdmin = member.permissions.has('Administrator') || member.permissions.has('ManageMessages');

        if (!isAdmin) {
            reaction.users.remove(user.id);
            const channel = await client.channels.fetch(pendingGame.channelId);
            const msg = await channel.send(`❌ <@${user.id}>, only admins can select the winning team!`);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        // Process the result or reshuffle on admin request
        if (reaction.emoji.name === '🔁') {
            // Only allow reshuffle for balanced games
            if (pendingGame.gameType !== 'balanced') {
                reaction.users.remove(user.id);
                return;
            }

            // Build full players list, ensuring ELO available
            let players = await Promise.all(
                [...pendingGame.team1, ...pendingGame.team2].map(async p => {
                    const u = await db.getUser(p.userId);
                    return { ...p, elo: p.elo ?? (u ? u.elo : 1500) };
                })
            );

            const { team1, team2 } = randomizeBalancedTeams(players, pendingGame.team1, pendingGame.team2, 80);

            // Update pending game teams
            pendingGame.team1 = team1;
            pendingGame.team2 = team2;

            // Recompute average ELOs
            const avg = arr => arr.length ? Math.round(arr.reduce((s, p) => s + (p.elo ?? 1500), 0) / arr.length) : 0;
            const team1AvgElo = avg(team1);
            const team2AvgElo = avg(team2);

            // Rebuild embed like in startBalancedGame
            const team1List = team1.map((p, i) => {
                const mention = `<@${p.userId}>`;
                const riot = p.riotId ? ` (${p.riotId})` : '';
                return `${i + 1}. ${mention}${riot} (${p.elo} ELO)`;
            }).join('\n') || 'Empty';
            const team2List = team2.map((p, i) => {
                const mention = `<@${p.userId}>`;
                const riot = p.riotId ? ` (${p.riotId})` : '';
                return `${i + 1}. ${mention}${riot} (${p.elo} ELO)`;
            }).join('\n') || 'Empty';

            const updatedEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`⚖️ Balanced Game Ready - ${team1.length}v${team2.length}`)
                .setDescription('**Teams reshuffled!** React 1️⃣ if Team 1 wins or 2️⃣ if Team 2 wins to update ELO.')
                .addFields(
                    { name: `🔵 Team 1 (Avg ELO: ${team1AvgElo})`, value: team1List, inline: true },
                    { name: `🔴 Team 2 (Avg ELO: ${team2AvgElo})`, value: team2List, inline: true },
                )
                .setFooter({ text: 'Admins: Use 🔁 to reshuffle again' })
                .setTimestamp();

            await reaction.message.edit({ embeds: [updatedEmbed] });
            // Remove the admin's 🔁 reaction so they can click again
            await reaction.users.remove(user.id);
        } else if (reaction.emoji.name === '1️⃣') {
            pendingGame.resolved = true;
            await processGameResult(reaction.message, pendingGame, 1);
        } else if (reaction.emoji.name === '2️⃣') {
            pendingGame.resolved = true;
            await processGameResult(reaction.message, pendingGame, 2);
        }
        return;
    }

    // Check if this is a balanced game lobby
    if (client.balancedGames && client.balancedGames.has(reaction.message.id)) {
        const balancedGame = client.balancedGames.get(reaction.message.id);

        if (reaction.emoji.name !== '✅') return;

        // Ensure user is registered (auto-register if not)
    let userData = await ensureRegisteredUser(user);

        // Check if user is already in the game
        const alreadyJoined = balancedGame.players.some(p => p.userId === user.id);
        if (alreadyJoined) return;

        // Check if game is full
        if (balancedGame.players.length >= 10) {
            reaction.users.remove(user.id);
            const channel = await client.channels.fetch(balancedGame.channelId);
            const msg = await channel.send(`❌ <@${user.id}>, the lobby is full (10/10)!`);
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        // Add player to the game (Riot ID optional)
        balancedGame.players.push({
            userId: user.id,
            username: user.username,
            riotId: userData.lol_riot_id || null,
            elo: userData.elo,
        });

        console.log(`[BALANCED] ${user.username} joined (ELO: ${userData.elo})`);

        // Update the message
        await updateBalancedGameMessage(reaction.message, balancedGame);
        return;
    }

    // Check if this is an active game
    const game = activeGames.get(reaction.message.id);
    if (!game) return;

    // Only handle 1️⃣ and 2️⃣ reactions
    if (reaction.emoji.name !== '1️⃣' && reaction.emoji.name !== '2️⃣') return;

    // Ensure user is registered (auto-register if not)
    let userData = await ensureRegisteredUser(user);

    const targetTeam = reaction.emoji.name === '1️⃣' ? 'team1' : 'team2';
    const otherTeam = targetTeam === 'team1' ? 'team2' : 'team1';

    // Check if user is already in a team
    const inTargetTeam = game[targetTeam].some(p => p.userId === user.id);
    const inOtherTeam = game[otherTeam].some(p => p.userId === user.id);

    if (inTargetTeam) {
        // Already in this team, do nothing
        return;
    }

    if (inOtherTeam) {
        // Remove from other team
        game[otherTeam] = game[otherTeam].filter(p => p.userId !== user.id);
        
        // Remove their reaction from the other emoji
        const otherEmoji = otherTeam === 'team1' ? '1️⃣' : '2️⃣';
        const otherReaction = reaction.message.reactions.cache.get(otherEmoji);
        if (otherReaction) {
            await otherReaction.users.remove(user.id);
        }
    }

    // Check if team is full
    if (game[targetTeam].length >= 5) {
        reaction.users.remove(user.id);
        const channel = await client.channels.fetch(game.channelId);
        const msg = await channel.send(`❌ <@${user.id}>, Team ${targetTeam === 'team1' ? '1' : '2'} is full!`);
        setTimeout(() => msg.delete().catch(() => {}), 5000);
        return;
    }

    // Add user to team (Riot ID optional)
    game[targetTeam].push({
        userId: user.id,
        username: user.username,
        riotId: userData.lol_riot_id || null,
    });

    console.log(`[GAME] ${user.username} joined ${targetTeam}`);

    // Update the message
    await updateGameMessage(reaction.message, game);

    // Check if both teams are full
    if (game.team1.length === 5 && game.team2.length === 5 && !game.awaitingConfirmation) {
        game.awaitingConfirmation = true;
        await requestGameConfirmation(reaction.message, game);
    }
});

// Handle reaction remove
client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
        }
    }

    // Check if this is a balanced game
    if (client.balancedGames && client.balancedGames.has(reaction.message.id)) {
        const balancedGame = client.balancedGames.get(reaction.message.id);

        if (reaction.emoji.name !== '✅') return;

        // Remove player from the game
        balancedGame.players = balancedGame.players.filter(p => p.userId !== user.id);

        console.log(`[BALANCED] ${user.username} left`);

        // Update the message
        await updateBalancedGameMessage(reaction.message, balancedGame);
        return;
    }

    const game = activeGames.get(reaction.message.id);
    if (!game) return;

    if (reaction.emoji.name !== '1️⃣' && reaction.emoji.name !== '2️⃣') return;

    const targetTeam = reaction.emoji.name === '1️⃣' ? 'team1' : 'team2';

    // Remove user from team
    game[targetTeam] = game[targetTeam].filter(p => p.userId !== user.id);

    console.log(`[GAME] ${user.username} left ${targetTeam}`);

    // Update the message
    await updateGameMessage(reaction.message, game);
});

// Update game message with current teams
async function updateGameMessage(message, game) {
    const team1List = game.team1.length > 0 
        ? game.team1.map(p => {
            const mention = `<@${p.userId}>`;
            return p.riotId ? `• ${mention} (${p.riotId})` : `• ${mention}`;
        }).join('\n')
        : 'No players yet';
    
    const team2List = game.team2.length > 0
        ? game.team2.map(p => {
            const mention = `<@${p.userId}>`;
            return p.riotId ? `• ${mention} (${p.riotId})` : `• ${mention}`;
        }).join('\n')
        : 'No players yet';

    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎮 Custom Game Lobby')
        .setDescription('React with 1️⃣ or 2️⃣ to join a team!\n\n**Note:** You must be registered. Linking your LoL account is optional.')
        .addFields(
            { name: `🔵 Team 1 (${game.team1.length}/5)`, value: team1List, inline: true },
            { name: `🔴 Team 2 (${game.team2.length}/5)`, value: team2List, inline: true },
        )
        .setFooter({ text: 'Game will start when both teams have 5 players | Use !forcestartgame to start early' })
        .setTimestamp();

    await message.edit({ embeds: [embed] });
}

// Request admin confirmation to start the game
async function requestGameConfirmation(message, game) {
    const channel = await client.channels.fetch(game.channelId);
    
    const team1List = game.team1.map(p => {
        const mention = `<@${p.userId}>`;
        return p.riotId ? `• ${mention} (${p.riotId})` : `• ${mention}`;
    }).join('\n');
    const team2List = game.team2.map(p => {
        const mention = `<@${p.userId}>`;
        return p.riotId ? `• ${mention} (${p.riotId})` : `• ${mention}`;
    }).join('\n');

    const confirmEmbed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⚠️ Game Ready - Admin Confirmation Required')
        .setDescription('**Both teams are full!**\n\nAdmins: React with ✅ to start the game or ❌ to cancel.')
        .addFields(
            { name: `🔵 Team 1 (${game.team1.length})`, value: team1List, inline: true },
            { name: `🔴 Team 2 (${game.team2.length})`, value: team2List, inline: true },
        )
        .setFooter({ text: 'Waiting for admin confirmation...' })
        .setTimestamp();

    const confirmMessage = await channel.send({ embeds: [confirmEmbed] });
    
    // Add reactions
    await confirmMessage.react('✅');
    await confirmMessage.react('❌');

    // Store confirmation state
    if (!client.pendingConfirmations) {
        client.pendingConfirmations = new Map();
    }

    client.pendingConfirmations.set(confirmMessage.id, {
        messageId: confirmMessage.id,
        channelId: game.channelId,
        gameMessageId: message.id,
        game: game,
    });

    console.log(`[GAME] Waiting for admin confirmation for game: ${message.id}`);
}

// Update balanced game message with current players
async function updateBalancedGameMessage(message, game) {
    const playersList = game.players.length > 0
        ? game.players
            .sort((a, b) => b.elo - a.elo) // Sort by ELO descending
            .map((p, i) => {
                const mention = `<@${p.userId}>`;
                const riot = p.riotId ? ` (${p.riotId})` : '';
                return `${i + 1}. ${mention}${riot} (${p.elo} ELO)`;
            })
            .join('\n')
        : 'No players yet';

    const avgElo = game.players.length > 0
        ? Math.round(game.players.reduce((sum, p) => sum + p.elo, 0) / game.players.length)
        : 0;

    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('⚖️ Ranked Game Lobby')
        .setDescription('React with ✅ to join the game! Teams will be automatically balanced by ELO.\n\n**Note:** You must be registered. Linking your LoL account is optional.')
        .addFields(
            { name: `👥 Players (${game.players.length}/10)`, value: playersList, inline: false },
        );

    if (game.players.length > 0) {
        embed.addFields(
            { name: '📊 Average ELO', value: `${avgElo}`, inline: true },
        );
    }

    embed.setFooter({ text: 'Admins can start with any number of players (min 2) | Use !startbalanced' })
        .setTimestamp();

    await message.edit({ embeds: [embed] });
}

// Balance teams based on ELO (greedy algorithm)
function balanceTeams(players) {
    // Sort players by ELO descending
    const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
    
    const team1 = [];
    const team2 = [];
    let team1Elo = 0;
    let team2Elo = 0;

    // Greedy algorithm: assign each player to the team with lower total ELO
    for (const player of sortedPlayers) {
        if (team1Elo <= team2Elo) {
            team1.push(player);
            team1Elo += player.elo;
        } else {
            team2.push(player);
            team2Elo += player.elo;
        }
    }

    return { team1, team2, team1Elo, team2Elo };
}

// Start balanced game
async function startBalancedGame(message, balancedGame) {
    console.log(`[BALANCED] Starting balanced game with ${balancedGame.players.length} players`);

    // Remove from balanced games
    client.balancedGames.delete(message.id);

    // Balance the teams
    const { team1, team2, team1Elo, team2Elo } = balanceTeams(balancedGame.players);

    const team1AvgElo = team1.length > 0 ? Math.round(team1Elo / team1.length) : 0;
    const team2AvgElo = team2.length > 0 ? Math.round(team2Elo / team2.length) : 0;

    // Update original message to show it's closed
    const closedEmbed = new EmbedBuilder()
        .setColor(0x808080)
        .setTitle('⚖️ Balanced Game Lobby - CLOSED')
        .setDescription('Teams have been balanced! Check below for team details.')
        .setTimestamp();

    await message.edit({ embeds: [closedEmbed] });
    await message.reactions.removeAll().catch(() => {});

    // Create final team overview
    const team1List = team1.map((p, i) => {
        const mention = `<@${p.userId}>`;
        const riot = p.riotId ? ` (${p.riotId})` : '';
        return `${i + 1}. ${mention}${riot} (${p.elo} ELO)`;
    }).join('\n') || 'Empty';
    const team2List = team2.map((p, i) => {
        const mention = `<@${p.userId}>`;
        const riot = p.riotId ? ` (${p.riotId})` : '';
        return `${i + 1}. ${mention}${riot} (${p.elo} ELO)`;
    }).join('\n') || 'Empty';

    const team1Count = team1.length;
    const team2Count = team2.length;
    const gameTitle = (team1Count === 5 && team2Count === 5) 
        ? '⚔️ Game Ready - 5v5 Custom Game'
        : `⚔️ Game Ready - ${team1Count}v${team2Count} Custom Game`;

    const finalEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(gameTitle)
        .setDescription('**All players, please join the custom lobby!**\n\n**Admins:** React with 1️⃣ if Team 1 wins or 2️⃣ if Team 2 wins to update ELO. Use 🔁 to reshuffle teams while keeping ELO balanced.')
        .addFields(
            { name: `🔵 Team 1 (${team1Count}) (Avg ELO: ${team1AvgElo})`, value: team1List, inline: true },
            { name: `🔴 Team 2 (${team2Count}) (Avg ELO: ${team2AvgElo})`, value: team2List, inline: true },
        )
        .setFooter({ text: 'Good luck and have fun!' })
        .setTimestamp();

    const channel = await client.channels.fetch(balancedGame.channelId);
    const resultsMessage = await channel.send({ embeds: [finalEmbed] });

    // Add reactions for admins to select winner or reshuffle
    await resultsMessage.react('1️⃣');
    await resultsMessage.react('2️⃣');
    await resultsMessage.react('🔁');

    // Store pending game result with a unique identifier
    const pendingGame = {
        messageId: resultsMessage.id,
        channelId: balancedGame.channelId,
        team1: team1,
        team2: team2,
        resolved: false,
        eloChangeAllowed: true, // balanced games do change ELO
        gameType: 'balanced',
    };
    
    // Store in a collection for pending games (we'll add this)
    if (!client.pendingGameResults) {
        client.pendingGameResults = new Map();
    }
    client.pendingGameResults.set(resultsMessage.id, pendingGame);

    console.log(`[BALANCED] Game started with balanced teams (Avg ELO: ${team1AvgElo} vs ${team2AvgElo})`);
}

// Randomize teams while trying to keep average ELOs balanced and slightly change composition
function randomizeBalancedTeams(allPlayers, prevTeam1, prevTeam2, iterations = 50) {
    const size1 = prevTeam1.length;
    const size2 = prevTeam2.length;
    const prevSet1 = new Set(prevTeam1.map(p => p.userId));
    const prevSet2 = new Set(prevTeam2.map(p => p.userId));

    function avgElo(team) {
        if (team.length === 0) return 0;
        return team.reduce((sum, p) => sum + (p.elo ?? 1500), 0) / team.length;
    }

    let best = null;
    for (let i = 0; i < iterations; i++) {
        const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
        const t1 = shuffled.slice(0, size1);
        const t2 = shuffled.slice(size1, size1 + size2);

        // Composition difference vs previous
        const diff1 = t1.filter(p => !prevSet1.has(p.userId)).length;
        const diff2 = t2.filter(p => !prevSet2.has(p.userId)).length;

        // Prefer at least 2 changes total across both teams
        const totalDiff = diff1 + diff2;

        const diff = Math.abs(avgElo(t1) - avgElo(t2));

        if (!best) {
            best = { t1, t2, diff, totalDiff };
        } else {
            // Prefer better ELO balance; if similar (within 1 ELO), prefer higher totalDiff
            if (diff < best.diff - 0.5 || (Math.abs(diff - best.diff) <= 0.5 && totalDiff > best.totalDiff)) {
                best = { t1, t2, diff, totalDiff };
            }
        }
    }

    return { team1: best.t1, team2: best.t2 };
}

// Finalize game when both teams are full
async function finalizeGame(message, game) {
    console.log(`[GAME] Finalizing game: ${message.id}`);

    // Remove the game from active games
    activeGames.delete(message.id);

    // Update original message to show it's closed
    const closedEmbed = new EmbedBuilder()
        .setColor(0x808080)
        .setTitle('🎮 Custom Game Lobby - CLOSED')
        .setDescription('Both teams are full! Check below for team details.')
        .setTimestamp();

    await message.edit({ embeds: [closedEmbed] });

    // Remove reactions
    await message.reactions.removeAll().catch(() => {});

    // Create final team overview
    const team1List = game.team1.map((p, i) => {
        const mention = `<@${p.userId}>`;
        return p.riotId ? `${i + 1}. ${mention} (${p.riotId})` : `${i + 1}. ${mention}`;
    }).join('\n');
    const team2List = game.team2.map((p, i) => {
        const mention = `<@${p.userId}>`;
        return p.riotId ? `${i + 1}. ${mention} (${p.riotId})` : `${i + 1}. ${mention}`;
    }).join('\n');

    const team1Count = game.team1.length;
    const team2Count = game.team2.length;
    const gameTitle = (team1Count === 5 && team2Count === 5) 
        ? '⚔️ Game Ready - 5v5 Custom Game'
        : `⚔️ Game Ready - ${team1Count}v${team2Count} Custom Game`;

    const finalEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(gameTitle)
        .setDescription('**All players, please join the custom lobby!**\n\n**Admins:** React with 1️⃣ if Team 1 wins or 2️⃣ if Team 2 wins to update ELO.')
        .addFields(
            { name: `🔵 Team 1 (${team1Count})`, value: team1List, inline: true },
            { name: `🔴 Team 2 (${team2Count})`, value: team2List, inline: true },
        )
        .setFooter({ text: 'Good luck and have fun!' })
        .setTimestamp();

    const channel = await client.channels.fetch(game.channelId);
    const resultsMessage = await channel.send({ embeds: [finalEmbed] });

    // Add reactions for admins to select winner
    await resultsMessage.react('1️⃣');
    await resultsMessage.react('2️⃣');

    // Store pending game result with a unique identifier
    const pendingGame = {
        messageId: resultsMessage.id,
        channelId: game.channelId,
        team1: game.team1,
        team2: game.team2,
        resolved: false,
        eloChangeAllowed: false, // custom games do not change ELO
        gameType: 'custom',
    };
    
    // Store in a collection for pending games (we'll add this)
    if (!client.pendingGameResults) {
        client.pendingGameResults = new Map();
    }
    client.pendingGameResults.set(resultsMessage.id, pendingGame);

    console.log(`[GAME] Game finalized with ${game.team1.length}v${game.team2.length}, waiting for result`);
}

// Calculate ELO change
function calculateEloChange(winnerAvgElo, loserAvgElo, kFactor = 32) {
    const expectedScoreWinner = 1 / (1 + Math.pow(10, (loserAvgElo - winnerAvgElo) / 400));
    const eloChange = Math.round(kFactor * (1 - expectedScoreWinner));
    return eloChange;
}

// Process game result and update ELO
async function processGameResult(message, pendingGame, winningTeam) {
    console.log(`[ELO] Processing game result, Team ${winningTeam} won`);

    const winners = winningTeam === 1 ? pendingGame.team1 : pendingGame.team2;
    const losers = winningTeam === 1 ? pendingGame.team2 : pendingGame.team1;

    // Determine ELO change policy (custom games should not change ELO)
    let eloChange = 0;
    if (pendingGame.eloChangeAllowed !== false) {
        // Calculate average ELO for both teams
        let winnerTotalElo = 0;
        let loserTotalElo = 0;

        for (const player of winners) {
            const userData = await db.getUser(player.userId);
            if (userData) winnerTotalElo += userData.elo;
        }

        for (const player of losers) {
            const userData = await db.getUser(player.userId);
            if (userData) loserTotalElo += userData.elo;
        }

        const winnerAvgElo = winners.length > 0 ? winnerTotalElo / winners.length : 1500;
        const loserAvgElo = losers.length > 0 ? loserTotalElo / losers.length : 1500;

        // Calculate ELO changes
        eloChange = calculateEloChange(winnerAvgElo, loserAvgElo);
    }

    // Update stats for winners
    for (const player of winners) {
        await db.updateUserStats(player.userId, eloChange, true);
    }

    // Update stats for losers
    for (const player of losers) {
        await db.updateUserStats(player.userId, -eloChange, false);
    }

    // Store game result for undo functionality
    const gameResult = {
        messageId: message.id,
        channelId: pendingGame.channelId,
        team1: pendingGame.team1,
        team2: pendingGame.team2,
        winningTeam: winningTeam,
        eloChange: eloChange,
        timestamp: new Date(),
    };

    // Store in channel's game history
    if (!completedGames.has(pendingGame.channelId)) {
        completedGames.set(pendingGame.channelId, []);
    }
    completedGames.get(pendingGame.channelId).push(gameResult);

    // Update the message to show results
    const resultEmbed = new EmbedBuilder()
        .setColor(winningTeam === 1 ? 0x0000FF : 0xFF0000)
        .setTitle(`🏆 Game Complete - Team ${winningTeam} Wins!`)
        .setDescription(
            pendingGame.eloChangeAllowed === false
                ? `**Custom Game:** ELO unchanged.\n\n*Made a mistake? Use \`!undogame\` to revert this result.*`
                : `**ELO Changes:** Winners +${eloChange} | Losers -${eloChange}\n\n*Made a mistake? Use \`!undogame\` to revert this result.*`
        )
        .addFields(
            { 
                name: `${winningTeam === 1 ? '🏆' : '💀'} Team 1`, 
                value: pendingGame.team1.map(p => {
                    const mention = `<@${p.userId}>`;
                    return p.riotId ? `${mention} (${p.riotId})` : `${mention}`;
                }).join('\n') || 'Empty',
                inline: true 
            },
            { 
                name: `${winningTeam === 2 ? '🏆' : '💀'} Team 2`, 
                value: pendingGame.team2.map(p => {
                    const mention = `<@${p.userId}>`;
                    return p.riotId ? `${mention} (${p.riotId})` : `${mention}`;
                }).join('\n') || 'Empty',
                inline: true 
            },
        )
        .setFooter({ text: 'Stats updated! Use !undogame to revert if needed' })
        .setTimestamp();

    await message.edit({ embeds: [resultEmbed] });
    await message.reactions.removeAll().catch(() => {});

    // Remove from pending games
    client.pendingGameResults.delete(message.id);

    console.log(`[ELO] Game result processed, ELO updated for all players`);
}

// Undo the last game result in a channel
async function undoGameResult(message, gameResult) {
    console.log(`[UNDO] Reverting game result from ${gameResult.timestamp}`);

    const winners = gameResult.winningTeam === 1 ? gameResult.team1 : gameResult.team2;
    const losers = gameResult.winningTeam === 1 ? gameResult.team2 : gameResult.team1;

    // Revert stats for winners (remove win, subtract ELO)
    for (const player of winners) {
        await db.revertGameStats(player.userId, gameResult.eloChange, true);
        console.log(`[UNDO] ${player.username}: Reverted win, -${gameResult.eloChange} ELO`);
    }

    // Revert stats for losers (remove loss, add back ELO)
    for (const player of losers) {
        await db.revertGameStats(player.userId, -gameResult.eloChange, false);
        console.log(`[UNDO] ${player.username}: Reverted loss, +${gameResult.eloChange} ELO`);
    }

    const undoEmbed = new EmbedBuilder()
        .setColor(0xFFAA00)
        .setTitle('⏮️ Game Result Undone')
        .setDescription(`**Previous Result:** Team ${gameResult.winningTeam} won\n**ELO Changes Reverted:** ±${gameResult.eloChange}\n\nAll player stats have been restored to their pre-game state.`)
        .addFields(
            { 
                name: '🔵 Team 1', 
                value: gameResult.team1.map(p => {
                    const mention = `<@${p.userId}>`;
                    return p.riotId ? `${mention} (${p.riotId})` : `${mention}`;
                }).join('\n') || 'Empty',
                inline: true 
            },
            { 
                name: '🔴 Team 2', 
                value: gameResult.team2.map(p => {
                    const mention = `<@${p.userId}>`;
                    return p.riotId ? `${mention} (${p.riotId})` : `${mention}`;
                }).join('\n') || 'Empty',
                inline: true 
            },
        )
        .setFooter({ text: 'Stats have been reverted' })
        .setTimestamp();

    await message.channel.send({ embeds: [undoEmbed] });

    console.log(`[UNDO] Game result successfully undone`);
}

// Login
client.login(process.env.DISCORD_TOKEN);

