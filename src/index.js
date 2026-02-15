// Basic Discord bot skeleton

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once("ready", () => {
  console.log("Bot ready!");
});

client.on("messageCreate", (message) => {
  if (message.content === "!ping") {
    message.reply("pong!");
  }
  // Parse BTC signals here, e.g. "BUY BTC @ $60k"
});

client.login(process.env.DISCORD_TOKEN);
