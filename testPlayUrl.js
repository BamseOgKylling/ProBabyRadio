const play = require("play-dl");

async function test() {
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  try {
    console.log("Fetching stream info for:", url);
    const streamInfo = await play.stream(url, {
      quality: 1,
      filter: "audioonly",
    });
    console.log("Stream info type:", streamInfo.type);
  } catch (err) {
    console.error("Error fetching stream:", err);
  }
}

test();
