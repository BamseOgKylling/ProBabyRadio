const dns = require("dns").promises;

/**
 * Resolve all.api.radio-browser.info -> IPs -> Hostnames
 * @returns {Promise<string[]>} List of resolved hostnames (or IPs if reverse fails)
 */
async function getRandomizedRadioServers() {
  try {
    const domain = "all.api.radio-browser.info";
    const addresses = await dns.resolve4(domain); // Only IPv4 for compatibility

    const hostnames = await Promise.all(
      addresses.map(async (ip) => {
        try {
          const [hostname] = await dns.reverse(ip);
          return `https://${hostname}`;
        } catch (err) {
          console.warn(`Reverse DNS failed for ${ip}, using IP`);
          return `https://${ip}`;
        }
      })
    );

    // Shuffle the hostnames
    for (let i = hostnames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hostnames[i], hostnames[j]] = [hostnames[j], hostnames[i]];
    }

    return hostnames;
  } catch (err) {
    console.error("Failed to resolve Radio Browser servers:", err);
    return [];
  }
}
module.exports = { getRandomizedRadioServers };
