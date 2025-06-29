import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { Brain, ArrowLeft, Send, Sparkles } from 'lucide-react'
import { api } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
}

export default function AIPlanning() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [planningResponse, setPlanningResponse] = useState<PlanningResponse | null>(null)
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlanningForm>()

  const onSubmit = async (data: PlanningForm) => {
    try {
      setLoading(true)
      setPlanningResponse(null)
      
      const response = await api.post('/ai/plan', {
        ...data,
        currentIncome: parseFloat(data.currentIncome),
        currentExpenses: parseFloat(data.currentExpenses),
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
            <div className="flex items-center py-6">
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
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Planning Form */}
            <div className="space-y-6">
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
              {planningResponse ? (
                <>
                  {/* Analysis */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Financial Analysis</CardTitle>
                      <CardDescription>
                        AI analysis of your financial situation and goal
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        <p className="whitespace-pre-wrap">{planningResponse.analysis}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recommendations */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Key Recommendations</CardTitle>
                      <CardDescription>
                        Actionable advice to help you achieve your goal
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {planningResponse.recommendations.map((recommendation, index) => (
                          <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                            <Badge variant="secondary" className="mt-1">
                              {index + 1}
                            </Badge>
                            <p className="text-sm">{recommendation}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Plan */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Action Plan</CardTitle>
                      <CardDescription>
                        Step-by-step plan to achieve your financial goal
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {planningResponse.actionPlan.map((action, index) => (
                          <div key={index} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">
                              {index + 1}
                            </div>
                            <p className="text-sm">{action}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Timeline & Risks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Estimated Timeline</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{planningResponse.estimatedTimeline}</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Risk Factors</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {planningResponse.riskFactors.map((risk, index) => (
                            <div key={index} className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0"></div>
                              <p className="text-sm">{risk}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>AI Analysis</CardTitle>
                    <CardDescription>
                      Your personalized financial analysis will appear here
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <Brain className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        Fill out the form and submit to get your AI-powered financial analysis
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
} 