const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
} = require("@discordjs/voice");
const axios = require("axios");

// Fetch stations from the Radio-Browser API
async function fetchRadioStations(query) {
  try {
    const response = await axios.get(
      `https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(
        query
      )}`
    );

    if (response.data.length === 0) return null;
    return response.data.slice(0, 5).map((station) => ({
      name: station.name,
      url: station.url,
    }));
  } catch (error) {
    console.error("Error fetching radio stations:", error);
    return null;
  }
}

// Play the selected radio station in a voice channel
async function playStation(message, station, voiceChannel) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();
  const resource = createAudioResource(station.url, { inlineVolume: true });
  resource.volume.setVolume(0.1);

  player.play(resource);
  connection.subscribe(player);

  return { connection, player };
}

module.exports = { fetchRadioStations, playStation };
