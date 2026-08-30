param(
  [switch]$LinkSteamProfiles
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if ($LinkSteamProfiles) {
  if (-not (Test-Path ".env")) {
    Write-Host "No .env found yet. Run install.ps1 (with no flag) first to set up your keys."
    exit 1
  }
  Write-Host "Installing dependencies..."
  npm install --silent
  node link-steam-profiles.js
  exit 0
}

function Test-CommandExists($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-EnvValue($key) {
  if (-not (Test-Path ".env")) { return "" }
  $line = Select-String -Path ".env" -Pattern "^$key=" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($line) {
    return ($line.Line -replace "^$key=", "")
  }
  return ""
}

function Set-EnvValue($key, $value) {
  $lines = @()
  if (Test-Path ".env") {
    $lines = Get-Content ".env" | Where-Object { $_ -notmatch "^$key=" }
  }
  $lines += "$key=$value"
  $lines | Set-Content ".env"
}

if (-not (Test-CommandExists node)) {
  Write-Host "Node.js was not found."
  if (Test-CommandExists winget) {
    $answer = Read-Host "Install it now with winget? [y/N]"
    if ($answer -eq "y" -or $answer -eq "Y") {
      winget install --id OpenJS.NodeJS.LTS -e
      Write-Host "Node.js was installed. Close and reopen this terminal, then run install.ps1 again."
      exit 0
    } else {
      Write-Host "Install Node.js from https://nodejs.org and run this script again."
      exit 1
    }
  } else {
    Write-Host "Install Node.js from https://nodejs.org and run this script again."
    exit 1
  }
}

Write-Host "Installing dependencies..."
npm install --silent

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

if (-not (Test-Path "games.json")) {
  Copy-Item "games.json.example" "games.json"
}

if (-not (Test-Path "owned.json")) {
  Copy-Item "owned.json.example" "owned.json"
}

if (-not (Test-Path "steamlinks.json")) {
  Copy-Item "steamlinks.json.example" "steamlinks.json"
}

if (-not (Test-Path "memory.yaml")) {
  Copy-Item "memory.yaml.example" "memory.yaml"
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue "DISCORD_BOT_TOKEN"))) {
  Write-Host ""
  Write-Host "Need a Discord bot token:"
  Write-Host "1. Go to https://discord.com/developers/applications and sign in"
  Write-Host "2. Click New Application, name it anything, create it"
  Write-Host "3. Click Bot in the left sidebar"
  Write-Host "4. IMPORTANT - scroll to Privileged Gateway Intents, turn ON both Message Content Intent and Server Members Intent, then click the Save Changes button at the bottom."
  Write-Host "   The toggles by themselves do not save. If you skip Save Changes, the bot will fail to log in with a disallowed intents error."
  Write-Host "5. Click Reset Token (or Copy) and copy the token"
  Write-Host "6. Click OAuth2 > URL Generator, check bot under Scopes, then check Send Messages and Read Message History under Bot Permissions"
  Write-Host "7. IMPORTANT - a URL appears at the bottom of that page. Copy it, paste it into your web browser, press Enter, pick your server, and click Authorize."
  Write-Host "   Creating the bot does NOT add it to your server. It will not show up in your server until you open that URL and authorize it there."
  Write-Host ""
  $tokenInput = Read-Host "Paste your Discord bot token"
  Set-EnvValue "DISCORD_BOT_TOKEN" $tokenInput
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue "ITAD_API_KEY"))) {
  Write-Host ""
  Write-Host "Need a free IsThereAnyDeal API key:"
  Write-Host "1. Register a free user account at https://isthereanydeal.com"
  Write-Host "2. Go to https://isthereanydeal.com/apps/"
  Write-Host "3. Click Register App, name it anything, submit"
  Write-Host "4. Copy the API key it shows you"
  Write-Host ""
  $keyInput = Read-Host "Paste your IsThereAnyDeal API key"
  Set-EnvValue "ITAD_API_KEY" $keyInput
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue "STEAM_API_KEY"))) {
  Write-Host ""
  Write-Host "Optional - only needed for !my-steam-profile and automatic Steam ownership counts on !info:"
  Write-Host "1. Go to https://steamcommunity.com/dev/apikey and sign in"
  Write-Host "2. Enter any domain name (e.g. localhost), agree to the terms, and submit"
  Write-Host "3. Copy the API key it shows you"
  Write-Host ""
  $steamKeyInput = Read-Host "Paste your Steam Web API key, or press Enter to skip"
  Set-EnvValue "STEAM_API_KEY" $steamKeyInput
}

if (-not (Test-CommandExists ollama)) {
  Write-Host ""
  $aiAnswer = Read-Host "Want the bot to use AI to give smarter, in-character answers when people chat with it? This is free - it installs Ollama and runs a small AI model locally on this machine, no API key or cost involved. [y/N]"
  if ($aiAnswer -eq "y" -or $aiAnswer -eq "Y") {
    if (Test-CommandExists winget) {
      Write-Host "Installing Ollama..."
      winget install --id Ollama.Ollama -e
    } else {
      Write-Host "Install it yourself from https://ollama.com/download, then run this script again to finish setting it up."
    }
  } else {
    Write-Host "Skipping - the bot won't reply to chat mentions. Run this script again any time to set it up."
  }
}

if (Test-CommandExists ollama) {
  $currentModel = Get-EnvValue "OLLAMA_MODEL"
  if ([string]::IsNullOrWhiteSpace($currentModel)) {
    $currentModel = "llama3.2"
    Set-EnvValue "OLLAMA_MODEL" $currentModel
  }

  $modelList = & ollama list 2>$null
  $modelFound = $false
  foreach ($line in $modelList) {
    if ($line -match [regex]::Escape($currentModel)) {
      $modelFound = $true
      break
    }
  }

  if (-not $modelFound) {
    Write-Host ""
    Write-Host "Downloading the $currentModel model for the bot to use (one-time, may take a few minutes)..."
    ollama pull $currentModel
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Could not download the model automatically - make sure Ollama is running, then run: ollama pull $currentModel"
    }
  }
}

if (-not (Test-CommandExists pm2)) {
  Write-Host ""
  Write-Host "Installing pm2 to keep the bot running in the background..."
  npm install -g pm2
}

$AppName = "discord-game-price-bot"

pm2 delete $AppName 2>$null | Out-Null
pm2 start index.js --name $AppName --cwd $ScriptDir --output "$ScriptDir\bot.log" --error "$ScriptDir\bot.error.log"
pm2 save

$taskName = "PM2 Resurrect - $AppName"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
  $pm2Command = Get-Command pm2 -ErrorAction SilentlyContinue
  if ($pm2Command) {
    $action = New-ScheduledTaskAction -Execute $pm2Command.Source -Argument "resurrect"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "Restores PM2-managed apps (including $AppName) at logon" | Out-Null
  }
}

Write-Host ""
Write-Host "Installed and running in the background."
Write-Host "View logs: pm2 logs $AppName"
Write-Host "Check status: pm2 status"
Write-Host "To stop it: pm2 stop $AppName"
Write-Host "To restart it after editing index.js: powershell -ExecutionPolicy Bypass -File install.ps1"
