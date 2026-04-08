const { searchResults } = require("../state/guildState");
const { joinChannel, playUrl, stopPlayback } = require("../audio/voiceManager");

async function execute(message) {
  const voiceChannel = message.member?.voice?.channel;
  const guildId = message.guild.id;

  if (!voiceChannel) {
    return message.reply("Du måste vara i en voice channel först.");
  }

  const arg = message.content.split(" ")[1];
  if (!arg) {
    return message.reply("Skriv t.ex. `!playradio 1`.");
  }

  const stationIndex = parseInt(arg, 10) - 1;
  const stations = searchResults.get(guildId);

  if (!stations || !stations.length) {
    return message.reply("Sök efter en station först med `!search`.");
  }

  if (
    Number.isNaN(stationIndex) ||
    stationIndex < 0 ||
    stationIndex >= stations.length
  ) {
    return message.reply("Ogiltigt nummer från sökresultatet.");
  }

  const station = stations[stationIndex];

  try {
    console.log("Trying to play station:", station.name);
    console.log("Resolved URL:", station.url);

    stopPlayback(guildId);

    const connection = await joinChannel(message, voiceChannel);
    playUrl(guildId, connection, station.url, message, `radio: ${station.name}`);

    return message.reply(`▶️ Now playing: **${station.name}**`);
  } catch (error) {
    console.error("Failed to join/play radio station:", error);
    return message.reply("Något gick fel när boten skulle ansluta till voice.");
  }
}

module.exports = {
  execute,
};