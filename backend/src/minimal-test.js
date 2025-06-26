const express = require('express');

const app = express();
const port = process.env.PORT || 8080;

console.log('🚀 Starting Minimal Test Server...');
console.log('🔧 Port:', port);
console.log('🔧 Process ID:', process.pid);

// Basic health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: port,
    message: 'Minimal test server is running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Minimal test server is running!',
    timestamp: new Date().toISOString(),
    port: port
  });
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`✅ Server listening on 0.0.0.0:${port}`);
  console.log(`✅ Ready to accept connections`);
}).on('error', (error) => {
  console.error(`❌ Server failed to start:`, error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}); 