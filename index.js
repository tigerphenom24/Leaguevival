const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const http = require('http');

// ── KEEP-ALIVE PING SERVER ───────────────────────────────────────────────────
// UptimeRobot hits this URL every 5 minutes to keep Replit awake
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Leaguevival Bot is alive ✅');
}).listen(3000, () => console.log('✅ Ping server running on port 3000'));

// ── CONFIG ──────────────────────────────────────────────────────────────────
// All secrets come from environment variables — never hardcode these
const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const DISCORD_APP_ID  = process.env.DISCORD_APP_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // your server ID
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;   // e.g. https://your-project.firebaseio.com

// Firebase service account JSON stored as an env var string
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

// ── FIREBASE INIT ────────────────────────────────────────────────────────────
initializeApp({ credential: cert(serviceAccount), databaseURL: FIREBASE_DB_URL });
const db = getDatabase();

// ── DISCORD CLIENT ───────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── REGISTER SLASH COMMANDS ──────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('lockbets')
    .setDescription('Lock bets for a team\'s game — use when kickoff starts')
    .addStringOption(opt =>
      opt.setName('team')
        .setDescription('Team name (e.g. Memphis, USF, Tulane)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('unlockbets')
    .setDescription('Unlock bets for a team\'s game (commissioner use)')
    .addStringOption(opt =>
      opt.setName('team')
        .setDescription('Team name')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('betsstatus')
    .setDescription('Show which games are locked for betting this week'),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_APP_ID, DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Get current season and schedule from Firebase
async function getSchedule() {
  const [schedSnap, seasonSnap] = await Promise.all([
    db.ref('season_schedule').once('value'),
    db.ref('current_season').once('value'),
  ]);
  return {
    schedule: schedSnap.val() || {},
    season: seasonSnap.val() || 1,
  };
}

// Find the current active betting week — highest week number that has incomplete games
function getCurrentWeek(schedule) {
  const weeks = Object.keys(schedule).map(Number).sort((a, b) => a - b);
  // Find all weeks with at least one incomplete game
  const activeWeeks = weeks.filter(week => {
    const games = schedule[week];
    if (!games) return false;
    // Handle both array and object formats from Firebase
    const gameList = Array.isArray(games) ? games : Object.values(games);
    return gameList.some(g => g && !g.completed && g.home && g.away);
  });
  if (activeWeeks.length > 0) return activeWeeks[0]; // earliest incomplete week
  // All games complete — return the last week
  return weeks[weeks.length - 1] || 1;
}

// Find a game by team name (fuzzy match — case insensitive, partial match)
// Returns the Firebase key (idx) so setGameLock writes to the right path
function findGame(schedule, week, teamInput) {
  const games = schedule[week];
  if (!games) return null;
  const query = teamInput.toLowerCase().trim();
  // Iterate over entries to preserve the original key (Firebase index)
  const entries = Array.isArray(games)
    ? games.map((g, i) => [String(i), g])
    : Object.entries(games);
  const found = entries.find(([key, g]) =>
    g && ((g.home || '').toLowerCase().includes(query) ||
          (g.away || '').toLowerCase().includes(query))
  );
  return found ? { game: found[1], idx: found[0] } : null;
}

// Lock or unlock a game in Firebase — write directly to the specific game path
// to avoid array/object ordering issues with read-modify-write
async function setGameLock(week, idx, locked) {
  // Try direct array index path first (most common format)
  const directPath = `season_schedule/${week}/${idx}/betsLocked`;
  try {
    await db.ref(directPath).set(locked);
    return true;
  } catch (err) {
    console.error('setGameLock direct path failed:', err);
    return false;
  }
}

// ── COMMAND HANDLER ──────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  await interaction.deferReply(); // show "thinking..." while we hit Firebase

  try {
    const { schedule, season } = await getSchedule();
    const week = getCurrentWeek(schedule);

    // ── /lockbets ─────────────────────────────────────────────────────────────
    if (commandName === 'lockbets') {
      const teamInput = interaction.options.getString('team');
      const result = findGame(schedule, week, teamInput);

      if (!result) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xCC1111)
            .setTitle('⚠️ Game Not Found')
            .setDescription(`No game found for **${teamInput}** in Week ${week}.\nCheck the team name and try again.`)
          ]
        });
        return;
      }

      const { game, idx } = result;

      if (game.betsLocked) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('🔒 Already Locked')
            .setDescription(`Bets for **${game.home} vs ${game.away}** (Week ${week}) are already locked.`)
          ]
        });
        return;
      }

      await setGameLock(week, idx, true);

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xCC1111)
          .setTitle('🔒 BETS LOCKED')
          .setDescription(
            `**${game.home} vs ${game.away}** is underway!\n\n` +
            `🚫 No new bets can be placed on this game.\n` +
            `Any existing bets remain active and will settle when the score is entered.`
          )
          .addFields(
            { name: 'Week', value: String(week), inline: true },
            { name: 'Season', value: String(season), inline: true },
            { name: 'Locked by', value: interaction.user.tag, inline: true },
          )
          .setFooter({ text: 'Leaguevival Sportsbook' })
          .setTimestamp()
        ]
      });
    }

    // ── /unlockbets ───────────────────────────────────────────────────────────
    else if (commandName === 'unlockbets') {
      const teamInput = interaction.options.getString('team');
      const result = findGame(schedule, week, teamInput);

      if (!result) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xCC1111)
            .setTitle('⚠️ Game Not Found')
            .setDescription(`No game found for **${teamInput}** in Week ${week}.`)
          ]
        });
        return;
      }

      const { game, idx } = result;
      await setGameLock(week, idx, false);

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x4FC3F7)
          .setTitle('🔓 Bets Unlocked')
          .setDescription(`Bets for **${game.home} vs ${game.away}** (Week ${week}) have been unlocked.`)
          .setFooter({ text: 'Leaguevival Sportsbook' })
          .setTimestamp()
        ]
      });
    }

    // ── /betsstatus ───────────────────────────────────────────────────────────
    else if (commandName === 'betsstatus') {
      const allWeeks = Object.keys(schedule).map(Number).sort((a,b)=>a-b);
      const games = schedule[week];
      const gameList = games ? (Array.isArray(games) ? games : Object.values(games)) : [];
      const upcoming = gameList.filter(g => g && g.home && g.away && !g.completed);

      if (!upcoming.length) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xC9A84C)
            .setTitle(`Week ${week} — Bet Status`)
            .setDescription(
              `No upcoming games found for Week ${week}.\n\n` +
              `**Debug:** Weeks in schedule: ${allWeeks.join(', ')}\n` +
              `Total games in week ${week}: ${gameList.length}`
            )
          ]
        });
        return;
      }

      const lines = upcoming.map(g => {
        const status = g.betsLocked ? '🔒 LOCKED' : '🟢 OPEN';
        return `${status} — **${g.home}** vs **${g.away}**`;
      });

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xC9A84C)
          .setTitle(`🏈 Week ${week} — Sportsbook Status`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Leaguevival Sportsbook · Season ' + season })
          .setTimestamp()
        ]
      });
    }

  } catch (err) {
    console.error('Command error:', err);
    await interaction.editReply('❌ Something went wrong: ' + err.message);
  }
});

// ── START ────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  await registerCommands();
});

client.login(DISCORD_TOKEN);
