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
  Globe
} from 'lucide-react'
import { api, logout } from '@/utils/api'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'react-hot-toast'

interface DataRetentionSettings {
  autoDeleteEnabled: boolean
  retentionMonths: number
  lastCleanup: string | null
}

interface UserPreferences {
  currency: string
  dateFormat: string
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
  const [settings, setSettings] = useState<DataRetentionSettings>({
    autoDeleteEnabled: false,
    retentionMonths: 4,
    lastCleanup: null
  })
  const [preferences, setPreferences] = useState<UserPreferences>({
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
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

  useEffect(() => {
    fetchSettings()
    fetchPreferences()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await api.get('/transactions/retention-settings')
      setSettings(response.data)
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Failed to load settings')
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
      toast.success('Settings saved successfully')
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePreferences = async () => {
    try {
      setSaving(true)
      // In a real app, you'd save to API
      localStorage.setItem('userPreferences', JSON.stringify(preferences))
      toast.success('Preferences saved successfully')
    } catch (error) {
      console.error('Error saving preferences:', error)
      toast.error('Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  const handleManualCleanup = async () => {
    if (!confirm(`This will permanently delete all transactions older than ${settings.retentionMonths} months. This action cannot be undone. Are you sure?`)) {
      return
    }

    try {
      setDeleting(true)
      const response = await api.delete(`/transactions/auto-delete?months=${settings.retentionMonths}`)
      toast.success(`Cleanup completed: ${response.data.deletedCount} transactions deleted`)
      // Refresh settings to update lastCleanup
      await fetchSettings()
    } catch (error) {
      console.error('Error during cleanup:', error)
      toast.error('Failed to perform cleanup')
    } finally {
      setDeleting(false)
    }
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
        <title>Settings - Personal Finance App</title>
        <meta name="description" content="Manage your app settings and preferences" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card aurora-header">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/')}
                  className="aurora-border"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
                <div>
                  <h1 className="text-3xl font-bold aurora-text">Settings</h1>
                  <p className="text-muted-foreground">
                    Manage your app preferences and data retention
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => logout()}
                  className="aurora-border"
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Theme Settings */}
            <Card className="aurora-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize the look and feel of your app
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-base">Theme</Label>
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
                          <p className="font-medium">Light</p>
                          <p className="text-sm text-muted-foreground">Clean and bright interface</p>
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
                          <p className="font-medium">Dark</p>
                          <p className="text-sm text-muted-foreground">Easy on the eyes</p>
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
                          <p className="font-medium">System</p>
                          <p className="text-sm text-muted-foreground">Follows your device</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Current theme: <span className="font-medium capitalize">{resolvedTheme}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Compact Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Reduce spacing for more content on screen
                    </p>
                  </div>
                  <Switch
                    checked={preferences.display.compactMode}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      display: { ...preferences.display, compactMode: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Show Charts</Label>
                    <p className="text-sm text-muted-foreground">
                      Display charts and visualizations
                    </p>
                  </div>
                  <Switch
                    checked={preferences.display.showCharts}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      display: { ...preferences.display, showCharts: checked }
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* User Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Preferences
                </CardTitle>
                <CardDescription>
                  Customize your app experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                      value={preferences.currency}
                      onValueChange={(value) => setPreferences({ ...preferences, currency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="CAD">CAD (C$)</SelectItem>
                        <SelectItem value="AUD">AUD (A$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateFormat">Date Format</Label>
                    <Select
                      value={preferences.dateFormat}
                      onValueChange={(value) => setPreferences({ ...preferences, dateFormat: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
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
                  Notifications
                </CardTitle>
                <CardDescription>
                  Manage your notification preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive updates via email
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
                    <Label className="text-base">Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive browser notifications
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications.push}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      notifications: { ...preferences.notifications, push: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Weekly Reports</Label>
                    <p className="text-sm text-muted-foreground">
                      Get weekly financial summaries
                    </p>
                  </div>
                  <Switch
                    checked={preferences.notifications.weeklyReport}
                    onCheckedChange={(checked) => setPreferences({
                      ...preferences,
                      notifications: { ...preferences.notifications, weeklyReport: checked }
                    })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Goal Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about goal progress
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
                  Privacy & Data
                </CardTitle>
                <CardDescription>
                  Control your data and privacy settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Share Usage Data</Label>
                    <p className="text-sm text-muted-foreground">
                      Help improve the app by sharing anonymous usage data
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
                    <Label className="text-base">Analytics</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow analytics to improve your experience
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

            {/* Data Retention Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Data Retention Settings
                </CardTitle>
                <CardDescription>
                  Configure how long your transaction data is kept
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Auto-delete toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Auto-delete old transactions</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically delete transactions older than the specified period
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoDeleteEnabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, autoDeleteEnabled: checked })}
                  />
                </div>

                {/* Retention period */}
                <div className="space-y-2">
                  <Label htmlFor="retentionMonths">Retention Period (months)</Label>
                  <Input
                    id="retentionMonths"
                    type="number"
                    min="1"
                    max="60"
                    value={settings.retentionMonths}
                    onChange={(e) => setSettings({ ...settings, retentionMonths: parseInt(e.target.value) || 4 })}
                    className="w-32"
                  />
                  <p className="text-sm text-muted-foreground">
                    Transactions older than this period will be automatically deleted
                  </p>
                </div>

                {/* Last cleanup info */}
                {settings.lastCleanup && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Last cleanup:</strong> {new Date(settings.lastCleanup).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {/* Warning */}
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Important Note
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        Auto-deletion permanently removes old transaction data. This action cannot be undone and may affect your financial reports and analytics.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={handleManualCleanup}
                    disabled={deleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deleting ? 'Cleaning up...' : 'Manual Cleanup Now'}
                  </Button>
                  
                  <Button
                    onClick={handleSaveSettings}
                    disabled={saving}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Save All Preferences */}
            <div className="flex justify-end space-x-4">
              <Button
                variant="outline"
                onClick={() => {
                  setPreferences({
                    currency: 'USD',
                    dateFormat: 'MM/DD/YYYY',
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
                  toast.success('Preferences reset to defaults')
                }}
                className="aurora-border"
              >
                Reset to Defaults
              </Button>
              <Button
                onClick={handleSavePreferences}
                disabled={saving}
                className="aurora-glow"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save All Preferences'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
} 