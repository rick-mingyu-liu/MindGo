import axios from 'axios'
import Swal from 'sweetalert2'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Logout function
export const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/login'
}

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    const { response } = error

    // Don't show automatic toast for auth endpoints (handled manually in components)
    const isAuthEndpoint = error.config?.url?.includes('/auth/')

    if (response?.status === 401) {
      // Unauthorized - redirect to login
      logout()
    } else if (response?.status === 403) {
      Swal.fire({
        icon: 'error',
        title: 'Access denied',
        text: 'Access denied. You do not have permission to perform this action.',
      })
    } else if (response?.status === 404) {
      Swal.fire({
        icon: 'error',
        title: 'Resource not found',
        text: 'Resource not found.',
      })
    } else if (response?.status >= 500) {
      Swal.fire({
        icon: 'error',
        title: 'Server error',
        text: 'Server error. Please try again later.',
      })
    } else if (response?.data?.error && !isAuthEndpoint) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: response.data.error,
      })
    } else if (!isAuthEndpoint) {
      Swal.fire({
        icon: 'error',
        title: 'An unexpected error occurred',
        text: 'An unexpected error occurred.',
      })
    }

    return Promise.reject(error)
  }
)

// Enhanced Stock API functions
export const enhancedStockAPI = {
  // Get enhanced watchlist
  getWatchlist: () => api.get('/enhanced-stocks/watchlist'),
  
  // Get detailed stock data
  getStockData: (symbol: string) => api.get(`/enhanced-stocks/stock/${symbol}`),
  
  // Add stock to watchlist
  addToWatchlist: (symbol: string, companyName: string) => 
    api.post('/enhanced-stocks/watchlist', { symbol, companyName }),
  
  // Remove stock from watchlist
  removeFromWatchlist: (symbol: string) => 
    api.delete(`/enhanced-stocks/watchlist/${symbol}`),
  
  // Search stocks
  searchStocks: (query: string) => 
    api.get(`/enhanced-stocks/search?q=${encodeURIComponent(query)}`),
  
  // Get market overview
  getMarketOverview: () => api.get('/enhanced-stocks/market-overview'),
  
  // Seed sample data (for development)
  seedSampleData: () => api.post('/enhanced-stocks/seed-sample-data')
}

// Add searchStocks for investments
export const investmentAPI = {
  searchStocks: (query: string) => api.get(`/investments/search?query=${encodeURIComponent(query)}`),
  getStockSnapshot: (symbol: string) => api.get(`/investments/snapshot/${symbol}`),
  getStockNews: (symbol: string) => api.get(`/investments/news/${symbol}`),
  getStockFinancials: (symbol: string) => api.get(`/investments/financials/${symbol}`),
  getMarketOverview: () => api.get('/investments/market-overview'),
  getStockAnalysis: (symbol: string) => api.get(`/investments/analysis/${symbol}`),
  getStockHistoricalData: (symbol: string, period: string = '1m') => api.get(`/investments/historical/${symbol}?period=${period}`),
  // Crypto watchlist endpoints
  getCryptoWatchlist: () => api.get('/investments/crypto-watchlist'),
  addToCryptoWatchlist: (symbol: string, coin_name?: string) => api.post('/investments/crypto-watchlist', { symbol, coin_name }),
  removeFromCryptoWatchlist: (symbol: string) => api.delete(`/investments/crypto-watchlist/${symbol}`),
}

export const goalAPI = {
  createFromAIPlan: (data: { aiPlanId: number, name: string, target_amount: number, target_date?: string, description?: string }) =>
    api.post('/goals/from-ai-plan', data),
};

export const summaryAPI = {
  checkIn: () => api.post('/summary/checkin'),
  getCheckinStreak: () => api.get('/summary/checkin-streak'),
};

export const cryptoAPI = {
  getCryptoDetail: (symbol: string) => api.get(`/crypto/${symbol}`),
};

export { api } 