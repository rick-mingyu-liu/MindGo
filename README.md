# 💰 MindGo - Personal Finance Management Platform

A comprehensive full-stack personal finance management application with AI-powered planning, investment tracking, real-time stock data, and advanced financial analytics.

## 🚀 Features


- ON PROGRESS
- email notification for weekly personal financial report
- guidence for first users
- after 4 month keep data in blockchain but remove from db
- autotracking from cards or by giving the bank statments (maybe)

### Core Financial Management
- **Dashboard Analytics**: 4-month rolling income/expense visualization with spending trends
- **Transaction Management**: Track income and expenses with smart categorization and data retention policies
- **Savings Goals**: Set, monitor, and track progress on financial goals with AI-powered recommendations
- **Investment Tracking**: Real-time stock data, watchlist management, and market analysis
- **AI Financial Planning**: OpenAI-powered personalized financial advice and budget recommendations

### Advanced Features
- **Real-time Stock Data**: Live market data, historical charts, and financial analysis
- **Investment Watchlist**: Track favorite stocks with AI-powered summaries
- **Market Overview**: Comprehensive market insights and news
- **Data Retention**: Configurable transaction retention policies
- **Responsive Design**: Modern UI with dark/light theme support

## 🏗️ Tech Stack

### Frontend
- **Framework**: Next.js 14 (TypeScript)
- **Styling**: Tailwind CSS with shadcn/ui components
- **Charts**: Recharts + React Financial Charts
- **HTTP Client**: Axios
- **State Management**: React Hooks + Context API
- **Form Handling**: React Hook Form with validation
- **UI Components**: Radix UI primitives

### Backend
- **Runtime**: Node.js + Express.js
- **Database**: PostgreSQL (Neon-compatible)
- **Database Client**: pg (direct SQL queries)
- **Authentication**: JWT with bcrypt password hashing
- **AI Integration**: OpenAI API (GPT-4)
- **Stock Data APIs**: Finnhub API + Alpha Vantage API + Yahoo Finance
- **Security**: Helmet, CORS, input validation
- **Logging**: Morgan HTTP request logger

### Infrastructure
- **Blockchain**: Ethereum smart contracts (in development)
- **Deployment**: Ready for cloud deployment
- **Environment**: Docker-ready configuration

## 📁 Project Structure

```
MindGo/
├── frontend/                 # Next.js frontend application
│   ├── pages/               # Next.js pages and routing
│   ├── components/          # React components and UI
│   │   ├── ui/             # shadcn/ui components
│   │   ├── StockDetailModal.tsx
│   │   └── StockWatchlist.tsx
│   ├── contexts/           # React context providers
│   ├── utils/              # Utility functions and API client
│   ├── lib/                # Library configurations
│   ├── styles/             # Global styles and Tailwind config
│   └── public/             # Static assets
├── backend/                 # Express.js backend API
│   ├── routes/             # API route handlers
│   ├── controllers/        # Request controllers
│   ├── services/           # Business logic services
│   │   ├── aiPlanner.js    # AI financial planning
│   │   ├── finnhubService.js # Stock data service
│   │   └── freeStockDataService.js
│   ├── middleware/         # Express middleware
│   ├── db/                 # Database configuration and migrations
│   └── app.js             # Express app setup
├── blockchain/             # Ethereum smart contracts (in development)
│   ├── contracts/         # Solidity smart contracts
│   └── scripts/           # Deployment and interaction scripts
├── setup.sh               # Automated setup script
└── README.md
```

## 🛠️ Quick Setup

### Option 1: Automated Setup (Recommended)
```bash
# Clone the repository
git clone <repository-url>
cd MindGo

# Run the automated setup script
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

#### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Neon recommended)
- OpenAI API key (optional, for AI features)

#### 1. Install Dependencies
```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

#### 2. Environment Configuration

**Backend (.env)**
```bash
cd backend
# Create .env file with the following variables:
DATABASE_URL=postgresql://username:password@host:port/database
JWT_SECRET=your-super-secret-jwt-key
OPENAI_API_KEY=your-openai-api-key
FINNHUB_API_KEY=your-finnhub-api-key
FINNHUB_TOKEN=your-finnhub-token
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-api-key
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

**Frontend (.env.local)**
```bash
cd frontend
# Create .env.local file:
NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### 3. Database Setup
```bash
cd backend
npm run db:setup
npm run db:seed
```

#### 4. Start Development Servers
```bash
# Backend (Terminal 1)
cd backend
npm run dev

# Frontend (Terminal 2)
cd frontend
npm run dev
```

Access the application:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

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
- `GET /transactions/categories` - Get transaction categories
- `DELETE /transactions/clear-all` - Clear all transactions
- `DELETE /transactions/auto-delete` - Auto-delete old transactions
- `GET /transactions/retention-settings` - Get data retention settings
- `PUT /transactions/retention-settings` - Update retention settings

### Analytics & Summary
- `GET /summary/monthly` - Monthly financial summary
- `GET /summary/rolling` - 4-month rolling summary
- `GET /summary/trends` - Spending trends analysis

