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
import { enhancedStockAPI } from '@/utils/api'
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
  const [stockData, setStockData] = useState<StockData | null>(null)
  const [financialReports, setFinancialReports] = useState<FinancialReport[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [analystRatings, setAnalystRatings] = useState<AnalystRating[]>([])
  const [analystSummary, setAnalystSummary] = useState<AnalystSummary | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch stock data when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchStockData()
    }
  }, [isOpen, symbol])

  const fetchStockData = async () => {
    try {
      setLoading(true)
      const response = await enhancedStockAPI.getStockData(symbol)
      
      setStockData(response.data.stock)
      setFinancialReports(response.data.financialReports)
      setNews(response.data.news)
      setAnalystRatings(response.data.analystRatings)
      setAnalystSummary(response.data.analystSummary)
    } catch (error) {
      console.error('Error fetching stock data:', error)
      toast.error('Failed to load stock details')
    } finally {
      setLoading(false)
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
              <Building className="w-6 h-6 text-primary" />
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
            ) : (
              <>
                {/* Key Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Key Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Market Cap</p>
                        <p className="text-lg font-bold">
                          {stockData?.market_cap ? formatCurrency(stockData.market_cap) : 'N/A'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">P/E Ratio</p>
                        <p className="text-lg font-bold">
                          {stockData?.pe_ratio?.toFixed(2) || 'N/A'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Dividend Yield</p>
                        <p className="text-lg font-bold">
                          {stockData?.dividend_yield ? `${stockData.dividend_yield.toFixed(2)}%` : 'N/A'}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Beta</p>
                        <p className="text-lg font-bold">
                          {stockData?.beta?.toFixed(2) || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Company Information */}
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
                        <p className="text-sm text-muted-foreground">Sector</p>
                        <p className="font-medium">{stockData?.sector || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{stockData?.industry || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Employees</p>
                        <p className="font-medium">
                          {stockData?.employees ? stockData.employees.toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Website</p>
                        {stockData?.website ? (
                          <a 
                            href={stockData.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline flex items-center gap-1"
                          >
                            Visit Website <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <p className="font-medium">N/A</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Description</p>
                      <p className="text-sm leading-relaxed">
                        {stockData?.description || 'No description available.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Trading Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Trading Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Volume</p>
                        <p className="font-medium">
                          {stockData?.volume ? stockData.volume.toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Volume</p>
                        <p className="font-medium">
                          {stockData?.avg_volume ? stockData.avg_volume.toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Day Range</p>
                        <p className="font-medium">{stockData?.day_range || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">52 Week Range</p>
                        <p className="font-medium">{stockData?.year_range || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
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
                {financialReports.length > 0 ? (
                  <div className="space-y-4">
                    {financialReports.map((report) => (
                      <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h4 className="font-medium">{report.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            Released {new Date(report.release_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          <FileText className="w-4 h-4 mr-2" />
                          View Report
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No financial reports available</p>
                  </div>
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
                {news.length > 0 ? (
                  <div className="space-y-4">
                    {news.map((item) => (
                      <div key={item.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={getSentimentColor(item.sentiment)}>
                                {item.sentiment}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{item.source}</span>
                              <span className="text-sm text-muted-foreground">
                                {new Date(item.published_at).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className="font-medium mb-2">{item.title}</h4>
                            <p className="text-sm text-muted-foreground mb-3">{item.summary}</p>
                            <Button variant="outline" size="sm">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Read More
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Newspaper className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No news available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Analyst Ratings
                </CardTitle>
                <CardDescription>
                  Professional analyst recommendations and price targets
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analystSummary ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{analystSummary.buy}</div>
                        <div className="text-sm text-muted-foreground">Buy</div>
                      </div>
                      <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">{analystSummary.hold}</div>
                        <div className="text-sm text-muted-foreground">Hold</div>
                      </div>
                      <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{analystSummary.sell}</div>
                        <div className="text-sm text-muted-foreground">Sell</div>
                      </div>
                    </div>
                    {analystSummary.averagePriceTarget && (
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Average Price Target</p>
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(analystSummary.averagePriceTarget)}
                        </p>
                        <p className="text-sm text-green-600">
                          +{((analystSummary.averagePriceTarget - currentPrice) / currentPrice * 100).toFixed(1)}% from current price
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No analyst ratings available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Risk Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Market Risk</span>
                    <Badge variant="secondary">Medium</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Volatility</span>
                    <Badge variant="secondary">Low</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Liquidity</span>
                    <Badge variant="secondary">High</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Regulatory Risk</span>
                    <Badge variant="destructive">High</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
} 