const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} = require("@discordjs/voice");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content === "!testvoice") {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply("Gå in i en voice channel först.");
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      connection.on("stateChange", (oldState, newState) => {
        console.log(`VOICE: ${oldState.status} -> ${newState.status}`);
      });

      connection.on("debug", console.log);
      connection.on("error", console.error);

      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

      const player = createAudioPlayer();

      player.on("stateChange", (oldState, newState) => {
        console.log(`PLAYER: ${oldState.status} -> ${newState.status}`);
      });

      player.on("error", console.error);

      const resource = createAudioResource("./test.mp3");
      connection.subscribe(player);
      player.play(resource);

      player.once(AudioPlayerStatus.Playing, () => {
        message.reply("Spelar test.mp3 nu.");
      });
    } catch (err) {
      console.error("TESTVOICE ERROR:", err);
      message.reply("Voice test misslyckades.");
    }
  }
});

client.login(process.env.TOKEN);