### Goals
- `GET /goals` - Get user savings goals
- `POST /goals` - Create new goal
- `PUT /goals/:id` - Update goal
- `DELETE /goals/:id` - Delete goal
- `GET /goals/stats` - Get goal statistics
- `DELETE /goals/clear-all` - Clear all goals
- `PUT /goals/:id/progress` - Update goal progress

### Investments
- `GET /investments/snapshot/:symbol` - Get stock snapshot
- `GET /investments/watchlist` - Get user watchlist
- `POST /investments/watchlist` - Add to watchlist
- `DELETE /investments/watchlist/:id` - Remove from watchlist
- `DELETE /investments/watchlist/clear-all` - Clear watchlist
- `GET /investments/historical/:symbol` - Get historical data
- `GET /investments/market-overview` - Get market overview
- `GET /investments/news/:symbol` - Get stock news
- `GET /investments/financials/:symbol` - Get financial data
- `GET /investments/watchlist/ai-summary` - Get AI watchlist summary
- `GET /investments/search` - Search stocks

### AI Planning
- `POST /ai/plan` - Generate AI financial plan
- `GET /ai/plans` - Get plan history
- `GET /ai/plans/:id` - Get specific plan
- `POST /ai/budget-recommendations` - Generate budget recommendations
- `POST /ai/investment-advice` - Generate investment advice

## 🔧 Development Scripts

### Backend
```bash
npm run dev          # Start development server with nodemon
npm run db:setup     # Setup database schema
npm run db:seed      # Seed sample data
npm start           # Start production server
```

### Frontend
```bash
npm run dev         # Start development server
npm run build       # Build for production
npm start          # Start production server
npm run lint       # Run ESLint
```

## 🔐 Authentication & Security

### JWT Implementation
The app uses JSON Web Tokens (JWT) for secure authentication:

- **Token Generation**: JWT tokens are created upon successful login/registration
- **Token Verification**: Middleware validates tokens on protected routes
- **Token Format**: `Bearer <token>` in Authorization header
- **Security**: Tokens are signed with a secret key and include user information
- **Expiration**: Configurable token expiration for enhanced security

### Protected Routes
All sensitive endpoints require valid JWT tokens:
```javascript
// Example of protected route usage
const auth = require('./middleware/auth');
app.use('/transactions', auth, transactionRoutes);
```

## 🤖 OpenAI AI Integration

The app leverages OpenAI's GPT-4 for comprehensive intelligent financial planning and analysis:

### Core AI Features

#### 🎯 Personalized Financial Planning
- **Goal-Based Planning**: AI generates customized financial plans based on user goals and current financial situation
- **Context-Aware Analysis**: Incorporates user's transaction history, spending patterns, and financial goals
- **Structured Recommendations**: Provides numbered, actionable recommendations with timelines
- **Risk Assessment**: Identifies potential challenges and risk factors for financial goals

#### 💰 Budget Optimization
- **Spending Pattern Analysis**: Analyzes historical spending by category
- **Budget Recommendations**: Suggests optimal budget allocations based on income and goals
- **Expense Reduction Strategies**: Identifies areas for potential savings
- **Monthly Savings Projections**: Calculates expected savings from recommended changes

#### 📈 Investment Guidance
- **Portfolio Analysis**: Reviews current investment positions and watchlist
- **Asset Allocation Advice**: Recommends optimal investment mix based on risk tolerance
- **Market Insights**: Provides context-aware investment recommendations
- **Risk Management**: Suggests strategies to mitigate investment risks

#### 🎯 Goal Achievement
- **Progress Tracking**: Analyzes current progress toward financial goals
- **Timeline Optimization**: Suggests realistic timelines for goal achievement
- **Milestone Planning**: Breaks down large goals into manageable milestones
- **Motivation Strategies**: Provides encouragement and progress insights

### AI Implementation Details

#### GPT-4 Model Configuration
```javascript
// Uses OpenAI's GPT-4 model with optimized parameters
const completion = await this.openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ],
  max_tokens: 1500,
  temperature: 0.7, // Balanced creativity and consistency
});
```

#### Financial Context Building
The AI service automatically builds comprehensive financial context including:
- **Monthly Income & Expenses**: Current financial situation
- **Historical Data**: 6-month spending patterns and trends
- **Goal Progress**: Current savings goals and completion status
- **Spending Categories**: Detailed breakdown of expenses
- **Investment Portfolio**: Current holdings and watchlist

#### Response Parsing & Structure
AI responses are automatically parsed to extract:
- **Analysis**: Comprehensive financial situation assessment
- **Recommendations**: Numbered, actionable advice (3-5 items)
- **Action Plan**: Concrete implementation steps
- **Timeline**: Realistic achievement timeframe
- **Risk Factors**: Potential challenges and mitigation strategies

### AI-Powered Endpoints

#### Financial Planning
- `POST /ai/plan` - Generate comprehensive financial plan
- `GET /ai/plans` - Retrieve plan history
- `GET /ai/plans/:id` - Get specific plan details

#### Specialized Advice
- `POST /ai/budget-recommendations` - Budget optimization suggestions
- `POST /ai/investment-advice` - Investment strategy recommendations
- `POST /ai/debt-payoff-strategy` - Debt management planning

