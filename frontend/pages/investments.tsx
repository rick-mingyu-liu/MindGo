import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Plus, TrendingUp, TrendingDown, BarChart3, Edit, Trash2, Search, LogOut, Star, Info, Eye, ExternalLink } from 'lucide-react'
import { api, logout, investmentAPI } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFirstRow } from '@/components/ui/table'
import { StockDetailModal } from '@/components/StockDetailModal'
import Swal from 'sweetalert2'
import { useTranslation } from 'next-i18next';

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

// Add fallback index info
const INDEX_CARDS = [
  {
    symbol: '^GSPC',
    label: 'S&P 500',
    name: 'S&P 500 Index',
  },
  {
    symbol: '^DJI',
    label: 'DJI',
    name: 'Dow Jones Industrial Average',
  },
  {
    symbol: '^IXIC',
    label: 'IXIC',
    name: 'NASDAQ Composite',
  },
];

// Add this above the Investments component
const INDEX_SUMMARIES: Record<string, { title: string; description: string; link: string }> = {
  '^GSPC': {
    title: 'S&P 500 Index',
    description: 'The S&P 500 is a stock market index tracking the stock performance of 500 large companies listed on stock exchanges in the United States. It is one of the most commonly followed equity indices and is considered a barometer for the overall U.S. stock market.',
    link: 'https://en.wikipedia.org/wiki/S%26P_500_Index',
  },
  '^DJI': {
    title: 'Dow Jones Industrial Average',
    description: 'The Dow Jones Industrial Average (DJIA) is a price-weighted index of 30 prominent companies listed on stock exchanges in the United States. It is one of the oldest and most widely recognized stock market indices in the world.',
    link: 'https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average',
  },
  '^IXIC': {
    title: 'NASDAQ Composite',
    description: 'The NASDAQ Composite is a stock market index that includes almost all stocks listed on the Nasdaq stock exchange. It is heavily weighted toward information technology companies and is seen as an indicator of the performance of technology and growth companies.',
    link: 'https://en.wikipedia.org/wiki/NASDAQ_Composite',
  },
};

