import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { Brain, ArrowLeft, Send, Sparkles, LogOut, ChevronDown, ChevronUp } from 'lucide-react'
import { api, logout, goalAPI } from '@/utils/api'
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
import Swal from 'sweetalert2'
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

interface PlanningForm {
  financialGoal: string
  currentIncome: string
  currentExpenses: string
  timeline: string
  additionalContext: string
  currency: string // Add this
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
  const { t, i18n } = useTranslation('common');
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
  const [moveGoalAmountHint, setMoveGoalAmountHint] = useState('')
  const [showPrompts, setShowPrompts] = useState(false)
  
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
    watch: watchMoveGoal,
  } = useForm({
    defaultValues: {
      name: moveGoalName,
      target_amount: moveGoalAmount,
      current_amount: '0',
      target_date: moveGoalDate,
      description: planningResponse?.analysis || '',
      currency: 'CAD',
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prefs = localStorage.getItem('userPreferences');
      if (prefs) {
        try {
          const lang = JSON.parse(prefs).language;
          if (lang && i18n.language !== lang) {
            i18n.changeLanguage(lang);
          }
        } catch {}
      }
    }
  }, [i18n]);

  const onSubmit = async (data: PlanningForm) => {
    try {
      setLoading(true)
      setPlanningResponse(null)
      const planningPrefs = JSON.parse(localStorage.getItem('planningPrefs') || '{}')
      // Append currency info to the additionalContext or financialGoal
      const currencySymbols = {
        CAD: '$',
        USD: '$',
        CNY: '¥',
        EUR: '€',
        GBP: '£',
        AUD: 'A$'
      };
      const safeCurrency = data.currency || 'USD';
      const symbol = Object.prototype.hasOwnProperty.call(currencySymbols, safeCurrency) ? currencySymbols[safeCurrency as keyof typeof currencySymbols] : safeCurrency;
      const currencyNote = `All responses should use the currency symbol (${symbol}) for ${safeCurrency}. For example, use '${symbol}10,000' instead of '${safeCurrency} 10,000'.`;
      const safeCurrentIncome = parseFloat(data.currentIncome) || 0;
      const safeCurrentExpenses = parseFloat(data.currentExpenses) || 0;
      const newData = {
        ...data,
        additionalContext: (data.additionalContext ? data.additionalContext + '\n' : '') + currencyNote,
        currentIncome: safeCurrentIncome,
        currentExpenses: safeCurrentExpenses,
        currency: safeCurrency,
        riskTolerance: planningPrefs.riskTolerance,
        lifeStage: planningPrefs.lifeStage,
        investmentExperience: planningPrefs.investmentExperience,
        language: i18n.language // Add language to payload
      };
      const response = await api.post('/ai/plan', newData)
      Swal.fire({
        icon: 'success',
        title: t('AI analysis completed!'),
      })
      setPlanningResponse(response.data)
    } catch (error) {
      console.error('AI planning error:', error)
      // Error handling is done in api interceptor
    } finally {
      setLoading(false)
    }
  }

  const handleQuickPrompt = (prompt: string) => {
    // Map English prompts to Mandarin if the language is zh
    const zhPrompts: Record<string, string> = {
      "I want to save $20,000 for an emergency fund within 1 year": "我想在一年内为应急基金存下$20,000",
      "Help me plan to buy a $300,000 house with a 20% down payment in 5 years": "帮我规划五年内以20%首付购买$300,000的房子",
      "I need to pay off $15,000 in credit card debt as quickly as possible": "我需要尽快还清$15,000信用卡债务",
      "I want to start investing for retirement and have $1M by age 65": "我想为退休投资，65岁时拥有$100万",
      "Help me create a budget to save for a $10,000 vacation in 2 years": "帮我制定预算，两年内为$10,000的假期存钱"
    };
    if (i18n.language === 'zh' && zhPrompts[prompt]) {
      setValue('financialGoal', zhPrompts[prompt]);
    } else {
      setValue('financialGoal', prompt);
    }
  }

  const onMoveGoalSubmit = async (data: any) => {
    setMoveGoalLoading(true);
    try {
      const aiPlanId = planningResponse?.plan?.id;
      if (!aiPlanId) {
        Swal.fire({
          icon: 'error',
          title: 'AI plan ID not found',
          text: 'Please try again.',
        });
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
      Swal.fire({
        icon: 'success',
        title: t('Goal moved to active goals!'),
      });
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
    Swal.fire({
      icon: 'success',
      title: 'Preferences updated!',
    })
  }

  return (
    <>
      <Head>
        <title>{t('AI Financial Planning')} - MindGo</title>
        <meta name="description" content={t('Get AI-powered financial planning advice')} />
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
                  className="mr-4 flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-2 sm:mr-2" />
                  <span className="hidden sm:inline">{t('Back to Dashboard')}</span>
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">{t('AI Financial Planning')}</h1>
                  <p className="text-muted-foreground">{t('Get personalized financial advice powered by AI')}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Planning Form */}
            <div className="space-y-6">
              {planningPrefs && (
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>{t('Your Financial Planning Preferences')}</CardTitle>
                    <CardDescription>
                      {t('These preferences are used to personalize your AI financial planning and investment suggestions.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {editingPrefs && prefsDraft ? (
                      <div className="flex flex-col gap-4">
                        <div>
                          <Label>{t('Risk Tolerance')}</Label>
                          <Select value={prefsDraft.riskTolerance} onValueChange={v => setPrefsDraft(p => p ? { ...p, riskTolerance: v } : p)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">{t('Low')}</SelectItem>
                              <SelectItem value="moderate">{t('Moderate')}</SelectItem>
                              <SelectItem value="high">{t('High')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('Life Stage')}</Label>
                          <Select value={prefsDraft.lifeStage} onValueChange={v => setPrefsDraft(p => p ? { ...p, lifeStage: v } : p)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="student">{t('Student')}</SelectItem>
                              <SelectItem value="worker">{t('Worker')}</SelectItem>
                              <SelectItem value="retired">{t('Retired')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('Investment Experience')}</Label>
                          <Select value={prefsDraft.investmentExperience} onValueChange={v => setPrefsDraft(p => p ? { ...p, investmentExperience: v } : p)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="beginner">{t('Beginner')}</SelectItem>
                              <SelectItem value="intermediate">{t('Intermediate')}</SelectItem>
                              <SelectItem value="advanced">{t('Advanced')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button onClick={handleSavePrefs} disabled={savingPrefs}>{savingPrefs ? t('Saving...') : t('Save')}</Button>
                          <Button variant="outline" onClick={handleCancelPrefs} disabled={savingPrefs}>{t('Cancel')}</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div><b>{t('Risk Tolerance')}:</b> {t(planningPrefs.riskTolerance.charAt(0).toUpperCase() + planningPrefs.riskTolerance.slice(1))}</div>
                        <div><b>{t('Life Stage')}:</b> {t(planningPrefs.lifeStage.charAt(0).toUpperCase() + planningPrefs.lifeStage.slice(1))}</div>
                        <div><b>{t('Investment Experience')}:</b> {t(planningPrefs.investmentExperience.charAt(0).toUpperCase() + planningPrefs.investmentExperience.slice(1))}</div>
                        <div className="flex justify-end mt-2">
                          <Button size="sm" variant="outline" onClick={handleEditPrefs}>{t('Edit')}</Button>
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
                    {t('Financial Planning Request')}
                  </CardTitle>
                  <CardDescription>
                    {t('Describe your financial situation and goals to get personalized AI advice')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
                    <div className="space-y-2">
                      <Label htmlFor="financialGoal">{t("What's your main financial goal?")}</Label>
                      <Textarea
                        id="financialGoal"
                        placeholder={t('e.g., Save $50,000 for a down payment on a house in 3 years')}
                        className="min-h-[80px] w-full rounded-lg py-3 px-4 text-base"
                        {...register('financialGoal', {
                          required: t('Financial goal is required'),
                          minLength: {
                            value: 10,
                            message: t('Please provide more details about your goal'),
                          },
                        })}
                      />
                      {errors.financialGoal && (
                        <p className="text-sm text-destructive">{errors.financialGoal.message}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentIncome">{t('Monthly Income')}</Label>
                        <Input
                          id="currentIncome"
                          type="number"
                          placeholder={t('5000')}
                          className="w-full rounded-lg py-3 px-4 text-base"
                          {...register('currentIncome', {
                            required: t('Current income is required'),
                            min: {
                              value: 0,
                              message: t('Income must be positive'),
                            },
                          })}
                        />
                        {errors.currentIncome && (
                          <p className="text-sm text-destructive">{errors.currentIncome.message}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currentExpenses">{t('Monthly Expenses')}</Label>
                        <Input
                          id="currentExpenses"
                          type="number"
                          placeholder={t('3000')}
                          className="w-full rounded-lg py-3 px-4 text-base"
                          {...register('currentExpenses', {
                            required: t('Current expenses are required'),
                            min: {
                              value: 0,
                              message: t('Expenses must be positive'),
                            },
                          })}
                        />
                        {errors.currentExpenses && (
                          <p className="text-sm text-destructive">{errors.currentExpenses.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeline">{t('Timeline for achieving your goal')}</Label>
                      <Select onValueChange={(value) => setValue('timeline', value)}>
                        <SelectTrigger className="w-full rounded-lg py-3 px-4 text-base">
                          <SelectValue placeholder={t('Select timeline')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6 months">{t('6 months')}</SelectItem>
                          <SelectItem value="1 year">{t('1 year')}</SelectItem>
                          <SelectItem value="2 years">{t('2 years')}</SelectItem>
                          <SelectItem value="3 years">{t('3 years')}</SelectItem>
                          <SelectItem value="5 years">{t('5 years')}</SelectItem>
                          <SelectItem value="10+ years">{t('10+ years')}</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.timeline && (
                        <p className="text-sm text-destructive">{errors.timeline.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">{t('Currency')}</Label>
                      <Select value={watch('currency') || 'CAD'} onValueChange={value => setValue('currency', value, { shouldValidate: true })}>
                        <SelectTrigger className="w-full rounded-lg py-3 px-4 text-base">
                          <SelectValue placeholder={t('Select currency')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CAD">{t('CAD ($)')}</SelectItem>
                          <SelectItem value="USD">{t('USD ($)')}</SelectItem>
                          <SelectItem value="CNY">{t('CNY (¥)')}</SelectItem>
                          <SelectItem value="EUR">{t('EUR (€)')}</SelectItem>
                          <SelectItem value="GBP">{t('GBP (£)')}</SelectItem>
                          <SelectItem value="AUD">{t('AUD (A$)')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="additionalContext">{t('Additional context (optional)')}</Label>
                      <Textarea
                        id="additionalContext"
                        placeholder={t('Any additional information about your financial situation, constraints, or preferences...')}
                        className="min-h-[100px] w-full rounded-lg py-3 px-4 text-base"
                        {...register('additionalContext')}
                      />
                    </div>
                    <Button type="submit" className="w-full py-3 text-base" disabled={loading}>
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          {t('Analyzing...')}
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          {t('Get AI Analysis')}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              {/* Quick Prompts - collapsible on mobile */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setShowPrompts(v => !v)}>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    {t('Quick Prompts')}
                  </div>
                  <div className="sm:hidden">
                    {showPrompts ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </CardHeader>
                <CardContent className={`transition-all duration-300 ${showPrompts || typeof window === 'undefined' || window.innerWidth >= 640 ? 'block' : 'hidden'} sm:block`}>
                  <div className="grid grid-cols-1 gap-2">
                    {[t("I want to save $20,000 for an emergency fund within 1 year"), t("Help me plan to buy a $300,000 house with a 20% down payment in 5 years"), t("I need to pay off $15,000 in credit card debt as quickly as possible"), t("I want to start investing for retirement and have $1M by age 65"), t("Help me create a budget to save for a $10,000 vacation in 2 years")].map((prompt, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="justify-start text-left h-auto p-3 text-base whitespace-normal break-words w-full max-w-full"
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
                      <CardTitle>{t('Financial Analysis')}</CardTitle>
                      <CardDescription className="pb-0">
                        {t('AI analysis of your financial situation and goal')}
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
                        const goalStr = watch('financialGoal') || '';
                        const match = goalStr.match(/\$?([\d,]+(\.\d+)?)([KMBkmb])?/);
                        if (match) {
                          let num = match[1].replace(/,/g, '');
                          let shorthand = match[3] ? match[3].toUpperCase() : '';
                          let numericValue = num;
                          if (shorthand === 'K') numericValue = String(parseFloat(num) * 1e3);
                          if (shorthand === 'M') numericValue = String(parseFloat(num) * 1e6);
                          if (shorthand === 'B') numericValue = String(parseFloat(num) * 1e9);
                          setMoveGoalAmount(numericValue);
                          setMoveGoalAmountHint(shorthand ? `${num}${shorthand}` : '');
                        } else {
                          setMoveGoalAmount('');
                          setMoveGoalAmountHint('');
                        }
                        setMoveGoalDate('')
                        setShowMoveGoal(true)
                      }}
                    >
                      {t('Move to Active Goals')}
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
              <DialogTitle>{t('Move to Active Goals')}</DialogTitle>
              <DialogDescription>
                {t('Set up a new savings goal with target amount and timeline')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitMoveGoal(onMoveGoalSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="movegoal-name">{t('Goal Name')}</Label>
                <Input
                  id="movegoal-name"
                  placeholder={t('e.g., Emergency Fund, House Down Payment')}
                  {...registerMoveGoal('name', { required: t('Goal name is required') })}
                />
                {moveGoalErrors.name && (
                  <p className="text-sm text-destructive">{moveGoalErrors.name.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="movegoal-target-amount">{t('Target Amount')}</Label>
                  <Input
                    id="movegoal-target-amount"
                    type="number"
                    step="0.01"
                    placeholder={t('0.00')}
                    {...registerMoveGoal('target_amount', {
                      required: t('Target amount is required'),
                      min: { value: 0.01, message: t('Target amount must be greater than 0') },
                    })}
                    value={moveGoalAmount}
                    onChange={e => {
                      setMoveGoalAmount(e.target.value);
                      setMoveGoalAmountHint('');
                    }}
                  />
                  {moveGoalAmountHint && (
                    <p className="text-xs text-muted-foreground">{t('Detected:')} {moveGoalAmountHint}</p>
                  )}
                  {moveGoalErrors.target_amount && (
                    <p className="text-sm text-destructive">{moveGoalErrors.target_amount.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="movegoal-current-amount">{t('Current Amount')}</Label>
                  <Input
                    id="movegoal-current-amount"
                    type="number"
                    step="0.01"
                    placeholder={t('0.00')}
                    {...registerMoveGoal('current_amount', {
                      required: t('Current amount is required'),
                      min: { value: 0, message: t('Current amount cannot be negative') },
                    })}
                  />
                  {moveGoalErrors.current_amount && (
                    <p className="text-sm text-destructive">{moveGoalErrors.current_amount.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="movegoal-target-date">{t('Target Date')} <span className="text-red-500">*</span></Label>
                  <Input
                    id="movegoal-target-date"
                    type="date"
                    placeholder={t('Select a date')}
                    {...registerMoveGoal('target_date', { required: t('Target date is required') })}
                  />
                  {moveGoalErrors.target_date && (
                    <p className="text-sm font-semibold text-red-600 flex items-center gap-1 mt-1">
                      {moveGoalErrors.target_date.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="movegoal-currency">{t('Currency')}</Label>
                  <Select
                    value={watchMoveGoal('currency') || 'CAD'}
                    onValueChange={value => setMoveGoalValue('currency', value, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select currency')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAD">{t('CAD ($)')}</SelectItem>
                      <SelectItem value="USD">{t('USD ($)')}</SelectItem>
                      <SelectItem value="CNY">{t('CNY (¥)')}</SelectItem>
                      <SelectItem value="EUR">{t('EUR (€)')}</SelectItem>
                      <SelectItem value="GBP">{t('GBP (£)')}</SelectItem>
                      <SelectItem value="AUD">{t('AUD (A$)')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {moveGoalErrors.currency && (
                    <p className="text-sm text-destructive">{moveGoalErrors.currency.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="movegoal-description">{t('Description (optional)')}</Label>
                <Textarea
                  id="movegoal-description"
                  placeholder={t('Additional details about your goal...')}
                  {...registerMoveGoal('description')}
                  className="min-h-[300px]"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowMoveGoal(false); resetMoveGoal(); }} className="flex-1" disabled={moveGoalLoading}>
                  {t('Cancel')}
                </Button>
                <Button type="submit" className="flex-1" disabled={moveGoalLoading}>
                  {moveGoalLoading ? t('Saving...') : t('Save Goal')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
} 