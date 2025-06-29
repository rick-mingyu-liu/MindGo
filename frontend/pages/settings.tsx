import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { ArrowLeft, Save, Trash2, Settings, AlertTriangle, Clock } from 'lucide-react'
import { api, logout } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'

interface DataRetentionSettings {
  autoDeleteEnabled: boolean
  retentionMonths: number
  lastCleanup: string | null
}

export default function Settings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settings, setSettings] = useState<DataRetentionSettings>({
    autoDeleteEnabled: false,
    retentionMonths: 4,
    lastCleanup: null
  })

  useEffect(() => {
    fetchSettings()
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
        <meta name="description" content="Manage your app settings and data retention" />
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
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Settings</h1>
                  <p className="text-muted-foreground">
                    Manage your app preferences and data retention
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => logout(router)}
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto space-y-6">
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
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Last cleanup:</strong> {new Date(settings.lastCleanup).toLocaleDateString()}
                    </p>
                  </div>
                )}

                {/* Warning */}
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        Important Note
                      </p>
                      <p className="text-sm text-yellow-700 mt-1">
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

            {/* Information Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  About Data Retention
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">What gets deleted?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Individual transactions older than the retention period</li>
                    <li>• Associated financial summaries and reports</li>
                    <li>• Historical data used for charts and analytics</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">What's preserved?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Your account settings and preferences</li>
                    <li>• Current savings goals and investment watchlist</li>
                    <li>• Recent transactions within the retention period</li>
                  </ul>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    <strong>Tip:</strong> Consider exporting important data before enabling auto-deletion, or use manual cleanup for more control.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
} 