async function getRandomizedRadioServers() {
  return [
    "https://de1.api.radio-browser.info",
    "https://nl1.api.radio-browser.info",
    "https://fr1.api.radio-browser.info",
    "https://all.api.radio-browser.info",
  ].sort(() => Math.random() - 0.5);
}

module.exports = {
  getRandomizedRadioServers,
};