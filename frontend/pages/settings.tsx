import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import {
  ArrowLeft,
  Trash2,
  AlertTriangle,
  Palette,
  Bell,
  User,
  Moon,
  Sun,
  Monitor,
  LogOut,
  BookOpen,
  Brain,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api, logout } from '@/utils/api'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'
import Swal from 'sweetalert2'
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import {
  LanguagePreference,
  UserPreferences,
  readPreferences,
  resolveLanguage,
  savePreferences,
} from '@/lib/preferences'

interface PlanningPreferences {
  riskTolerance: string
  lifeStage: string
  investmentExperience: string
}

const PLANNING_DEFAULTS: PlanningPreferences = {
  riskTolerance: 'moderate',
  lifeStage: 'worker',
  investmentExperience: 'beginner',
}

const THEMES = [
  { value: 'light', icon: Sun, label: 'Light', hint: 'Clean and bright interface' },
  { value: 'dark', icon: Moon, label: 'Dark', hint: 'Easy on the eyes' },
  { value: 'system', icon: Monitor, label: 'System', hint: 'Follows your device' },
] as const

/**
 * Every control here takes effect and is kept the moment it changes — there
 * is no Save button to forget. Currency, language and planning preferences
 * live in this browser; the weekly report switch is the one server setting.
 */
