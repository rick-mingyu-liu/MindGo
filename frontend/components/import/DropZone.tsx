import { useEffect, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_FILES_PER_BATCH = 5

interface DropZoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

/**
 * Takes screenshots by drag and drop, file picker, or paste anywhere on the
 * page (⌘V straight after taking a screenshot is the quickest path).
 */
export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const { t } = useTranslation('common')
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list ?? []).filter((file) => ACCEPTED_TYPES.includes(file.type))
    if (files.length > 0 && !disabled) onFiles(files)
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) {
        event.preventDefault()
        accept(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        accept(event.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        disabled && 'opacity-60'
      )}
    >
      <ImagePlus className="h-10 w-10 text-muted-foreground" aria-hidden />
      <p className="font-medium">{t('Drop screenshots here, choose files, or paste')}</p>
      <p className="text-sm text-muted-foreground">{t('Up to 5 images at a time: PNG, JPEG or WebP.')}</p>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
        {t('Choose files')}
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        className="hidden"
        onChange={(event) => {
          accept(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
