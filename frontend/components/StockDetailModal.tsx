import React, { useState, useEffect } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Building, 
  Globe, 
  Users, 
  BarChart3,
  FileText,
  Newspaper,
  Target,
  AlertTriangle,
  ExternalLink,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'
import { investmentAPI } from '@/utils/api'
import toast from 'react-hot-toast'

interface StockDetailModalProps {
  symbol: string
  companyName: string
  currentPrice: number
  change: number
  changePercent: number
  children: React.ReactNode
}

interface StockData {
  symbol: string
  company_name: string
  sector: string
  industry: string
  employees: number
  website: string
  description: string
  market_cap: number
  pe_ratio: number
  dividend_yield: number
  beta: number
  volume: number
  avg_volume: number
  day_range: string
  year_range: string
  current_price: number
  change_amount: number
  change_percent: number
}

interface FinancialReport {
  id: number
  symbol: string
  report_type: string
  period: string
  title: string
  description: string
  file_url: string
  release_date: string
}

interface NewsItem {
  id: number
  symbol: string
  title: string
  summary: string
  url: string
  source: string
  published_at: string
  sentiment: 'positive' | 'negative' | 'neutral'
}

interface AnalystRating {
  id: number
  symbol: string
  analyst_firm: string
  rating: 'buy' | 'hold' | 'sell'
  price_target: number
  rating_date: string
}

interface AnalystSummary {
  total: number
  buy: number
  hold: number
  sell: number
  averagePriceTarget: number
}

