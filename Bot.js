console.log(
  "aes-256-gcm:",
  require("node:crypto").getCiphers().includes("aes-256-gcm")
);

const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const { activePlayers } = require("./state/guildState");
const { stopPlayback } = require("./audio/voiceManager");

const searchRadio = require("./commands/searchRadio");
const playRadio = require("./commands/playRadio");
const playYoutube = require("./commands/playYoutube");
const stopCommand = require("./commands/stop");

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

function checkVoiceChannelActivity(guildId) {
  const current = activePlayers.get(guildId);
  if (!current) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channelId = current.connection.joinConfig.channelId;
  const channel = guild.channels.cache.get(channelId);

  if (!channel) return;

  if (channel.members.size === 1) {
    setTimeout(() => {
      const updated = guild.channels.cache.get(channelId);
      if (updated && updated.members.size === 1) {
        console.log(`Leaving ${guildId} due to inactivity.`);
        stopPlayback(guildId);
      }
    }, 2 * 60 * 1000);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const content = message.content.trim();

  try {
    if (content.startsWith("!search")) {
      return searchRadio.execute(message);
    }

    if (content.startsWith("!playradio")) {
      await playRadio.execute(message);
      checkVoiceChannelActivity(guildId);
      return;
    }

    if (content.startsWith("!playyoutube")) {
      await playYoutube.execute(message);
      checkVoiceChannelActivity(guildId);
      return;
    }

    if (content === "!stop") {
      return stopCommand.execute(message);
    }
  } catch (error) {
    console.error("Command error:", error);
    return message.reply("Något gick fel när kommandot kördes.");
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  const guildId = oldState.guild.id;
  const active = activePlayers.get(guildId);

  if (!active) return;

  const channelId = active.connection.joinConfig.channelId;
  const voiceChannel = oldState.guild.channels.cache.get(channelId);

  if (!voiceChannel) return;

  if (voiceChannel.members.size === 1) {
    console.log(`No users left in ${voiceChannel.name}, leaving...`);
    stopPlayback(guildId);
  }
});

client.login(TOKEN);