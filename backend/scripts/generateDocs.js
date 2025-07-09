const fs = require('fs');
const path = require('path');
const apiDocs = require('../utils/apiDocs');

// Generate API documentation
const docs = apiDocs.generateDocs();

// Write to file
const docsPath = path.join(__dirname, '..', 'API_DOCUMENTATION.md');
fs.writeFileSync(docsPath, docs);

console.log('✅ API documentation generated successfully!');
console.log(`📄 Documentation saved to: ${docsPath}`);

// Also generate JSON version for programmatic access
const jsonPath = path.join(__dirname, '..', 'api-endpoints.json');
const endpoints = apiDocs.getEndpoints();
fs.writeFileSync(jsonPath, JSON.stringify(endpoints, null, 2));

console.log(`📄 JSON endpoints saved to: ${jsonPath}`);
console.log(`📊 Total endpoints documented: ${endpoints.length}`); 