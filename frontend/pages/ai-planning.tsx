import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { Brain, ArrowLeft, Send, Sparkles, LogOut } from 'lucide-react'
import { api, logout, goalAPI } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ReactMarkdown from 'react-markdown'
import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface PlanningForm {
  financialGoal: string
  currentIncome: string
  currentExpenses: string
  timeline: string
  additionalContext: string
}

interface PlanningResponse {
  analysis: string
  recommendations: string[]
  actionPlan: string[]
  estimatedTimeline: string
  riskFactors: string[]
  plan?: {
    id: number
  }
}

// Helper to extract stock tickers from AI analysis
function extractTickers(text: string): string[] {
  // Simple regex for US stock tickers (all caps, 1-5 letters, not at start of line)
  const matches = text.match(/\b[A-Z]{1,5}\b/g)
  if (!matches) return []
  // Filter out common English words and duplicates
  const blacklist = ['AND', 'THE', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'YOUR', 'WILL', 'HAVE', 'ARE', 'NOT', 'BUT', 'CAN', 'HAS', 'ALL', 'YOU', 'ONE', 'TWO', 'FIVE', 'YEAR', 'YEARS', 'WEEK', 'WEEKS', 'SAVE', 'PLAN', 'RISK', 'HIGH', 'LOW', 'ETF', 'BOND', 'CASH', 'STOCK', 'GOAL', 'BUY', 'SELL', 'HOLD', 'USD']
  return Array.from(new Set(matches.filter(t => !blacklist.includes(t))))
}

