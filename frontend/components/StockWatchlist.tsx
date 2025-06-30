import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Plus, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Star,
  Eye,
  Trash2
} from 'lucide-react'
import { StockDetailModal } from './StockDetailModal'
import { formatCurrency } from '@/utils/formatters'
import { enhancedStockAPI, investmentAPI } from '@/utils/api'
import toast from 'react-hot-toast'

interface Stock {
  id: number
  symbol: string
  companyName: string
  currentPrice: number
  change: number
  changePercent: number
  marketCap: number
  volume: number
  sector: string
  industry: string
  addedAt: string
  lastUpdated: string
}

export function StockWatchlist() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddStock, setShowAddStock] = useState(false)
  const [newStockSymbol, setNewStockSymbol] = useState('')
  const [newStockCompany, setNewStockCompany] = useState('')
  const [addingStock, setAddingStock] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState('')

  // Fetch watchlist data
  const fetchWatchlist = async () => {
    try {
      setLoading(true)
      const response = await enhancedStockAPI.getWatchlist()
      setStocks(response.data.watchlist)
    } catch (error) {
      console.error('Error fetching watchlist:', error)
      toast.error('Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWatchlist()
  }, [])

  // Debounced search for stocks/companies
  useEffect(() => {
    if (!showAddStock || !searchQuery.trim()) {
      setSearchResults([])
      setSearchError('')
      return
    }
    setSearching(true)
    setSearchError('')
    const timeout = setTimeout(async () => {
      try {
        const res = await investmentAPI.searchStocks(searchQuery.trim())
        setSearchResults(res.data.results.result || [])
      } catch (err) {
        setSearchError('Failed to search stocks')
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [searchQuery, showAddStock])

  const filteredStocks = stocks.filter(stock =>
    stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddStock = async () => {
    if (!newStockSymbol.trim() || !newStockCompany.trim()) {
      toast.error('Please enter both symbol and company name')
      return
    }

    try {
      setAddingStock(true)
      await enhancedStockAPI.addToWatchlist(newStockSymbol.trim(), newStockCompany.trim())
      toast.success('Stock added to watchlist')
      setNewStockSymbol('')
      setNewStockCompany('')
      setShowAddStock(false)
      fetchWatchlist() // Refresh the list
    } catch (error) {
      console.error('Error adding stock:', error)
      // Error message is handled by the API interceptor
    } finally {
      setAddingStock(false)
    }
  }

  const handleRemoveStock = async (symbol: string) => {
    try {
      await enhancedStockAPI.removeFromWatchlist(symbol)
      toast.success('Stock removed from watchlist')
      fetchWatchlist() // Refresh the list
    } catch (error) {
      console.error('Error removing stock:', error)
      // Error message is handled by the API interceptor
    }
  }

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-green-600' : 'text-red-600'
  }

  const getChangeIcon = (change: number) => {
    return change >= 0 ? 
      <TrendingUp className="w-4 h-4 text-green-600" /> : 
      <TrendingDown className="w-4 h-4 text-red-600" />
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stock Watchlist</CardTitle>
          <CardDescription>Track your favorite stocks and get detailed information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="aurora-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-primary" />
              Stock Watchlist
            </CardTitle>
            <CardDescription>
              Track your favorite stocks and get detailed information
            </CardDescription>
          </div>
          <Button 
            onClick={() => setShowAddStock(true)}
            className="aurora-glow"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Stock
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search stocks by symbol or company name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Add Stock Modal */}
        {showAddStock && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background p-6 rounded-lg shadow-lg w-96">
              <h3 className="text-lg font-semibold mb-4">Add Stock to Watchlist</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Search by Symbol or Company Name</label>
                  <Input
                    placeholder="Type symbol or company name..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                  {searching && <div className="text-xs text-muted-foreground mt-1">Searching...</div>}
                  {searchError && <div className="text-xs text-red-600 mt-1">{searchError}</div>}
                  {searchResults.length > 0 && (
                    <div className="border rounded mt-2 max-h-48 overflow-y-auto bg-background z-10">
                      {searchResults.map((result, idx) => (
                        <div
                          key={result.symbol + idx}
                          className="px-3 py-2 hover:bg-muted cursor-pointer"
                          onClick={() => {
                            setNewStockSymbol(result.symbol)
                            setNewStockCompany(result.description)
                            setSearchQuery(result.symbol + ' - ' + result.description)
                            setSearchResults([])
                          }}
                        >
                          <span className="font-mono font-semibold">{result.symbol}</span> - {result.description}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Stock Symbol</label>
                  <Input
                    placeholder="Enter stock symbol (e.g., AAPL)"
                    value={newStockSymbol}
                    onChange={(e) => setNewStockSymbol(e.target.value.toUpperCase())}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddStock()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Company Name</label>
                  <Input
                    placeholder="Enter company name (e.g., Apple Inc.)"
                    value={newStockCompany}
                    onChange={(e) => setNewStockCompany(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddStock()}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button 
                  onClick={handleAddStock} 
                  className="flex-1"
                  disabled={addingStock}
                >
                  {addingStock ? 'Adding...' : 'Add Stock'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowAddStock(false)}
                  className="flex-1"
                  disabled={addingStock}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stocks Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">% Change</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No stocks found matching your search.' : 'No stocks in your watchlist.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredStocks.map((stock) => (
                  <TableRow key={stock.id}>
                    <TableCell className="font-mono font-semibold">{stock.symbol}</TableCell>
                    <TableCell>{stock.companyName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {stock.currentPrice ? formatCurrency(stock.currentPrice) : 'N/A'}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${stock.change > 0 ? 'text-green-600' : stock.change < 0 ? 'text-red-600' : ''}`}>
                      {stock.change !== null ? `${stock.change > 0 ? '+' : ''}${stock.change.toFixed(2)}` : 'N/A'}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${stock.changePercent > 0 ? 'text-green-600' : stock.changePercent < 0 ? 'text-red-600' : ''}`}>
                      {stock.changePercent !== null ? `${stock.changePercent > 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%` : 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleRemoveStock(stock.symbol)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
} 