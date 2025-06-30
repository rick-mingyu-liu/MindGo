import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Plus, TrendingUp, TrendingDown, BarChart3, Edit, Trash2, Search, LogOut, Star, Info } from 'lucide-react'
import { api, logout } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface WatchlistItem {
  id: number
  symbol: string
  company_name: string
  currentPrice: number
  change: number
  changePercent: number
  marketCap?: string
  volume?: number
}

interface WatchlistForm {
  symbol: string
  company_name: string
}

export default function Investments() {
  const router = useRouter()
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<WatchlistItem | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WatchlistForm>()

  useEffect(() => {
    fetchWatchlist()
  }, [])

  const fetchWatchlist = async () => {
    try {
      setLoading(true)
      const response = await api.get('/investments/watchlist')
      setWatchlist(response.data.watchlist)
    } catch (error) {
      console.error('Error fetching watchlist:', error)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: WatchlistForm) => {
    try {
      if (editingItem) {
        await api.put(`/investments/watchlist/${editingItem.id}`, data)
        toast.success('Stock updated successfully!')
      } else {
        await api.post('/investments/watchlist', data)
        toast.success('Stock added to watchlist!')
      }
      
      setIsDialogOpen(false)
      reset()
      setEditingItem(null)
      fetchWatchlist()
      
    } catch (error) {
      console.error('Watchlist error:', error)
    }
  }

  const handleEdit = (item: WatchlistItem) => {
    setEditingItem(item)
    reset({
      symbol: item.symbol,
      company_name: item.company_name,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (itemId: number) => {
    if (confirm('Are you sure you want to remove this stock from your watchlist?')) {
      try {
        await api.delete(`/investments/watchlist/${itemId}`)
        toast.success('Stock removed from watchlist!')
        fetchWatchlist()
      } catch (error) {
        console.error('Error removing stock:', error)
      }
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
    return num.toString()
  }

  const filteredWatchlist = watchlist.filter(item =>
    item.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Investment Watchlist - Personal Finance App</title>
        <meta name="description" content="Track your favorite stocks" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-6">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  onClick={() => router.push('/')}
                  className="mr-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Investment Watchlist</h1>
                  <p className="text-muted-foreground">Track your favorite stocks and investments</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/watchlist')}
                >
                  <Star className="w-4 h-4 mr-2" />
                  Enhanced View
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Stock
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>
                        {editingItem ? 'Edit Stock' : 'Add to Watchlist'}
                      </DialogTitle>
                      <DialogDescription>
                        Add a new stock to your watchlist
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="symbol">Stock Symbol</Label>
                        <Input
                          id="symbol"
                          placeholder="e.g., AAPL, GOOGL, TSLA"
                          {...register('symbol', {
                            required: 'Stock symbol is required',
                            pattern: {
                              value: /^[A-Z]{1,5}$/,
                              message: 'Please enter a valid stock symbol (1-5 uppercase letters)',
                            },
                          })}
                        />
                        {errors.symbol && (
                          <p className="text-sm text-destructive">{errors.symbol.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="company_name">Company Name</Label>
                        <Input
                          id="company_name"
                          placeholder="e.g., Apple Inc., Alphabet Inc."
                          {...register('company_name', {
                            required: 'Company name is required',
                          })}
                        />
                        {errors.company_name && (
                          <p className="text-sm text-destructive">{errors.company_name.message}</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsDialogOpen(false)
                            reset()
                            setEditingItem(null)
                          }}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                          {editingItem ? 'Update Stock' : 'Add Stock'}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  onClick={logout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Info Section */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-5 h-5 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                  <Info className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Two Watchlist Views Available
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Basic View:</strong> Simple table with essential stock data. 
                  <strong className="ml-2">Enhanced View:</strong> Detailed analysis, financial reports, news, and comprehensive metrics.
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search stocks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {watchlist.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No stocks in watchlist</h3>
                <p className="text-muted-foreground mb-4">
                  Add your favorite stocks to start tracking their performance
                </p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Stock
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Watchlist ({filteredWatchlist.length} stocks)</CardTitle>
                <CardDescription>
                  Real-time stock prices and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Change %</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWatchlist.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.symbol}</TableCell>
                        <TableCell>{item.company_name}</TableCell>
                        <TableCell className="text-right">
                          {item.currentPrice ? formatCurrency(item.currentPrice) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.change ? (
                            <div className={`flex items-center justify-end gap-1 ${
                              item.change >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {item.change >= 0 ? (
                                <TrendingUp className="w-4 h-4" />
                              ) : (
                                <TrendingDown className="w-4 h-4" />
                              )}
                              {formatCurrency(Math.abs(item.change))}
                            </div>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.changePercent ? (
                            <Badge variant={item.changePercent >= 0 ? "default" : "destructive"}>
                              {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                            </Badge>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  )
} 