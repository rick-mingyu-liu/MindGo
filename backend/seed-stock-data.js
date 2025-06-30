const db = require('./db/connection');

const sampleStocks = [
  {
    symbol: 'AAPL',
    company_name: 'Apple Inc.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    employees: 164000,
    website: 'https://www.apple.com',
    description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. The company offers iPhone, Mac, iPad, and wearables, home, and accessories.',
    market_cap: 2500000000000,
    pe_ratio: 28.5,
    dividend_yield: 0.65,
    beta: 1.2,
    volume: 45000000,
    avg_volume: 52000000,
    day_range: '$175.50 - $178.20',
    year_range: '$124.17 - $198.23',
    current_price: 175.43,
    change_amount: 2.15,
    change_percent: 1.24
  },
  {
    symbol: 'MSFT',
    company_name: 'Microsoft Corporation',
    sector: 'Technology',
    industry: 'Software & IT Services',
    employees: 221000,
    website: 'https://www.microsoft.com',
    description: 'Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.',
    market_cap: 2800000000000,
    pe_ratio: 35.2,
    dividend_yield: 0.85,
    beta: 1.1,
    volume: 22000000,
    avg_volume: 25000000,
    day_range: '$378.00 - $380.50',
    year_range: '$280.00 - $400.00',
    current_price: 378.85,
    change_amount: -1.23,
    change_percent: -0.32
  },
  {
    symbol: 'GOOGL',
    company_name: 'Alphabet Inc.',
    sector: 'Technology',
    industry: 'Internet Content & Information',
    employees: 156500,
    website: 'https://www.google.com',
    description: 'Alphabet Inc. provides online advertising services in the United States, Europe, the Middle East, Africa, the Asia-Pacific, Canada, and Latin America.',
    market_cap: 1800000000000,
    pe_ratio: 25.8,
    dividend_yield: 0.0,
    beta: 1.1,
    volume: 18000000,
    avg_volume: 20000000,
    day_range: '$142.00 - $143.50',
    year_range: '$120.00 - $150.00',
    current_price: 142.56,
    change_amount: 0.89,
    change_percent: 0.63
  },
  {
    symbol: 'AMZN',
    company_name: 'Amazon.com Inc.',
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail',
    employees: 1608000,
    website: 'https://www.amazon.com',
    description: 'Amazon.com Inc. engages in the retail sale of consumer products and subscriptions in North America and internationally.',
    market_cap: 1600000000000,
    pe_ratio: 45.2,
    dividend_yield: 0.0,
    beta: 1.3,
    volume: 35000000,
    avg_volume: 40000000,
    day_range: '$154.50 - $156.00',
    year_range: '$130.00 - $170.00',
    current_price: 155.20,
    change_amount: -0.45,
    change_percent: -0.29
  },
  {
    symbol: 'TSLA',
    company_name: 'Tesla Inc.',
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers',
    employees: 127855,
    website: 'https://www.tesla.com',
    description: 'Tesla Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems.',
    market_cap: 790000000000,
    pe_ratio: 65.8,
    dividend_yield: 0.0,
    beta: 2.1,
    volume: 65000000,
    avg_volume: 70000000,
    day_range: '$247.00 - $250.00',
    year_range: '$200.00 - $300.00',
    current_price: 248.50,
    change_amount: 5.20,
    change_percent: 2.14
  }
];

const sampleFinancialReports = [
  {
    symbol: 'AAPL',
    report_type: 'quarterly',
    period: 'Q4 2023',
    title: 'Apple Q4 2023 Earnings Report',
    description: 'Fourth quarter earnings report for fiscal year 2023',
    file_url: 'https://investor.apple.com/earnings/',
    release_date: '2024-01-15'
  },
  {
    symbol: 'AAPL',
    report_type: 'annual',
    period: '2023',
    title: 'Apple Annual Report 2023',
    description: 'Annual report for fiscal year 2023',
    file_url: 'https://investor.apple.com/annual-reports/',
    release_date: '2023-12-31'
  },
  {
    symbol: 'MSFT',
    report_type: 'quarterly',
    period: 'Q4 2023',
    title: 'Microsoft Q4 2023 Earnings Report',
    description: 'Fourth quarter earnings report for fiscal year 2023',
    file_url: 'https://www.microsoft.com/en-us/investor/earnings/',
    release_date: '2024-01-20'
  }
];

