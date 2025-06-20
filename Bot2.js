const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");
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

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!play") || message.author.bot) return;

  const args = message.content.split(" ");
  const url = args[1];

  if (!url || !ytdl.validateURL(url)) {
    return message.reply("❌ Please provide a valid YouTube URL.");
  }

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    return message.reply("🔇 You need to be in a voice channel first!");
  }

  try {
    // Join the voice channel
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Wait until ready
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    // Create audio player
    const player = createAudioPlayer();

    // Stream audio from YouTube with ytdl-core (audio only)
    const stream = ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25, // optional to help with buffering
    });

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
    });

    // Subscribe connection to player
    connection.subscribe(player);

    // Play the audio resource
    player.play(resource);

    message.reply(`▶️ Now playing audio from: ${url}`);

    // Optional: handle player events
    player.on("error", (error) => {
      console.error("Error:", error);
      message.channel.send("⚠️ Error while playing audio.");
    });

    player.on("idle", () => {
      connection.destroy(); // leave voice channel when done
    });
  } catch (error) {
    console.error("🚨 Error while trying to play audio:", error);
    message.reply("⚠️ Failed to play the audio.");
  }
});

client.login(TOKEN);
