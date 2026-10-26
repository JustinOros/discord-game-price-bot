const { sc } = require("./helpers");

const TICK = "*/2 * * * *";

function channels(ctx) {
  ctx.world.g1.addChannel({ id: "CH-forest", name: "the-forest" });
  ctx.world.g1.addChannel({ id: "CH-sotf", name: "sons-of-the-forest" });
}

function forestUp(ctx, players) {
  ctx.world.a2s = { "docker.test.local:27016": { name: "The Forest", players: players, max: 8 } };
}

module.exports = [
  sc("servers-command-online-and-offline", async (ctx) => {
    forestUp(ctx, 3);
    await ctx.say("alice", "!servers");
    ctx.world.a2s = { "docker.test.local:27016": { name: "The Forest", players: 0, max: 8, challenge: true } };
    await ctx.say("alice", "!servers");
    ctx.world.a2s = { "docker.test.local:8766": { name: "The Forest", players: 1, max: 4 } };
    await ctx.say("alice", "!servers");
    await ctx.say("alice", "!help");
  }),

  sc("servers-command-running-without-player-count", async (ctx) => {
    await ctx.say("alice", "!servers");
  }),

  sc("servers-command-docker-host-unreachable", async (ctx) => {
    ctx.fx.sshState.fail = true;
    await ctx.say("alice", "!servers");
  }),

  sc("servers-command-container-missing", async (ctx) => {
    ctx.fx.sshState.serverOutput = "plex|Up 2 days|0.0.0.0:32400->32400/tcp|running\n";
    await ctx.say("alice", "!servers");
    ctx.fx.sshState.serverOutput = "";
    await ctx.say("alice", "!servers");
  }),

  sc("servers-command-explicit-query-port-and-host", async (ctx) => {
    ctx.world.a2s = { "game.test.local:9999": { name: "The Forest", players: 2, max: 8 } };
    await ctx.say("alice", "!servers");
  }, { files: { "plugins/server-status/config.yaml": { servers: [{ name: "The Forest", container: "theforest", channel: "the-forest", host: "game.test.local", queryPort: 9999 }] } } }),

  sc("servers-remote-query-only-server", async (ctx) => {
    ctx.world.g1.addChannel({ id: "CH-remote", name: "remote-game" });
    ctx.world.a2s = { "remote.test.local:2457": { name: "Remote Game", players: 2, max: 10 } };
    await ctx.say("alice", "!servers");
    await ctx.startReady();
    await ctx.cron(TICK);
    ctx.world.a2s = {};
    await ctx.cron(TICK);
  }, { env: { DOCKER_SSH_HOST: null }, files: { "plugins/server-status/config.yaml": { servers: [] }, "plugins/server-status/config.local.yaml": { servers: [{ name: "Remote Game", host: "remote.test.local", queryPort: 2457, channel: "remote-game" }] } } }),

  sc("servers-remote-instance-states", async (ctx) => {
    ctx.world.g1.addChannel({ id: "CH-remote", name: "remote-game" });
    await ctx.startReady();
    ctx.fx.sshState.listOutput = JSON.stringify({ data: [] });
    await ctx.say("alice", "!servers");
    ctx.fx.sshState.listOutput = JSON.stringify({ data: [{ label: "remote", status: "running" }] });
    await ctx.say("alice", "!servers");
    ctx.world.a2s = { "remote.test.local:2457": { name: "Remote", players: 1, max: 10 } };
    await ctx.say("alice", "!servers");
    ctx.world.a2s = {};
    ctx.fx.sshState.listFail = true;
    await ctx.say("alice", "!servers");
  }, { env: { DOCKER_SSH_HOST: null }, files: { "plugins/server-status/config.yaml": { servers: [] }, "plugins/server-status/config.local.yaml": { servers: [{ name: "Remote Game", host: "remote.test.local", queryPort: 2457, channel: "remote-game", instanceLabel: "remote", listCommand: "list-instances" }] } } }),

  sc("servers-remote-no-player-count", async (ctx) => {
    ctx.world.g1.addChannel({ id: "CH-remote", name: "remote-game" });
    await ctx.startReady();
    ctx.fx.sshState.listOutput = JSON.stringify({ data: [{ label: "remote", status: "running" }] });
    await ctx.say("alice", "!servers");
    await ctx.cron(TICK);
    ctx.fx.sshState.listOutput = JSON.stringify({ data: [{ label: "remote", status: "shutting_down" }] });
    await ctx.say("alice", "!servers");
    await ctx.cron(TICK);
    ctx.fx.sshState.listOutput = JSON.stringify({ data: [{ label: "remote", status: "provisioning" }] });
    await ctx.say("alice", "!servers");
    await ctx.cron(TICK);
    ctx.fx.sshState.listOutput = JSON.stringify({ data: [] });
    await ctx.say("alice", "!servers");
  }, { env: { DOCKER_SSH_HOST: null }, files: { "plugins/server-status/config.yaml": { servers: [] }, "plugins/server-status/config.local.yaml": { servers: [{ name: "Remote Game", host: "remote.test.local", playerCount: false, channel: "remote-game", instanceLabel: "remote", listCommand: "list-instances" }] } } }),

  sc("servers-not-set-up", async (ctx) => {
    await ctx.say("alice", "!servers");
    await ctx.startReady();
    await ctx.cron(TICK);
  }, { env: { DOCKER_SSH_HOST: null } }),

  sc("servers-no-servers-listed", async (ctx) => {
    await ctx.say("alice", "!servers");
  }, { files: { "plugins/server-status/config.yaml": { servers: [] } } }),

  sc("servers-config-missing", async (ctx) => {
    await ctx.say("alice", "!servers");
    await ctx.startReady();
  }, { files: { "plugins/server-status/config.yaml": null } }),

  sc("servers-status-messages-post-edit-and-alert", async (ctx) => {
    channels(ctx);
    forestUp(ctx, 3);
    await ctx.startReady();
    await ctx.cron(TICK, "first check posts and pins both messages");
    await ctx.cron(TICK, "nothing changed, nothing edited");
    forestUp(ctx, 5);
    await ctx.cron(TICK, "player count changed, message edited");
    ctx.fx.sshState.serverOutput = "TheForest|Exited (137) 1 minute ago||exited\nSonsOfTheForest|Exited (0) 9 minutes ago||exited\n";
    await ctx.cron(TICK, "forest went down, edited and alert");
    await ctx.cron(TICK, "still down, nothing new");
    ctx.fx.sshState.serverOutput = null;
    forestUp(ctx, 0);
    await ctx.cron(TICK, "forest back up, edited and alert");
    await ctx.advance(11 * 60 * 1000);
    await ctx.cron(TICK, "stale message refreshed after ten minutes");
  }),

  sc("servers-status-message-deleted-is-reposted", async (ctx) => {
    channels(ctx);
    forestUp(ctx, 3);
    await ctx.startReady();
    await ctx.cron(TICK);
    ctx.world.channelRegistry.get("CH-forest").store.clear();
    forestUp(ctx, 4);
    await ctx.cron(TICK, "message gone, posted again");
  }),

  sc("servers-status-pin-fails-and-missing-channel", async (ctx) => {
    ctx.world.g1.addChannel({ id: "CH-forest", name: "the-forest" });
    ctx.world.failNext("pin", 1);
    forestUp(ctx, 3);
    await ctx.startReady();
    await ctx.cron(TICK, "forest posted, pin refused, sotf channel missing");
  }),

  sc("servers-status-docker-host-down-keeps-quiet", async (ctx) => {
    channels(ctx);
    forestUp(ctx, 3);
    await ctx.startReady();
    await ctx.cron(TICK);
    ctx.fx.sshState.fail = true;
    await ctx.cron(TICK, "host unreachable shows unknown, no alert");
    ctx.fx.sshState.fail = false;
    await ctx.cron(TICK, "host back, no alert because status never changed");
  }),

  sc("servers-status-alerts-off", async (ctx) => {
    channels(ctx);
    forestUp(ctx, 3);
    await ctx.startReady();
    await ctx.cron(TICK);
    ctx.fx.sshState.serverOutput = "TheForest|Exited (137) 1 minute ago||exited\nSonsOfTheForest|Exited (0) 9 minutes ago||exited\n";
    await ctx.cron(TICK, "forest down, edited, no alert");
  }, { files: { "plugins/server-status/config.yaml": { alerts: false, servers: [{ name: "The Forest", container: "TheForest", channel: "the-forest" }] } } }),

  sc("servers-status-interval-setting", async (ctx) => {
    await ctx.startReady();
    await ctx.cron("*/10 * * * *", "interval of ten minutes");
  }, { files: { "plugins/server-status/config.yaml": { intervalMinutes: 10, servers: [] } } })
];
