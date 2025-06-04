const { Client, GatewayIntentBits } = require("discord.js");
const { getRandomizedRadioServers } = require("./radioResolver");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
} = require("@discordjs/voice");
const axios = require("axios");

require("dotenv").config();
const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const connections = new Map();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Fetch stations from the Radio-Browser API
async function fetchRadioStations(query) {
  const apiServers = await getRandomizedRadioServers();

  if (!apiServers.length) {
    console.error("No Radio Browser servers available.");
    return null;
  }

  for (const server of apiServers) {
    try {
      const response = await axios.get(
        `${server}/json/stations/byname/${encodeURIComponent(query)}`,
        { timeout: 2000 } // timout 2 seconds incase if servers are down
      );

      if (response.data.length > 0) {
        return response.data.slice(0, 5).map((station) => ({
          name: station.name,
          url: station.url,
        }));
      }
    } catch (error) {
      console.error(`Error with ${server}:`, error.message);
    }
  }

  console.error("All API servers failed.");
  return null;
}

// Handle commands
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const voiceChannel = message.member.voice.channel;

  if (message.content.startsWith("!search")) {
    const args = message.content.split(" ").slice(1);
    if (!args.length) {
      return message.reply(
        "Please provide a search term (e.g., `!search rock`)."
      );
    }

    const searchTerm = args.join(" ");
    const stations = await fetchRadioStations(searchTerm);

    if (!stations) {
      return message.reply("No stations found for your search.");
    }

    let response = "Here are some matching stations:\n";
    stations.forEach((s, i) => {
      response += `**${i + 1}.** ${s.name}\n`;
    });
    response += "\nType `!play [number]` to play a station.";

    message.reply(response);
    connections.set(message.guild.id, { stations });
  }

  if (message.content.startsWith("!play")) {
    if (!voiceChannel) {
      return message.reply(
        "You need to be in a voice channel to use this command!"
      );
    }

    const args = message.content.split(" ")[1];
    const guildData = connections.get(message.guild.id);
    if (!guildData || !guildData.stations || !args) {
      return message.reply(
        "Please search for a station first using `!search`."
      );
    }

    const stationIndex = parseInt(args, 10) - 1;
    if (
      isNaN(stationIndex) ||
      stationIndex < 0 ||
      stationIndex >= guildData.stations.length
    ) {
      return message.reply(
        "Invalid selection. Use a number from the search results."
      );
    }

    const station = guildData.stations[stationIndex];

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

    connections.set(message.guild.id, { connection, player });
    message.reply(`Now playing: **${station.name}** 🎵`);

    checkVoiceChannelActivity(message.guild.id);
  }

  if (message.content === "!stop") {
    const guildConnection = connections.get(message.guild.id);
    if (guildConnection) {
      guildConnection.player.stop();
      guildConnection.connection.destroy();
      connections.delete(message.guild.id);
      message.reply("Stopped playing and left the voice channel.");
    } else {
      message.reply("Nothing is currently playing.");
    }
  }
});

// Handle voice state updates (detect when users leave)
client.on("voiceStateUpdate", (oldState, newState) => {
  const guildId = oldState.guild.id;
  const guildConnection = connections.get(guildId);

  if (!guildConnection) return; // Bot is not in a channel for this guild

  const { connection } = guildConnection;
  const channel = connection.joinConfig.channelId;
  const voiceChannel = oldState.guild.channels.cache.get(channel);

  if (!voiceChannel) return;

  // Check if the bot is the only one left
  if (voiceChannel.members.size === 1) {
    console.log(`No users left in ${voiceChannel.name}, leaving...`);
    stopPlayback(guildId);
  }
});

client.login(TOKEN);

function stopPlayback(guildId) {
  const guildConnection = connections.get(guildId);
  if (guildConnection) {
    guildConnection.player.stop();
    guildConnection.connection.destroy();
    connections.delete(guildId);
    console.log(`Disconnected from ${guildId} due to inactivity.`);
  }
}

function checkVoiceChannelActivity(guildId) {
  const guildConnection = connections.get(guildId);
  if (!guildConnection) return;

  const { connection } = guildConnection;
  const voiceChannel = connection.joinConfig.channelId;
  const guild = client.guilds.cache.get(guildId);
  const channel = guild.channels.cache.get(voiceChannel);

  if (!channel) return;

  // Check if the bot is the only one in the channel
  if (channel.members.size === 1) {
    setTimeout(() => {
      if (channel.members.size === 1) {
        // Check again after timeout
        connection.destroy();
        connections.delete(guildId);
        console.log(`Disconnected from ${guildId} due to inactivity.`);
      }
    }, 2 * 60 * 1000); // Wait 2 minutes before leaving
  }
}
