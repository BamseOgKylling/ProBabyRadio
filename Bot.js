const { Client, GatewayIntentBits } = require("discord.js");
const { getRandomizedRadioServers } = require("./radioResolver");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  entersState,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");
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

const SpotifyWebApi = require("spotify-web-api-node");

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

async function getSpotifyTrackUrls(spotifyUrl) {
  try {
    const tokenData = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(tokenData.body["access_token"]);

    if (spotifyUrl.includes("track")) {
      const trackId = spotifyUrl.split("/track/")[1].split("?")[0];
      const track = await spotifyApi.getTrack(trackId);
      return [`${track.body.name} ${track.body.artists[0].name}`];
    }

    if (spotifyUrl.includes("playlist")) {
      const playlistId = spotifyUrl.split("/playlist/")[1].split("?")[0];
      const data = await spotifyApi.getPlaylistTracks(playlistId);
      return data.body.items.map((item) => {
        const track = item.track;
        return `${track.name} ${track.artists[0].name}`;
      });
    }

    return [];
  } catch (err) {
    console.error("Spotify error:", err.message);
    return [];
  }
}
const queues = new Map();
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

  ///
  if (message.content.startsWith("!playurl")) {
    if (!voiceChannel) {
      return message.reply("Join a voice channel first!");
    }

    const url = message.content.split(" ")[1];
    if (!url) return message.reply("Please provide a URL.");

    // STOP current playback and clear old connections/queue
    const existing = connections.get(message.guild.id);
    if (existing && existing.connection && !existing.connection.destroyed) {
      try {
        existing.player.stop();
        existing.connection.destroy();
      } catch (err) {
        console.warn("Failed to stop or destroy old connection:", err);
      }
      connections.delete(message.guild.id);
    }

    if (queues.has(message.guild.id)) {
      queues.delete(message.guild.id);
    }

    // YouTube playback using ytdl-core from your working code
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      if (!ytdl.validateURL(url)) {
        return message.reply("Invalid YouTube URL.");
      }

      try {
        // Join the voice channel
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        // Wait until the connection is ready
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

        // Create audio player
        const player = createAudioPlayer();

        // Stream audio from YouTube (audio only)
        const stream = ytdl(url, {
          filter: "audioonly",
          quality: "highestaudio",
          highWaterMark: 1 << 25,
          requestOptions: {
            headers: {
              // This helps avoid being blocked by YouTube
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/92.0.4515.159 Safari/537.36",
              Referer: "https://www.youtube.com/",
            },
          },
        });

        const resource = createAudioResource(stream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
        });

        resource.volume.setVolume(0.1);

        // Subscribe the connection to the player
        connection.subscribe(player);

        // Play the audio resource
        player.play(resource);

        // Save connection for cleanup, etc.
        connections.set(message.guild.id, { connection, player });

        message.reply(`▶️ Now playing audio from: ${url}`);

        // Handle player events
        player.on("idle", () => {
          const connData = connections.get(message.guild.id);
          if (
            connData &&
            connData.connection &&
            !connData.connection.destroyed
          ) {
            connData.connection.destroy();
          }
          connections.delete(message.guild.id);

          const currentQueue = queues.get(message.guild.id);
          if (currentQueue && currentQueue.length > 0) {
            playQueue(currentQueue, voiceChannel, message);
          } else {
            queues.delete(message.guild.id);
          }
        });
      } catch (error) {
        console.error("🚨 Error while trying to play audio:", error);
        message.reply("⚠️ Failed to play the audio.");
      }
    } else if (url.includes("spotify.com")) {
      const searchQueries = await getSpotifyTrackUrls(url);
      if (searchQueries.length === 0) {
        return message.reply("Could not retrieve tracks from Spotify.");
      }

      message.reply(
        `🔁 Loaded ${searchQueries.length} tracks from Spotify playlist.`
      );

      const ytSearch = require("yt-search");

      const [firstQuery, ...restQueries] = searchQueries;

      // Search for and play the first track
      const firstResult = await ytSearch(firstQuery);
      const firstVideo = firstResult.videos.length
        ? firstResult.videos[0]
        : null;

      if (!firstVideo) {
        return message.reply("Couldn't find the first track on YouTube.");
      }

      message.reply(
        `▶️ Now playing first track from Spotify: **${firstVideo.title}**`
      );

      playQueue([firstVideo.url], voiceChannel, message); // Start with just the first song

      // Start resolving the rest in the background
      (async () => {
        const restUrls = [];

        for (const query of restQueries) {
          try {
            const result = await ytSearch(query);
            const video = result.videos.length ? result.videos[0] : null;
            if (video) {
              restUrls.push(video.url);
            }
          } catch (e) {
            console.warn("Error searching YouTube for:", query, e);
          }
        }

        if (!queues.has(message.guild.id)) {
          queues.set(message.guild.id, []);
        }

        const currentQueue = queues.get(message.guild.id);
        currentQueue.push(...restUrls);
      })();
      //
    } else if (url.startsWith("http://") || url.startsWith("https://")) {
      // Direct radio stream
      if (!voiceChannel) {
        return message.reply("Join a voice channel first!");
      }

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      try {
        const resource = createAudioResource(url, { inlineVolume: true });
        resource.volume.setVolume(0.1);

        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);

        connections.set(message.guild.id, { connection, player });

        message.reply(`Now playing radio stream: ${url}`);

        player.on("error", (error) => {
          console.error("Audio player error:", error);
          message.channel.send("An error occurred while playing the audio.");
        });

        player.on("idle", () => {
          connection.destroy();
          connections.delete(message.guild.id);
        });
      } catch (error) {
        console.error("Error playing radio stream:", error);
        message.reply("Failed to play the provided radio stream URL.");
      }
    } else {
      return message.reply(
        "Only YouTube, Spotify and direct radio stream URLs are supported."
      );
    }
  }

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

  if (message.content === "!skip") {
    const guildId = message.guild.id;
    const connectionData = connections.get(guildId);

    if (!connectionData) {
      return message.reply("There is no song playing right now.");
    }

    const { player, connection } = connectionData;

    if (!player) {
      return message.reply("No audio is currently playing.");
    }

    message.reply("⏭ Skipping current track...");
    player.stop(); // This triggers the 'idle' event, which plays the next track if any.
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
// Modify playQueue function to store the queue:
async function playQueue(queue, voiceChannel, message) {
  if (!queue.length) return;

  // Store the queue for this guild
  queues.set(message.guild.id, queue);

  const url = queue.shift();

  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const stream = ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25,
    });

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    resource.volume.setVolume(0.1);

    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);

    connections.set(message.guild.id, { connection, player });

    message.channel.send(`▶️ Now playing: ${url}`);

    player.on("idle", () => {
      connection.destroy();
      connections.delete(message.guild.id);
      const currentQueue = queues.get(message.guild.id);
      if (currentQueue && currentQueue.length > 0) {
        playQueue(currentQueue, voiceChannel, message);
      } else {
        queues.delete(message.guild.id);
      }
    });

    player.on("error", (error) => {
      console.error("Audio player error:", error);
      message.channel.send("⚠️ Error while playing a track. Skipping...");
      connection.destroy();
      connections.delete(message.guild.id);
      const currentQueue = queues.get(message.guild.id);
      if (currentQueue && currentQueue.length > 0) {
        playQueue(currentQueue, voiceChannel, message);
      } else {
        queues.delete(message.guild.id);
      }
    });
  } catch (error) {
    console.error("Queue error:", error);
    message.reply("Something went wrong while trying to play the playlist.");
  }
}
