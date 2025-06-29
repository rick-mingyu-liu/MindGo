# 💰 Personal Finance Web App

A full-stack personal finance management application with AI-powered planning, investment tracking, and comprehensive financial analytics.

## 🚀 Features

- **Dashboard Analytics**: 4-month rolling income/expense visualization
- **Transaction Management**: Track income and expenses with categorization
- **Savings Goals**: Set and monitor financial goals
- **Investment Tracking**: Real-time stock data via Moomoo integration
- **AI Financial Planning**: OpenAI-powered personalized financial advice
- **User Authentication**: Secure user management system

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (TypeScript)
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **HTTP Client**: Axios
- **State Management**: React Hooks

### Backend
- **Runtime**: Node.js + Express
- **Database**: PostgreSQL (Neon-compatible)
- **Database Client**: pg (direct SQL)
- **Authentication**: JWT
- **AI Integration**: OpenAI API

## 📁 Project Structure

```
pf/
├── frontend/                 # Next.js frontend application
│   ├── pages/               # Next.js pages
│   ├── components/          # React components
│   ├── utils/              # Utility functions
│   ├── styles/             # Global styles
│   └── package.json
├── backend/                 # Express.js backend API
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic services
│   ├── controllers/        # Request controllers
│   ├── db/                 # Database configuration
│   ├── app.js             # Express app setup
│   └── package.json
└── README.md
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Neon recommended)
- OpenAI API key

### 1. Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Environment Configuration

#### Backend (.env)
```bash
cd backend
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# JWT
JWT_SECRET=your-super-secret-jwt-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Server
PORT=3001
NODE_ENV=development
```

#### Frontend (.env.local)
```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Database Setup

```bash
cd backend
npm run db:setup
npm run db:seed
```

### 4. Start Development Servers

#### Backend
```bash
cd backend
npm run dev
```

#### Frontend
```bash
cd frontend
npm run dev
```

Access the application at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## 📊 API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/profile` - Get user profile

### Transactions
- `GET /transactions` - Get user transactions
- `POST /transactions` - Create new transaction
- `PUT /transactions/:id` - Update transaction
- `DELETE /transactions/:id` - Delete transaction

### Analytics
- `GET /summary/monthly` - Monthly financial summary
- `GET /summary/rolling` - 4-month rolling summary

### Goals
- `GET /goals` - Get user savings goals
- `POST /goals` - Create new goal
- `PUT /goals/:id` - Update goal
- `DELETE /goals/:id` - Delete goal

### Investments
- `GET /investments/snapshot/:symbol` - Get stock snapshot
- `GET /investments/watchlist` - Get user watchlist
- `POST /investments/watchlist` - Add to watchlist

### AI Planning
- `POST /ai/plan` - Generate AI financial plan

## 🔧 Development Scripts

### Backend
- `npm run dev` - Start development server with nodemon
- `npm run db:setup` - Setup database schema
- `npm run db:seed` - Seed sample data
- `npm start` - Start production server

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server

## 🤖 AI Integration

The app includes OpenAI integration for personalized financial planning. Users can ask questions about their finances and receive AI-generated advice and planning recommendations.

## 📈 Moomoo Integration

The backend includes a placeholder service for Moomoo integration via TCP connection to OpenD. This allows for real-time stock data retrieval and portfolio tracking.

## 🔒 Security

- JWT-based authentication
- Password hashing with bcrypt
- Environment variable configuration
- CORS protection
- Input validation and sanitization

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes. 