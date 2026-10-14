import Image from 'next/image'
import { cn } from '@/lib/utils'

// The wordmark's intrinsic size; keep it at the SVG viewBox's aspect ratio.
// The rendered height comes from className and the width follows it.
const WIDTH = 446
const HEIGHT = 100

interface BrandLogoProps {
  className?: string
  priority?: boolean
}

/**
 * The TermPocket wordmark, announced once as "TermPocket". Light and dark
 * variants switch on Tailwind's `dark` class rather than `resolvedTheme`;
 * both carry the alt text because `display: none` already removes the
 * inactive one from the accessibility tree. Put it inside the page's heading
 * in place of a text brand name.
 */
export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  const shared = 'w-auto max-w-full object-contain align-middle'
  return (
    <>
      <Image
        src="/brand/termpocket-logo.svg"
        alt="TermPocket"
        width={WIDTH}
        height={HEIGHT}
        priority={priority}
        className={cn(shared, 'inline-block dark:hidden', className)}
      />
      <Image
        src="/brand/termpocket-logo-dark.svg"
        alt="TermPocket"
        width={WIDTH}
        height={HEIGHT}
        priority={priority}
        className={cn(shared, 'hidden dark:inline-block', className)}
      />
    </>
  )
}
