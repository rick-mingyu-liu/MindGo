import Link from 'next/link'
import { useTranslation } from 'next-i18next'
import { ArrowRight, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AgentPanel() {
  const { t } = useTranslation('common')
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />{t('agent.title')}</CardTitle>
      <CardDescription>{t('agent.subtitle')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="rounded-lg border bg-muted/40 p-4 text-sm">{t('agent.example')}</p>
      <p className="text-sm text-muted-foreground">{t('agent.reviewHint')}</p>
      <Button asChild><Link href="/agent">{t('agent.open')}<ArrowRight className="h-4 w-4" /></Link></Button>
    </CardContent>
  </Card>
}
