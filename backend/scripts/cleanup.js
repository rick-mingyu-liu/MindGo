const fs = require('fs');
const path = require('path');

console.log('🧹 Starting backend cleanup...');

// Files to remove (if they exist)
const filesToRemove = [
  'run-migration.js',
  'seed-stock-data.js'
];

// Remove old files
filesToRemove.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`🗑️  Removed: ${file}`);
  }
});

// Create directories if they don't exist
const directories = [
  'scripts',
  'utils',
  'config',
  'middleware'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

console.log('✅ Backend cleanup completed!');
console.log('\n📋 Cleanup Summary:');
console.log('- Removed old migration and seed files');
console.log('- Created utility directories');
console.log('- Organized code structure');
console.log('\n🎯 Next steps:');
console.log('1. Update controllers to use new utilities');
console.log('2. Add rate limiting to routes');
console.log('3. Implement proper error handling');
console.log('4. Add input validation');
console.log('5. Generate API documentation: npm run docs:generate'); 