### AI Data Integration

#### Real-time Financial Data
- **Transaction History**: Analyzes spending patterns and trends
- **Goal Progress**: Tracks savings and investment progress
- **Market Data**: Incorporates current market conditions
- **User Preferences**: Learns from user interactions and feedback

#### Privacy & Security
- **Data Anonymization**: Personal data is processed securely
- **No Data Storage**: OpenAI doesn't store user financial data
- **Local Processing**: Sensitive data remains on your servers
- **Consent-Based**: Users control what data is shared with AI

### AI Response Examples

#### Financial Plan Response
```
🎯 Financial Analysis
Based on your current situation, you're saving $800/month with a goal of $50,000 in 3 years.

📋 Recommendations
1. Increase monthly savings to $1,200 by reducing dining out expenses
2. Set up automatic transfers to high-yield savings account
3. Consider a side hustle to boost income by $400/month
4. Review and optimize subscription services

⏰ Action Plan
- Week 1: Audit current subscriptions and cancel unused services
- Week 2: Set up automatic savings transfers
- Week 3: Research side hustle opportunities
- Month 2: Implement new budget and track progress

⚠️ Risk Factors
- Economic downturn affecting job security
- Unexpected medical expenses
- Market volatility affecting investment returns
```

## 📈 Investment Features

### Multi-Source Stock Data Integration

#### Finnhub API (Primary Data Source)
- **Real-time Quotes**: Live stock prices and market data
- **Company News**: Latest news and press releases
- **Financial Reports**: Quarterly and annual financial statements
- **Technical Indicators**: SMA, EMA, RSI, MACD calculations
- **Recommendation Trends**: Analyst recommendations and ratings
- **Earnings Data**: EPS surprises and earnings calendar
- **Company Profiles**: Detailed company information

#### Alpha Vantage API (Fallback & Historical Data)
- **Historical Price Data**: Daily, weekly, and monthly price history
- **Technical Indicators**: Advanced technical analysis
- **Fundamental Data**: Company fundamentals and ratios
- **Forex & Crypto**: Additional market data support
- **Rate Limiting**: Built-in rate limit handling with fallback

#### Yahoo Finance (Free Alternative)
- **No API Key Required**: Completely free historical data
- **High Reliability**: Robust data source with good uptime
- **Adjusted Prices**: Dividend and split-adjusted prices
- **Volume Data**: Trading volume information
- **Fallback Strategy**: Used when other APIs are rate-limited

### Data Source Strategy
The app implements a smart fallback system:
1. **Primary**: Finnhub API for real-time and comprehensive data
2. **Secondary**: Alpha Vantage API for historical data
3. **Fallback**: Yahoo Finance for free, reliable data
4. **Caching**: 5-minute cache to reduce API calls and improve performance

### Watchlist Management
- Add/remove stocks from personal watchlist
- AI-powered watchlist performance summaries
- Real-time price alerts and notifications
- Portfolio tracking and analysis
- Multi-source data aggregation for comprehensive insights

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt password encryption
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Cross-origin resource sharing security
- **Helmet Security**: HTTP security headers
- **Environment Variables**: Secure configuration management

## 🚀 Deployment

### Environment Variables
Ensure all required environment variables are set in production:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secure JWT signing key (32+ characters recommended)
- `OPENAI_API_KEY`: OpenAI API key (for AI features)
- `FINNHUB_API_KEY`: Finnhub API key (for real-time stock data)
- `FINNHUB_TOKEN`: Finnhub token (for additional features)
- `ALPHA_VANTAGE_API_KEY`: Alpha Vantage API key (free tier available)
- `NODE_ENV`: Set to 'production'
- `CORS_ORIGIN`: Frontend URL

### Database Migration
```bash
cd backend
npm run db:setup
```

### Build and Deploy
```bash
# Frontend
cd frontend
npm run build
npm start

# Backend
cd backend
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🔑 API Keys Setup

### Required API Keys

#### Finnhub API
1. Visit [finnhub.io](https://finnhub.io/)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Add to `.env`: `FINNHUB_API_KEY=your-key-here`

#### Alpha Vantage API
1. Visit [alphavantage.co](https://alphavantage.co/)
2. Sign up for a free API key
3. Add to `.env`: `ALPHA_VANTAGE_API_KEY=your-key-here`
4. Free tier includes 500 requests/day

#### OpenAI API
1. Visit [platform.openai.com](https://platform.openai.com/)
2. Create an account and add billing
3. Generate an API key
4. Add to `.env`: `OPENAI_API_KEY=your-key-here`

### API Rate Limits
- **Finnhub**: 60 calls/minute (free tier)
- **Alpha Vantage**: 500 calls/day (free tier)
- **OpenAI**: Varies by plan
- **Yahoo Finance**: No API key required, but rate limited

## 🆘 Support

For support and questions:
- Check the API documentation at `/health` endpoint
- Review the console logs for detailed endpoint information
- Ensure all environment variables are properly configured
- Check API rate limits if experiencing data issues

---

**Demo Credentials**: `john.doe@example.com` / `password123` 