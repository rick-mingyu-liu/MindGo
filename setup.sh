#!/bin/bash

echo "🚀 Setting up Personal Finance App..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating backend .env file..."
    cp env.example .env
    echo "⚠️  Please edit backend/.env with your database credentials and API keys"
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install

# Create .env.local file if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating frontend .env.local file..."
    cp env.example .env.local
fi

cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit backend/.env with your database credentials:"
echo "   - DATABASE_URL (PostgreSQL connection string)"
echo "   - JWT_SECRET (any random string)"
echo "   - OPENAI_API_KEY (optional, for AI features)"
echo ""
echo "2. Start the backend server:"
echo "   cd backend && npm run dev"
echo ""
echo "3. In another terminal, setup the database:"
echo "   cd backend && npm run db:setup && npm run db:seed"
echo ""
echo "4. Start the frontend server:"
echo "   cd frontend && npm run dev"
echo ""
echo "5. Access the app at http://localhost:3000"
echo "   Demo login: john.doe@example.com / password123" 