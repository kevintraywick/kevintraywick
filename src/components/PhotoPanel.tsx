import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed, uploadImage } from '../hooks/useFeed'
import { formatDate, hostname } from '../utils/format'

const MAX_DIMENSION = 2400
const RESIZE_THRESHOLD_BYTES = 4 * 1024 * 1024

const PAN_KEY_PREFIX = 'photoPan:'
const CENTER = { x: 50, y: 50 }

function loadPan(id: number | undefined): { x: number; y: number } {
  if (id == null) return CENTER
  try {
    const raw = localStorage.getItem(PAN_KEY_PREFIX + id)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p.x === 'number' && typeof p.y === 'number') return p
    }
  } catch {
    // ignore
  }
  return CENTER
}

function clampPercent(n: number) {
  return Math.min(100, Math.max(0, n))
}

// Photos.app and modern cameras can hand us files past the API's 10MB cap;
// downscale client-side and fall back to the original if decoding fails (e.g. jsdom, odd formats).
async function downscaleImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < RESIZE_THRESHOLD_BYTES) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function PhotoPanel() {
  const { entries, postEntry } = useFeed()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'error'>('idle')

  const photos = entries.filter(e => e.image_url)
  const photo = photos[index] ?? photos[photos.length - 1]

  // Pan: object-cover crops tall/wide photos; dragging the image adjusts
  // object-position, remembered per photo in localStorage.
  const [pan, setPan] = useState(() => loadPan(photo?.id))
  const panDrag = useRef<{
    startX: number
    startY: number
    panX: number
    panY: number
    overflowX: number
    overflowY: number
    last: { x: number; y: number } | null
  } | null>(null)

  const [panPhotoId, setPanPhotoId] = useState(photo?.id)
  if (photo?.id !== panPhotoId) {
    setPanPhotoId(photo?.id)
    setPan(loadPan(photo?.id))
  }

  function handlePanStart(e: React.PointerEvent<HTMLImageElement>) {
    const img = e.currentTarget
    if (!img.naturalWidth || !img.naturalHeight) return
    const rect = img.getBoundingClientRect()
    const scale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
    const overflowX = img.naturalWidth * scale - rect.width
    const overflowY = img.naturalHeight * scale - rect.height
    if (overflowX < 1 && overflowY < 1) return
    panDrag.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, overflowX, overflowY, last: null }
    img.setPointerCapture?.(e.pointerId)
  }

  function handlePanMove(e: React.PointerEvent<HTMLImageElement>) {
    const d = panDrag.current
    if (!d) return
    d.last = {
      x: d.overflowX >= 1 ? clampPercent(d.panX - ((e.clientX - d.startX) / d.overflowX) * 100) : d.panX,
      y: d.overflowY >= 1 ? clampPercent(d.panY - ((e.clientY - d.startY) / d.overflowY) * 100) : d.panY,
    }
    setPan(d.last)
  }

  function handlePanEnd(e: React.PointerEvent<HTMLImageElement>) {
    const d = panDrag.current
    if (!d) return
    panDrag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (d.last && photo) {
      try {
        localStorage.setItem(PAN_KEY_PREFIX + photo.id, JSON.stringify(d.last))
      } catch {
        // ignore
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    const isFile = e.dataTransfer.types.includes('Files')
    if (isFile) {
      if (!isFileDragOver) setIsFileDragOver(true)
      if (isDragOver) setIsDragOver(false)
    } else {
      if (!isDragOver) setIsDragOver(true)
      if (isFileDragOver) setIsFileDragOver(false)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
      setIsFileDragOver(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    setIsFileDragOver(false)

    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) {
      setUploadState('loading')
      try {
        const resized = await downscaleImage(file)
        const imageUrl = await uploadImage(resized)
        await postEntry(formatDate(new Date().toISOString(), true), undefined, undefined, imageUrl)
        setIndex(0)
        setUploadState('idle')
      } catch {
        setUploadState('error')
        setTimeout(() => setUploadState('idle'), 1500)
      }
      return
    }

    // URL drops still open the blog composer, as the old feed panel did
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) {
      navigate('/blog', { state: { title: hostname(url), link: url } })
    }
  }

  const hasOlder = index < photos.length - 1
  const hasNewer = index > 0

  return (
    <div
      className="group absolute inset-0 overflow-hidden transition-colors"
      style={{ background: isDragOver ? 'rgba(255,255,255,0.08)' : 'transparent' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Current photo */}
      {photo ? (
        <img
          src={photo.image_url}
          alt={photo.title}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none cursor-grab active:cursor-grabbing"
          style={{
            objectPosition: `${pan.x}% ${pan.y}%`,
            touchAction: 'none',
          }}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white/40 font-sans text-xs">drag a photo here</span>
        </div>
      )}

      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center"
        style={{ height: '22px', background: 'linear-gradient(rgba(0,0,0,0.35), transparent)' }}
      >
        <button
          onClick={() => navigate('/blog')}
          aria-label="Go to blog"
          disabled={uploadState === 'loading'}
          className="absolute cursor-pointer"
          style={{ left: '8px', marginTop: '5px' }}
        >
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-white leading-none"
            style={{
              background: uploadState === 'error' ? '#f87171' : '#999',
              fontSize: uploadState === 'loading' ? '10px' : '16px',
              opacity: uploadState !== 'idle' ? 0.8 : isFileDragOver ? 0.8 : 0.4,
            }}
          >
            {uploadState === 'loading' ? '…' : uploadState === 'error' ? '✕' : '+'}
          </span>
        </button>
        <a href="/cc" className="w-5 h-5 rounded-full block" style={{ background: '#999', opacity: 0.4, marginTop: '5px' }} />
        <a href="/me" className="w-5 h-5 rounded-full block" style={{ background: '#5af', opacity: 0.4, marginTop: '5px', marginLeft: '8px' }} />
        <a href="https://movealong-production.up.railway.app" target="_blank" rel="noopener noreferrer" className="block" style={{ opacity: 0.4, marginLeft: '8px', fontSize: '20px', color: '#999', lineHeight: '20px', marginTop: '5px' }}>→</a>
      </div>

      {/* Slideshow arrows — back in time on the left; forward appears once you've gone back */}
      {hasOlder && (
        <button
          aria-label="Older photo"
          onClick={() => setIndex(i => Math.min(i + 1, photos.length - 1))}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)', fontSize: '20px', lineHeight: 1, paddingBottom: '2px' }}
        >
          ‹
        </button>
      )}
      {hasNewer && (
        <button
          aria-label="Newer photo"
          onClick={() => setIndex(i => Math.max(i - 1, 0))}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)', fontSize: '20px', lineHeight: 1, paddingBottom: '2px' }}
        >
          ›
        </button>
      )}

      {/* Date chip */}
      {photo && (
        <span
          className="absolute left-2 bottom-2 text-white/80 font-sans text-[11px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          {formatDate(photo.created_at, true)}
        </span>
      )}

      {/* Drop overlay — sits over the photo without hiding it */}
      {(isFileDragOver || uploadState === 'loading') && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="absolute rounded-lg pointer-events-none"
            style={{ inset: '10px', border: '2px dashed rgba(255,255,255,0.7)' }}
          />
          <span className="text-white font-sans text-sm">
            {uploadState === 'loading' ? 'Uploading…' : 'Drop photo'}
          </span>
        </div>
      )}
    </div>
  )
}
