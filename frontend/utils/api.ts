import axios from 'axios'
import toast from 'react-hot-toast'

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
  toast.success('Logged out successfully')
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

    if (response?.status === 401) {
      // Unauthorized - redirect to login
      logout()
    } else if (response?.status === 403) {
      toast.error('Access denied. You do not have permission to perform this action.')
    } else if (response?.status === 404) {
      toast.error('Resource not found.')
    } else if (response?.status >= 500) {
      toast.error('Server error. Please try again later.')
    } else if (response?.data?.error) {
      toast.error(response.data.error)
    } else {
      toast.error('An unexpected error occurred.')
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
}

export { api } 