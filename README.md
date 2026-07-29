# Leaguevival
Bet Locker
# Leaguevival Discord Bot

Slash commands that lock/unlock sportsbook bets directly in Firebase.

## Commands

| Command | What it does |
|---|---|
| `/lockbets Memphis` | Locks bets for Memphis's game this week |
| `/unlockbets Memphis` | Unlocks bets for Memphis's game |
| `/betsstatus` | Shows all games this week and their lock status |

## Setup (one time, ~25 minutes)

### Step 1 — Create the Discord Bot (10 min)

1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it "Leaguevival Bot"
3. Go to **Bot** tab → click **Add Bot**
4. Under **Token** → click **Reset Token** → copy it (this is your `DISCORD_TOKEN`)
5. Scroll down → enable **Server Members Intent** and **Message Content Intent**
6. Go to **OAuth2 → URL Generator** → check `bot` and `applications.commands`
7. Under Bot Permissions check: **Send Messages**, **Use Slash Commands**, **Embed Links**
8. Copy the generated URL → open in browser → add bot to your Leaguevival Discord server
9. Note your **Application ID** from the General Information tab (this is your `DISCORD_APP_ID`)

### Step 2 — Get your Discord Server ID

1. In Discord, go to Settings → Advanced → enable **Developer Mode**
2. Right-click your server name → **Copy Server ID** (this is your `DISCORD_GUILD_ID`)

### Step 3 — Firebase Service Account (5 min)

1. Go to Firebase Console → your project → Settings (gear icon) → **Service Accounts**
2. Click **Generate new private key** → download the JSON file
3. Open the JSON file — copy the entire contents (this is your `FIREBASE_CREDENTIALS`)
4. Your `FIREBASE_DB_URL` is in the JSON as `"databaseURL"` — or find it in Firebase Console → Realtime Database

### Step 4 — Deploy to Railway (5 min)

1. Create a free account at https://railway.app
2. Create a new GitHub repo and push these two files (index.js + package.json)
3. In Railway → **New Project** → **Deploy from GitHub repo** → select your repo
4. Railway auto-detects Node.js and runs `npm start`
5. Go to **Variables** tab and add:

```
DISCORD_TOKEN      = (your bot token from Step 1)
DISCORD_APP_ID     = (your application ID from Step 1)
DISCORD_GUILD_ID   = (your server ID from Step 2)
FIREBASE_DB_URL    = https://your-project-default-rtdb.firebaseio.com
FIREBASE_CREDENTIALS = (paste the entire contents of the service account JSON)
```

6. Railway redeploys automatically — check **Logs** for `✅ Bot logged in`

### Step 5 — Test it

In your Discord server type:
```
/betsstatus
```
Should show this week's games. Then:
```
/lockbets Memphis
```
Open the app — Memphis's game should show 🔒 BETS LOCKED immediately.

## Troubleshooting

- **Commands not showing in Discord** — wait 1-2 minutes after first deploy, then restart the bot
- **"Game Not Found"** — team name must partially match what's in your schedule (e.g. "Mem" works for Memphis)
- **Firebase errors** — make sure `FIREBASE_CREDENTIALS` is the full JSON content including the curly braces
