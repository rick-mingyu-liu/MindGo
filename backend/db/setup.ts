import fs from 'node:fs';
import path from 'node:path';
import { query } from './connection';
import { packageRoot } from '../utils/packageRoot';

async function setupDatabase(): Promise<void> {
  try {
    console.log('🔧 Setting up database schema...');

    // Read and execute schema
    const schemaPath = path.join(packageRoot(__dirname), 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    await query(schema);
    console.log('✅ Database schema created successfully');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupDatabase();
}

export = setupDatabase;
