import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Settings as SettingsIcon, 
  AlertTriangle, 
  Clock, 
  Palette,
  Bell,
  Shield,
  User,
  Moon,
  Sun,
  Monitor,
  Eye,
  EyeOff,
  Smartphone,
  Globe,
  LogOut
} from 'lucide-react'
import { api, logout } from '@/utils/api'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogTrigger,
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

interface DataRetentionSettings {
  autoDeleteEnabled: boolean
  retentionMonths: number
  lastCleanup: string | null
}

interface UserPreferences {
  currency: string
  dateFormat: string
  language: string // Added language property
  notifications: {
    email: boolean
    push: boolean
    weeklyReport: boolean
    goalReminders: boolean
  }
  privacy: {
    shareData: boolean
    analytics: boolean
  }
  display: {
    compactMode: boolean
    showCharts: boolean
  }
}

export default function Settings() {
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [settings, setSettings] = useState<DataRetentionSettings>({
    autoDeleteEnabled: false,
    retentionMonths: 4,
    lastCleanup: null
  })
  const [preferences, setPreferences] = useState<UserPreferences>({
    currency: 'CAD', // Default currency
    dateFormat: 'MM/DD/YYYY',
    language: 'System', // Default language is now 'System'
    notifications: {
      email: true,
      push: false,
      weeklyReport: true,
      goalReminders: true
    },
    privacy: {
      shareData: false,
      analytics: true
    },
    display: {
      compactMode: false,
      showCharts: true
    }
  })
  const [planningPrefs, setPlanningPrefs] = useState({
    riskTolerance: 'moderate',
    lifeStage: 'worker',
    investmentExperience: 'beginner'
  })
  const [savingPlanningPrefs, setSavingPlanningPrefs] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const { t, i18n } = useTranslation('common');

  useEffect(() => {
    fetchSettings()
    // Only set language if not already saved in localStorage
    const savedPrefs = typeof window !== 'undefined' ? localStorage.getItem('userPreferences') : null;
    if (savedPrefs) {
      setPreferences(JSON.parse(savedPrefs))
    }
    const saved = typeof window !== 'undefined' ? localStorage.getItem('planningPrefs') : null;
    if (saved) {
      setPlanningPrefs(JSON.parse(saved));
    }
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await api.get('/transactions/retention-settings')
      setSettings(response.data)
    } catch (error) {
      console.error('Error fetching settings:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to load settings',
        text: 'There was an error fetching your settings. Please try again later.'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchPreferences = async () => {
    try {
      // In a real app, you'd fetch from API
      // For now, load from localStorage
      const savedPrefs = localStorage.getItem('userPreferences')
      if (savedPrefs) {
        setPreferences(JSON.parse(savedPrefs))
      }
    } catch (error) {
      console.error('Error fetching preferences:', error)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      await api.put('/transactions/retention-settings', settings)
      Swal.fire({
        icon: 'success',
        title: t('Settings saved successfully'),
        text: t('Your settings have been saved successfully!')
      })
    } catch (error) {
      console.error('Error saving settings:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to save settings',
        text: 'There was an error saving your settings. Please try again later.'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSavePreferences = async () => {
    try {
      setSaving(true)
      // In a real app, you'd save to API
      localStorage.setItem('userPreferences', JSON.stringify(preferences))
      Swal.fire({
        icon: 'success',
        title: t('Preferences saved successfully'),
        text: t('Your preferences have been saved successfully!')
      })
    } catch (error) {
      console.error('Error saving preferences:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to save preferences',
        text: 'There was an error saving your preferences. Please try again later.'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleClearData = async () => {
    setClearDialogOpen(false)
    try {
      setClearing(true)
      await Promise.all([
        api.delete('/transactions/clear-all'),
        api.delete('/goals/clear-all'),
        api.delete('/investments/watchlist/clear-all'),
        api.delete('/summary/clear-all') // Clear streak/check-in data
      ])
      Swal.fire({
        icon: 'success',
        title: 'All data cleared successfully',
        text: 'All your data including transactions, goals, and watchlist have been cleared successfully!'
      })
      router.push('/')
    } catch (error) {
      console.error('Error clearing data:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to clear data',
        text: 'There was an error clearing your data. Please try again later.'
      })
    } finally {
      setClearing(false)
    }
  }

  const handleWeeklyReportToggle = async (checked: boolean) => {
    setPreferences({
      ...preferences,
      notifications: { ...preferences.notifications, weeklyReport: checked }
    });
    try {
      await api.put('/auth/notifications', {
        weekly_reports_enabled: checked,
        email_notifications_enabled: preferences.notifications.email
      });
      Swal.fire({
        icon: 'success',
        title: 'Weekly report preference updated!',
        text: 'Your weekly report preference has been updated successfully!'
      })
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Failed to update weekly report preference',
        text: 'There was an error updating your weekly report preference. Please try again later.'
      })
    }
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
        <title>Settings - MindGo</title>
        <meta name="description" content="Manage your app settings and preferences" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/')}
                  className="flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-2 sm:mr-2" />
                  <span className="hidden sm:inline">{t('Back to Dashboard')}</span>
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">{t('Settings')}</h1>
                  <p className="text-muted-foreground">
                    {t('Manage your app preferences and data retention')}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => logout()}
                  className="hidden sm:flex"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('Logout')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Theme Settings */}
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
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-base">{t('Theme')}</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        theme === 'light' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setTheme('light')}
                    >
                      <div className="flex items-center space-x-3">
                        <Sun className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{t('Light')}</p>
                          <p className="text-sm text-muted-foreground">{t('Clean and bright interface')}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setTheme('dark')}
                    >
                      <div className="flex items-center space-x-3">
                        <Moon className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{t('Dark')}</p>
                          <p className="text-sm text-muted-foreground">{t('Easy on the eyes')}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div 
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        theme === 'system' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setTheme('system')}
                    >
                      <div className="flex items-center space-x-3">
                        <Monitor className="h-5 w-5" />
                        <div>
                          <p className="font-medium">{t('System')}</p>
                          <p className="text-sm text-muted-foreground">{t('Follows your device')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    {t('Current theme')}: <span className="font-medium capitalize">{t(resolvedTheme.charAt(0).toUpperCase() + resolvedTheme.slice(1))}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* User Preferences */}
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
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t('Currency')}</Label>
                    <Select
                      value={preferences.currency}
                      onValueChange={(value) => setPreferences({ ...preferences, currency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">{t('Language')}</Label>
                    <Select
                      value={preferences.language}
                      onValueChange={(value) => {
                        setPreferences({ ...preferences, language: value });
                        let lang = value;
                        if (lang === 'system') {
                          lang = window.navigator.language.startsWith('zh') ? 'zh' : 'en';
                        }
                        i18n.changeLanguage(lang);
                        router.push(router.asPath, router.asPath, { locale: lang });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('Language')}>
                          {preferences.language === 'en'
                            ? t('English')
                            : preferences.language === 'zh'
                            ? t('Mandarin')
                            : t('System')}
                        </SelectValue>
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

            {/* Notifications */}
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
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('Email Notifications')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Receive updates via email')}
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications.email}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      notifications: { ...preferences.notifications, email: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('Weekly Reports')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Get weekly financial summary by email every Sunday at 7 p.m.')}
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications.weeklyReport}
                    onCheckedChange={handleWeeklyReportToggle}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('Goal Reminders')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Get notified about goal progress')}
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications.goalReminders}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      notifications: { ...preferences.notifications, goalReminders: checked }
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Privacy Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t('Privacy & Data')}
                </CardTitle>
                <CardDescription>
                  {t('Control your data and privacy settings')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('Share Usage Data')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Help improve the app by sharing anonymous usage data')}
                    </p>
                  </div>
                  <Switch
                    checked={preferences.privacy.shareData}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      privacy: { ...preferences.privacy, shareData: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('Analytics')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('Allow analytics to improve your experience')}
                    </p>
                  </div>
                  <Switch
                    checked={preferences.privacy.analytics}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      privacy: { ...preferences.privacy, analytics: checked }
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Financial Planning Preferences */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>{t('Financial Planning Preferences')}</CardTitle>
                <CardDescription>
                  {t('These preferences will be used to personalize your AI financial planning and investment suggestions.')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Label>{t('Risk Tolerance')}</Label>
                  <Select value={planningPrefs.riskTolerance} onValueChange={v => setPlanningPrefs(p => ({ ...p, riskTolerance: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('Low')}</SelectItem>
                      <SelectItem value="moderate">{t('Moderate')}</SelectItem>
                      <SelectItem value="high">{t('High')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mb-4">
                  <Label>{t('Life Stage')}</Label>
                  <Select value={planningPrefs.lifeStage} onValueChange={v => setPlanningPrefs(p => ({ ...p, lifeStage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">{t('Student')}</SelectItem>
                      <SelectItem value="worker">{t('Worker')}</SelectItem>
                      <SelectItem value="retired">{t('Retired')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mb-4">
                  <Label>{t('Investment Experience')}</Label>
                  <Select value={planningPrefs.investmentExperience} onValueChange={v => setPlanningPrefs(p => ({ ...p, investmentExperience: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">{t('Beginner')}</SelectItem>
                      <SelectItem value="intermediate">{t('Intermediate')}</SelectItem>
                      <SelectItem value="advanced">{t('Advanced')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Data Retention Settings */}
            {/* <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Data Retention Settings
                </CardTitle>
                <CardDescription>
                  We will auto delete the data from the database after 4 months, but you can click <b>Save to Blockchain</b> so those will not disappear.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold mb-1">Blockchain Settings</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      You can save your important financial data to the blockchain for permanent, tamper-proof storage. Once saved, your data will not be deleted, even if it is removed from our database after 4 months.
                    </p>
                    <Button variant="default">Save to Blockchain</Button>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Account Management */}
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
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          {t('Dangerous Actions')}
                        </p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                          {t('These actions cannot be undone and will permanently delete your data.')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">{t('Clear All Data')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('Permanently delete all transactions, goals, and streak etc.')}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => setClearDialogOpen(true)}
                      disabled={clearing}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('Clear All Data')}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">{t('Sign Out')}</Label>
                      <p className="text-sm text-muted-foreground">
                        {t('Sign out of your account')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => logout()}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('Logout')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save All Preferences */}
            <div className="flex justify-end space-x-4">
              <Button
                variant="outline"
                onClick={() => {
                  setPreferences({
                    currency: 'CAD',
                    dateFormat: 'MM/DD/YYYY',
                    language: 'System',
                    notifications: {
                      email: true,
                      push: false,
                      weeklyReport: true,
                      goalReminders: true
                    },
                    privacy: {
                      shareData: false,
                      analytics: true
                    },
                    display: {
                      compactMode: false,
                      showCharts: true
                    }
                  })
                  Swal.fire({
                    icon: 'success',
                    title: t('Preferences reset to defaults'),
                    text: t('Your preferences have been reset to defaults successfully!')
                  })
                }}
                className="aurora-border"
              >
                {t('Reset to Defaults')}
              </Button>
              <Button
                onClick={handleSavePreferences}
                disabled={saving}
                className="aurora-glow"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : t('Save All Preferences')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Clear All Data')}</DialogTitle>
            <DialogDescription>
              {t('This will permanently delete <b>ALL</b> your data including transactions, goals, and watchlist. This action cannot be undone. Are you sure?')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('Cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleClearData} disabled={clearing}>
              {clearing ? 'Clearing...' : t('Yes, Delete Everything')}
            </Button>
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