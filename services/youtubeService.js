const ytdl = require("@distube/ytdl-core");
const yts = require("yt-search");

function isYoutubeUrl(url) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{11})/
  );
  return match ? match[1] : null;
}

function cleanSearchQuery(query) {
  return query
    .replace(/\(.*?lyrics.*?\)/gi, "")
    .replace(/\[.*?lyrics.*?\]/gi, "")
    .replace(/\(official video\)/gi, "")
    .replace(/\[official video\]/gi, "")
    .trim();
}

function isPlayableFormatsError(error) {
  const msg = error?.message?.toLowerCase() || "";
  return msg.includes("failed to find any playable formats");
}

async function findLyricsFallback(query, excludeUrl = null) {
  const excludeVideoId = excludeUrl ? extractVideoId(excludeUrl) : null;

  const cleanedQuery = cleanSearchQuery(query);
  const searches = [
    `${cleanedQuery} lyrics`,
    `${cleanedQuery} official audio`,
    `${cleanedQuery} audio`,
    `${cleanedQuery} lyric video`,
    cleanedQuery,
  ];

  for (const searchQuery of searches) {
    try {
      const result = await yts(searchQuery);
      const videos = result?.videos || [];

      const best = videos.find((video) => {
        const title = (video.title || "").toLowerCase();
        const videoId = extractVideoId(video.url);

        if (excludeVideoId && videoId === excludeVideoId) {
          return false;
        }

        return (
          !title.includes("live") &&
          !title.includes("hour version") &&
          !title.includes("sped up") &&
          !title.includes("slowed") &&
          !title.includes("reaction") &&
          !title.includes("cover")
        );
      });

      if (best) {
        return {
          title: best.title,
          url: best.url,
        };
      }
    } catch (error) {
      console.warn(`yt-search failed for "${searchQuery}":`, error.message);
    }
  }

  return null;
}

async function getPlayableYoutubeUrl(url) {
  if (!isYoutubeUrl(url)) {
    throw new Error("Not a YouTube URL.");
  }

  if (!ytdl.validateURL(url)) {
    throw new Error("Invalid YouTube URL.");
  }

  let finalUrl = url;
  let usedFallback = false;
  let title = "Unknown title";

  try {
    const info = await ytdl.getBasicInfo(url);
    const details = info.videoDetails;

    title = details.title || title;

    if (details.age_restricted || details.isPrivate || details.isUnlisted) {
      const fallback = await findLyricsFallback(title, url);
      if (!fallback) {
        throw new Error("No fallback found.");
      }

      finalUrl = fallback.url;
      title = fallback.title;
      usedFallback = true;
    }

    return {
      originalUrl: url,
      finalUrl,
      title,
      usedFallback,
    };
  } catch (error) {
    let query = url;

    try {
      const videoId = extractVideoId(url);
      if (videoId) {
        const result = await yts({ videoId });
        if (result?.title) {
          query = result.title;
        }
      }
    } catch (searchError) {
      console.warn("Failed to get title from videoId:", searchError.message);
    }

    const fallback = await findLyricsFallback(query, url);
    if (!fallback) {
      throw new Error("Could not find a playable fallback version.");
    }

    return {
      originalUrl: url,
      finalUrl: fallback.url,
      title: fallback.title,
      usedFallback: true,
    };
  }
}

function createYoutubeStream(url) {
  return ytdl(url, {
    filter: "audioonly",
    quality: "highestaudio",
    highWaterMark: 1 << 25,
    requestOptions: {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
      },
    },
  });
}

module.exports = {
  isYoutubeUrl,
  getPlayableYoutubeUrl,
  createYoutubeStream,
  isPlayableFormatsError,
  findLyricsFallback,
  extractVideoId,
};