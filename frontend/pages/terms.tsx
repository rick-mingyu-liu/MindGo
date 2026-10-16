import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import LegalPage from '@/components/LegalPage'

export default function Terms() {
  return <LegalPage doc="terms" />
}

// Public: no auth check, so it renders for signed-out visitors and at build time.
export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'legal'])),
    },
  }
}