export default function AIPlanning() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [planningResponse, setPlanningResponse] = useState<PlanningResponse | null>(null)
  const [showMoveGoal, setShowMoveGoal] = useState(false)
  const [moveGoalName, setMoveGoalName] = useState('')
  const [moveGoalAmount, setMoveGoalAmount] = useState('')
  const [moveGoalDate, setMoveGoalDate] = useState('')
  const [moveGoalLoading, setMoveGoalLoading] = useState(false)
  const [planningPrefs, setPlanningPrefs] = useState<{ riskTolerance: string, lifeStage: string, investmentExperience: string } | null>(null)
  const [editingPrefs, setEditingPrefs] = useState(false)
  const [prefsDraft, setPrefsDraft] = useState<{ riskTolerance: string, lifeStage: string, investmentExperience: string } | null>(null)
  const [savingPrefs, setSavingPrefs] = useState(false)
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlanningForm>()

  const {
    register: registerMoveGoal,
    handleSubmit: handleSubmitMoveGoal,
    reset: resetMoveGoal,
    formState: { errors: moveGoalErrors },
    setValue: setMoveGoalValue,
  } = useForm({
    defaultValues: {
      name: moveGoalName,
      target_amount: moveGoalAmount,
      current_amount: '0',
      target_date: moveGoalDate,
      description: planningResponse?.analysis || '',
    },
  })

  useEffect(() => {
    const saved = localStorage.getItem('planningPrefs')
    if (saved) setPlanningPrefs(JSON.parse(saved))
  }, [])

  useEffect(() => {
    if (showMoveGoal) {
      setMoveGoalValue('name', moveGoalName);
      setMoveGoalValue('target_amount', moveGoalAmount);
      setMoveGoalValue('current_amount', '0');
      setMoveGoalValue('target_date', moveGoalDate);
      setMoveGoalValue('description', planningResponse?.analysis || '');
    }
    // eslint-disable-next-line
  }, [showMoveGoal]);

  const onSubmit = async (data: PlanningForm) => {
    try {
      setLoading(true)
      setPlanningResponse(null)
      const planningPrefs = JSON.parse(localStorage.getItem('planningPrefs') || '{}')
      const response = await api.post('/ai/plan', {
        ...data,
        currentIncome: parseFloat(data.currentIncome),
        currentExpenses: parseFloat(data.currentExpenses),
        riskTolerance: planningPrefs.riskTolerance,
        lifeStage: planningPrefs.lifeStage,
        investmentExperience: planningPrefs.investmentExperience,
      })
      setPlanningResponse(response.data)
      toast.success('AI analysis completed!')
    } catch (error) {
      console.error('AI planning error:', error)
      // Error handling is done in api interceptor
    } finally {
      setLoading(false)
    }
  }

  const handleQuickPrompt = (prompt: string) => {
    setValue('financialGoal', prompt)
  }

  const onMoveGoalSubmit = async (data: any) => {
    setMoveGoalLoading(true);
    try {
      const aiPlanId = planningResponse?.plan?.id;
      if (!aiPlanId) {
        toast.error('AI plan ID not found. Please try again.');
        setMoveGoalLoading(false);
        return;
      }
      await goalAPI.createFromAIPlan({
        aiPlanId,
        name: data.name,
        target_amount: parseFloat(data.target_amount),
        target_date: data.target_date,
        description: data.description,
      });
      toast.success('Goal moved to active goals!');
      setShowMoveGoal(false);
      resetMoveGoal();
    } catch (err) {
      // Error handled by API interceptor
    } finally {
      setMoveGoalLoading(false);
    }
  };

  const handleEditPrefs = () => {
    setPrefsDraft(planningPrefs)
    setEditingPrefs(true)
  }
  const handleCancelPrefs = () => {
    setEditingPrefs(false)
  }
  const handleSavePrefs = () => {
    if (!prefsDraft) return
    setSavingPrefs(true)
    localStorage.setItem('planningPrefs', JSON.stringify(prefsDraft))
    setPlanningPrefs(prefsDraft)
    setEditingPrefs(false)
    setSavingPrefs(false)
    toast.success('Preferences updated!')
  }

  return (
    <>
      <Head>
        <title>AI Financial Planning - Personal Finance App</title>
        <meta name="description" content="Get AI-powered financial planning advice" />
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
                  <h1 className="text-3xl font-bold">AI Financial Planning</h1>
                  <p className="text-muted-foreground">Get personalized financial advice powered by AI</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Planning Form */}
            <div className="space-y-6">
              {planningPrefs && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Your Financial Planning Preferences</CardTitle>
                    <CardDescription>
                      These preferences are used to personalize your AI financial planning and investment suggestions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {editingPrefs && prefsDraft ? (
                      <div className="flex flex-col gap-4">
                        <div>
                          <Label>Risk Tolerance</Label>
                          <Select value={prefsDraft.riskTolerance} onValueChange={v => setPrefsDraft(p => p ? { ...p, riskTolerance: v } : p)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="moderate">Moderate</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Life Stage</Label>
                          <Select value={prefsDraft.lifeStage} onValueChange={v => setPrefsDraft(p => p ? { ...p, lifeStage: v } : p)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="student">Student</SelectItem>
                              <SelectItem value="worker">Worker</SelectItem>
                              <SelectItem value="retired">Retired</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Investment Experience</Label>
                          <Select value={prefsDraft.investmentExperience} onValueChange={v => setPrefsDraft(p => p ? { ...p, investmentExperience: v } : p)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="beginner">Beginner</SelectItem>
                              <SelectItem value="intermediate">Intermediate</SelectItem>
                              <SelectItem value="advanced">Advanced</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button onClick={handleSavePrefs} disabled={savingPrefs}>{savingPrefs ? 'Saving...' : 'Save'}</Button>
                          <Button variant="outline" onClick={handleCancelPrefs} disabled={savingPrefs}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div><b>Risk Tolerance:</b> {planningPrefs.riskTolerance.charAt(0).toUpperCase() + planningPrefs.riskTolerance.slice(1)}</div>
                        <div><b>Life Stage:</b> {planningPrefs.lifeStage.charAt(0).toUpperCase() + planningPrefs.lifeStage.slice(1)}</div>
                        <div><b>Investment Experience:</b> {planningPrefs.investmentExperience.charAt(0).toUpperCase() + planningPrefs.investmentExperience.slice(1)}</div>
                        <div className="flex justify-end mt-2">
                          <Button size="sm" variant="outline" onClick={handleEditPrefs}>Edit</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Financial Planning Request
                  </CardTitle>
                  <CardDescription>
                    Describe your financial situation and goals to get personalized AI advice
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
                    <div className="space-y-2">
                      <Label htmlFor="financialGoal">What's your main financial goal?</Label>
                      <Textarea
                        id="financialGoal"
                        placeholder="e.g., Save $50,000 for a down payment on a house in 3 years"
                        className="min-h-[80px]"
                        {...register('financialGoal', {
                          required: 'Financial goal is required',
                          minLength: {
                            value: 10,
                            message: 'Please provide more details about your goal',
                          },
                        })}
                      />
                      {errors.financialGoal && (
                        <p className="text-sm text-destructive">{errors.financialGoal.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentIncome">Monthly Income ($)</Label>
                        <Input
                          id="currentIncome"
                          type="number"
                          placeholder="5000"
                          {...register('currentIncome', {
                            required: 'Current income is required',
                            min: {
                              value: 0,
                              message: 'Income must be positive',
                            },
                          })}
                        />
                        {errors.currentIncome && (
                          <p className="text-sm text-destructive">{errors.currentIncome.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="currentExpenses">Monthly Expenses ($)</Label>
                        <Input
                          id="currentExpenses"
                          type="number"
                          placeholder="3000"
                          {...register('currentExpenses', {
                            required: 'Current expenses are required',
                            min: {
                              value: 0,
                              message: 'Expenses must be positive',
                            },
                          })}
                        />
                        {errors.currentExpenses && (
                          <p className="text-sm text-destructive">{errors.currentExpenses.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timeline">Timeline for achieving your goal</Label>
                      <Select onValueChange={(value) => setValue('timeline', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timeline" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6 months">6 months</SelectItem>
                          <SelectItem value="1 year">1 year</SelectItem>
                          <SelectItem value="2 years">2 years</SelectItem>
                          <SelectItem value="3 years">3 years</SelectItem>
                          <SelectItem value="5 years">5 years</SelectItem>
                          <SelectItem value="10+ years">10+ years</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.timeline && (
                        <p className="text-sm text-destructive">{errors.timeline.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="additionalContext">Additional context (optional)</Label>
                      <Textarea
                        id="additionalContext"
                        placeholder="Any additional information about your financial situation, constraints, or preferences..."
                        className="min-h-[100px]"
                        {...register('additionalContext')}
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Get AI Analysis
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Quick Prompts */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Quick Prompts
                  </CardTitle>
                  <CardDescription>
                    Click on a prompt to quickly fill in your financial goal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      "I want to save $20,000 for an emergency fund within 1 year",
                      "Help me plan to buy a $300,000 house with a 20% down payment in 5 years",
                      "I need to pay off $15,000 in credit card debt as quickly as possible",
                      "I want to start investing for retirement and have $1M by age 65",
                      "Help me create a budget to save for a $10,000 vacation in 2 years"
                    ].map((prompt, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="justify-start text-left h-auto p-3"
                        onClick={() => handleQuickPrompt(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* AI Response */}
            <div className="space-y-6">
              {planningResponse && (
                <>
                  {/* Analysis */}
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle>Financial Analysis</CardTitle>
                      <CardDescription className="pb-0">
                        AI analysis of your financial situation and goal
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none pb-8">
                        {React.createElement(ReactMarkdown as any, {}, planningResponse.analysis)}
                      </div>
                    </CardContent>
                  </Card>
                  <div className="flex justify-end mt-4">
                    <Button
                      className="bg-black text-white hover:bg-neutral-800 transition-colors duration-150"
                      onClick={() => {
                        setMoveGoalName(watch('financialGoal') || '')
                        // Try to extract a number from the goal string for amount
                        const match = (watch('financialGoal') || '').match(/\$?([\d,]+(\.\d+)?)/)
                        setMoveGoalAmount(match ? match[1].replace(/,/g, '') : '')
                        setMoveGoalDate('')
                        setShowMoveGoal(true)
                      }}
                    >
                      Move to Active Goals
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {showMoveGoal && (
        <Dialog open={showMoveGoal} onOpenChange={setShowMoveGoal}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] min-h-[500px] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Move to Active Goals</DialogTitle>
              <DialogDescription>
                Set up a new savings goal with target amount and timeline
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitMoveGoal(onMoveGoalSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="movegoal-name">Goal Name</Label>
                <Input
                  id="movegoal-name"
                  placeholder="e.g., Emergency Fund, House Down Payment"
                  {...registerMoveGoal('name', { required: 'Goal name is required' })}
                />
                {moveGoalErrors.name && (
                  <p className="text-sm text-destructive">{moveGoalErrors.name.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="movegoal-target-amount">Target Amount ($)</Label>
                  <Input
                    id="movegoal-target-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...registerMoveGoal('target_amount', {
                      required: 'Target amount is required',
                      min: { value: 0.01, message: 'Target amount must be greater than 0' },
                    })}
                  />
                  {moveGoalErrors.target_amount && (
                    <p className="text-sm text-destructive">{moveGoalErrors.target_amount.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="movegoal-current-amount">Current Amount ($)</Label>
                  <Input
                    id="movegoal-current-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...registerMoveGoal('current_amount', {
                      required: 'Current amount is required',
                      min: { value: 0, message: 'Current amount cannot be negative' },
                    })}
                  />
                  {moveGoalErrors.current_amount && (
                    <p className="text-sm text-destructive">{moveGoalErrors.current_amount.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="movegoal-target-date">Target Date <span className="text-red-500">*</span></Label>
                <Input
                  id="movegoal-target-date"
                  type="date"
                  placeholder="Select a date"
                  {...registerMoveGoal('target_date', { required: 'Target date is required' })}
                />
                {moveGoalErrors.target_date && (
                  <p className="text-sm font-semibold text-red-600 flex items-center gap-1 mt-1">
                    {moveGoalErrors.target_date.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="movegoal-description">Description (optional)</Label>
                <Textarea
                  id="movegoal-description"
                  placeholder="Additional details about your goal..."
                  {...registerMoveGoal('description')}
                  className="min-h-[300px]"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowMoveGoal(false); resetMoveGoal(); }} className="flex-1" disabled={moveGoalLoading}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={moveGoalLoading}>
                  {moveGoalLoading ? 'Saving...' : 'Save Goal'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
} 