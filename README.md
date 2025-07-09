# MindGo - Personal Finance Management Platform

<div align="center">
  <img src="frontend/public/MindGo.png" alt="MindGo Logo" width="200"/>
  <p><em>Your intelligent companion for personal finance management</em></p>
</div>

## 🚀 Overview

MindGo is a comprehensive personal finance management platform that combines traditional financial tracking with AI-powered insights and investment monitoring. Built with a modern tech stack, it provides users with tools to track expenses, set financial goals, monitor investments, and receive personalized financial advice.

## ✨ Features

### 📊 Financial Dashboard
- **Real-time Overview**: Track income, expenses, and net worth at a glance
- **Interactive Charts**: Visualize spending patterns with dynamic charts
- **Streak Tracking**: Daily check-ins to maintain financial discipline
- **Market Indices**: Live updates on major market indices (S&P 500, DJI, NASDAQ)

### 💰 Transaction Management
- **Expense Tracking**: Categorize and track all expenses
- **Income Recording**: Monitor all income sources
- **Smart Categories**: Automatic categorization with manual override
- **Data Retention**: Configurable automatic cleanup of old transactions

### 🎯 Financial Goals
- **Goal Setting**: Create and track financial goals
- **Progress Visualization**: Visual progress bars and completion tracking
- **Target Dates**: Set deadlines and track progress over time
- **Goal Statistics**: Comprehensive goal performance analytics

### 📈 Investment Tracking
- **Stock Watchlist**: Monitor favorite stocks in real-time
- **Market Data**: Live stock prices, charts, and financial metrics
- **News Integration**: Latest financial news for tracked stocks
- **AI Analysis**: AI-powered investment insights and recommendations

### 🤖 AI-Powered Features
- **Financial Planning**: AI-generated personalized financial plans
- **Budget Recommendations**: Smart budget suggestions based on spending patterns
- **Investment Advice**: AI-driven investment recommendations
- **Weekly Reports**: Automated email reports with insights

### 🔐 Security & Authentication
- **JWT Authentication**: Secure user authentication
- **Email Verification**: Account verification via email
- **Password Security**: Bcrypt password hashing
- **Session Management**: Secure session handling

## 🛠 Tech Stack

### Backend
- **Node.js** with Express.js
- **PostgreSQL** database
- **JWT** for authentication
- **OpenAI API** for AI features
- **Finnhub API** for stock data
- **Nodemailer** for email services
- **Cron jobs** for automated tasks

### Frontend
- **Next.js** with TypeScript
- **React** with hooks
- **Tailwind CSS** for styling
- **Radix UI** components
- **Recharts** for data visualization
- **React Hook Form** for form handling
- **Lucide React** for icons

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- PostgreSQL database

### Quick Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MindGo
   ```

2. **Run the setup script**
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Configure environment variables**

   **Backend (.env)**
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/mindgo
   JWT_SECRET=your-secret-key
   OPENAI_API_KEY=your-openai-api-key
   FINNHUB_API_KEY=your-finnhub-api-key
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-email-password
   CORS_ORIGIN=http://localhost:3000
   ```

   **Frontend (.env.local)**
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

4. **Setup the database**
   ```bash
   cd backend
   npm run db:setup
   npm run db:seed
   ```

5. **Start the servers**

   **Backend (Terminal 1)**
   ```bash
   cd backend
   npm run dev
   ```

   **Frontend (Terminal 2)**
   ```bash
   cd frontend
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Demo login: `john.doe@example.com` / `password123`

## 🗂 Project Structure

```
MindGo/
├── backend/                 # Express.js API server
│   ├── controllers/        # Route controllers
│   ├── db/                # Database setup and migrations
│   ├── middleware/        # Authentication middleware
│   ├── routes/            # API route definitions
│   ├── services/          # Business logic services
│   └── app.js            # Main server file
├── frontend/              # Next.js React application
│   ├── components/        # Reusable UI components
│   ├── contexts/          # React contexts
│   ├── pages/            # Next.js pages
│   ├── styles/           # Global styles
│   └── utils/            # Utility functions
└── setup.sh              # Automated setup script
```

## 🔌 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/verify-email` - Email verification

### Transactions
- `GET /transactions` - Get user transactions
- `POST /transactions` - Create new transaction
- `PUT /transactions/:id` - Update transaction
- `DELETE /transactions/:id` - Delete transaction

### Financial Summary
- `GET /summary/monthly` - Monthly financial summary
- `GET /summary/rolling` - Rolling period summary
- `GET /summary/trends` - Spending trends analysis

### Goals
- `GET /goals` - Get user goals
- `POST /goals` - Create new goal
- `PUT /goals/:id` - Update goal
- `PUT /goals/:id/progress` - Update goal progress

### Investments
- `GET /investments/watchlist` - Get stock watchlist
- `POST /investments/watchlist` - Add stock to watchlist
- `GET /investments/snapshot/:symbol` - Get stock snapshot
- `GET /investments/historical/:symbol` - Get historical data

### AI Features
- `POST /ai/plan` - Generate financial plan
- `POST /ai/budget-recommendations` - Get budget advice
- `POST /ai/investment-advice` - Get investment advice

## 🎨 Key Features in Detail

### Dashboard
The main dashboard provides a comprehensive overview of your financial health:
- **Financial Summary Cards**: Quick view of income, expenses, and net worth
- **Spending Charts**: Interactive charts showing spending patterns
- **Goal Progress**: Visual progress of financial goals
- **Market Overview**: Live updates on major market indices
- **Recent Transactions**: Latest transaction history
- **Daily Check-in**: Streak tracking for financial discipline

### AI Planning
Leverage artificial intelligence for personalized financial guidance:
- **Financial Plans**: AI-generated comprehensive financial strategies
- **Budget Recommendations**: Smart suggestions based on spending patterns
- **Investment Insights**: AI-powered investment analysis
- **Weekly Reports**: Automated email reports with AI insights

### Investment Tracking
Monitor your investments with real-time data:
- **Stock Watchlist**: Track favorite stocks with live prices
- **Market Data**: Real-time stock information and charts
- **Financial Metrics**: Key ratios and company information
- **News Integration**: Latest news for tracked stocks

## 🔧 Development

### Running in Development Mode
```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev
```

### Database Management
```bash
# Setup database
cd backend
npm run db:setup

# Seed with sample data
npm run db:seed
```

### Code Quality
```bash
# Frontend linting
cd frontend
npm run lint
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for AI-powered features
- **Finnhub** for financial market data
- **Radix UI** for accessible components
- **Tailwind CSS** for utility-first styling
- **Recharts** for beautiful data visualizations

## 📞 Support

For support, email support@mindgo.com or create an issue in the repository.

---

<div align="center">
  <p>Made with ❤️ for better financial management</p>
</div> 