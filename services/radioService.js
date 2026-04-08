const resolver = require("../radioResolver");
console.log("RADIO RESOLVER:", resolver);

const axios = require("axios");
const { getRandomizedRadioServers } = require("../radioResolver");

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

module.exports = {
  fetchRadioStations,
};