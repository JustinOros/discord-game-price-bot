# Discord Game Price Bot

A Discord bot for your server. Type `!watch GAME NAME` in any channel to start tracking a PC game's price, `!remove GAME NAME` (or `!unwatch GAME NAME`) to stop, `!list` to see what is being watched, `!price GAME NAME` to check a price without watching it, `!history GAME NAME` to see every recorded sale over the past 12 months with date and price, `!predict GAME NAME` to guess when it might go on sale next, `!info GAME NAME` to see its platforms, multiplayer/co-op/cross-play info, a link to its store page, and how many people on the server own it, `!own GAME NAME` to mark a game as owned by you, `!unown GAME NAME` to remove it from your owned list, `!my-steam-profile LINK` to link your Steam profile so `!info` can count games you own automatically, `!who GAME NAME` to list who has confirmed they own a game, `!remember SOMETHING` to permanently teach it a fact about you that survives restarts, `!forget SOMETHING` (or `!forget all`) to make it forget something you had it remember, `!memories` to see everything it remembers about you, `!check` to run the sale check on demand, `!shops` to see which stores it covers. Once a day it checks the best current price across PC stores for everything watched and posts in the channel it was added from when something is on sale, with the title, sale price, and which store it is at.

Mention the bot's trigger word anywhere in a message (that doesn't start with `!`) and, if Ollama is installed and running (and `AI_ENABLED` isn't turned off), it thinks up a short, in-character answer to whatever you said using a free AI model running right on your own computer - no API key, no cost, nothing sent anywhere over the internet. Without Ollama running (or with `AI_ENABLED=false`), it doesn't reply to mentions at all. It never fires on `!` commands, even ones that happen to contain the trigger word. The bot's name, trigger word, and personality are entirely up to you - edit `personality.yaml` to set them (see [Notes](#notes)); it ships pre-filled as BMO from Adventure Time as an example.

When someone new joins the server, it posts a random greeting from `greetings.yaml` in your #general channel. When someone leaves, it posts a random goodbye from `goodbyes.yaml` there too.

It runs as a background service on a computer you leave on (a Mac, Linux box, or Windows PC all work), since a bot that reacts to typed commands has to stay connected to Discord all the time. There is no website and no cloud hosting involved.

## Setup

### 1. Create the Discord bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click New Application. Name it whatever you like.
2. Go to the Bot tab, click Add Bot.
3. Under Privileged Gateway Intents, turn on "Message Content Intent" (required to read `!watch` style commands) and "Server Members Intent" (required to detect when someone joins and send a greeting). Click Save Changes.
4. Click Reset Token, copy it. This is your `DISCORD_BOT_TOKEN`, keep it secret.
5. Go to OAuth2 > URL Generator, check the "bot" scope, then under Bot Permissions check "Send Messages" and "Read Message History". A URL appears at the bottom of the page.
6. This step is required and easy to miss: copy that URL, paste it into your browser, press Enter, pick your server, and click Authorize. Creating the bot in steps 1 to 5 does not add it to your server, it only exists in the developer portal until you do this.

### 2. Get a free IsThereAnyDeal API key

Register a free account at [isthereanydeal.com](https://isthereanydeal.com), then go to [isthereanydeal.com/apps/](https://isthereanydeal.com/apps/) and click Register App to get a key. Free, instant, no card needed. This is your `ITAD_API_KEY`.

### 3. Get a free Steam Web API key (optional)

Only needed if you want `!my-steam-profile` and automatic Steam ownership counts on `!info`. Go to [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey), sign in, enter any domain name (e.g. `localhost`), and submit. This is your `STEAM_API_KEY`. You can skip this during setup and add it to `.env` later if you change your mind.

### 4. Install Ollama for the bot's AI answers (optional, free)

Only needed for the bot to give smart, made-up-on-the-spot answers when asked a question in chat - completely free, since it runs a small AI model locally instead of calling a paid cloud API. The installer in the next step will offer to install [Ollama](https://ollama.com) for you and download the model, so you can skip this step and let it handle everything. If you'd rather do it yourself first, download it from [ollama.com/download](https://ollama.com/download). Skip this entirely if you don't want the bot replying to chat mentions at all - you can always set it up later and just run the installer again.

### 5. Install and run it

Works the same way on macOS, Linux, and Windows - a background process manager called [pm2](https://pm2.keymetrics.io) keeps the bot running and automatically restarts it if it ever crashes or the computer reboots.

You need [Node.js](https://nodejs.org) installed first (18 or newer). On macOS or Linux with Homebrew, or on Windows with `winget`, the installer will offer to install it for you.

**On macOS or Linux**, in Terminal:

```
cd discord-game-price-bot
bash install.sh
```

**On Windows**, in PowerShell:

```
cd discord-game-price-bot
powershell -ExecutionPolicy Bypass -File install.ps1
```

Either way, it will ask for your Discord bot token, your IsThereAnyDeal key, and (optionally) your Steam Web API key the first time (nothing is shown or saved anywhere except your local `.env` file), offer to install Ollama and download its AI model if you don't have it yet, install dependencies, and set the bot up as a background service that starts on login/boot and restarts itself if it ever crashes. That is the whole setup.

In your Discord server, try `!watch Hades` and `!list` to confirm it is working.

Logs go to `bot.log` and `bot.error.log` inside the project folder, useful if a command does not seem to be working. `pm2 logs discord-game-price-bot` shows the same thing live in the terminal, and `pm2 status` shows whether it's currently running.

To stop the bot:

```
pm2 stop discord-game-price-bot
```

To change the token or key later, edit `.env` directly, then run the installer again (`bash install.sh` or the PowerShell command above) to restart it with the new values. Re-running it any time (for example after editing `index.js`) is safe, it just reinstalls and restarts the service.

## Notes

- Price data comes from [IsThereAnyDeal](https://isthereanydeal.com), which covers Steam, GOG, Epic, Humble, Fanatical, and most other PC stores. `!watch` and the daily check always pick whichever store currently has the lowest price, and every price shown says which store it is at. Type `!shops` to see the live, current list of every store it checks.
- `!watch` matches the top search result for whatever you typed, and tells you what it matched so you can catch a wrong pick early.
- The daily check runs at 8am Arizona time. To change it, edit the `cron.schedule("0 15 * * *", ...)` line in `index.js` (that time is in UTC).
- The daily check only alerts once per discount level per game. If the price drops further while still on sale, you get a new alert. If it goes back to full price and later goes on sale again, that is a new alert too.
- Everything watched is stored in `games.json` in this folder, in plain text, so you can also open it directly if you ever want to see or edit the list by hand.
- `games.json`, `owned.json`, `steamlinks.json`, `memory.yaml`, and `.env` hold your server's actual data and are left out of git (`.gitignore`) so they never end up in a public repo by accident. The installer creates each of these from its matching `.example` template automatically if it doesn't exist yet.
- The installer manages the bot with [pm2](https://pm2.keymetrics.io), so once it's set up you can check on it with plain pm2 commands any time: `pm2 status` (is it running), `pm2 logs discord-game-price-bot` (live logs), `pm2 restart discord-game-price-bot`, `pm2 stop discord-game-price-bot`, and `pm2 delete discord-game-price-bot` (remove it from pm2 entirely - re-run the installer to add it back).
- If you're upgrading from an older version of this bot that used launchd directly on macOS, `install.sh` detects and automatically removes that old service the first time you run it, so you don't end up with two copies of the bot running and double-replying in Discord.
- To add, remove, or change greetings, edit `greetings.yaml`. Use `{user}` anywhere in a greeting and it gets replaced with a mention of the person who joined.
- Same for goodbyes: edit `goodbyes.yaml`. Use `{user}` there too, it gets replaced with the username of whoever left (a plain name, not a mention, since Discord can't ping someone no longer in the server).
- The join greeting posts to whichever channel is named `general` in your server. To use a different channel, change `GREETING_CHANNEL_NAME` near the top of `index.js` to that channel's name (no `#`) and restart it (re-run the installer, or `pm2 restart discord-game-price-bot`). If no channel with that name exists, nothing posts and `bot.error.log` will note it.
- Any Discord Scheduled Event on your server gets an automatic reminder posted to that same channel 15 minutes before it starts, like "Movie Night starting in 15 minutes!" Each event only gets reminded once. To change how far ahead it reminds, edit `EVENT_REMINDER_MINUTES` near the top of `index.js` and restart it.
- `!info` gets platforms and Multiplayer/Co-Op/Cross-Play from that game's Steam store page when it has one. For non-Steam games (GOG/Epic exclusives etc.) there is no such lookup available, so "not listed" there means "couldn't confirm it," not "definitely single-player only."
- The ownership count on `!info` combines two sources: anyone who ran `!own` for that game, plus anyone who linked their Steam profile with `!my-steam-profile` and actually owns it there. Discord itself has no concept of game ownership, so there is no fully automatic way to get this - `!own` needs people to mark their own games by hand, and `!my-steam-profile` only auto-detects Steam copies (not GOG/Epic) and only if that person's Steam profile has "game details" set to public. Everything self-reported through `!own` is stored in `owned.json`; Steam profile links are stored in `steamlinks.json`, both in this folder, in plain text.
- If you don't want to make each person run `!my-steam-profile` themselves, you can link them yourself from the terminal (the easiest way if you already know your server members as Steam friends): run `bash install.sh --link-steam-profiles` (macOS/Linux) or `powershell -ExecutionPolicy Bypass -File install.ps1 -LinkSteamProfiles` (Windows). The first time, it asks for your own Steam profile once (to read your friends list from - it needs your Steam friends list privacy set to public, and remembers your profile after that so it won't ask again). Then it lists your Discord server's members for you to pick one by number, lists your Steam friends for you to pick one by number, links them, and asks if you want to link another (defaults to no). This does not restart the bot, so there is no need to run the installer again afterward. This is terminal-only by design - there's no Discord command for it, so members can't link (or relink) each other's profiles themselves.
- The bot only replies to mentions of its trigger word if Ollama is installed, running, and has the model in `OLLAMA_MODEL` downloaded - without that, mentioning it gets no reply at all, and nothing is logged (check `bot.error.log` if you expect it to be working and it isn't replying). Each person can only trigger an AI answer once every 5 seconds; asking again sooner (or the Ollama request failing) just gets no reply rather than a second request, which keeps a burst of questions from bogging down your computer generating several replies at once.
- `!remember SOMETHING` teaches it a permanent fact about you - a name, a preference, a correction like "don't call me buddy" - that it will always take into account when it replies to you, even after the bot restarts. These facts are saved to `memory.yaml`, per person, and never expire on their own, unlike the short-term memory described below. `!forget SOMETHING` removes one again (it has to match what you typed to `!remember`, word for word - use `!memories` to see the exact wording it has stored), and `!forget all` clears everything it remembers about you at once. Each person can have up to 20 things remembered at a time.
- `OLLAMA_MODEL` in `.env` controls which model it uses (`llama3.2` by default - small, fast, and good enough for short in-character replies). To use a different one, pull it yourself with `ollama pull MODEL_NAME`, set `OLLAMA_MODEL=MODEL_NAME` in `.env`, and restart it (re-run the installer, or `pm2 restart discord-game-price-bot`). Bigger models give better answers but take longer to reply and use more of your computer's memory.
- It remembers each person's last 3 exchanges (their message and its reply) so it can follow up naturally and stick to things you told it earlier in the conversation, like a correction or a preference. This memory is per-person, kept only in the bot's running memory (not saved to disk), and forgotten automatically after 30 minutes of that person not mentioning it.
- The bot's name, trigger word, and personality all come from `personality.yaml`. It ships set up as BMO from Adventure Time:
  ```
  name: BMO
  trigger: bmo
  persona: |
    You are BMO, the small handheld game console robot from Adventure Time. You are cheerful, innocent,
    a little literal-minded, and love games and your friends Finn and Jake. Playful, warm, a little silly,
    occasionally saying things like "Oh my glob" or calling the user "buddy" or "friend".
  ```
  Change `name` to whatever the bot should be called (used in a couple of log messages), `trigger` to the word that should make it reply (matched as a whole word, case-insensitive, anywhere in a message), and `persona` to a description of how it should talk and act - write it like you're describing a character to someone. It always stays an expert on this README and keeps replies to one short sentence, no matter what personality you give it. Edit the file and restart it (re-run the installer, or `pm2 restart discord-game-price-bot`) to pick up the changes. `greetings.yaml` and `goodbyes.yaml` have their own sample lines written in BMO's voice too - edit those separately if you want the join/leave messages to match a different personality.
- To turn the AI answers off without uninstalling Ollama (for example if you want your computer's resources back for something else), set `AI_ENABLED=false` in `.env` and restart it (re-run the installer, or `pm2 restart discord-game-price-bot`). Set it back to `true` (or remove the line entirely) to turn it back on. This only affects mention replies - everything else keeps working either way.

## License

[MIT](LICENSE)
