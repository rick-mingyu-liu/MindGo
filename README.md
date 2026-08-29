# MindGo - AI-Powered Personal Finance Companion


[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-blue.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue.svg)](https://www.postgresql.org/)

> **MindGo** is a comprehensive personal finance management application that combines traditional financial tracking with AI-powered insights to help users make smarter financial decisions and achieve their goals.

## 🎯 Our Mission

To democratize financial intelligence by providing everyone with AI-powered tools to make smarter financial decisions, track their progress, and achieve their goals.

## ✨ Key Features

### 💰 **Smart Financial Tracking**
- **Transaction Management**: Add, edit, and categorize income and expenses
- **Multi-Currency Support**: Track finances in CAD, USD, CNY, EUR, GBP, AUD
- **Real-time Analytics**: Visual charts and insights into spending patterns
- **Category Analysis**: Detailed breakdown of expenses by category

### 🎯 **Goal Setting & Tracking**
- **Savings Goals**: Set financial targets with progress tracking
- **Timeline Management**: Track goals with target dates and milestones
- **Progress Visualization**: Visual progress bars and completion percentages
- **Goal Recommendations**: AI-powered suggestions for goal optimization

### 📈 **Investment Watchlist**
- **Real-time Stock Data**: Live stock prices and performance metrics
- **Market Indices**: Track major indices (S&P 500, Dow Jones, NASDAQ)
- **Stock Analysis**: Detailed company information and financial reports
- **Portfolio Tracking**: Monitor your favorite stocks and their performance

### 🤖 **AI-Powered Financial Planning**
- **Personalized Advice**: Get customized financial recommendations
- **Goal Planning**: AI helps create realistic financial plans
- **Investment Suggestions**: Smart investment ideas based on your profile
- **Risk Assessment**: Understand potential risks and mitigation strategies

### 📊 **Advanced Analytics**
- **4-Month Rolling Analysis**: Track financial trends over time
- **Income vs Expenses**: Visual comparison of cash flow
- **Spending Patterns**: Identify areas for potential savings
- **Financial Health Score**: Overall assessment of your financial situation

### 🔔 **Smart Notifications**
- **Weekly Reports**: Automated email summaries of your financial activity
- **Goal Reminders**: Stay on track with timely notifications
- **Market Updates**: Get notified about significant market movements

### 🌍 **Internationalization**
- **Multi-language Support**: English and Mandarin (中文)
- **Localized Content**: Currency formatting and cultural adaptations
- **Responsive Design**: Works seamlessly across all devices

## 🏗️ Architecture

### Backend (Node.js/Express)
- **Framework**: Express.js with TypeScript support
- **Database**: PostgreSQL with comprehensive schema
- **Authentication**: JWT-based secure authentication
- **AI Integration**: OpenAI API for financial planning
- **External APIs**: Stock data, exchange rates, email services
- **Security**: Helmet, rate limiting, input validation

### Frontend (Next.js/React)
- **Framework**: Next.js 14 with React 18
- **Styling**: Tailwind CSS with custom components
- **Charts**: Recharts and React Financial Charts
- **State Management**: React hooks and context
- **Internationalization**: next-i18next for multi-language support
- **UI Components**: Radix UI primitives with custom styling

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 13+
- OpenAI API key (optional, for AI features)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd MindGo
```

### 2. Install Dependencies
```bash
(cd backend && npm install)
(cd frontend && npm install)
```

### 3. Configure Environment Variables

#### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/mindgo

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key

# OpenAI (optional)
OPENAI_API_KEY=your-openai-api-key

# Email Service (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_APP_NAME=MindGo
```

### 4. Setup Database
```bash
cd backend
npm run db:setup
npm run db:seed
```

### 5. Start the Application

#### Start Backend
```bash
cd backend
npm run dev
```

#### Start Frontend (in new terminal)
```bash
cd frontend
npm run dev
```

### 6. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Demo Account**: john.doe@example.com / password123

## 📁 Project Structure

```
MindGo/
├── backend/                           # Express.js API server
│   ├── app.js                        # Main application entry point
│   ├── package.json                  # Backend dependencies
│   ├── config/                       # Configuration files
│   │   └── index.js                 # Environment and app configuration
│   ├── controllers/                  # Route controllers
│   │   ├── aiController.js          # AI planning and analysis
│   │   ├── authController.js        # User authentication
│   │   ├── goalController.js        # Savings goals management
│   │   ├── investmentController.js  # Stock watchlist and market data
│   │   ├── summaryController.js     # Financial analytics and reports
│   │   └── transactionController.js # Transaction CRUD operations
│   ├── db/                          # Database setup and schema
│   │   ├── connection.js            # PostgreSQL connection
│   │   ├── schema.sql              # Database schema definition
│   │   ├── seed.js                 # Database seeding script
│   │   └── setup.js                # Database initialization
│   ├── middleware/                  # Authentication and validation
│   │   ├── auth.js                 # JWT authentication middleware
│   │   └── rateLimiter.js          # Rate limiting middleware
│   ├── routes/                      # API endpoints
│   │   ├── ai.js                   # AI planning routes
│   │   ├── auth.js                 # Authentication routes
│   │   ├── goals.js                # Goals management routes
│   │   ├── investments.js          # Investment routes
│   │   ├── summary.js              # Analytics routes
│   │   └── transactions.js         # Transaction routes
│   ├── services/                    # Business logic and external APIs
│   │   ├── aiPlanner.js            # OpenAI integration for financial advice
│   │   ├── emailService.js         # Email notifications and reports
│   │   ├── exchangeRateService.js  # Currency conversion API
│   │   ├── finnhubService.js       # Stock market data API
│   │   ├── freeStockDataService.js # Free stock data alternatives
│   │   └── schedulerService.js     # Automated tasks and cron jobs
│   ├── utils/                       # Helper functions
│   │   ├── errorHandler.js         # Error handling utilities
│   │   └── logger.js               # Logging utilities
├── frontend/                        # Next.js React application
│   ├── package.json                # Frontend dependencies
│   ├── next.config.js              # Next.js configuration
│   ├── tailwind.config.js          # Tailwind CSS configuration
│   ├── tsconfig.json               # TypeScript configuration
│   ├── components/                  # Reusable UI components
│   │   ├── ui/                     # Radix UI components
│   │   │   ├── button.tsx          # Button component
│   │   │   ├── card.tsx            # Card component
│   │   │   ├── dialog.tsx          # Dialog/modal component
│   │   │   ├── dropdown-menu.tsx   # Dropdown menu component
│   │   │   ├── input.tsx           # Input field component
│   │   │   ├── label.tsx           # Label component
│   │   │   ├── progress.tsx        # Progress bar component
│   │   │   ├── select.tsx          # Select dropdown component
│   │   │   ├── sheet.tsx           # Side sheet component
│   │   │   ├── switch.tsx          # Toggle switch component
│   │   │   ├── table.tsx           # Table component
│   │   │   ├── tabs.tsx            # Tab component
│   │   │   ├── textarea.tsx        # Textarea component
│   │   │   └── theme-toggle.tsx    # Theme toggle component
│   │   ├── StockDetailModal.tsx    # Stock detail modal
│   │   └── StockWatchlist.tsx      # Stock watchlist component
│   ├── contexts/                    # React context providers
│   │   └── ThemeContext.tsx        # Theme management context
│   ├── lib/                        # Utility libraries
│   │   └── utils.ts                # Utility functions
│   ├── pages/                      # Next.js pages
│   │   ├── _app.tsx                # App wrapper component
│   │   ├── index.tsx               # Dashboard page
│   │   ├── login.tsx               # Login page
│   │   ├── register.tsx            # Registration page
│   │   ├── goals.tsx               # Goals management page
│   │   ├── investments.tsx         # Investment watchlist page
│   │   ├── ai-planning.tsx         # AI financial planning page
│   │   ├── settings.tsx            # User settings page
│   │   ├── verify-email.tsx        # Email verification page
│   │   └── transactions/           # Transaction pages
│   │       ├── index.tsx           # Transaction list page
│   │       ├── new.tsx             # New transaction page
│   │       └── edit/               # Transaction editing
│   │           └── [id].tsx        # Edit transaction page
│   ├── public/                      # Static assets
│   │   ├── locales/                # Internationalization files
│   │   │   ├── en/                 # English translations
│   │   │   │   └── common.json     # English locale
│   │   │   └── zh/                 # Chinese translations
│   │   │       └── common.json     # Chinese locale
│   │   ├── logo_pure.jpg           # Light theme logo
│   │   ├── MindGo_dark.png         # Dark theme app logo
│   │   └── MindGo.png              # Light theme app logo
│   ├── styles/                      # Global styles
│   │   └── globals.css              # Global CSS styles
│   └── utils/                       # Helper functions
│       ├── api.ts                   # API client and utilities
│       └── formatters.ts            # Data formatting utilities
```

## 🔧 Development

### Backend Development
```bash
cd backend
npm run dev          # Start development server
npm run db:setup     # Setup database
npm run db:seed      # Seed sample data
```

### Frontend Development
```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
```

### Database Management
```bash
# Reset database
cd backend
npm run db:setup
npm run db:seed

# View database schema
cat db/schema.sql
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 🔌 External APIs & Services

### **Stock Market Data APIs**
- **[Finnhub](https://finnhub.io/)** - Real-time stock quotes, company profiles, and financial data
- **[Yahoo Finance](https://finance.yahoo.com/)** - Free historical stock data and market information
- **[Alpha Vantage](https://www.alphavantage.co/)** - Alternative stock data provider (fallback)

### **AI & Machine Learning**
- **[OpenAI GPT-4](https://openai.com/)** - AI-powered financial planning and advice generation
- **Custom AI Prompts** - Structured financial analysis and recommendations

### **Currency & Exchange Rates**
- **[Frankfurter](https://www.frankfurter.app/)** - Free currency exchange rate API
- **Multi-currency Support** - CAD, USD, CNY, EUR, GBP, AUD

### **Email Services**
- **[Nodemailer](https://nodemailer.com/)** - Email delivery for weekly reports and notifications
- **Gmail SMTP** - Email service provider integration

## 📚 API Documentation

The backend provides comprehensive API endpoints:

- **Authentication**: `/auth/*` - User registration, login, verification
- **Transactions**: `/transactions/*` - CRUD operations for financial transactions
- **Goals**: `/goals/*` - Savings goal management
- **Investments**: `/investments/*` - Stock watchlist and market data
- **AI Planning**: `/ai/*` - AI-powered financial advice
- **Summary**: `/summary/*` - Financial analytics and reports

## 🛠️ Open Source Libraries & Dependencies

### **Backend Dependencies**
- **[Express.js](https://expressjs.com/)** - Web application framework
- **[PostgreSQL](https://www.postgresql.org/)** - Relational database
- **[bcryptjs](https://github.com/dcodeIO/bcrypt.js/)** - Password hashing
- **[jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)** - JWT authentication
- **[axios](https://axios-http.com/)** - HTTP client for API calls
- **[express-validator](https://express-validator.github.io/)** - Input validation
- **[helmet](https://helmetjs.github.io/)** - Security middleware
- **[morgan](https://github.com/expressjs/morgan)** - HTTP request logger
- **[node-cron](https://github.com/node-cron/node-cron)** - Cron job scheduling
- **[nodemailer](https://nodemailer.com/)** - Email sending
- **[openai](https://github.com/openai/openai-node)** - OpenAI API client
- **[cors](https://github.com/expressjs/cors)** - Cross-origin resource sharing
- **[dotenv](https://github.com/motdotla/dotenv)** - Environment variable management
- **[express-rate-limit](https://github.com/nfriedly/express-rate-limit)** - Rate limiting

### **Frontend Dependencies**
- **[Next.js 14](https://nextjs.org/)** - React framework with SSR
- **[React 18](https://reactjs.org/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Radix UI](https://www.radix-ui.com/)** - Accessible UI primitives
- **[Recharts](https://recharts.org/)** - Chart library for data visualization
- **[React Hook Form](https://react-hook-form.com/)** - Form state management
- **[Lucide React](https://lucide.dev/)** - Icon library
- **[React Hot Toast](https://react-hot-toast.com/)** - Toast notifications
- **[SweetAlert2](https://sweetalert2.github.io/)** - Beautiful alerts
- **[React Markdown](https://github.com/remarkjs/react-markdown)** - Markdown rendering
- **[i18next](https://www.i18next.com/)** - Internationalization
- **[next-i18next](https://github.com/i18next/next-i18next)** - Next.js i18n integration
- **[class-variance-authority](https://cva.style/docs)** - Component variant management
- **[clsx](https://github.com/lukeed/clsx)** - Conditional className utility
- **[tailwind-merge](https://github.com/dcastil/tailwind-merge)** - Tailwind class merging

### **Development Dependencies**
- **[Nodemon](https://nodemon.io/)** - Development server with auto-restart
- **[ESLint](https://eslint.org/)** - Code linting
- **[TypeScript ESLint](https://typescript-eslint.io/)** - TypeScript linting rules
- **[PostCSS](https://postcss.org/)** - CSS processing
- **[Autoprefixer](https://autoprefixer.github.io/)** - CSS vendor prefixing

## 🗄️ Database Schema

### **Core Tables**
- **`users`** - User accounts with authentication and preferences
- **`transactions`** - Financial transactions (income/expenses) with categories
- **`savings_goals`** - User-defined financial goals and progress tracking
- **`watchlist`** - Stock symbols and companies for investment tracking
- **`ai_plans`** - Generated AI financial plans

### **Key Features**
- **Multi-currency Support** - All monetary values support multiple currencies
- **Category System** - Comprehensive transaction categorization
- **Progress Tracking** - Goal progress and completion percentages
- **Audit Trail** - Created/updated timestamps for all records
- **Foreign Key Relationships** - Proper referential integrity

## 🔗 API Endpoints Structure

### **Authentication Routes** (`/auth`)
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/verify-email` - Email verification
- `POST /auth/forgot-password` - Password reset

### **Transaction Routes** (`/transactions`)
- `GET /transactions` - List user transactions
- `POST /transactions` - Create new transaction
- `PUT /transactions/:id` - Update transaction
- `DELETE /transactions/:id` - Delete transaction

### **Goals Routes** (`/goals`)
- `GET /goals` - List user goals
- `POST /goals` - Create new goal
- `PUT /goals/:id` - Update goal
- `DELETE /goals/:id` - Delete goal

### **Investment Routes** (`/investments`)
- `GET /investments/watchlist` - Get user watchlist
- `POST /investments/watchlist` - Add stock to watchlist
- `DELETE /investments/watchlist/:symbol` - Remove from watchlist
- `GET /investments/stock/:symbol` - Get stock details
- `GET /investments/search` - Search stocks

### **AI Planning Routes** (`/ai`)
- `POST /ai/generate-plan` - Generate AI financial plan
- `POST /ai/analyze` - Analyze financial data

### **Summary Routes** (`/summary`)
- `GET /summary/rolling` - Get rolling financial summary
- `POST /summary/send-report` - Send weekly report

## 🌐 Deployment

### Backend Deployment
```bash
cd backend
npm run build
npm start
```

### Frontend Deployment
```bash
cd frontend
npm run build
npm start
```

### Environment Variables
Ensure all environment variables are properly configured for production:
- Database connection string
- JWT secret
- API keys for external services
- Email service credentials

## 🤝 Contributing

This is a private project. For collaboration opportunities, please contact the development team directly.

## 🙏 Acknowledgments

- **OpenAI** for AI-powered financial planning
- **Finnhub** for real-time stock market data
- **Exchange Rate API** for currency conversion
- **Next.js** and **React** for the frontend framework
- **Express.js** for the backend framework
- **PostgreSQL** for reliable data storage

## 📞 Support

For support, please open an issue in the GitHub repository or contact the development team.

---

**MindGo** - Empowering financial intelligence through AI-driven insights and smart tracking. 🚀 