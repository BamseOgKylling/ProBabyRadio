console.log(
  "aes-256-gcm:",
  require("node:crypto").getCiphers().includes("aes-256-gcm")
);

const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
require("dotenv").config();

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
} = require("@discordjs/voice");

const { getRandomizedRadioServers } = require("./radioResolver");

const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Separera sökresultat från aktiva voice-connections
const searchResults = new Map(); // guildId -> [{ name, url }]
const activePlayers = new Map(); // guildId -> { connection, player }

// =========================
// READY
// =========================
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// =========================
// RADIO SEARCH
// =========================
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
        { timeout: 4000 }
      );

      if (Array.isArray(response.data) && response.data.length > 0) {
        return response.data.slice(0, 5).map((station) => ({
          name: station.name || "Unknown station",
          url: station.url_resolved || station.url,
        }));
      }
    } catch (error) {
      console.error(`Error with ${server}: ${error.message}`);
    }
  }

  console.error("All API servers failed.");
  return null;
}

// =========================
// STOP / CLEANUP
// =========================
function stopPlayback(guildId) {
  const existing = activePlayers.get(guildId);
  if (!existing) return;

  try {
    existing.player?.stop(true);
  } catch (err) {
    console.warn("Failed to stop player:", err.message);
  }

  try {
    existing.connection?.destroy();
  } catch (err) {
    console.warn("Failed to destroy connection:", err.message);
  }

  activePlayers.delete(guildId);
  console.log(`Disconnected from guild ${guildId}`);
}

function setupPlayerDebug(player, connection, guildId) {
  player.on("stateChange", (oldState, newState) => {
    console.log(
      `[Guild ${guildId}] Player: ${oldState.status} -> ${newState.status}`
    );
  });

  connection.on("stateChange", (oldState, newState) => {
    console.log(
      `[Guild ${guildId}] Connection: ${oldState.status} -> ${newState.status}`
    );
  });

  player.on("error", (error) => {
    console.error(`[Guild ${guildId}] Player error:`, error);
  });

  connection.on("error", (error) => {
    console.error(`[Guild ${guildId}] Connection error:`, error);
  });
}

// =========================
// PLAY RADIO STATION
// =========================
async function playRadioStation(message, voiceChannel, station) {
  const guildId = message.guild.id;

  try {
    const existingConnection = getVoiceConnection(guildId);
    if (existingConnection) {
      try {
        existingConnection.destroy();
      } catch (e) {
        console.warn("Failed to destroy existing connection:", e.message);
      }
    }

  const connection = joinVoiceChannel({
  channelId: voiceChannel.id,
  guildId: message.guild.id,
  adapterCreator: message.guild.voiceAdapterCreator,
  selfDeaf: true,
});

    connection.on("debug", (msg) => {
      console.log(`[VOICE DEBUG ${guildId}] ${msg}`);
    });

  connection.on("stateChange", (oldState, newState) => {
  console.log(`VOICE: ${oldState.status} -> ${newState.status}`);
});

connection.on("debug", console.log);
connection.on("error", console.error);

await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    player.on("stateChange", (oldState, newState) => {
      console.log(
        `[PLAYER STATE ${guildId}] ${oldState.status} -> ${newState.status}`
      );
    });

    player.on("error", async (error) => {
      console.error(`[PLAYER ERROR ${guildId}]`, error);
      await message.channel.send(
        `⚠️ Kunde inte spela stationen **${station.name}**`
      );
    });

    const resource = createAudioResource(station.url, {
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(0.2);
    }

    connection.subscribe(player);
    player.play(resource);

    activePlayers.set(guildId, { connection, player });

    player.once(AudioPlayerStatus.Playing, () => {
      message.channel.send(`▶️ Now playing: **${station.name}**`);
    });
  } catch (error) {
    console.error("Failed to join/play radio station:", error);
    return message.reply("Något gick fel när boten skulle ansluta till voice.");
  }
}

// =========================
// AUTO LEAVE IF EMPTY
// =========================
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

// =========================
// MESSAGE HANDLER
// =========================
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const voiceChannel = message.member?.voice?.channel;
  const guildId = message.guild.id;
  const content = message.content.trim();

  // !search
  if (content.startsWith("!search")) {
    const args = content.split(" ").slice(1);

    if (!args.length) {
      return message.reply("Skriv något att söka på, t.ex. `!search rock`.");
    }

    const searchTerm = args.join(" ");
    const stations = await fetchRadioStations(searchTerm);

    if (!stations || stations.length === 0) {
      return message.reply("Hittade inga stationer.");
    }

    searchResults.set(guildId, stations);

    let response = `Här är några träffar för **${searchTerm}**:\n\n`;
    stations.forEach((station, index) => {
      response += `**${index + 1}.** ${station.name}\n`;
    });
    response += `\nSkriv \`!play [nummer]\` för att spela en station.`;

    return message.reply(response);
  }

  // !play
  if (content.startsWith("!play")) {
    if (!voiceChannel) {
      return message.reply("Du måste vara i en voice channel först.");
    }

    const arg = content.split(" ")[1];
    if (!arg) {
      return message.reply("Skriv t.ex. `!play 1`.");
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

    await playRadioStation(message, voiceChannel, station);
    checkVoiceChannelActivity(guildId);
    return;
  }

  // !stop
  if (content === "!stop") {
    if (!activePlayers.has(guildId)) {
      return message.reply("Inget spelas just nu.");
    }

    stopPlayback(guildId);
    return message.reply("Stoppade uppspelningen och lämnade voice channel.");
  }
});

// =========================
// LEAVE WHEN USERS LEAVE
// =========================
client.on("voiceStateUpdate", (oldState, newState) => {
  const guildId = oldState.guild.id;
  const active = activePlayers.get(guildId);

  if (!active) return;

  const channelId = active.connection.joinConfig.channelId;
  const voiceChannel = oldState.guild.channels.cache.get(channelId);

  if (!voiceChannel) return;

  // bara botten kvar
  if (voiceChannel.members.size === 1) {
    console.log(`No users left in ${voiceChannel.name}, leaving...`);
    stopPlayback(guildId);
  }
});

client.login(TOKEN);