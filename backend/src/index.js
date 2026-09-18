// Local development server. On Vercel the same app is served by api/index.js.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3001;
createApp().listen(port, () => {
  console.log(`Plant It API listening on http://localhost:${port} (health: /api/health)`);
});
