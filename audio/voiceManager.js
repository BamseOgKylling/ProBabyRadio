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

const { activePlayers } = require("../state/guildState");

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

async function joinChannel(message, voiceChannel) {
  const guildId = message.guild.id;

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

  connection.on("stateChange", (oldState, newState) => {
    console.log(`VOICE: ${oldState.status} -> ${newState.status}`);
  });

  connection.on("debug", console.log);
  connection.on("error", console.error);

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  return connection;
}

function createPlayer(guildId, message, label) {
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

    if (message) {
      await message.channel.send(`⚠️ Kunde inte spela ${label || "ljudet"}.`);
    }
  });

  return player;
}

function applyVolume(resource, volume = 0.2) {
  if (resource.volume) {
    resource.volume.setVolume(volume);
  }
}

function playUrl(guildId, connection, url, message, label = "audio") {
  const player = createPlayer(guildId, message, label);

  const resource = createAudioResource(url, {
    inlineVolume: true,
  });

  applyVolume(resource);

  connection.subscribe(player);
  player.play(resource);

  activePlayers.set(guildId, { connection, player });

  player.once(AudioPlayerStatus.Playing, () => {
    console.log(`[PLAYER ${guildId}] Started playing ${label}`);
  });

  return player;
}

function playResource(guildId, connection, resource, message, label = "audio") {
  const player = createPlayer(guildId, message, label);

  applyVolume(resource);

  connection.subscribe(player);
  player.play(resource);

  activePlayers.set(guildId, { connection, player });

  player.once(AudioPlayerStatus.Playing, () => {
    console.log(`[PLAYER ${guildId}] Started playing ${label}`);
  });

  return player;
}

module.exports = {
  stopPlayback,
  joinChannel,
  playUrl,
  playResource,
};