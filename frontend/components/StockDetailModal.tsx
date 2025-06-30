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

interface StockDetailModalProps {
  symbol: string
  companyName: string
  currentPrice: number
  change: number
  changePercent: number
  children: React.ReactNode
}

interface FinancialMetrics {
  marketCap: number
  peRatio: number
  dividendYield: number
  beta: number
  volume: number
  avgVolume: number
  dayRange: string
  yearRange: string
}

interface CompanyInfo {
  sector: string
  industry: string
  employees: number
  website: string
  description: string
}

interface NewsItem {
  id: string
  title: string
  summary: string
  url: string
  publishedAt: string
  source: string
  sentiment: 'positive' | 'negative' | 'neutral'
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
  const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics | null>(null)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [activeTab, setActiveTab] = useState('overview')

  // Mock data - in real implementation, this would come from API
  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      // Simulate API call
      setTimeout(() => {
        setFinancialMetrics({
          marketCap: 2500000000000, // $2.5T
          peRatio: 28.5,
          dividendYield: 0.65,
          beta: 1.2,
          volume: 45000000,
          avgVolume: 52000000,
          dayRange: '$175.50 - $178.20',
          yearRange: '$124.17 - $198.23'
        })
        
        setCompanyInfo({
          sector: 'Technology',
          industry: 'Software & IT Services',
          employees: 164000,
          website: 'https://www.apple.com',
          description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. The company offers iPhone, Mac, iPad, and wearables, home, and accessories.'
        })
        
        setNews([
          {
            id: '1',
            title: 'Apple Reports Record Q4 Earnings',
            summary: 'Apple Inc. announced record-breaking fourth quarter earnings, driven by strong iPhone sales and services revenue growth.',
            url: '#',
            publishedAt: '2024-01-15T10:30:00Z',
            source: 'Financial Times',
            sentiment: 'positive'
          },
          {
            id: '2',
            title: 'New iPhone Model Expected in September',
            summary: 'Analysts predict Apple will launch its next iPhone model in September with significant camera improvements.',
            url: '#',
            publishedAt: '2024-01-14T15:45:00Z',
            source: 'Bloomberg',
            sentiment: 'positive'
          },
          {
            id: '3',
            title: 'Apple Faces Regulatory Challenges in EU',
            summary: 'European regulators are investigating Apple\'s App Store practices, potentially leading to new regulations.',
            url: '#',
            publishedAt: '2024-01-13T09:15:00Z',
            source: 'Reuters',
            sentiment: 'negative'
          }
        ])
        setLoading(false)
      }, 1000)
    }
  }, [isOpen])

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
                        <p className="text-lg font-bold">{financialMetrics?.marketCap ? formatCurrency(financialMetrics.marketCap) : 'N/A'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">P/E Ratio</p>
                        <p className="text-lg font-bold">{financialMetrics?.peRatio?.toFixed(2) || 'N/A'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Dividend Yield</p>
                        <p className="text-lg font-bold">{financialMetrics?.dividendYield ? `${financialMetrics.dividendYield.toFixed(2)}%` : 'N/A'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Beta</p>
                        <p className="text-lg font-bold">{financialMetrics?.beta?.toFixed(2) || 'N/A'}</p>
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
                        <p className="font-medium">{companyInfo?.sector || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{companyInfo?.industry || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Employees</p>
                        <p className="font-medium">{companyInfo?.employees ? companyInfo.employees.toLocaleString() : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Website</p>
                        <a 
                          href={companyInfo?.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline flex items-center gap-1"
                        >
                          Visit Website <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Description</p>
                      <p className="text-sm leading-relaxed">{companyInfo?.description || 'No description available.'}</p>
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
                        <p className="font-medium">{financialMetrics?.volume ? financialMetrics.volume.toLocaleString() : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Volume</p>
                        <p className="font-medium">{financialMetrics?.avgVolume ? financialMetrics.avgVolume.toLocaleString() : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Day Range</p>
                        <p className="font-medium">{financialMetrics?.dayRange || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">52 Week Range</p>
                        <p className="font-medium">{financialMetrics?.yearRange || 'N/A'}</p>
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Q4 2023 Earnings Report</h4>
                      <p className="text-sm text-muted-foreground">Released January 15, 2024</p>
                    </div>
                    <Button variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-2" />
                      View Report
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Annual Report 2023</h4>
                      <p className="text-sm text-muted-foreground">Released December 31, 2023</p>
                    </div>
                    <Button variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-2" />
                      View Report
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Q3 2023 Earnings Report</h4>
                      <p className="text-sm text-muted-foreground">Released October 15, 2023</p>
                    </div>
                    <Button variant="outline" size="sm">
                      <FileText className="w-4 h-4 mr-2" />
                      View Report
                    </Button>
                  </div>
                </div>
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
                              {new Date(item.publishedAt).toLocaleDateString()}
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
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">15</div>
                      <div className="text-sm text-muted-foreground">Buy</div>
                    </div>
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">8</div>
                      <div className="text-sm text-muted-foreground">Hold</div>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">2</div>
                      <div className="text-sm text-muted-foreground">Sell</div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Average Price Target</p>
                    <p className="text-2xl font-bold text-primary">$195.50</p>
                    <p className="text-sm text-green-600">+12.5% from current price</p>
                  </div>
                </div>
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