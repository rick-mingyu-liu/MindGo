import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Plus,
  ArrowRight,
  Brain,
  BarChart3,
  LogOut,
  Sparkles,
  Info,
  RefreshCw,
  Eye,
  Edit,
  Settings as SettingsIcon,
  Star,
  Mail,
  CheckCircle2
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine } from 'recharts'
import { api, logout, investmentAPI } from '@/utils/api'
import { formatCurrency, formatCompactCurrency } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'react-hot-toast'
import { useTheme } from '@/contexts/ThemeContext'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import Swal from 'sweetalert2'
import { categories as categoryTypeMap } from './transactions/new';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

interface FinancialSummary {
  period: string
  totalIncome: number
  totalExpenses: number
  netIncome: number
  monthlyBreakdown: Array<{
    month: string
    income: number
    expenses: number
    netIncome: number
  }>
  categories: Record<string, {
    total: number
    count: number
    average: number
  }>
  transactions?: Array<{
    id: number
    description: string
    amount: number
    type: 'income' | 'expense'
    category: string
    date: string
    currency?: string
    convertedAmount?: number
    convertedCurrency?: string
  }>
  targetCurrency?: string
}

interface Goal {
  id: number
  name: string
  target_amount: number
  current_amount: number
  target_date: string
  description: string
  currency?: string
  convertedCurrentAmount?: number
  convertedTargetAmount?: number
  convertedCurrency?: string
}

interface WatchlistItem {
  id: number
  symbol: string
  company_name: string
  currentPrice: number
  change: number
  changePercent: number
}

// Colour follows the category, not its rank in the pie, so a slice keeps the same
// colour whether you're looking at the Overall, Spending or Income view.
const CATEGORY_COLORS: Record<string, string> = {
  // Expenses
  'Groceries': '#f59e0b',
  'Dining Out': '#e11d48',
  'Transportation': '#06b6d4',
  'Housing': '#3b82f6',
  'Utilities': '#ef4444',
  'Entertainment': '#8b5cf6',
  'Shopping': '#ec4899',
  'Healthcare': '#f97316',
  'Education': '#14b8a6',
  'Travel': '#6366f1',
  'Other Expenses': '#a16207',
  // Income
  'Salary': '#22c55e',
  'Freelance': '#a855f7',
  'Investment Returns': '#84cc16',
  'Business': '#0ea5e9',
  'Tax Refund': '#15803d',
  'Other Income': '#10b981',
}

const FALLBACK_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

// Unknown categories still need a stable colour, so derive it from the name.
const getCategoryColor = (name: string) => {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

type CategoryView = 'all' | 'expense' | 'income'

// The trend lines, their colours and their marker shapes in one place, so the
// chart and its legend can never drift apart.
const TREND_SERIES = [
  { key: 'income', label: 'Income', shape: 'circle', light: '#22c55e', dark: '#4ade80' },
  { key: 'expenses', label: 'Expenses', shape: 'square', light: '#ef4444', dark: '#f87171' },
  { key: 'net', label: 'Net', shape: 'triangle', light: '#3b82f6', dark: '#60a5fa' },
] as const

type TrendSeries = typeof TREND_SERIES[number]

// The shapes are a second, non-colour cue: green and red sit at OKLab ΔE 7.4 under
// deuteranopia, which is too close to carry identity on their own.
const renderMarker = (shape: TrendSeries['shape'], cx: number, cy: number, size: number, fill: string, ring: string) => {
  // The ring is drawn in the card's own colour, so crossing lines and stacked
  // points stay legible instead of merging into one blob.
  const paint = { fill, stroke: ring, strokeWidth: 2, style: { cursor: 'pointer' } }
  if (shape === 'square') {
    return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx={1} {...paint} />
  }
  if (shape === 'triangle') {
    const w = size * 1.15
    return <path d={`M ${cx} ${cy - w} L ${cx + w} ${cy + size * 0.9} L ${cx - w} ${cy + size * 0.9} Z`} {...paint} />
  }
  return <circle cx={cx} cy={cy} r={size} {...paint} />
}

const categoryChartCopy: Record<CategoryView, { title: string; description: string; empty: string }> = {
  all: {
    title: 'Category Breakdown',
    description: 'All income and expenses by category',
    empty: 'No transactions in this period yet',
  },
  expense: {
    title: 'Spending by Category',
    description: 'Breakdown of your expenses by category',
    empty: 'No expenses in this period yet',
  },
  income: {
    title: 'Income by Category',
    description: 'Breakdown of your income by category',
    empty: 'No income in this period yet',
  },
}

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

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}

