const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database schema...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    await db.query(schema);
    console.log('✅ Database schema created successfully');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase; 