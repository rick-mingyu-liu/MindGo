import type { OcrLine } from '@/lib/ocr/types'

interface SourcePreviewProps {
  url: string
  image: { width: number; height: number }
  boxes: OcrLine['box'][]
  alt: string
}

/**
 * The screenshot with the selected row's text outlined, so a digit can be
 * checked against the picture. Boxes are in image pixels; they are placed as
 * percentages so the overlay follows the image at any display size.
 */
export function SourcePreview({ url, image, boxes, alt }: SourcePreviewProps) {
  return (
    <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-md border">
      {/* An object URL for a local file: next/image cannot optimise it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block h-auto w-full" />
      {boxes.map((box, index) => (
        <div
          key={index}
          aria-hidden
          className="absolute rounded-sm border-2 border-amber-500 bg-amber-400/20"
          style={{
            left: `${(box.x / image.width) * 100}%`,
            top: `${(box.y / image.height) * 100}%`,
            width: `${(box.width / image.width) * 100}%`,
            height: `${(box.height / image.height) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}