export default function Dashboard() {
  const router = useRouter()
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isNewUser, setIsNewUser] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { resolvedTheme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false)
  const [indexRows, setIndexRows] = useState<any[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [indexError, setIndexError] = useState('');
  const [categoryView, setCategoryView] = useState<CategoryView>('all');
  const { t, i18n } = useTranslation('common');

  // Get user's default currency from localStorage (preferences)
  let defaultCurrency = 'CAD';
  if (typeof window !== 'undefined') {
    const prefs = localStorage.getItem('userPreferences');
    if (prefs) {
      try {
        defaultCurrency = JSON.parse(prefs).currency || 'CAD';
      } catch {}
    }
  }

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      const prefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      const currency = prefs.currency || 'CAD';
      const [summaryRes, goalsRes, watchlistRes, transactionsRes] = await Promise.all([
        api.get(`/summary/rolling?months=4&targetCurrency=${currency}`),
        api.get('/goals'),
        api.get('/investments/watchlist'),
        api.get(`/transactions?limit=10&targetCurrency=${currency}`)
      ])

      setSummary(summaryRes.data)
      setGoals(goalsRes.data.goals)
      setWatchlist(watchlistRes.data.watchlist)
      setTransactions(transactionsRes.data.transactions)

      // Check if this is a new user (has very little data or sample data)
      const hasVeryLittleData = summaryRes.data.transactions?.length <= 6 && 
                               goalsRes.data.goals.length <= 1 && 
                               watchlistRes.data.watchlist.length <= 3
      
      // Show welcome message for users with sample data or very little data
      setIsNewUser(hasVeryLittleData)

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchDashboardData()
    setRefreshing(false)
  }

  const handleSendReport = async () => {
    try {
      await api.post('/auth/test-email');
      Swal.fire({
        icon: 'success',
        title: t('Report Sent!'),
        text: t('Your financial report has been emailed to you. Check your inbox!'),
        confirmButtonColor: '#facc15',
      });
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to send financial report.'),
        confirmButtonColor: '#f87171',
      });
    }
  };

  // const handleClearData = async () => {
  //   if (confirm('This will clear all your data for testing purposes. Are you sure?')) {
  //     try {
  //       setRefreshing(true)
        
  //       // Clear all user data
  //       await Promise.all([
  //         api.delete('/transactions/clear-all'),
  //         api.delete('/goals/clear-all'),
  //         api.delete('/investments/watchlist/clear-all')
  //       ])
        
  //       // Refresh dashboard
  //       await fetchDashboardData()
  //       toast.success('Data cleared for testing')
  //     } catch (error) {
  //       console.error('Error clearing data:', error)
  //       toast.error('Failed to clear data')
  //     } finally {
  //       setRefreshing(false)
  //     }
  //   }
  // }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchDashboardData()
  }, [router, fetchDashboardData])

  useEffect(() => {
    const fetchIndices = async () => {
      setIndexLoading(true);
      setIndexError('');
      try {
        const results = await Promise.all(
          INDEX_CARDS.map(idx => investmentAPI.getStockSnapshot(idx.symbol))
        );
        setIndexRows(results.map((res, i) => ({
          ...INDEX_CARDS[i],
          quote: res.data.quote,
        })));
      } catch (err) {
        setIndexError('Failed to load index data');
        setIndexRows([]);
      } finally {
        setIndexLoading(false);
      }
    };
    fetchIndices();
  }, []);

  // Listen for navigation events to refresh data when returning to dashboard
  useEffect(() => {
    const handleRouteChange = () => {
      if (router.pathname === '/') {
        fetchDashboardData()
      }
    }

    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router, fetchDashboardData])

  const getCategoryChartData = (view: CategoryView = 'all') => {
    if (!summary?.categories) return [];
    return Object.entries(summary.categories)
      .map(([name, data]) => {
        // Determine type from categoryTypeMap
        let type: 'income' | 'expense' = 'expense';
        if (categoryTypeMap.income.includes(name)) type = 'income';
        else if (categoryTypeMap.expense.includes(name)) type = 'expense';
        return {
          name,
          value: data.total,
          type,
        };
      })
      .filter(entry => view === 'all' || entry.type === view)
      .sort((a, b) => b.value - a.value);
  }

  const categoryChartData = getCategoryChartData(categoryView)

  const getMonthlyChartData = () => {
    if (!summary?.monthlyBreakdown) return []
    
    return summary.monthlyBreakdown.map(item => {
      // Parse the month string (e.g., "2025-06") more reliably
      const [year, month] = item.month.split('-')
      const monthIndex = parseInt(month) - 1 // JavaScript months are 0-indexed
      const date = new Date(parseInt(year), monthIndex, 1)
      
      return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        income: item.income,
        expenses: item.expenses,
        net: item.netIncome
      }
    })
  }

  const monthlyChartData = getMonthlyChartData()
  const monthCount = Math.max(monthlyChartData.length, 1)
  const monthlyAverages = {
    income: monthlyChartData.reduce((sum, item) => sum + item.income, 0) / monthCount,
    expenses: monthlyChartData.reduce((sum, item) => sum + item.expenses, 0) / monthCount,
    net: monthlyChartData.reduce((sum, item) => sum + item.net, 0) / monthCount,
  }

  const displayCurrency = summary?.targetCurrency || defaultCurrency
  const seriesColor = (series: TrendSeries) => (resolvedTheme === 'dark' ? series.dark : series.light)

  // Custom tooltip for the line chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-4 rounded-lg shadow-lg">
          <p className="font-semibold text-foreground mb-2">{t(label)}</p>
          {payload.map((entry: any, index: number) => {
            const series = TREND_SERIES.find((s) => s.label === entry.name)
            return (
              <div key={index} className="flex items-center space-x-2 mb-1">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  {renderMarker(series?.shape ?? 'circle', 6, 6, 4, entry.color, 'transparent')}
                </svg>
                <span className="text-sm font-medium text-muted-foreground">
                  {t(entry.name)}:
                </span>
                <span className="text-sm font-bold" style={{ color: entry.color }}>
                  {formatCurrency(entry.value, displayCurrency)}
                </span>
              </div>
            )
          })}
        </div>
      )
    }
    return null
  }

  // Custom label renderer for pie chart
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value, type }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const labelRadius = outerRadius + 20;
    const labelX = cx + labelRadius * Math.cos(-midAngle * RADIAN);
    const labelY = cy + labelRadius * Math.sin(-midAngle * RADIAN);
    const textAnchor = x > cx ? 'start' : 'end';
    const dominantBaseline = y > cy ? 'auto' : 'middle';
    if (percent < 0.05) return null;
    const sign = type === 'income' ? '+' : '-';
    return (
      <g key={`label-${index}`}>
        <line x1={x} y1={y} x2={labelX} y2={labelY} stroke="hsl(var(--muted-foreground))" strokeWidth={1} opacity={0.6} />
        <text x={labelX} y={labelY} fill="hsl(var(--foreground))" textAnchor={textAnchor} dominantBaseline={dominantBaseline} fontSize={12} fontWeight={500}>{t(name)}</text>
        <text x={labelX} y={labelY + 15} fill="hsl(var(--muted-foreground))" textAnchor={textAnchor} dominantBaseline={dominantBaseline} fontSize={10}>
          {sign}{formatCurrency(value, summary?.targetCurrency || defaultCurrency)} ({(percent * 100).toFixed(1)}%)
        </text>
      </g>
    );
  };

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
        <title>Dashboard - MindGo</title>
        <meta name="description" content="Your personal finance dashboard" />
      </Head>

      <div className="min-h-screen bg-background relative">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold aurora-text">{t('MindGo')}</h1>
                <p className="text-muted-foreground">{t('Your financial overview')}</p>
              </div>
              {/* Desktop actions */}
              <div className="hidden sm:flex gap-2 flex-wrap">
                <ThemeToggle />
                <Button
                  variant="outline"
                  onClick={() => {
                    const nextLang = i18n.language === 'en' ? 'zh' : 'en';
                    i18n.changeLanguage(nextLang);
                    router.push(router.asPath, router.asPath, { locale: nextLang });
                  }}
                >
                  {i18n.language === 'en' ? '中文' : 'EN'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {t('Refresh')}
                </Button>
                <Button
                  onClick={() => router.push('/transactions/new')}
                  className="aurora-glow"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('Add Transaction')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/ai-planning')}
                >
                  <Brain className="w-4 h-4 mr-2" />
                  {t('AI Planning')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSendReport}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {t('Send Report')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/settings')}
                >
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  {t('Settings')}
                </Button>
              </div>
              {/* Mobile actions: FAB + menu */}
              <div className="sm:hidden flex items-center gap-2">
                <button
                  className="fixed bottom-6 right-6 z-50 flex sm:hidden items-center justify-center w-16 h-16 rounded-full bg-primary text-white shadow-lg fab-add-transaction"
                  onClick={() => router.push('/transactions/new')}
                  aria-label="Add Transaction"
                >
                  <Plus className="w-8 h-8" />
                </button>
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" className="ml-2">
                      <SettingsIcon className="w-6 h-6" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="p-6 flex flex-col gap-4">
                    <Button onClick={handleRefresh} disabled={refreshing}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                      {t('Refresh')}
                    </Button>
                    <Button onClick={() => router.push('/ai-planning')}>
                      <Brain className="w-4 h-4 mr-2" />
                      {t('AI Planning')}
                    </Button>
                    <Button onClick={handleSendReport}>
                      <Mail className="w-4 h-4 mr-2" />
                      {t('Send Report')}
                    </Button>
                    <Button onClick={() => router.push('/settings')}>
                      <SettingsIcon className="w-4 h-4 mr-2" />
                      {t('Settings')}
                    </Button>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-8">
          {/* Welcome Message for New Users */}
          {isNewUser && (
            <Card className="mb-8 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 transition-colors duration-200 hover:bg-blue-100 dark:hover:bg-blue-900/30">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-blue-900 dark:text-white mb-2">
                      {t('Welcome to MindGo! 🎉')}
                    </h3>
                    <p className="text-blue-800 dark:text-blue-200 mb-4">
                      {t("You've started your journey to financial freedom. Let's get you started with some basic steps:")}
                    </p>
                    <ul className="text-blue-800 dark:text-blue-200 space-y-1 mb-4">
                      <li>• <strong>{t('Add your own transactions')}</strong> {t('by clicking "Add Transaction"')}</li>
                      <li>• <strong>{t('Create savings goals')}</strong> {t('to track your financial targets')}</li>
                      <li>• <strong>{t('Get AI-powered financial advice')}</strong> {t('for personalized planning')}</li>
                      <li>• <strong>{t('Track your interested stocks')}</strong> {t('to see how they perform and financial reports')}</li>
                      <li>• <strong>{t('Receive your weekly financial report')}</strong> {t('to highlight your financial performance')}</li>
                      <li>• <strong>{t('Manage your settings')}</strong> {t('to customize your experience')}</li>
                    </ul>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <Button
                        size="sm"
                        onClick={() => router.push('/transactions/new')}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('Add Your First Transaction')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push('/goals')}
                      >
                        <Target className="w-4 h-4 mr-2" />
                        {t('Create a Goal')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push('/ai-planning')}
                      >
                        <Brain className="w-4 h-4 mr-2" />
                        {t('AI Planning')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push('/investments')}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {t('Add to Watchlist')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendReport}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {t('Send Report')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="overflow-x-auto scrollbar-hide -mx-2 pb-2 sm:mx-0 sm:pb-0">
            <div className="flex gap-4 min-w-[600px] sm:grid sm:grid-cols-4 lg:grid-cols-4 sm:gap-6 mb-8">
              {/* Total Income Card */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('Total Income')}</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summary?.totalIncome || 0, summary?.targetCurrency || defaultCurrency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('Last 4 months')}
                  </p>
                </CardContent>
              </Card>
              {/* Total Expenses Card */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('Total Expenses')}</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summary?.totalExpenses || 0, summary?.targetCurrency || defaultCurrency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('Last 4 months')}
                  </p>
                </CardContent>
              </Card>
              {/* Net Income Card */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('Net Income')}</CardTitle>
                  <DollarSign className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${(summary?.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(summary?.netIncome || 0, summary?.targetCurrency || defaultCurrency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('Last 4 months')}
                  </p>
                </CardContent>
              </Card>
              {/* Active Goals Card (shrunk) */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5 flex flex-col items-center justify-center text-center px-2">
                <CardHeader className="flex flex-col items-center justify-center space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {t('Active Goals')}
                    <Target className="h-4 w-4 text-orange-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold">{goals.length}</div>
                  <p className="text-xs text-muted-foreground">{t('Savings goals')}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Charts Section */}
          {summary && summary.monthlyBreakdown && summary.monthlyBreakdown.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Monthly Trend Chart */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {t('4-Month Income vs Expenses')}
                  </CardTitle>
                  <CardDescription>
                    {t('Track your financial trends over time')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Summary Statistics */}
                  <div className="grid grid-cols-3 gap-4 mb-8 p-4 bg-card rounded-lg shadow hover:shadow-md transition-shadow border border-border dark:shadow-white/10 dark:hover:shadow-white/20 relative z-0">
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">{t('Avg Income')}</p>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(monthlyAverages.income, displayCurrency)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">{t('Avg Expenses')}</p>
                      <p className="text-lg font-bold text-red-600">
                        {formatCurrency(monthlyAverages.expenses, displayCurrency)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">{t('Avg Net')}</p>
                      <p className={`text-lg font-bold ${monthlyAverages.net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(monthlyAverages.net, displayCurrency)}
                      </p>
                    </div>
                  </div>

                  <div className="h-80 relative z-10">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyChartData} margin={{ top: 16, right: 24, left: 8, bottom: 4 }} style={{ cursor: 'pointer' }}>
                        {/* Horizontal hairlines only — the month labels already mark the columns */}
                        <CartesianGrid
                          vertical={false}
                          stroke={resolvedTheme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'}
                          strokeWidth={1}
                        />
                        <XAxis
                          dataKey="month"
                          tickFormatter={(str) => {
                            return t(str.split(' ')[0]);
                          }}
                          tick={{
                            fill: resolvedTheme === 'dark' ? '#e5e7eb' : '#374151',
                            fontSize: 13,
                            fontWeight: 500
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickMargin={12}
                          /* Keeps the first and last markers clear of the plot edges */
                          padding={{ left: 24, right: 24 }}
                        />
                        <YAxis
                          tickFormatter={(value) => formatCompactCurrency(value, displayCurrency)}
                          tick={{
                            fill: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
                            fontSize: 11
                          }}
                          axisLine={false}
                          tickLine={false}
                          tickMargin={8}
                          width={56}
                        />
                        {/* Break-even, so a negative Net reads at a glance */}
                        <ReferenceLine
                          y={0}
                          stroke={resolvedTheme === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)'}
                          strokeWidth={1}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)', strokeWidth: 2 }} />
                        {TREND_SERIES.map((series) => (
                          <Line
                            key={series.key}
                            type="monotone"
                            dataKey={series.key}
                            stroke={seriesColor(series)}
                            strokeWidth={2.5}
                            name={series.label}
                            dot={(props: any) => (
                              <g key={`${series.key}-dot-${props.index}`}>
                                {renderMarker(series.shape, props.cx, props.cy, 4, seriesColor(series), 'hsl(var(--card))')}
                              </g>
                            )}
                            activeDot={(props: any) => (
                              <g key={`${series.key}-active-${props.index}`}>
                                {renderMarker(series.shape, props.cx, props.cy, 6, seriesColor(series), 'hsl(var(--card))')}
                              </g>
                            )}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Chart Legend — same colours and marker shapes as the lines */}
                  <div className="mt-4 flex justify-center">
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                      {TREND_SERIES.map((series) => (
                        <div key={series.key} className="flex items-center space-x-2">
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                            {renderMarker(series.shape, 6, 6, 4, seriesColor(series), 'transparent')}
                          </svg>
                          <span className="text-sm font-medium text-foreground">{t(series.label)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Category Breakdown */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{t(categoryChartCopy[categoryView].title)}</CardTitle>
                      <CardDescription>
                        {t(categoryChartCopy[categoryView].description)}
                      </CardDescription>
                    </div>
                    <Tabs value={categoryView} onValueChange={(value) => setCategoryView(value as CategoryView)}>
                      <TabsList>
                        <TabsTrigger value="all">{t('Overall')}</TabsTrigger>
                        <TabsTrigger value="expense">{t('Spending')}</TabsTrigger>
                        <TabsTrigger value="income">{t('Income')}</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent>
                  {categoryChartData.length > 0 ? (
                    <>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart style={{ cursor: 'pointer' }}>
                            <Pie
                              data={categoryChartData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={renderCustomLabel}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              style={{ cursor: 'pointer' }}
                            >
                              {categoryChartData.map((entry) => (
                                <Cell key={`cell-${entry.name}`} fill={getCategoryColor(entry.name)} style={{ cursor: 'pointer' }} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value, name) => [`${formatCurrency(value as number, summary?.targetCurrency || defaultCurrency)}`, t(typeof name === 'string' ? name : '')]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legend */}
                      <div className="mt-4">
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                          {categoryChartData.map((entry) => (
                            <div key={entry.name} className="flex items-center space-x-2 whitespace-normal">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getCategoryColor(entry.name) }}
                              />
                              <span className="text-foreground whitespace-normal">{t(entry.name)}</span>
                              <span className="text-muted-foreground ml-1">
                                {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.value, summary?.targetCurrency || defaultCurrency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-80 flex items-center justify-center text-center">
                      <p className="text-sm text-muted-foreground">
                        {t(categoryChartCopy[categoryView].empty)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="mb-8 transition-colors duration-200 hover:bg-muted/80 cursor-pointer dark:hover:bg-white/2.5">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{t('No Financial Data Yet')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('Start by adding your first transaction to see your financial overview')}
                  </p>
                  <Button onClick={() => router.push('/transactions/new')}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('Add Your First Transaction')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Goals and Watchlist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Savings Goals */}
            <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('Savings Goals')}</CardTitle>
                    <CardDescription>{t('Track your financial goals')}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/goals')}
                  >
                    {t('View All')}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {goals.length > 0 ? (
                  <div className="space-y-4">
                    {goals.slice(0, 3).map((goal) => {
                      const progress = (goal.current_amount / goal.target_amount) * 100;
                      return (
                        <div key={goal.id} className="p-3 border rounded-lg bg-background transition-shadow hover:shadow-md dark:hover:shadow-white/20 dark:hover:bg-white/5 dark:hover:border-white/20 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{goal.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(goal.convertedCurrentAmount ?? goal.current_amount, goal.convertedCurrency ?? goal.currency ?? summary?.targetCurrency ?? defaultCurrency)} / {formatCurrency(goal.convertedTargetAmount ?? goal.target_amount, goal.convertedCurrency ?? goal.currency ?? summary?.targetCurrency ?? defaultCurrency)}
                            </span>
                          </div>
                          <Progress value={progress} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {progress.toFixed(1)}% {t('complete')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground mb-4">{t('No savings goals yet')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push('/goals')}
                    >
                      {t('Create Your First Goal')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Investment Watchlist */}
            <Card className="transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('Investment Watchlist')}</CardTitle>
                    <CardDescription>{t('Track your favorite stocks')}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/investments')}
                  >
                    {t('View All')}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {indexLoading ? (
                  <div className="text-center py-6">{t('Loading...')}</div>
                ) : indexError ? (
                  <div className="text-center py-6 text-red-600">{indexError}</div>
                ) : (
                  <div className="space-y-3">
                    {indexRows.map((idx) => (
                      <div key={idx.symbol} className="flex items-center justify-between p-3 border rounded-lg bg-background transition-shadow hover:shadow-md dark:hover:shadow-white/20 dark:hover:bg-white/5 dark:hover:border-white/20">
                        <div>
                          <div className="font-medium">{t(idx.label)}</div>
                          <div className="text-sm text-muted-foreground">{t(idx.name)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {idx.quote?.c ? formatCurrency(
                              idx.quote.c,
                              (idx.symbol === '^GSPC' || idx.symbol === '^DJI' || idx.symbol === '^IXIC')
                                ? 'USD'
                                : (idx.quote?.currency || defaultCurrency)
                            ) : 'N/A'}
                          </div>
                          {typeof idx.quote?.dp === 'number' && (
                            <Badge variant={idx.quote.dp >= 0 ? 'default' : 'destructive'}>
                              {idx.quote.dp >= 0 ? '+' : ''}{idx.quote.dp.toFixed(2)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card className="mb-8 mt-8 transition-colors duration-200 hover:bg-muted/80 dark:hover:bg-white/2.5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('Recent Transactions')}</CardTitle>
                  <CardDescription>{t('Your latest financial activities')}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/transactions')}
                >
                  {t('View All')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {transactions.length > 0 ? (
                <div className="space-y-3">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg bg-background transition-shadow hover:shadow-md dark:hover:shadow-white/20 dark:hover:bg-white/5 dark:hover:border-white/20">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full ${transaction.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {t(transaction.category)} • {new Date(transaction.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <p className={`font-semibold ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.type === 'income' ? '+' : '-'}
                            {formatCurrency(
                              transaction.convertedAmount ?? transaction.amount,
                              transaction.convertedCurrency ?? transaction.currency ?? defaultCurrency
                            )}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {t(transaction.type)}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/transactions/edit/${transaction.id}`)}
                          className="h-6 w-6 p-0"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground mb-4">{t('No transactions yet')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/transactions/new')}
                  >
                    {t('Add Your First Transaction')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  )
} 