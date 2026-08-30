#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ "$1" == "--link-steam-profiles" ]]; then
  if [[ ! -f .env ]]; then
    echo "No .env found yet. Run bash install.sh (with no flag) first to set up your keys."
    exit 1
  fi
  echo "Installing dependencies..."
  npm install --silent
  node link-steam-profiles.js
  exit 0
fi

OS_NAME="$(uname -s)"

if [[ "$OS_NAME" != "Darwin" && "$OS_NAME" != "Linux" ]]; then
  echo "This installer is for macOS and Linux. On Windows, run install.ps1 in PowerShell instead."
  exit 1
fi

set_env_value() {
  local key="$1"
  local value="$2"
  if [[ -f .env ]] && grep -q "^${key}=" .env; then
    grep -v "^${key}=" .env > .env.tmp
    mv .env.tmp .env
  fi
  echo "${key}=${value}" >> .env
}

if [[ "$OS_NAME" == "Darwin" ]]; then
  for OLD_LABEL in com.justinoros.discordgamepricebot com.justinoros.gamepricebot; do
    OLD_PLIST="$HOME/Library/LaunchAgents/$OLD_LABEL.plist"
    if [[ -f "$OLD_PLIST" ]]; then
      echo "Found an old launchd service ($OLD_LABEL) from a previous version of this bot - switching it over to pm2 so you don't end up with two copies running."
      launchctl unload "$OLD_PLIST" >/dev/null 2>&1 || true
      rm -f "$OLD_PLIST"
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found."
  if command -v brew >/dev/null 2>&1; then
    read -p "Install it now with Homebrew? [y/N] " answer
    if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
      brew install node
    else
      echo "Install Node.js from https://nodejs.org (or your package manager) and run this script again."
      exit 1
    fi
  else
    echo "Install Node.js from https://nodejs.org (or your package manager, e.g. apt/dnf/pacman) and run this script again."
    exit 1
  fi
fi

echo "Installing dependencies..."
npm install --silent

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if [[ ! -f games.json ]]; then
  cp games.json.example games.json
fi

if [[ ! -f owned.json ]]; then
  cp owned.json.example owned.json
fi

if [[ ! -f steamlinks.json ]]; then
  cp steamlinks.json.example steamlinks.json
fi

if [[ ! -f memory.yaml ]]; then
  cp memory.yaml.example memory.yaml
fi

CURRENT_TOKEN=$(grep -E "^DISCORD_BOT_TOKEN=" .env | cut -d "=" -f2-)
CURRENT_KEY=$(grep -E "^ITAD_API_KEY=" .env | cut -d "=" -f2-)

if [[ -z "$CURRENT_TOKEN" ]]; then
  echo ""
  echo "Need a Discord bot token:"
  echo "1. Go to https://discord.com/developers/applications and sign in"
  echo "2. Click New Application, name it anything, create it"
  echo "3. Click Bot in the left sidebar"
  echo "4. IMPORTANT - scroll to Privileged Gateway Intents, turn ON both Message Content Intent and Server Members Intent, then click the Save Changes button at the bottom."
  echo "   The toggles by themselves do not save. If you skip Save Changes, the bot will fail to log in with a disallowed intents error."
  echo "5. Click Reset Token (or Copy) and copy the token"
  echo "6. Click OAuth2 > URL Generator, check bot under Scopes, then check Send Messages and Read Message History under Bot Permissions"
  echo "7. IMPORTANT - a URL appears at the bottom of that page. Copy it, paste it into your web browser, press Enter, pick your server, and click Authorize."
  echo "   Creating the bot does NOT add it to your server. It will not show up in your server until you open that URL and authorize it there."
  echo ""
  read -p "Paste your Discord bot token: " TOKEN_INPUT
  set_env_value DISCORD_BOT_TOKEN "$TOKEN_INPUT"
fi

if [[ -z "$CURRENT_KEY" ]]; then
  echo ""
  echo "Need a free IsThereAnyDeal API key:"
  echo "1. Register a free user account at https://isthereanydeal.com"
  echo "2. Go to https://isthereanydeal.com/apps/"
  echo "3. Click Register App, name it anything, submit"
  echo "4. Copy the API key it shows you"
  echo ""
  read -p "Paste your IsThereAnyDeal API key: " KEY_INPUT
  set_env_value ITAD_API_KEY "$KEY_INPUT"
fi

CURRENT_STEAM_KEY=$(grep -E "^STEAM_API_KEY=" .env | cut -d "=" -f2-)

if [[ -z "$CURRENT_STEAM_KEY" ]]; then
  echo ""
  echo "Optional - only needed for !my-steam-profile and automatic Steam ownership counts on !info:"
  echo "1. Go to https://steamcommunity.com/dev/apikey and sign in"
  echo "2. Enter any domain name (e.g. localhost), agree to the terms, and submit"
  echo "3. Copy the API key it shows you"
  echo ""
  read -p "Paste your Steam Web API key, or press Enter to skip: " STEAM_KEY_INPUT
  set_env_value STEAM_API_KEY "$STEAM_KEY_INPUT"
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo ""
  read -p "Want the bot to use AI to give smarter, in-character answers when people chat with it? This is free - it installs Ollama and runs a small AI model locally on this machine, no API key or cost involved. [y/N] " AI_ANSWER
  if [[ "$AI_ANSWER" == "y" || "$AI_ANSWER" == "Y" ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "Installing Ollama..."
      brew install ollama
    elif [[ "$OS_NAME" == "Linux" ]]; then
      echo "Installing Ollama..."
      curl -fsSL https://ollama.com/install.sh | sh
    else
      echo "Install it yourself from https://ollama.com/download, then run this script again to finish setting it up."
    fi
  else
    echo "Skipping - the bot won't reply to chat mentions. Run this script again any time to set it up."
  fi
fi

if command -v ollama >/dev/null 2>&1; then
  CURRENT_OLLAMA_MODEL=$(grep -E "^OLLAMA_MODEL=" .env | cut -d "=" -f2-)
  if [[ -z "$CURRENT_OLLAMA_MODEL" ]]; then
    CURRENT_OLLAMA_MODEL="llama3.2"
    set_env_value OLLAMA_MODEL "$CURRENT_OLLAMA_MODEL"
  fi

  if command -v brew >/dev/null 2>&1 && brew list ollama >/dev/null 2>&1; then
    brew services start ollama >/dev/null 2>&1 || true
    sleep 2
  fi

  if ! ollama list 2>/dev/null | grep -q "$CURRENT_OLLAMA_MODEL"; then
    echo ""
    echo "Downloading the $CURRENT_OLLAMA_MODEL model for the bot to use (one-time, may take a few minutes)..."
    ollama pull "$CURRENT_OLLAMA_MODEL" || echo "Could not download the model automatically - make sure Ollama is running, then run: ollama pull $CURRENT_OLLAMA_MODEL"
  fi
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo ""
  echo "Installing pm2 to keep the bot running in the background..."
  npm install -g pm2
fi

APP_NAME="discord-game-price-bot"

pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start index.js --name "$APP_NAME" --cwd "$SCRIPT_DIR" --output "$SCRIPT_DIR/bot.log" --error "$SCRIPT_DIR/bot.error.log"
pm2 save

STARTUP_CMD=$(pm2 startup 2>/dev/null | grep "^sudo " || true)
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD"
fi

echo ""
echo "Installed and running in the background."
echo "View logs: pm2 logs $APP_NAME"
echo "Check status: pm2 status"
echo "To stop it: pm2 stop $APP_NAME"
echo "To restart it after editing index.js: bash install.sh"