const sampleNews = [
  {
    symbol: 'AAPL',
    title: 'Apple Reports Record Q4 Earnings',
    summary: 'Apple Inc. announced record-breaking fourth quarter earnings, driven by strong iPhone sales and services revenue growth.',
    url: 'https://www.bloomberg.com/news/articles/apple-q4-earnings',
    source: 'Bloomberg',
    published_at: '2024-01-15T10:30:00Z',
    sentiment: 'positive'
  },
  {
    symbol: 'AAPL',
    title: 'New iPhone Model Expected in September',
    summary: 'Analysts predict Apple will launch its next iPhone model in September with significant camera improvements.',
    url: 'https://www.reuters.com/technology/apple-iphone-2024',
    source: 'Reuters',
    published_at: '2024-01-14T15:45:00Z',
    sentiment: 'positive'
  },
  {
    symbol: 'MSFT',
    title: 'Microsoft Cloud Revenue Surges',
    summary: 'Microsoft reported strong cloud computing revenue growth, exceeding analyst expectations.',
    url: 'https://www.cnbc.com/microsoft-cloud-earnings',
    source: 'CNBC',
    published_at: '2024-01-20T09:15:00Z',
    sentiment: 'positive'
  }
];

const sampleAnalystRatings = [
  {
    symbol: 'AAPL',
    analyst_firm: 'Goldman Sachs',
    rating: 'buy',
    price_target: 195.50,
    rating_date: '2024-01-10'
  },
  {
    symbol: 'AAPL',
    analyst_firm: 'Morgan Stanley',
    rating: 'buy',
    price_target: 190.00,
    rating_date: '2024-01-08'
  },
  {
    symbol: 'AAPL',
    analyst_firm: 'JPMorgan',
    rating: 'hold',
    price_target: 175.00,
    rating_date: '2024-01-05'
  },
  {
    symbol: 'MSFT',
    analyst_firm: 'Bank of America',
    rating: 'buy',
    price_target: 420.00,
    rating_date: '2024-01-12'
  },
  {
    symbol: 'MSFT',
    analyst_firm: 'Citigroup',
    rating: 'buy',
    price_target: 410.00,
    rating_date: '2024-01-09'
  }
];

async function seedStockData() {
  try {
    console.log('🌱 Seeding stock data...');

    // Insert stock data
    for (const stock of sampleStocks) {
      const query = `
        INSERT INTO stock_data (
          symbol, company_name, sector, industry, employees, website, description,
          market_cap, pe_ratio, dividend_yield, beta, volume, avg_volume,
          day_range, year_range, current_price, change_amount, change_percent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (symbol) DO UPDATE SET
          current_price = EXCLUDED.current_price,
          change_amount = EXCLUDED.change_amount,
          change_percent = EXCLUDED.change_percent,
          volume = EXCLUDED.volume,
          last_updated = CURRENT_TIMESTAMP
      `;

      await db.query(query, [
        stock.symbol, stock.company_name, stock.sector, stock.industry,
        stock.employees, stock.website, stock.description, stock.market_cap,
        stock.pe_ratio, stock.dividend_yield, stock.beta, stock.volume,
        stock.avg_volume, stock.day_range, stock.year_range,
        stock.current_price, stock.change_amount, stock.change_percent
      ]);
    }

    // Insert financial reports
    for (const report of sampleFinancialReports) {
      const query = `
        INSERT INTO financial_reports (symbol, report_type, period, title, description, file_url, release_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `;
      await db.query(query, [
        report.symbol, report.report_type, report.period, report.title,
        report.description, report.file_url, report.release_date
      ]);
    }

    // Insert news
    for (const news of sampleNews) {
      const query = `
        INSERT INTO stock_news (symbol, title, summary, url, source, published_at, sentiment)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `;
      await db.query(query, [
        news.symbol, news.title, news.summary, news.url,
        news.source, news.published_at, news.sentiment
      ]);
    }

    // Insert analyst ratings
    for (const rating of sampleAnalystRatings) {
      const query = `
        INSERT INTO analyst_ratings (symbol, analyst_firm, rating, price_target, rating_date)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `;
      await db.query(query, [
        rating.symbol, rating.analyst_firm, rating.rating,
        rating.price_target, rating.rating_date
      ]);
    }

    console.log('✅ Stock data seeded successfully!');
    console.log(`📊 Added ${sampleStocks.length} stocks`);
    console.log(`📄 Added ${sampleFinancialReports.length} financial reports`);
    console.log(`📰 Added ${sampleNews.length} news articles`);
    console.log(`📈 Added ${sampleAnalystRatings.length} analyst ratings`);

  } catch (error) {
    console.error('❌ Error seeding stock data:', error);
  } finally {
    await db.end();
  }
}

// Run the seeding function
seedStockData(); 