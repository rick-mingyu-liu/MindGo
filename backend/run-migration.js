const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import the database connection
const { pool } = require('./db/connection');

async function runMigration() {
  try {
    console.log('🔄 Running database migration...');
    
    // Read the schema file
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await pool.query(statement);
        } catch (error) {
          // Ignore errors for IF NOT EXISTS statements
          if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
            console.log(`⚠️  Statement ${i + 1} skipped (already exists): ${error.message.split('\n')[0]}`);
          } else {
            console.error(`❌ Error in statement ${i + 1}:`, error.message);
            throw error;
          }
        }
      }
    }
    
    console.log('✅ Database migration completed successfully!');
    
    // Test the new tables
    console.log('🔍 Testing new tables...');
    
    const testQueries = [
      'SELECT COUNT(*) FROM stock_data',
      'SELECT COUNT(*) FROM financial_reports', 
      'SELECT COUNT(*) FROM stock_news',
      'SELECT COUNT(*) FROM analyst_ratings',
      'SELECT COUNT(*) FROM stock_price_history'
    ];
    
    for (const query of testQueries) {
      try {
        const result = await pool.query(query);
        const tableName = query.split('FROM ')[1];
        console.log(`✅ ${tableName}: ${result.rows[0].count} rows`);
      } catch (error) {
        console.log(`❌ ${query.split('FROM ')[1]}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration(); 