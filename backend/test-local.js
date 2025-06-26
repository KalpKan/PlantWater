const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

async function testEndpoints() {
  console.log('🧪 Testing backend endpoints...\n');

  const endpoints = [
    { path: '/', name: 'Root endpoint' },
    { path: '/api/startup-health', name: 'Startup health check' },
    { path: '/api/health', name: 'Health check' },
    { path: '/api/test', name: 'Basic test' },
    { path: '/api/basic-test', name: 'Express test' }
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint.name} (${endpoint.path})...`);
      const response = await axios.get(`${BASE_URL}${endpoint.path}`, {
        timeout: 5000
      });
      console.log(`✅ ${endpoint.name}: ${response.status} - ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.log(`❌ ${endpoint.name}: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    console.log('');
  }

  // Test CORS preflight
  try {
    console.log('Testing CORS preflight...');
    const response = await axios.options(`${BASE_URL}/api/health`, {
      headers: {
        'Origin': 'https://plantit.site',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization'
      },
      timeout: 5000
    });
    console.log(`✅ CORS preflight: ${response.status}`);
    console.log(`   Headers: ${JSON.stringify(response.headers)}`);
  } catch (error) {
    console.log(`❌ CORS preflight: ${error.message}`);
  }
}

// Run tests
testEndpoints().catch(console.error); 