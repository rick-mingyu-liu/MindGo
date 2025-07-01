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
  Star
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { api, logout } from '@/utils/api'
import { formatCurrency } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { toast } from 'react-hot-toast'

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
  }>
}

interface Goal {
  id: number
  name: string
  target_amount: number
  current_amount: number
  target_date: string
  description: string
}

interface WatchlistItem {
  id: number
  symbol: string
  company_name: string
  currentPrice: number
  change: number
  changePercent: number
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4']

export default function Dashboard() {
  const router = useRouter()
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isNewUser, setIsNewUser] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      
      const [summaryRes, goalsRes, watchlistRes, transactionsRes] = await Promise.all([
        api.get('/summary/rolling?months=4'),
        api.get('/goals'),
        api.get('/investments/watchlist'),
        api.get('/transactions?limit=10')
      ])

      setSummary(summaryRes.data)
      setGoals(goalsRes.data.goals)
      setWatchlist(watchlistRes.data.watchlist)
      setTransactions(transactionsRes.data.transactions)

      // Check if this is a new user (has very little data or sample data)
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      const hasSampleData = summaryRes.data.transactions?.some((t: any) => 
        t.description.includes('Sample')
      )
      const hasVeryLittleData = summaryRes.data.transactions?.length <= 6 && 
                               goalsRes.data.goals.length <= 1 && 
                               watchlistRes.data.watchlist.length <= 3
      
      // Show welcome message for users with sample data or very little data
      setIsNewUser(hasSampleData || hasVeryLittleData)

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

