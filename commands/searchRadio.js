const { fetchRadioStations } = require("../services/radioService");
const { searchResults } = require("../state/guildState");

async function execute(message) {
  const guildId = message.guild.id;
  const args = message.content.split(" ").slice(1);

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
  response += `\nSkriv \`!playradio [nummer]\` för att spela en station.`;

  return message.reply(response);
}

module.exports = {
  execute,
};