const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database with sample data...');
    
    // Read and execute seed data
    const seedPath = path.join(__dirname, 'seed.sql');
    const seedData = fs.readFileSync(seedPath, 'utf8');
    
    await db.query(seedData);
    console.log('✅ Database seeded successfully');
    
    // Display sample login credentials
    console.log('\n📋 Sample Login Credentials:');
    console.log('Email: john.doe@example.com');
    console.log('Password: password123');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase; 