  const handleClearData = async () => {
    if (confirm('This will clear all your data for testing purposes. Are you sure?')) {
      try {
        setRefreshing(true)
        
        // Clear all user data
        await Promise.all([
          api.delete('/transactions/clear-all'),
          api.delete('/goals/clear-all'),
          api.delete('/investments/watchlist/clear-all')
        ])
        
        // Refresh dashboard
        await fetchDashboardData()
        toast.success('Data cleared for testing')
      } catch (error) {
        console.error('Error clearing data:', error)
        toast.error('Failed to clear data')
      } finally {
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchDashboardData()
  }, [router, fetchDashboardData])

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

  const getCategoryChartData = () => {
    if (!summary?.categories) return []
    
    return Object.entries(summary.categories)
      .map(([name, data]) => ({
        name,
        value: data.total
      }))
      .sort((a, b) => b.value - a.value) // Sort by value descending
  }

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

  // Custom tooltip for the line chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-4 rounded-lg shadow-lg">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm font-medium text-muted-foreground">
                {entry.name}:
              </span>
              <span className="text-sm font-bold" style={{ color: entry.color }}>
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  // Custom axis tick for better formatting
  const CustomAxisTick = ({ x, y, payload }: any) => {
    return (
      <g transform={`translate(${x},${y})`}>
        <text 
          x={0} 
          y={0} 
          dy={16} 
          textAnchor="middle" 
          fill="hsl(var(--muted-foreground))"
          fontSize={12}
          fontWeight={500}
        >
          {payload.value}
        </text>
      </g>
    )
  }

  // Custom Y-axis tick for currency formatting
  const CustomYTick = ({ x, y, payload }: any) => {
    return (
      <g transform={`translate(${x},${y})`}>
        <text 
          x={0} 
          y={0} 
          dy={4} 
          textAnchor="end" 
          fill="hsl(var(--muted-foreground))"
          fontSize={11}
        >
          {formatCurrency(payload.value)}
        </text>
      </g>
    )
  }

  // Custom label renderer for pie chart
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value }: any) => {
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    
    // Calculate label position outside the pie
    const labelRadius = outerRadius + 20
    const labelX = cx + labelRadius * Math.cos(-midAngle * RADIAN)
    const labelY = cy + labelRadius * Math.sin(-midAngle * RADIAN)
    
    // Determine text anchor based on angle
    const textAnchor = x > cx ? 'start' : 'end'
    const dominantBaseline = y > cy ? 'auto' : 'middle'
    
    // Only show labels for segments > 5%
    if (percent < 0.05) return null
    
    return (
      <g key={`label-${index}`}>
        {/* Line from pie to label */}
        <line
          x1={x}
          y1={y}
          x2={labelX}
          y2={labelY}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1}
          opacity={0.6}
        />
        {/* Label */}
        <text
          x={labelX}
          y={labelY}
          fill="hsl(var(--foreground))"
          textAnchor={textAnchor}
          dominantBaseline={dominantBaseline}
          fontSize={12}
          fontWeight={500}
        >
          {name}
        </text>
        {/* Percentage */}
        <text
          x={labelX}
          y={labelY + 15}
          fill="hsl(var(--muted-foreground))"
          textAnchor={textAnchor}
          dominantBaseline={dominantBaseline}
          fontSize={10}
        >
          {formatCurrency(value)} ({(percent * 100).toFixed(1)}%)
        </text>
      </g>
    )
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
        <title>Dashboard - MindGo</title>
        <meta name="description" content="Your personal finance dashboard" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold aurora-text">MindGo</h1>
                <p className="text-muted-foreground">Your financial overview</p>
              </div>
              <div className="flex gap-2">
                <ThemeToggle />
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/ai-planning')}
                >
                  <Brain className="w-4 h-4 mr-2" />
                  AI Planning
                </Button>
                <Button
                  onClick={() => router.push('/transactions/new')}
                  className="aurora-glow"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Transaction
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/settings')}
                >
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Message for New Users */}
          {isNewUser && (
            <Card className="mb-8 border-blue-200 bg-blue-50 transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">
                      Welcome to Personal Finance App! 🎉
                    </h3>
                    <p className="text-blue-800 mb-4">
                      We've created some sample data to help you get started. You can:
                    </p>
                    <ul className="text-blue-800 space-y-1 mb-4">
                      <li>• <strong>Add your own transactions</strong> by clicking "Add Transaction"</li>
                      <li>• <strong>Create savings goals</strong> to track your financial targets</li>
                      <li>• <strong>Get AI-powered financial advice</strong> for personalized planning</li>
                    </ul>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => router.push('/transactions/new')}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Transaction
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push('/goals')}
                      >
                        <Target className="w-4 h-4 mr-2" />
                        Create a Goal
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.totalIncome || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 4 months
                </p>
              </CardContent>
            </Card>

            <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.totalExpenses || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 4 months
                </p>
              </CardContent>
            </Card>

            <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Income</CardTitle>
                <DollarSign className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${(summary?.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(summary?.netIncome || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 4 months
                </p>
              </CardContent>
            </Card>

            <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Goals</CardTitle>
                <Target className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{goals.length}</div>
                <p className="text-xs text-muted-foreground">
                  Savings goals
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          {summary && summary.monthlyBreakdown && summary.monthlyBreakdown.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Monthly Trend Chart */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    4-Month Income vs Expenses
                  </CardTitle>
                  <CardDescription>
                    Track your financial trends over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Summary Statistics */}
                  <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-muted rounded-lg">
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">Avg Income</p>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(getMonthlyChartData().reduce((sum, item) => sum + item.income, 0) / Math.max(getMonthlyChartData().length, 1))}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">Avg Expenses</p>
                      <p className="text-lg font-bold text-red-600">
                        {formatCurrency(getMonthlyChartData().reduce((sum, item) => sum + item.expenses, 0) / Math.max(getMonthlyChartData().length, 1))}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">Avg Net</p>
                      <p className={`text-lg font-bold ${getMonthlyChartData().reduce((sum, item) => sum + item.net, 0) / Math.max(getMonthlyChartData().length, 1) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(getMonthlyChartData().reduce((sum, item) => sum + item.net, 0) / Math.max(getMonthlyChartData().length, 1))}
                      </p>
                    </div>
                  </div>

                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMonthlyChartData()}>
                        <defs>
                          <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="hsl(var(--border))" 
                          strokeWidth={1}
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="month"
                          tickFormatter={(str) => {
                            return str.split(' ')[0]
                          }}
                          tick={CustomAxisTick}
                          axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={CustomYTick}
                          axisLine={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                          tickLine={false}
                          tickMargin={10}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line 
                          type="monotone" 
                          dataKey="income" 
                          stroke="#22c55e" 
                          strokeWidth={3} 
                          name="Income"
                          dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: '#22c55e', strokeWidth: 2 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="expenses" 
                          stroke="#ef4444" 
                          strokeWidth={3} 
                          name="Expenses"
                          dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="net" 
                          stroke="#3b82f6" 
                          strokeWidth={3} 
                          name="Net"
                          dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Chart Legend */}
                  <div className="mt-4 flex justify-center">
                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span className="text-sm font-medium text-foreground">Income</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span className="text-sm font-medium text-foreground">Expenses</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-sm font-medium text-foreground">Net</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Category Breakdown */}
              <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
                <CardHeader>
                  <CardTitle>Spending by Category</CardTitle>
                  <CardDescription>
                    Breakdown of your expenses by category
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getCategoryChartData()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={renderCustomLabel}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {getCategoryChartData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Legend */}
                  {getCategoryChartData().length > 0 && (
                    <div className="mt-4">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {getCategoryChartData().map((entry, index) => (
                          <div key={entry.name} className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="truncate text-foreground">{entry.name}</span>
                            <span className="text-muted-foreground ml-auto">
                              {formatCurrency(entry.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="mb-8 transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Financial Data Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Start by adding your first transaction to see your financial overview
                  </p>
                  <Button onClick={() => router.push('/transactions/new')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Transaction
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Goals and Watchlist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Savings Goals */}
            <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Savings Goals</CardTitle>
                    <CardDescription>Track your financial goals</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/goals')}
                  >
                    View All
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
                        <div key={goal.id} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{goal.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                            </span>
                          </div>
                          <Progress value={progress} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {progress.toFixed(1)}% complete
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground mb-4">No savings goals yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push('/goals')}
                    >
                      Create Your First Goal
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Investment Watchlist */}
            <Card className="transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Investment Watchlist</CardTitle>
                    <CardDescription>Track your favorite stocks</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/investments')}
                  >
                    View All
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {watchlist.length > 0 ? (
                  <div className="space-y-3">
                    {watchlist.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{item.symbol}</div>
                          <div className="text-sm text-muted-foreground">{item.company_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {item.currentPrice ? formatCurrency(item.currentPrice) : 'N/A'}
                          </div>
                          {item.changePercent !== null && (
                            <Badge variant={item.changePercent >= 0 ? 'default' : 'destructive'}>
                              {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground mb-4">No stocks in watchlist</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card className="mb-8 mt-8 transition-colors duration-200 hover:bg-muted/80 cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Transactions</CardTitle>
                  <CardDescription>Your latest financial activities</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/transactions')}
                >
                  View All
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {transactions.length > 0 ? (
                <div className="space-y-3">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full ${transaction.type === 'income' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {transaction.category} • {new Date(transaction.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="text-right">
                          <p className={`font-semibold ${transaction.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                          </p>
                          <Badge variant="secondary" className="text-xs">
                            {transaction.type}
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
                  <p className="text-muted-foreground mb-4">No transactions yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/transactions/new')}
                  >
                    Add Your First Transaction
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