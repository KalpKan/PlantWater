// Vercel serverless entry point: every /api/* request is rewritten here
// (vercel.json) and handled by the Express app in backend/src/app.js.
const { createApp } = require('../backend/src/app');

module.exports = createApp();
