const { activePlayers } = require("../state/guildState");
const { stopPlayback } = require("../audio/voiceManager");

async function execute(message) {
  const guildId = message.guild.id;

  if (!activePlayers.has(guildId)) {
    return message.reply("Inget spelas just nu.");
  }

  stopPlayback(guildId);
  return message.reply("Stoppade uppspelningen och lämnade voice channel.");
}

module.exports = {
  execute,
};