const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const { opus } = require("@discordjs/voice");

try {
  require("@discordjs/opus");
  console.log("@discordjs/opus loaded successfully.");
} catch {
  console.warn("@discordjs/opus not found, falling back to opusscript.");
  try {
    require("opusscript");
    console.log("Using opusscript as a fallback.");
  } catch (error) {
    console.error(
      "Neither @discordjs/opus nor opusscript could be loaded. Audio features might not work properly."
    );
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

require("dotenv").config();
const TOKEN = process.env.TOKEN;

const radioStations = {
  gaming: "https://gaming.stream.laut.fm/gaming",
  rock: "http://stream.piraterock.se:8101/webradio",
  lofi: "https://lofi.stream.laut.fm/lofi",
  relax: "http://stream.soundstorm-radio.com/radio/8000/radio.mp3",
  chill:
    "https://strw3.openstream.co/1292?aw_0_1st.collectionid%3D4384%26stationId%3D4384%26publisherId%3D1316%26k%3D1734375662",
};

let player; // Audio player variable to control playback
// Map to store connections and players for each guild
const connections = new Map();
const idleTimers = new Map();

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return; // Ignore bot messages

  const voiceChannel = message.member.voice.channel;

  // Command to play a radio station
  if (message.content.startsWith("!play")) {
    const args = message.content.split(" ");
    const stationName = args[1];

    if (!voiceChannel) {
      message.reply("You need to be in a voice channel to use this command!");
      return;
    }

    if (!stationName || !radioStations[stationName]) {
      message.reply(
        `Please specify a valid station: ${Object.keys(radioStations).join(
          ", "
        )}`
      );
      return;
    }

    // Join the voice channel and create a player
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    const resource = createAudioResource(radioStations[stationName], {
      inlineVolume: true,
    });
    resource.volume.setVolume(0.1);

    player.play(resource);
    connection.subscribe(player);

    connections.set(message.guild.id, { connection, player, voiceChannel });

    message.reply(`Now playing ${stationName} station!`);
    startIdleTimer(message.guild.id); // Start the idle timer for this guild
  } else if (message.content === "!stop") {
    stopPlayback(message.guild.id, message);
  } else if (message.content === "!pause") {
    pausePlayback(message.guild.id, message);
  }
});
// Pause playback
function pausePlayback(guildId, message) {
  const guildConnection = connections.get(guildId);
  if (guildConnection?.player) {
    guildConnection.player.pause();
    message.reply("Playback paused.");
  } else {
    message.reply("Nothing is playing right now.");
  }
}

// Stop playback and disconnect
function stopPlayback(guildId, message) {
  const guildConnection = connections.get(guildId);
  if (guildConnection) {
    guildConnection.player.stop();
    guildConnection.connection.destroy();
    connections.delete(guildId);
    clearIdleTimer(guildId);
    message.reply("Playback stopped, and I left the voice channel.");
  } else {
    message.reply("Nothing is playing in this guild.");
  }
}

// Start or reset the idle timer for a guild
function startIdleTimer(guildId) {
  clearIdleTimer(guildId); // Clear existing timer if any

  const timer = setTimeout(() => {
    checkVoiceChannelActivity(guildId);
  }, 3 * 60 * 1000); // 3 minutes

  idleTimers.set(guildId, timer);
}

// Clear the idle timer for a guild
function clearIdleTimer(guildId) {
  if (idleTimers.has(guildId)) {
    clearTimeout(idleTimers.get(guildId));
    idleTimers.delete(guildId);
  }
}

// Check voice channel activity for a guild
function checkVoiceChannelActivity(guildId) {
  const guildConnection = connections.get(guildId);
  if (!guildConnection) return;

  const { voiceChannel, connection } = guildConnection;

  if (voiceChannel.members.size <= 1) {
    connection.destroy();
    connections.delete(guildId);
    clearIdleTimer(guildId);
    console.log(`Disconnected from ${guildId} due to inactivity.`);
  } else {
    startIdleTimer(guildId); // Restart the timer if members are present
  }
}
client.login(TOKEN);
