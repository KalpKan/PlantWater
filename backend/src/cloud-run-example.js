const express = require('express');

const app = express();
const port = process.env.PORT || 8080;

console.log('🚀 Starting Cloud Run Example...');
console.log('🔧 Port:', port);

// Basic health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: port,
    message: 'Cloud Run example is running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Cloud Run example is running!',
    timestamp: new Date().toISOString(),
    port: port
  });
});

// EXACT Cloud Run pattern from documentation
app.listen(port, () => {
  console.log('Hello world listening on port', port);
}); 