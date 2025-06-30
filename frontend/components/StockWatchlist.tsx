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

interface Stock {
  symbol: string
  companyName: string
  currentPrice: number
  change: number
  changePercent: number
  marketCap: number
  volume: number
  isWatched: boolean
}

export function StockWatchlist() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddStock, setShowAddStock] = useState(false)
  const [newStockSymbol, setNewStockSymbol] = useState('')

  // Mock data - in real implementation, this would come from API
  useEffect(() => {
    setTimeout(() => {
      setStocks([
        {
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          currentPrice: 175.43,
          change: 2.15,
          changePercent: 1.24,
          marketCap: 2500000000000,
          volume: 45000000,
          isWatched: true
        },
        {
          symbol: 'MSFT',
          companyName: 'Microsoft Corporation',
          currentPrice: 378.85,
          change: -1.23,
          changePercent: -0.32,
          marketCap: 2800000000000,
          volume: 22000000,
          isWatched: true
        },
        {
          symbol: 'GOOGL',
          companyName: 'Alphabet Inc.',
          currentPrice: 142.56,
          change: 0.89,
          changePercent: 0.63,
          marketCap: 1800000000000,
          volume: 18000000,
          isWatched: true
        },
        {
          symbol: 'AMZN',
          companyName: 'Amazon.com Inc.',
          currentPrice: 155.20,
          change: -0.45,
          changePercent: -0.29,
          marketCap: 1600000000000,
          volume: 35000000,
          isWatched: true
        },
        {
          symbol: 'TSLA',
          companyName: 'Tesla Inc.',
          currentPrice: 248.50,
          change: 5.20,
          changePercent: 2.14,
          marketCap: 790000000000,
          volume: 65000000,
          isWatched: true
        }
      ])
      setLoading(false)
    }, 1000)
  }, [])

  const filteredStocks = stocks.filter(stock =>
    stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddStock = () => {
    if (newStockSymbol.trim()) {
      // In real implementation, this would validate the symbol and fetch stock data
      const newStock: Stock = {
        symbol: newStockSymbol.toUpperCase(),
        companyName: `${newStockSymbol.toUpperCase()} Company`,
        currentPrice: 100.00,
        change: 0,
        changePercent: 0,
        marketCap: 1000000000,
        volume: 1000000,
        isWatched: true
      }
      setStocks([...stocks, newStock])
      setNewStockSymbol('')
      setShowAddStock(false)
    }
  }

  const handleRemoveStock = (symbol: string) => {
    setStocks(stocks.filter(stock => stock.symbol !== symbol))
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
              <Input
                placeholder="Enter stock symbol (e.g., AAPL)"
                value={newStockSymbol}
                onChange={(e) => setNewStockSymbol(e.target.value)}
                className="mb-4"
                onKeyPress={(e) => e.key === 'Enter' && handleAddStock()}
              />
              <div className="flex gap-2">
                <Button onClick={handleAddStock} className="flex-1">
                  Add Stock
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowAddStock(false)}
                  className="flex-1"
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
                <TableHead className="text-right">Market Cap</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStocks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No stocks found matching your search.' : 'No stocks in your watchlist.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredStocks.map((stock) => (
                  <TableRow key={stock.symbol} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {stock.symbol}
                        </Badge>
                        {stock.isWatched && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{stock.companyName}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(stock.currentPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`flex items-center justify-end gap-1 ${getChangeColor(stock.change)}`}>
                        {getChangeIcon(stock.change)}
                        <span className="font-mono">
                          {stock.change >= 0 ? '+' : ''}{formatCurrency(stock.change)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {stock.marketCap >= 1000000000000 
                        ? `$${(stock.marketCap / 1000000000000).toFixed(1)}T`
                        : `$${(stock.marketCap / 1000000000).toFixed(1)}B`
                      }
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {(stock.volume / 1000000).toFixed(1)}M
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <StockDetailModal
                          symbol={stock.symbol}
                          companyName={stock.companyName}
                          currentPrice={stock.currentPrice}
                          change={stock.change}
                          changePercent={stock.changePercent}
                        >
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </StockDetailModal>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleRemoveStock(stock.symbol)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-primary">{filteredStocks.length}</p>
            <p className="text-sm text-muted-foreground">Stocks</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {filteredStocks.filter(s => s.change > 0).length}
            </p>
            <p className="text-sm text-muted-foreground">Gaining</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-red-600">
              {filteredStocks.filter(s => s.change < 0).length}
            </p>
            <p className="text-sm text-muted-foreground">Declining</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 