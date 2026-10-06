const { GuildScheduledEventStatus } = require("discord.js");

const EVENT_REMINDER_MINUTES = 5;
const notifiedEvents = new Set();

async function checkUpcomingEvents(client, ctx) {
  const stillScheduled = new Set();

  for (const guild of client.guilds.cache.values()) {
    let events;
    try {
      events = await guild.scheduledEvents.fetch();
    } catch (err) {
      console.error("Could not fetch scheduled events for " + guild.name + ":", err.message);
      continue;
    }

    for (const event of events.values()) {
      if (event.status !== GuildScheduledEventStatus.Scheduled || !event.scheduledStartAt) continue;
      stillScheduled.add(event.id);

      if (notifiedEvents.has(event.id)) continue;

      const minutesUntil = (event.scheduledStartAt.getTime() - Date.now()) / 60000;
      if (minutesUntil <= 0 || minutesUntil > EVENT_REMINDER_MINUTES) continue;

      const channel = guild.channels.cache.find(
        (c) => c.name === ctx.GREETING_CHANNEL_NAME && c.isTextBased && c.isTextBased()
      );
      if (!channel) {
        console.error("Could not find a #" + ctx.GREETING_CHANNEL_NAME + " channel in " + guild.name);
        notifiedEvents.add(event.id);
        continue;
      }

      try {
        const roles = ctx.loadRoles();
        const match = ctx.findGameRole(roles, event.name);
        const role = match && guild.roles.cache.get(match.entry.roleId);
        const mention = role ? role.toString() + " " : "";
        await channel.send(mention + "EVENT: " + event.name + " starting soon!");
      } catch (err) {
        console.error("Could not send event reminder:", err.message);
      }
      notifiedEvents.add(event.id);
    }
  }

  for (const id of Array.from(notifiedEvents)) {
    if (!stillScheduled.has(id)) notifiedEvents.delete(id);
  }
}

module.exports = {
  name: "event-reminders",
  onReady(ctx) {
    ctx.cron.schedule("* * * * *", () => checkUpcomingEvents(ctx.client, ctx));
  }
};
