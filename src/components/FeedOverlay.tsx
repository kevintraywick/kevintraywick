import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed, uploadImage, fetchEntry, type Comment } from '../hooks/useFeed'
import { formatDate, hostname } from '../utils/format'

const FEED_PREVIEW_LIMIT = 8

export function FeedOverlay() {
  const { entries, postComment } = useFeed()
  const navigate = useNavigate()
  const [isDragOver, setIsDragOver] = useState(false)
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [commentValues, setCommentValues] = useState<Record<number, string>>({})
  const [commentErrors, setCommentErrors] = useState<Record<number, boolean>>({})

  const recent = entries.slice(0, FEED_PREVIEW_LIMIT)
  const [commentPreviews, setCommentPreviews] = useState<Record<number, Comment[]>>({})

  useEffect(() => {
    const withComments = recent.filter(e => e.comment_count > 0)
    withComments.forEach(entry => {
      if (commentPreviews[entry.id]) return
      fetchEntry(String(entry.id)).then(detail => {
        setCommentPreviews(prev => ({ ...prev, [entry.id]: detail.comments }))
      }).catch(() => {})
    })
  }, [entries])

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
        const imageUrl = await uploadImage(file)
        navigate('/blog', { state: { imageUrl, title: file.name } })
      } catch {
        setUploadState('error')
        setTimeout(() => setUploadState('idle'), 1500)
      }
      return
    }

    // URL drops (existing behavior)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (url?.startsWith('http')) {
      navigate('/blog', { state: { title: hostname(url), link: url } })
    }
  }

  async function handleComment(entryId: number) {
    const body = (commentValues[entryId] || '').trim()
    if (!body) return
    try {
      await postComment(entryId, body)
      setCommentValues(prev => ({ ...prev, [entryId]: '' }))
      setCommentErrors(prev => ({ ...prev, [entryId]: false }))
    } catch {
      setCommentErrors(prev => ({ ...prev, [entryId]: true }))
      setTimeout(() => setCommentErrors(prev => ({ ...prev, [entryId]: false })), 600)
    }
  }

  const anyDragOver = isDragOver || isFileDragOver

  return (
    <div
      className="absolute inset-0 flex flex-col font-sans text-xs overflow-hidden transition-colors"
      style={{ background: anyDragOver ? 'rgba(255,255,255,0.08)' : 'transparent' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header bar */}
      <div className="border-b border-white/10 flex-shrink-0 flex items-center justify-center relative" style={{ height: '22px' }}>
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
              opacity: uploadState !== 'idle' ? 0.8 : anyDragOver ? 0.8 : 0.4,
            }}
          >
            {uploadState === 'loading' ? '…' : uploadState === 'error' ? '✕' : '+'}
          </span>
        </button>
        <a href="/cc" className="w-5 h-5 rounded-full block" style={{ background: '#999', opacity: 0.4, marginTop: '5px' }} />
        <a href="/me" className="w-5 h-5 rounded-full block" style={{ background: '#5af', opacity: 0.4, marginTop: '5px', marginLeft: '8px' }} />
        <a href="https://movealong-production.up.railway.app" target="_blank" rel="noopener noreferrer" className="block" style={{ opacity: 0.4, marginLeft: '8px', fontSize: '20px', color: '#999', lineHeight: '20px', marginTop: '5px' }}>→</a>
      </div>

      {/* Feed */}
      <div
        className="flex-1 overflow-y-auto py-2.5 pl-2.5 pr-0 space-y-2 no-scrollbar"
        style={{ scrollbarWidth: 'none' }}
      >
        {recent.map(entry => (
          <div key={entry.id} className="bg-white/90 rounded p-2">
            {entry.image_url && (
              <div className="w-full h-16 overflow-hidden rounded mb-1">
                <img
                  src={entry.image_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="leading-snug">
              <span className="text-gray-500 text-[12px] mr-1.5">{formatDate(entry.created_at)}</span>
              <button
                className="font-semibold text-black hover:underline text-left text-[13px]"
                onClick={() => navigate('/blog/' + entry.id)}
              >
                {entry.title}
              </button>
              {entry.link && (
                <>
                  <span className="text-gray-400 mx-1">·</span>
                  <a
                    href={entry.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 italic text-[12px]"
                    onClick={e => e.stopPropagation()}
                  >
                    {hostname(entry.link)}
                  </a>
                </>
              )}
            </div>
            {entry.note && (
              <p className="text-black text-[12px] leading-snug mt-0.5 line-clamp-3">{entry.note}</p>
            )}
            {commentPreviews[entry.id]?.slice(0, 3).map(c => (
              <p key={c.id} className="text-gray-500 text-[11px] leading-snug mt-0.5 line-clamp-3">{c.body}</p>
            ))}
            <input
              className={`mt-1 w-full text-[12px] border rounded px-1.5 py-0.5 bg-white placeholder-gray-400 focus:outline-none ${commentErrors[entry.id] ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="Add a comment…"
              value={commentValues[entry.id] || ''}
              onChange={e => setCommentValues(prev => ({ ...prev, [entry.id]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleComment(entry.id) }}
            />
          </div>
        ))}
      </div>

    </div>
  )
}
