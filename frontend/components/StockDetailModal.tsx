import React, { useState, useEffect } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogDescription
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
import Swal from 'sweetalert2'
import { BarChart, Bar, Legend, ResponsiveContainer, CartesianGrid, XAxis as RechartsXAxis, YAxis as RechartsYAxis, Tooltip, LineChart, Line } from 'recharts';
import { useTranslation } from 'next-i18next';

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
  const { t } = useTranslation('common');
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
  const [analysis, setAnalysis] = useState<any>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [errorAnalysis, setErrorAnalysis] = useState('')
  const [historicalData, setHistoricalData] = useState<any>(null)
  const [loadingHistorical, setLoadingHistorical] = useState(false)
  const [errorHistorical, setErrorHistorical] = useState('')

  // Fetch stock data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchStockData()
      fetchNews()
      fetchFinancials()
      fetchMarketOverview()
      fetchAnalysis()
      fetchHistoricalData()
    }
  }, [isOpen, symbol])

  const fetchStockData = async () => {
    try {
      setLoading(true)
      const response = await investmentAPI.getStockSnapshot(symbol)
      setStockData(response.data)
    } catch (error) {
      console.error('Error fetching stock data:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to load stock details',
      })
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

  const fetchAnalysis = async () => {
    setLoadingAnalysis(true)
    setErrorAnalysis('')
    try {
      const res = await investmentAPI.getStockAnalysis(symbol)
      setAnalysis(res.data || null)
    } catch (err) {
      setErrorAnalysis('Failed to load analysis')
      setAnalysis(null)
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const fetchHistoricalData = async () => {
    setLoadingHistorical(true)
    setErrorHistorical('')
    try {
      const res = await investmentAPI.getStockHistoricalData(symbol)
      setHistoricalData(res.data || null)
    } catch (err) {
      setErrorHistorical('Failed to load historical data')
      setHistoricalData(null)
    } finally {
      setLoadingHistorical(false)
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
                {formatCurrency(Math.abs(typeof change === 'number' ? change : 0))} ({(typeof changePercent === 'number' ? (changePercent >= 0 ? '+' : '') + changePercent.toFixed(2) : '0.00')}%)
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            {t('Detailed information and analysis for the selected stock.')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">{t('Overview')}</TabsTrigger>
            <TabsTrigger value="financials">{t('Financials')}</TabsTrigger>
            <TabsTrigger value="news">{t('News')}</TabsTrigger>
            <TabsTrigger value="analysis">{t('Analysis')}</TabsTrigger>
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
                      {t('Key Metrics')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Current Price')}</p>
                        <p className="font-medium">{stockData?.quote?.c !== undefined ? stockData.quote.c : t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Change')}</p>
                        <p className="font-medium">{stockData?.quote?.d !== undefined ? stockData.quote.d : '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Change %')}</p>
                        <p className="font-medium">{stockData?.quote?.dp !== undefined ? stockData.quote.dp + '%' : '0.00%'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Day Range')}</p>
                        <p className="font-medium">{stockData?.tradingInfo?.dayRange || t('N/A')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Company Information - Now using Finnhub profile data */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      {t('Company Information')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Name')}</p>
                        <p className="font-medium">{stockData?.companyInfo?.name ? t(stockData.companyInfo.name) : t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Market Cap')}</p>
                        <p className="font-medium">{stockData?.tradingInfo?.marketCap !== undefined && stockData?.tradingInfo?.marketCap !== null ? stockData.tradingInfo.marketCap : t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Industry')}</p>
                        <p className="font-medium">{stockData?.companyInfo?.industry ? t(stockData.companyInfo.industry) : t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Country')}</p>
                        <p className="font-medium">{stockData?.companyInfo?.country || t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Website')}</p>
                        <p className="font-medium">
                          {stockData?.companyInfo?.website ? (
                            <a href={stockData.companyInfo.website} target="_blank" rel="noopener noreferrer" className="underline">
                              {stockData.companyInfo.website}
                            </a>
                          ) : t('N/A')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Exchange')}</p>
                        <p className="font-medium">{stockData?.companyInfo?.exchange ? t(stockData.companyInfo.exchange) : t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('IPO Date')}</p>
                        <p className="font-medium">{stockData?.companyInfo?.ipo || t('N/A')}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('Ticker')}</p>
                        <p className="font-medium">{stockData?.companyInfo?.ticker || t('N/A')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stock Trend Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      {t('Price Trend (1 Month)')}
                    </CardTitle>
                    <CardDescription>
                      {t('Historical price movement for {{symbol}}', { symbol })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingHistorical ? (
                      <div className="text-center py-8">{t('Loading...')}</div>
                    ) : errorHistorical ? (
                      <div className="text-center py-8 text-red-600">{errorHistorical}</div>
                    ) : historicalData && historicalData.data && historicalData.data.o && historicalData.data.o.length > 0 ? (
                      <div className="h-80">
                        <CandlestickChart 
                          data={historicalData.data}
                          symbol={symbol}
                        />
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">{t('No historical data available.')}</div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">{t('No data available.')}</div>
            )}
          </TabsContent>

          <TabsContent value="financials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {t('Financial Reports')}
                </CardTitle>
                <CardDescription>
                  {t('Access quarterly and annual financial reports')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingFinancials ? (
                  <div className="text-center py-8">{t('Loading...')}</div>
                ) : errorFinancials ? (
                  <div className="text-center py-8 text-red-600">{errorFinancials}</div>
                ) : financials ? (
                  <FinancialsTable financials={financials} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">{t('No financials available.')}</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="news" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper className="w-5 h-5" />
                  {t('Latest News')}
                </CardTitle>
                <CardDescription>
                  {t('Recent news and announcements about {{symbol}}', { symbol })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingNews ? (
                  <div className="text-center py-8">{t('Loading...')}</div>
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
                                  {t('Read More')}
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">{t('No news available.')}</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            {/* Recommendation Trends Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {t('Recommendation Trends')}
                </CardTitle>
                <CardDescription>
                  {t('Analyst recommendations over time')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAnalysis ? (
                  <div className="text-center py-8">{t('Loading...')}</div>
                ) : errorAnalysis ? (
                  <div className="text-center py-8 text-red-600">{errorAnalysis}</div>
                ) : analysis && analysis.recommendations && analysis.recommendations.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={analysis.recommendations} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <RechartsXAxis dataKey="period" />
                      <RechartsYAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="buy" fill="#22c55e" name={t('Buy')} />
                      <Bar dataKey="hold" fill="#f59e0b" name={t('Hold')} />
                      <Bar dataKey="sell" fill="#ef4444" name={t('Sell')} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">{t('No recommendation data available.')}</div>
                )}
              </CardContent>
            </Card>
            {/* EPS Surprises Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  {t('EPS Surprises (Last 4 Quarters)')}
                </CardTitle>
                <CardDescription>
                  {t('Actual vs. estimated EPS for the last 4 quarters')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAnalysis ? (
                  <div className="text-center py-8">{t('Loading...')}</div>
                ) : errorAnalysis ? (
                  <div className="text-center py-8 text-red-600">{errorAnalysis}</div>
                ) : analysis && analysis.epsSurprises && analysis.epsSurprises.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Period')}</th>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Actual EPS')}</th>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Estimate')}</th>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Surprise')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.epsSurprises.map((row: any, idx: number) => (
                          <tr key={idx} className="border-b">
                            <td className="px-2 py-1">{row.period || row.date || t('N/A')}</td>
                            <td className="px-2 py-1">{row.actual !== undefined ? row.actual : t('N/A')}</td>
                            <td className="px-2 py-1">{row.estimate !== undefined ? row.estimate : t('N/A')}</td>
                            <td className="px-2 py-1">{row.surprise !== undefined ? row.surprise : (row.actual !== undefined && row.estimate !== undefined ? (row.actual - row.estimate).toFixed(2) : t('N/A'))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">{t('No EPS surprise data available.')}</div>
                )}
              </CardContent>
            </Card>
            {/* Earnings Calendar Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  {t('Earnings Calendar (Next Month)')}
                </CardTitle>
                <CardDescription>
                  {t('Upcoming earnings events (US only)')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAnalysis ? (
                  <div className="text-center py-8">{t('Loading...')}</div>
                ) : errorAnalysis ? (
                  <div className="text-center py-8 text-red-600">{errorAnalysis}</div>
                ) : analysis && analysis.earningsCalendar && analysis.earningsCalendar.earnings && analysis.earningsCalendar.earnings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Date')}</th>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Time')}</th>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('EPS Estimate')}</th>
                          <th className="px-2 py-1 border-b text-left font-semibold">{t('Actual EPS')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.earningsCalendar.earnings.map((row: any, idx: number) => (
                          <tr key={idx} className="border-b">
                            <td className="px-2 py-1">{row.date || t('N/A')}</td>
                            <td className="px-2 py-1">{row.hour || row.time || t('N/A')}</td>
                            <td className="px-2 py-1">{row.epsEstimate !== undefined ? row.epsEstimate : t('N/A')}</td>
                            <td className="px-2 py-1">{row.epsActual !== undefined ? row.epsActual : t('N/A')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">{t('No upcoming earnings events.')}</div>
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
  const { t } = useTranslation('common');
  // Only show annual reports
  const reports = financials.annualReports || []
  const columns = [
    { key: 'period', label: t('Year') },
    { key: 'revenue', label: t('Revenue') },
    { key: 'netIncome', label: t('Net Income') },
    { key: 'eps', label: t('EPS') },
    { key: 'assets', label: t('Assets') },
    { key: 'liabilities', label: t('Liabilities') },
    { key: 'filingUrl', label: t('Filing') },
  ]
  const getYear = (period: any) => {
    if (!period) return t('N/A');
    // Try to extract year from YYYY-MM-DD or YYYYMMDD or YYYY
    const match = String(period).match(/(\d{4})/);
    return match ? match[1] : t('N/A');
  }
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
              <tr><td colSpan={columns.length} className="text-center py-4">{t('No data')}</td></tr>
            ) : (
              reports.map((row: any, idx: number) => (
                <tr key={idx} className="border-b">
                  {columns.map(col => (
                    <td key={col.key} className="px-2 py-1">
                      {col.key === 'filingUrl' ? (
                        row.filingUrl ? (
                          <a href={row.filingUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600 flex items-center gap-1">
                            {t('View Filing')}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-10 10m0 0h7m-7 0v-7" /></svg>
                          </a>
                        ) : t('N/A')
                      ) : col.key === 'period' ? (
                        getYear(row.period)
                      ) : (
                        row[col.key] !== undefined && row[col.key] !== null ? row[col.key] : t('N/A')
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

// OHLC Chart Component
const CandlestickChart = ({ data, symbol }: { data: any; symbol: string }) => {
  const { t } = useTranslation('common');
  // Transform Finnhub data to the format expected by Recharts
  const chartData = data.t.map((timestamp: number, index: number) => ({
    date: new Date(timestamp * 1000).toLocaleDateString(),
    open: data.o[index],
    high: data.h[index],
    low: data.l[index],
    close: data.c[index],
    volume: data.v ? data.v[index] : 0
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <RechartsXAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <RechartsYAxis 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `$${value.toFixed(2)}`}
        />
        <Tooltip 
          formatter={(value: any, name: string) => [`$${value.toFixed(2)}`, name]}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
        />
        <Line 
          type="monotone" 
          dataKey="open" 
          stroke="#3b82f6" 
          strokeWidth={2}
          dot={false}
          name={t('Open')}
        />
        <Line 
          type="monotone" 
          dataKey="high" 
          stroke="#22c55e" 
          strokeWidth={2}
          dot={false}
          name={t('High')}
        />
        <Line 
          type="monotone" 
          dataKey="low" 
          stroke="#ef4444" 
          strokeWidth={2}
          dot={false}
          name={t('Low')}
        />
        <Line 
          type="monotone" 
          dataKey="close" 
          stroke="#f59e0b" 
          strokeWidth={2}
          dot={false}
          name={t('Close')}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};