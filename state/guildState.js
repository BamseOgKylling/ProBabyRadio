const searchResults = new Map(); // guildId -> [{ name, url }]
const activePlayers = new Map(); // guildId -> { connection, player }

module.exports = {
  searchResults,
  activePlayers,
};