export function StockDetailModal({ 
  symbol, 
  companyName, 
  currentPrice, 
  change, 
  changePercent,
  children 
}: StockDetailModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stockData, setStockData] = useState<any | null>(null)
  const [news, setNews] = useState<any[]>([])
  const [financials, setFinancials] = useState<any | null>(null)
  const [marketOverview, setMarketOverview] = useState<any | null>(null)
  const [loadingNews, setLoadingNews] = useState(false)
  const [loadingFinancials, setLoadingFinancials] = useState(false)
  const [loadingMarket, setLoadingMarket] = useState(false)
  const [errorNews, setErrorNews] = useState('')
  const [errorFinancials, setErrorFinancials] = useState('')
  const [errorMarket, setErrorMarket] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch stock data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchStockData()
      fetchNews()
      fetchFinancials()
      fetchMarketOverview()
    }
  }, [isOpen, symbol])

  const fetchStockData = async () => {
    try {
      setLoading(true)
      const response = await investmentAPI.getStockSnapshot(symbol)
      setStockData(response.data)
    } catch (error) {
      console.error('Error fetching stock data:', error)
      toast.error('Failed to load stock details')
    } finally {
      setLoading(false)
    }
  }

  const fetchNews = async () => {
    setLoadingNews(true)
    setErrorNews('')
    try {
      const res = await investmentAPI.getStockNews(symbol)
      setNews(res.data.news || [])
    } catch (err) {
      setErrorNews('Failed to load news')
      setNews([])
    } finally {
      setLoadingNews(false)
    }
  }

  const fetchFinancials = async () => {
    setLoadingFinancials(true)
    setErrorFinancials('')
    try {
      const res = await investmentAPI.getStockFinancials(symbol)
      setFinancials(res.data.financials || null)
    } catch (err) {
      setErrorFinancials('Failed to load financials')
      setFinancials(null)
    } finally {
      setLoadingFinancials(false)
    }
  }

  const fetchMarketOverview = async () => {
    setLoadingMarket(true)
    setErrorMarket('')
    try {
      const res = await investmentAPI.getMarketOverview()
      setMarketOverview(res.data || null)
    } catch (err) {
      setErrorMarket('Failed to load market overview')
      setMarketOverview(null)
    } finally {
      setLoadingMarket(false)
    }
  }

  const getChangeIcon = () => {
    if (change > 0) return <ArrowUpRight className="w-4 h-4" />
    if (change < 0) return <ArrowDownRight className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {stockData?.companyInfo?.logo ? (
                <img src={stockData.companyInfo.logo} alt="Logo" className="w-8 h-8 rounded bg-white border object-contain" />
              ) : (
                <Building className="w-6 h-6 text-primary" />
              )}
              <div>
                <h2 className="text-xl font-bold">{symbol}</h2>
                <p className="text-sm text-muted-foreground">{companyName}</p>
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-2xl font-bold">{formatCurrency(currentPrice)}</div>
              <div className={`flex items-center gap-1 text-sm ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {getChangeIcon()}
                {formatCurrency(Math.abs(change))} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="financials">Financials</TabsTrigger>
            <TabsTrigger value="news">News</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : stockData ? (
              <>
                {/* Key Metrics - Only show what is available */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Key Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Current Price</p>
                        <p className="font-medium">{stockData?.quote?.c !== undefined ? stockData.quote.c : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Change</p>
                        <p className="font-medium">{stockData?.quote?.d !== undefined ? stockData.quote.d : '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Change %</p>
                        <p className="font-medium">{stockData?.quote?.dp !== undefined ? stockData.quote.dp + '%' : '0.00%'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Day Range</p>
                        <p className="font-medium">{stockData?.tradingInfo?.dayRange || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Company Information - Now using Finnhub profile data */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      Company Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Name</p>
                        <p className="font-medium">{stockData?.companyInfo?.name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Market Cap</p>
                        <p className="font-medium">{stockData?.tradingInfo?.marketCap !== undefined && stockData?.tradingInfo?.marketCap !== null ? stockData.tradingInfo.marketCap : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{stockData?.companyInfo?.industry || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Country</p>
                        <p className="font-medium">{stockData?.companyInfo?.country || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Website</p>
                        <p className="font-medium">
                          {stockData?.companyInfo?.website ? (
                            <a href={stockData.companyInfo.website} target="_blank" rel="noopener noreferrer" className="underline">
                              {stockData.companyInfo.website}
                            </a>
                          ) : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Exchange</p>
                        <p className="font-medium">{stockData?.companyInfo?.exchange || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">IPO Date</p>
                        <p className="font-medium">{stockData?.companyInfo?.ipo || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Ticker</p>
                        <p className="font-medium">{stockData?.companyInfo?.ticker || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No data available.</div>
            )}
          </TabsContent>

          <TabsContent value="financials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Financial Reports
                </CardTitle>
                <CardDescription>
                  Access quarterly and annual financial reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingFinancials ? (
                  <div className="text-center py-8">Loading...</div>
                ) : errorFinancials ? (
                  <div className="text-center py-8 text-red-600">{errorFinancials}</div>
                ) : financials ? (
                  <FinancialsTable financials={financials} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No financials available.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="news" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper className="w-5 h-5" />
                  Latest News
                </CardTitle>
                <CardDescription>
                  Recent news and announcements about {symbol}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingNews ? (
                  <div className="text-center py-8">Loading...</div>
                ) : errorNews ? (
                  <div className="text-center py-8 text-red-600">{errorNews}</div>
                ) : news.length > 0 ? (
                  <div className="space-y-4">
                    {news.map((item, idx) => (
                      <div key={item.id || idx} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-muted-foreground">{item.source}</span>
                              <span className="text-sm text-muted-foreground">
                                {item.published_at ? new Date(item.published_at).toLocaleDateString() : ''}
                              </span>
                            </div>
                            <h4 className="font-medium mb-2">{item.title}</h4>
                            <p className="text-sm text-muted-foreground mb-3">{item.summary}</p>
                            {item.url && (
                              <Button variant="outline" size="sm" asChild>
                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4 mr-2" />
                                  Read More
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No news available.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Market Overview
                </CardTitle>
                <CardDescription>
                  Market summary and movers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingMarket ? (
                  <div className="text-center py-8">Loading...</div>
                ) : errorMarket ? (
                  <div className="text-center py-8 text-red-600">{errorMarket}</div>
                ) : marketOverview ? (
                  <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(marketOverview, null, 2)}</pre>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">No market overview available.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function FinancialsTable({ financials }: { financials: any }) {
  // Only show annual reports
  const reports = financials.annualReports || []
  const columns = [
    { key: 'period', label: 'Period' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'netIncome', label: 'Net Income' },
    { key: 'eps', label: 'EPS' },
    { key: 'assets', label: 'Assets' },
    { key: 'liabilities', label: 'Liabilities' },
    { key: 'filingUrl', label: 'Filing' },
  ]
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-2 py-1 border-b text-left font-semibold">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center py-4">No data</td></tr>
            ) : (
              reports.map((row: any, idx: number) => (
                <tr key={idx} className="border-b">
                  {columns.map(col => (
                    <td key={col.key} className="px-2 py-1">
                      {col.key === 'filingUrl' ? (
                        row.filingUrl ? (
                          <a href={row.filingUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 flex items-center gap-1">
                            View Filing
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-10 10m0 0h7m-7 0v-7" /></svg>
                          </a>
                        ) : 'N/A'
                      ) : (
                        row[col.key] !== undefined ? row[col.key] : 'N/A'
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
} 