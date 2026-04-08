const { StreamType, createAudioResource } = require("@discordjs/voice");
const { joinChannel, stopPlayback } = require("../audio/voiceManager");
const {
  getPlayableYoutubeUrl,
  createYoutubeStream,
  findLyricsFallback,
  isPlayableFormatsError,
} = require("../services/youtubeService");
const { activePlayers } = require("../state/guildState");

async function execute(message) {
  const voiceChannel = message.member?.voice?.channel;
  const guildId = message.guild.id;

  if (!voiceChannel) {
    return message.reply("Du måste vara i en voice channel först.");
  }

  const url = message.content.split(" ")[1];
  if (!url) {
    return message.reply("Skriv t.ex. `!playyoutube <youtube-url>`.");
  }

  try {
    stopPlayback(guildId);

    const playable = await getPlayableYoutubeUrl(url);
    const connection = await joinChannel(message, voiceChannel);

    await tryPlayYoutube(message, connection, playable, false);
  } catch (error) {
    console.error("playYoutube error:", error);
    return message.reply(
      "Kunde inte spela YouTube-länken. Testa gärna en annan länk."
    );
  }
}

async function tryPlayYoutube(message, connection, playable, alreadyRetried) {
  const guildId = message.guild.id;
  const {
    createAudioPlayer,
    NoSubscriberBehavior,
    AudioPlayerStatus,
  } = require("@discordjs/voice");

  console.log("Trying YouTube URL:", playable.finalUrl);
  console.log("Title:", playable.title);
  console.log("Used fallback:", playable.usedFallback);
  console.log("Already retried:", alreadyRetried);

  const stream = createYoutubeStream(playable.finalUrl);

  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });

  if (resource.volume) {
    resource.volume.setVolume(0.2);
  }

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play,
    },
  });

  let handledError = false;
  let announcedPlaying = false;

  player.on("stateChange", (oldState, newState) => {
    console.log(
      `[YOUTUBE PLAYER ${guildId}] ${oldState.status} -> ${newState.status}`
    );
  });

  player.once(AudioPlayerStatus.Playing, async () => {
    announcedPlaying = true;

    if (playable.usedFallback) {
      await message.channel.send(
        `🔁 Originalvideon gick inte att spela. Använder fallback: **${playable.title}**`
      );
    }

    await message.channel.send(`▶️ Now playing: **${playable.title}**`);
  });

  player.on("error", async (error) => {
    if (handledError) return;
    handledError = true;

    console.error(`[YOUTUBE PLAYER ERROR ${guildId}]`, error);

    if (!alreadyRetried && isPlayableFormatsError(error)) {
      try {
        console.log("Trying fallback search with title:", playable.title);

        await message.channel.send(
          "⚠️ Originalvideon gick inte att spela. Söker efter lyrics/audio-version..."
        );

     const fallback = await findLyricsFallback(
  playable.title || playable.originalUrl,
  playable.finalUrl
);

        console.log("Fallback found:", fallback);

        if (!fallback) {
          await message.channel.send(
            "Kunde inte hitta någon spelbar fallback-version."
          );
          return;
        }

        try {
          player.stop(true);
        } catch {}

        activePlayers.delete(guildId);

        return await tryPlayYoutube(
          message,
          connection,
          {
            originalUrl: playable.originalUrl,
            finalUrl: fallback.url,
            title: fallback.title,
            usedFallback: true,
          },
          true
        );
      } catch (retryError) {
        console.error("Fallback retry failed:", retryError);
        await message.channel.send(
          "Kunde inte spela originalvideon eller fallback-versionen."
        );
        return;
      }
    }

    if (!announcedPlaying) {
      await message.channel.send("⚠️ Kunde inte spela YouTube-ljudet.");
    }
  });

  connection.subscribe(player);
  player.play(resource);

  activePlayers.set(guildId, { connection, player });
}

module.exports = {
  execute,
};