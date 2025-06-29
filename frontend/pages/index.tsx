import { useState, useEffect } from 'react'
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
  BarChart3
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { api } from '@/utils/api'
import { formatCurrency } from '@/utils/formatters'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    fetchDashboardData()
  }, [router])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      const [summaryRes, goalsRes, watchlistRes] = await Promise.all([
        api.get('/summary/rolling?months=4'),
        api.get('/goals'),
        api.get('/investments/watchlist')
      ])

      setSummary(summaryRes.data)
      setGoals(goalsRes.data.goals)
      setWatchlist(watchlistRes.data.watchlist)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getCategoryChartData = () => {
    if (!summary?.categories) return []
    
    return Object.entries(summary.categories).map(([name, data]) => ({
      name,
      value: data.total
    }))
  }

  const getMonthlyChartData = () => {
    if (!summary?.monthlyBreakdown) return []
    
    return summary.monthlyBreakdown.map(item => ({
      month: new Date(item.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
      income: item.income,
      expenses: item.expenses,
      net: item.netIncome
    }))
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
        <title>Dashboard - Personal Finance App</title>
        <meta name="description" content="Your personal finance dashboard" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Your financial overview</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/ai-planning')}
                >
                  <Brain className="w-4 h-4 mr-2" />
                  AI Planning
                </Button>
                <Button
                  onClick={() => router.push('/transactions/new')}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Transaction
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Income</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(summary?.totalIncome || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 4 months
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(summary?.totalExpenses || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 4 months
                </p>
              </CardContent>
            </Card>

            <Card>
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

            <Card>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Monthly Trend Chart */}
            <Card>
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
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={getMonthlyChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(value as number)} />
                      <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} name="Income" />
                      <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" />
                      <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} name="Net" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
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
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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
              </CardContent>
            </Card>
          </div>

          {/* Goals and Watchlist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Savings Goals */}
            <Card>
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
                    View All <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {goals.length === 0 ? (
                  <div className="text-center py-8">
                    <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No savings goals yet. Create your first goal!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {goals.slice(0, 3).map((goal) => {
                      const progress = (goal.current_amount / goal.target_amount) * 100
                      return (
                        <div key={goal.id} className="space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{goal.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {progress.toFixed(1)}%
                            </Badge>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Watchlist */}
            <Card>
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
                    View All <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {watchlist.length === 0 ? (
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No stocks in watchlist. Add some stocks to track!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {watchlist.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{item.symbol}</p>
                          <p className="text-sm text-muted-foreground">{item.company_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {item.currentPrice ? formatCurrency(item.currentPrice) : 'N/A'}
                          </p>
                          {item.changePercent && (
                            <Badge variant={item.changePercent >= 0 ? "default" : "destructive"}>
                              {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
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
        </main>
      </div>
    </>
  )
} 