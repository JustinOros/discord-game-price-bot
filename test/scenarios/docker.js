const { sc } = require("./helpers");

module.exports = [
  sc("docker-guild-with-role", async (ctx) => {
    await ctx.say("bob", "!docker ps");
    await ctx.say("bob", "!docker restart gitea");
    await ctx.say("bob", "!docker restart GITEA");
    await ctx.say("bob", "!docker restart c3d4");
    await ctx.say("bob", "!docker restart c3d4e5f6a7b8");
    await ctx.say("bob", "!docker restart plex-media-server");
    await ctx.say("bob", "!docker restart a1b2");
    await ctx.say("bob", "!docker restart nothing");
    await ctx.say("bob", "!docker restart");
    await ctx.say("bob", "!docker foo");
    await ctx.say("bob", "!docker");
    await ctx.say("bob", "!DOCKER PS");
    await ctx.say("bob", "!docker   restart    sotf-server  ", { label: "bob: !docker restart with extra spaces" });
    await ctx.say("bob", "!docker restart it's;rm -rf", { label: "bob: !docker restart with shell metacharacters" });
  }),

  sc("docker-quote-in-container-name", async (ctx) => {
    ctx.fx.sshState.output = "x9f8e7d6c5b4|it's-odd name|Up 1 hour\nabc123def456|plain|Up 2 hours\n";
    await ctx.say("bob", "!docker ps");
    await ctx.say("bob", "!docker restart it's-odd name");
  }),

  sc("docker-guild-without-role", async (ctx) => {
    await ctx.say("alice", "!docker ps");
    await ctx.say("alice", "!docker");
    await ctx.say("alice", "!docker restart gitea");
  }),

  sc("docker-ssh-failures", async (ctx) => {
    ctx.fx.sshState.fail = true;
    await ctx.say("bob", "!docker ps");
    await ctx.say("bob", "!docker restart gitea");
    ctx.fx.sshState.fail = false;
    ctx.fx.sshState.failRestart = true;
    await ctx.say("bob", "!docker restart gitea", { label: "bob: restart command itself fails" });
  }),

  sc("docker-empty-lists", async (ctx) => {
    ctx.fx.sshState.output = "";
    await ctx.say("bob", "!docker ps");
    ctx.fx.sshState.output = "a1b2c3d4e5f6|Plex-Media-Server|Up 3 days\n";
    await ctx.say("bob", "!docker ps", { label: "bob: only the protected container exists" });
    ctx.fx.sshState.output = "\n  \nx1|only-one|Up 1 hour\nbadline-without-pipes\n";
    await ctx.say("bob", "!docker ps", { label: "bob: blank and malformed lines" });
  }),

  sc("docker-not-enabled", async (ctx) => {
    await ctx.say("bob", "!docker ps");
    await ctx.say("bob", "!help");
    await ctx.dm("dave", "!docker ps");
  }, { env: { DOCKER_SSH_HOST: null } }),

  sc("docker-not-enabled-missing-role-id", async (ctx) => {
    await ctx.say("bob", "!docker ps");
  }, { env: { DOCKER_ROLE_ID: null } }),

  sc("docker-no-protected-containers", async (ctx) => {
    await ctx.say("bob", "!docker ps");
    await ctx.say("bob", "!docker restart plex-media-server");
  }, { env: { DOCKER_PROTECTED_CONTAINERS: null } }),

  sc("docker-multiple-protected-containers", async (ctx) => {
    await ctx.say("bob", "!docker ps");
    await ctx.say("bob", "!docker restart GITEA");
    await ctx.say("bob", "!docker restart retroassembly");
  }, { env: { DOCKER_PROTECTED_CONTAINERS: " Plex-Media-Server , gitea ,, " } }),

  sc("docker-direct-messages", async (ctx) => {
    await ctx.dm("bob", "!docker ps");
    await ctx.dm("dave", "!docker ps");
    await ctx.dm("dave", "!docker restart gitea");
    await ctx.dm("alice", "!docker ps");
    await ctx.dm("eve", "!docker ps");
    await ctx.dm("dave", "!docker");
    await ctx.dm("dave", "  !DOCKER restart sotf-server  ", { label: "dave dm: padded upper case restart" });
    await ctx.dm("dave", "!dockerx ps", { label: "dave dm: !dockerx is not a docker command" });
  })
];
