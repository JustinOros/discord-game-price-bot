Characterization tests for the Discord bot

These tests record what the bot does today so a refactor can be checked
against it. They load the real index.js (plus any plugins/ or core/ folders
or other folders next to it) in a throwaway temp directory, with fakes for
discord.js, node-cron, child_process.execFile, fetch, the clock and
Math.random. The real data files are never touched.

Run
  node test/run.js                 run all scenarios and compare to the baseline
  node test/run.js NAME [NAME]     run only the named scenarios
  node test/run.js --list          list scenario names
  node test/run.js --update        rewrite test/snapshots/baseline.json
  node test/run.js --update NAME   rewrite only that scenario in the baseline

Exit code is 1 if any scenario differs, crashes or has no baseline.
A failing scenario prints each differing field with expected and actual.

Rule for refactoring
After every refactor step, node test/run.js must still print only PASS
lines with the baseline untouched. Do not run --update to make a refactor
pass. Use --update only when a behavior change is intended, and review the
baseline.json diff before committing it.

What a scenario records
Every outgoing payload in order (replies, channel sends, interaction
replies, embeds and components as JSON), console output, role and member
operations, ssh arguments, fetch calls (secrets redacted), registered
event handlers, cron expressions, and any data file the bot changed.

Notes
- personality.yaml, greetings.yaml, goodbyes.yaml, maps.json and trivia.json
  are replaced by small fixed copies at the temp dir root so editing the
  real content does not break the baseline. The scenario real-content-files
  uses the real copies. If a refactor moves these files, update
  contentFiles() in test/lib/sandbox.js to write them at the new paths.
- README.md is copied for real. The system prompt is recorded with the README
  text cut out and replaced by a flag, so README edits do not matter.
- Embed and button JSON comes from the real builders in node_modules/discord.js.
  A discord.js upgrade can change that output.
- Fixtures live in test/lib/gamedata.js (games, shops, steam) and
  test/lib/fixtures.js (routes). Scenarios live in test/scenarios/.