export default function Settings() {
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { t, i18n } = useTranslation('common')
  const [preferences, setPreferences] = useState<UserPreferences>({ currency: 'CAD', language: 'system' })
  const [planningPrefs, setPlanningPrefs] = useState<PlanningPreferences>(PLANNING_DEFAULTS)
  // null until the server says; the switch is disabled rather than guessing.
  const [weeklyReports, setWeeklyReports] = useState<boolean | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [ackDialogOpen, setAckDialogOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login')
      return
    }
    setPreferences(readPreferences())
    try {
      const saved = JSON.parse(localStorage.getItem('planningPrefs') || 'null')
      if (saved) setPlanningPrefs({ ...PLANNING_DEFAULTS, ...saved })
    } catch {}

    api.get('/auth/profile')
      .then(({ data }) => {
        const { weekly_reports_enabled: weekly, email_notifications_enabled: email } = data.user
        setWeeklyReports(Boolean(weekly && email))
      })
      .catch(() => toast.error(t('Could not load your notification setting.')))
  }, [router, t])

  const saved = () => toast.success(t('Saved'), { id: 'settings-saved' })

  const changeCurrency = (currency: string) => {
    setPreferences(savePreferences({ currency }))
    saved()
  }

  const changeLanguage = (value: string) => {
    const language = value as LanguagePreference
    setPreferences(savePreferences({ language }))
    const locale = resolveLanguage(language)
    i18n.changeLanguage(locale)
    router.push(router.asPath, router.asPath, { locale })
  }

  const changePlanning = (changes: Partial<PlanningPreferences>) => {
    const next = { ...planningPrefs, ...changes }
    setPlanningPrefs(next)
    localStorage.setItem('planningPrefs', JSON.stringify(next))
    saved()
  }

  const changeWeeklyReports = async (checked: boolean) => {
    setWeeklyReports(checked)
    try {
      // The scheduler sends only when both flags are on; this switch is both.
      await api.put('/auth/notifications', {
        weekly_reports_enabled: checked,
        email_notifications_enabled: checked,
      })
      saved()
    } catch {
      setWeeklyReports(!checked)
      toast.error(t('Could not save. Please try again.'))
    }
  }

  const handleClearData = async () => {
    setClearing(true)
    try {
      await Promise.all([
        api.delete('/transactions/clear-all'),
        api.delete('/goals/clear-all'),
        api.delete('/investments/watchlist/clear-all')
      ])
      setClearDialogOpen(false)
      await Swal.fire({
        icon: 'success',
        title: t('All data cleared'),
        text: t('Your transactions, goals and watchlist have been deleted.'),
        confirmButtonText: t('OK'),
      })
      router.push('/')
    } catch {
      toast.error(t('Could not clear all data. Some of it may already be deleted; please try again.'))
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <Head>
        <title>Settings - MindGo</title>
        <meta name="description" content="Manage your app settings and preferences" />
      </Head>

      <div className="min-h-screen bg-background">
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
                className="flex items-center"
                aria-label={t('Back to Dashboard')}
              >
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('Back to Dashboard')}</span>
              </Button>
              <div>
                <h1 className="text-3xl font-bold">{t('Settings')}</h1>
                <p className="text-muted-foreground">
                  {t('Changes are saved as you make them.')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  {t('Appearance')}
                </CardTitle>
                <CardDescription>
                  {t('Customize the look and feel of your app')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label className="text-base">{t('Theme')}</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup" aria-label={t('Theme')}>
                  {THEMES.map(({ value, icon: Icon, label, hint }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={theme === value}
                      onClick={() => setTheme(value)}
                      className={`p-4 border rounded-lg text-left transition-colors ${
                        theme === value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Icon className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{t(label)}</p>
                          <p className="text-sm text-muted-foreground">{t(hint)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {theme === 'system' && (
                  <p className="text-sm text-muted-foreground">
                    {t('Current theme')}: <span className="font-medium">{t(resolvedTheme === 'dark' ? 'Dark' : 'Light')}</span>
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('Preferences')}
                </CardTitle>
                <CardDescription>
                  {t('Customize your app experience')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t('Currency')}</Label>
                    <Select value={preferences.currency} onValueChange={changeCurrency}>
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CAD">CAD ($)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="CNY">CNY (¥)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="AUD">AUD (A$)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {t('Totals on the dashboard and transactions page are converted to this currency.')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">{t('Language')}</Label>
                    <Select value={preferences.language} onValueChange={changeLanguage}>
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">{t('System')}</SelectItem>
                        <SelectItem value="en">{t('English')}</SelectItem>
                        <SelectItem value="zh">{t('Mandarin')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  {t('Notifications')}
                </CardTitle>
                <CardDescription>
                  {t('Manage your notification preferences')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="weekly-reports" className="text-base">{t('Weekly Reports')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Get weekly financial summary by email every Sunday at 7 p.m.')}
                    </p>
                  </div>
                  <Switch
                    id="weekly-reports"
                    checked={weeklyReports ?? false}
                    disabled={weeklyReports === null}
                    onCheckedChange={changeWeeklyReports}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  {t('Financial Planning Preferences')}
                </CardTitle>
                <CardDescription>
                  {t('These preferences will be used to personalize your AI financial planning and investment suggestions.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="risk">{t('Risk Tolerance')}</Label>
                    <Select value={planningPrefs.riskTolerance} onValueChange={(v) => changePlanning({ riskTolerance: v })}>
                      <SelectTrigger id="risk"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{t('Low')}</SelectItem>
                        <SelectItem value="moderate">{t('Moderate')}</SelectItem>
                        <SelectItem value="high">{t('High')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="life-stage">{t('Life Stage')}</Label>
                    <Select value={planningPrefs.lifeStage} onValueChange={(v) => changePlanning({ lifeStage: v })}>
                      <SelectTrigger id="life-stage"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">{t('Student')}</SelectItem>
                        <SelectItem value="worker">{t('Worker')}</SelectItem>
                        <SelectItem value="retired">{t('Retired')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience">{t('Investment Experience')}</Label>
                    <Select
                      value={planningPrefs.investmentExperience}
                      onValueChange={(v) => changePlanning({ investmentExperience: v })}
                    >
                      <SelectTrigger id="experience"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">{t('Beginner')}</SelectItem>
                        <SelectItem value="intermediate">{t('Intermediate')}</SelectItem>
                        <SelectItem value="advanced">{t('Advanced')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('Account Management')}
                </CardTitle>
                <CardDescription>
                  {t('Manage your account and data')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('Sign Out')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Sign out of your account')}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => logout()}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('Logout')}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      {t('Clear All Data')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Permanently delete all transactions, goals, and watchlist data.')}
                    </p>
                  </div>
                  <Button variant="destructive" onClick={() => setClearDialogOpen(true)} disabled={clearing}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('Clear All Data')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setAckDialogOpen(true)} className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                {t('Open Source Acknowledgements')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={clearDialogOpen} onOpenChange={(open) => !clearing && setClearDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Clear All Data')}</DialogTitle>
            <DialogDescription>
              {t('This permanently deletes all your transactions, goals and watchlist. It cannot be undone.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={clearing}>{t('Cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleClearData} disabled={clearing}>
              {clearing ? t('Clearing...') : t('Yes, Delete Everything')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('Open Source Acknowledgements')}</DialogTitle>
            <DialogDescription>{t('This project is made by these amazing open source projects:')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <h4 className="font-semibold mb-2">{t('Frontend')}</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Next.js</li>
                <li>React</li>
                <li>TypeScript</li>
                <li>Tailwind CSS</li>
                <li>shadcn/ui</li>
                <li>Radix UI (@radix-ui/react-*)</li>
                <li>lucide-react</li>
                <li>recharts</li>
                <li>react-hook-form</li>
                <li>next-i18next</li>
                <li>react-i18next</li>
                <li>i18next</li>
                <li>sweetalert2</li>
                <li>react-hot-toast</li>
                <li>react-markdown</li>
                <li>axios</li>
                <li>clsx</li>
                <li>class-variance-authority</li>
                <li>autoprefixer</li>
                <li>postcss</li>
                <li>tailwind-merge</li>
                <li>@vercel/analytics</li>
                <li>ppu-paddle-ocr</li>
                <li>onnxruntime-web</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('Backend')}</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Express.js</li>
                <li>PostgreSQL (pg)</li>
                <li>bcryptjs</li>
                <li>helmet</li>
                <li>express-rate-limit</li>
                <li>cors</li>
                <li>jsonwebtoken</li>
                <li>nodemailer</li>
                <li>node-cron</li>
                <li>dotenv</li>
                <li>morgan</li>
                <li>axios</li>
                <li>express-validator</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('APIs (free)')}</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>ExchangeRate.host (currency conversion)</li>
                <li>Frankfurter.dev (currency conversion)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('Close')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}
