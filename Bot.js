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
const ytdl = require("ytdl-core");

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
  relax: "https://transliacija.relaxfm.lt/relaxfm128.mp3",
};

let player; // Audio player variable to control playback
let connection; // Voice connection variable
let idleTimer; // Timer to track idle time

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

    if (voiceChannel) {
      // Join the voice channel
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      player = createAudioPlayer();

      if (stationName && radioStations[stationName]) {
        // Play the selected radio station
        const resource = createAudioResource(radioStations[stationName], {
          inlineVolume: true, // Enables volume control
        });

        resource.volume.setVolume(0.1); // Set the volume to 10%
        player.play(resource);
        connection.subscribe(player);

        message.reply(`Now playing the ${stationName} station!`);
        startIdleTimer(message); // Start the idle timer when a station is playing
      } else if (!stationName) {
        message.reply(
          `Please specify a station like "!Play gaming". Available stations: ${Object.keys(
            radioStations
          ).join(", ")}`
        );
      } else {
        message.reply(
          `Invalid station name. Available stations: ${Object.keys(
            radioStations
          ).join(", ")}`
        );
      }
    } else {
      message.reply("You need to be in a voice channel to use this command!");
    }
  }

  // Pause playback
  else if (message.content === "!pause") {
    if (player) {
      player.pause();
      message.reply("Playback paused.");
    } else {
      message.reply("Nothing is playing right now.");
    }
  }

  // Stop playback
  else if (message.content === "!stop") {
    if (player && connection) {
      player.stop();
      connection.destroy(); // Leave the voice channel
      connection = null;
      player = null;
      message.reply("Playback stopped, and I left the voice channel.");
    } else {
      message.reply("Nothing is playing right now.");
    }
  }
});

// Function to start or reset the idle timer
function startIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer); // Clear any existing timer

  // Set a new timer to check channel activity after 3 minutes
  idleTimer = setTimeout(() => {
    checkVoiceChannelActivity();
  }, 3 * 60 * 1000); // 3 minutes
}

// Function to check if the bot should disconnect due to inactivity
async function checkVoiceChannelActivity() {
  if (connection) {
    const channel = connection.joinConfig.channelId;
    const voiceChannel = client.channels.cache.get(channel);

    if (voiceChannel && voiceChannel.members.size <= 1) {
      // Disconnect if the bot is alone in the channel
      connection.destroy();
      connection = null;
      player = null;
      console.log("Disconnected due to inactivity.");
    } else {
      // Restart the timer if there are still members in the channel
      startIdleTimer();
    }
  }
}
client.login(TOKEN);
