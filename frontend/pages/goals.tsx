import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Plus, Target, Calendar, DollarSign, Edit, Trash2, LogOut } from 'lucide-react'
import { api, logout } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface Goal {
  id: number
  name: string
  target_amount: number
  current_amount: number
  target_date: string
  description: string
}

interface GoalForm {
  name: string
  target_amount: string
  current_amount: string
  target_date: string
  description: string
}

export default function Goals() {
  const router = useRouter()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GoalForm>()

  useEffect(() => {
    fetchGoals()
  }, [])

  const fetchGoals = async () => {
    try {
      setLoading(true)
      const response = await api.get('/goals')
      setGoals(response.data.goals)
    } catch (error) {
      console.error('Error fetching goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: GoalForm) => {
    try {
      if (editingGoal) {
        await api.put(`/goals/${editingGoal.id}`, {
          ...data,
          target_amount: parseFloat(data.target_amount),
          current_amount: parseFloat(data.current_amount),
        })
        toast.success('Goal updated successfully!')
      } else {
        await api.post('/goals', {
          ...data,
          target_amount: parseFloat(data.target_amount),
          current_amount: parseFloat(data.current_amount),
        })
        toast.success('Goal created successfully!')
      }
      
      setIsDialogOpen(false)
      reset()
      setEditingGoal(null)
      fetchGoals()
      
    } catch (error) {
      console.error('Goal error:', error)
    }
  }

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal)
    reset({
      name: goal.name,
      target_amount: goal.target_amount.toString(),
      current_amount: goal.current_amount.toString(),
      target_date: goal.target_date,
      description: goal.description,
    })
    setIsDialogOpen(true)
  }

  const handleDelete = async (goalId: number) => {
    if (confirm('Are you sure you want to delete this goal?')) {
      try {
        await api.delete(`/goals/${goalId}`)
        toast.success('Goal deleted successfully!')
        fetchGoals()
      } catch (error) {
        console.error('Error deleting goal:', error)
      }
    }
  }

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-green-500'
    if (progress >= 75) return 'bg-blue-500'
    if (progress >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
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
        <title>Savings Goals - Personal Finance App</title>
        <meta name="description" content="Manage your savings goals" />
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
                  <h1 className="text-3xl font-bold">Savings Goals</h1>
                  <p className="text-muted-foreground">Track and manage your financial goals</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Goal
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>
                        {editingGoal ? 'Edit Goal' : 'Create New Goal'}
                      </DialogTitle>
                      <DialogDescription>
                        Set up a new savings goal with target amount and timeline
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Goal Name</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Emergency Fund, House Down Payment"
                          {...register('name', {
                            required: 'Goal name is required',
                          })}
                        />
                        {errors.name && (
                          <p className="text-sm text-destructive">{errors.name.message}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="target_amount">Target Amount ($)</Label>
                          <Input
                            id="target_amount"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...register('target_amount', {
                              required: 'Target amount is required',
                              min: {
                                value: 0.01,
                                message: 'Target amount must be greater than 0',
                              },
                            })}
                          />
                          {errors.target_amount && (
                            <p className="text-sm text-destructive">{errors.target_amount.message}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="current_amount">Current Amount ($)</Label>
                          <Input
                            id="current_amount"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...register('current_amount', {
                              required: 'Current amount is required',
                              min: {
                                value: 0,
                                message: 'Current amount cannot be negative',
                              },
                            })}
                          />
                          {errors.current_amount && (
                            <p className="text-sm text-destructive">{errors.current_amount.message}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="target_date">Target Date</Label>
                        <Input
                          id="target_date"
                          type="date"
                          {...register('target_date', {
                            required: 'Target date is required',
                          })}
                        />
                        {errors.target_date && (
                          <p className="text-sm text-destructive">{errors.target_date.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description (optional)</Label>
                        <Textarea
                          id="description"
                          placeholder="Additional details about your goal..."
                          {...register('description')}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsDialogOpen(false)
                            reset()
                            setEditingGoal(null)
                          }}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                          {editingGoal ? 'Update Goal' : 'Create Goal'}
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
          {goals.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No savings goals yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first savings goal to start tracking your progress
                </p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Goal
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map((goal) => {
                const progress = (goal.current_amount / goal.target_amount) * 100
                const daysRemaining = Math.ceil(
                  (new Date(goal.target_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                )
                
                return (
                  <Card key={goal.id} className="relative">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{goal.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {goal.description || 'No description provided'}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(goal)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(goal.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{progress.toFixed(1)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Current</p>
                          <p className="font-medium text-green-600">
                            {formatCurrency(goal.current_amount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Target</p>
                          <p className="font-medium">
                            {formatCurrency(goal.target_amount)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {new Date(goal.target_date).toLocaleDateString()}
                          </span>
                        </div>
                        <Badge variant={daysRemaining < 0 ? "destructive" : daysRemaining < 30 ? "default" : "secondary"}>
                          {daysRemaining < 0 ? 'Overdue' : `${daysRemaining} days left`}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </>
  )
} 