function IndexDetailModal({ open, onOpenChange, symbol }: { open: boolean; onOpenChange: (v: boolean) => void; symbol: string }) {
  const info = INDEX_SUMMARIES[symbol];
  if (!info) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{info.title}</DialogTitle>
          <DialogDescription>{info.description}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

export default function Investments() {
  const router = useRouter()
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchAddQuery, setSearchAddQuery] = useState('')
  const [searchAddResults, setSearchAddResults] = useState<any[]>([])
  const [searchAddLoading, setSearchAddLoading] = useState(false)
  const [searchAddError, setSearchAddError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [detailModalOpenId, setDetailModalOpenId] = useState<number | null>(null)
  const [indexRows, setIndexRows] = useState<any[]>([])
  const [indexLoading, setIndexLoading] = useState(true)
  const [indexError, setIndexError] = useState('')
  const [openIndexModal, setOpenIndexModal] = useState<string | null>(null)
  const { t } = useTranslation('common');

  useEffect(() => {
    fetchWatchlist()
    fetchIndices()
  }, [])

  // Debounced search for Add Stock dialog
  useEffect(() => {
    if (!isDialogOpen) {
      setSearchAddResults([])
      setSearchAddError('')
      return
    }
    if (!searchAddQuery.trim()) {
      setSearchAddResults([])
      setSearchAddError('')
      return
    }
    setSearchAddLoading(true)
    setSearchAddError('')
    const timeout = setTimeout(async () => {
      try {
        const res = await investmentAPI.searchStocks(searchAddQuery.trim())
        setSearchAddResults(res.data.results.result || [])
      } catch (err) {
        setSearchAddError('Failed to search stocks')
        setSearchAddResults([])
      } finally {
        setSearchAddLoading(false)
      }
    }, 400)
    return () => clearTimeout(timeout)
  }, [searchAddQuery, isDialogOpen])

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

  const fetchIndices = async () => {
    setIndexLoading(true)
    setIndexError('')
    try {
      const results = await Promise.all(
        INDEX_CARDS.map(idx => investmentAPI.getStockSnapshot(idx.symbol))
      )
      setIndexRows(results.map((res, i) => ({
        ...INDEX_CARDS[i],
        quote: res.data.quote,
      })))
    } catch (err) {
      setIndexError('Failed to load index data')
      setIndexRows([])
    } finally {
      setIndexLoading(false)
    }
  }

  const handleDelete = async (itemId: number) => {
    setPendingDeleteId(itemId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (pendingDeleteId == null) return
      try {
      await api.delete(`/investments/watchlist/${pendingDeleteId}`)
        Swal.fire({
          icon: 'success',
          title: 'Stock removed from watchlist!',
        })
        fetchWatchlist()
      } catch (error) {
        console.error('Error removing stock:', error)
    } finally {
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
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

  // Add stock directly from search result
  const handleAddStockFromSearch = async (symbol: string, companyName: string) => {
    try {
      await api.post('/investments/watchlist', { symbol, company_name: companyName })
      Swal.fire({
        icon: 'success',
        title: 'Stock added to watchlist!',
      })
      setIsDialogOpen(false)
      setSearchAddQuery('')
      setSearchAddResults([])
      fetchWatchlist()
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Failed to add stock',
      })
    }
  }

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
        <title>Watchlist - MindGo</title>
        <meta name="description" content="Track your favorite stocks" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-6 gap-4 sm:gap-0">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  onClick={() => router.push('/')}
                  className="mr-4 flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-2 sm:mr-2" />
                  <span className="hidden sm:inline">{t('Back to Dashboard')}</span>
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">{t('Investment Watchlist')}</h1>
                  <p className="text-muted-foreground">{t('Track your favorite stocks and investments')}</p>
                </div>
              </div>
              <div className="hidden sm:flex gap-2">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      {t('Add Stock')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>
                        {t('Add to Watchlist')}
                      </DialogTitle>
                      <DialogDescription>
                        {t('Add a new stock to your watchlist')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Label htmlFor="add-search">{t('Search by Symbol or Company Name')}</Label>
                        <Input
                        id="add-search"
                        placeholder={t('Type symbol or company name...')}
                        value={searchAddQuery}
                        onChange={e => setSearchAddQuery(e.target.value)}
                        autoFocus
                      />
                      {searchAddLoading && <div className="text-xs text-muted-foreground mt-1">{t('Searching...')}</div>}
                      {searchAddError && <div className="text-xs text-red-600 mt-1">{searchAddError}</div>}
                      {searchAddResults.length > 0 && (
                        <div className="border rounded mt-2 max-h-48 overflow-y-auto bg-background z-10">
                          {searchAddResults.map((result, idx) => (
                            <div
                              key={result.symbol + idx}
                              className="px-3 py-2 hover:bg-muted cursor-pointer"
                              onClick={() => handleAddStockFromSearch(result.symbol, result.description)}
                            >
                              <span className="font-mono font-semibold">{result.symbol}</span> - {result.description}
                            </div>
                          ))}
                      </div>
                      )}
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsDialogOpen(false)
                            setSearchAddQuery('')
                            setSearchAddResults([])
                          }}
                          className="flex-1"
                        >
                          {t('Cancel')}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </header>

        {/* FAB for mobile */}
        <button
          className="fixed bottom-6 right-6 z-50 flex sm:hidden items-center justify-center w-16 h-16 rounded-full fab-add-transaction"
          onClick={() => setIsDialogOpen(true)}
          aria-label={t('Add Stock')}
        >
          <Plus className="w-8 h-8" />
        </button>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('Search your watchlist...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          {/* Indices Table */}
          <div className="mb-6">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950/20 shadow-sm p-4">
              <div className="flex items-center gap-4 mb-2">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">{t('Major Indices')} <span className="text-xs font-normal text-blue-700 dark:text-blue-300">{t('(Live)')}</span></h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 dark:text-gray-400">
                      <th className="px-1 py-2 text-left font-semibold">{t('Symbol')}</th>
                      <th className="px-1 py-2 text-left font-semibold hidden sm:table-cell">{t('Name')}</th>
                      <th className="px-1 py-2 text-right font-semibold">{t('Price')}</th>
                      <th className="px-1 py-2 text-right font-semibold hidden sm:table-cell">{t('Change')}</th>
                      <th className="px-1 py-2 text-right font-semibold sm:pr-6 lg:pr-8">{t('Change %')}</th>
                      <th className="px-1 py-2 text-center font-semibold">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexLoading ? (
                      <tr><td colSpan={4} className="text-center py-4 sm:hidden">{t('Loading...')}</td><td colSpan={6} className="text-center py-4 hidden sm:table-cell">{t('Loading...')}</td></tr>
                    ) : indexError ? (
                      <tr><td colSpan={4} className="text-center text-red-600 py-4 sm:hidden">{indexError}</td><td colSpan={6} className="text-center text-red-600 py-4 hidden sm:table-cell">{indexError}</td></tr>
                    ) : indexRows.length > 0 ? (
                      indexRows.map(idx => {
                        const price = idx.quote?.c ?? 'N/A'
                        const change = idx.quote?.d ?? 'N/A'
                        const changePct = idx.quote?.dp ?? 'N/A'
                        const isUp = typeof change === 'number' && change > 0
                        const isDown = typeof change === 'number' && change < 0
                        return (
                          <tr key={idx.symbol} className="border-t border-gray-100 dark:border-gray-800 hover:bg-muted/60 transition-colors">
                            <td className="px-1 py-2 font-mono">{idx.label}</td>
                            <td className="px-1 py-2 hidden sm:table-cell">{idx.name}</td>
                            <td className="text-right font-medium">{price !== 'N/A' ? formatCurrency(price) : 'N/A'}</td>
                            <td className="text-right hidden sm:table-cell">
                              {price !== 'N/A' && change !== 'N/A' ? (
                                <div className={`flex items-center justify-end gap-1 ${isUp ? 'text-green-600' : isDown ? 'text-red-600' : ''}`}> 
                                  {isUp ? (
                                    <TrendingUp className="w-4 h-4" />
                                  ) : isDown ? (
                                    <TrendingDown className="w-4 h-4" />
                                  ) : null}
                                  {formatCurrency(Math.abs(change))}
                                </div>
                              ) : 'N/A'}
                            </td>
                            <td className="px-1 py-2 text-right sm:pr-6 lg:pr-8">
                              {price !== 'N/A' && changePct !== 'N/A' ? (
                                <Badge variant={changePct >= 0 ? "default" : "destructive"}>
                                  {changePct > 0 ? '+' : ''}{changePct.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}%
                                </Badge>
                              ) : 'N/A'}
                            </td>
                            <td className="px-1 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" className="w-7 h-7 p-0" onClick={() => setOpenIndexModal(idx.symbol)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="w-7 h-7 p-0" asChild>
                                  <a href={INDEX_SUMMARIES[idx.symbol].link} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </Button>
                                <IndexDetailModal open={openIndexModal === idx.symbol} onOpenChange={(v) => v ? setOpenIndexModal(idx.symbol) : setOpenIndexModal(null)} symbol={idx.symbol} />
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr><td colSpan={4} className="text-center py-4 sm:hidden">{t('No data')}</td><td colSpan={6} className="text-center py-4 hidden sm:table-cell">{t('No data')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          

          {watchlist.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">{t('No stocks in watchlist')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('Add your favorite stocks to start tracking their performance')}
                </p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('Add Your First Stock')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('Watchlist')} ({filteredWatchlist.length} {t('stocks')})</CardTitle>
                <CardDescription>
                  {t('Real-time stock prices and performance')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableFirstRow>
                      <TableHead>{t('Symbol')}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t('Company')}</TableHead>
                      <TableHead className="text-right">{t('Price')}</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">{t('Change')}</TableHead>
                      <TableHead className="text-right">{t('Change %')}</TableHead>
                      <TableHead className="text-right w-16 sm:w-auto">{t('Actions')}</TableHead>
                    </TableFirstRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWatchlist.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.symbol}</TableCell>
                        <TableCell className="hidden sm:table-cell">{item.company_name}</TableCell>
                        <TableCell className="text-right">
                          {item.currentPrice ? formatCurrency(item.currentPrice) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
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
                          <div className="flex items-center justify-end gap-1 sm:gap-2">
                            <StockDetailModal
                              symbol={item.symbol}
                              companyName={item.company_name}
                              currentPrice={item.currentPrice}
                              change={item.change}
                              changePercent={item.changePercent}
                            >
                              <Button variant="ghost" size="icon" className="w-7 h-7 p-0">
                                <Eye className="w-4 h-4" />
                            </Button>
                            </StockDetailModal>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 p-0"
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

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('Remove Stock')}</DialogTitle>
                <DialogDescription>
                  {t('Are you sure you want to remove this stock from your watchlist? This action cannot be undone.')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                  {t('Cancel')}
                </Button>
                <Button variant="destructive" onClick={confirmDelete}>
                  {t('Remove')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </>
  )
} 