import { useEffect, useRef, useState } from 'react'
import { useFeed, fetchEntry, type Comment } from '../hooks/useFeed'
import { formatDateTime } from '../utils/format'

function titleFrom(text: string) {
  const words = text.split(/\s+/)
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '')
}

// -1 is the blank page ("+ new entry"), where writing starts a new post.
const NEW_PAGE = -1

const arrowClass =
  'absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-black/70 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'
const arrowStyle = { background: 'rgba(0,0,0,0.08)', fontSize: '20px', lineHeight: 1, paddingBottom: '2px' } as const
const stampClass = 'block mt-1 font-sans text-[11px] tracking-wide text-black/45'

// One post at a time. Clicking the box opens a write line: on a post it adds a
// reply under it (a thread), on the blank page it starts a new post. Enter
// commits either one — there is no editing afterwards.
export function ThoughtPanel() {
  const { entries, loading, error, postEntry, postComment } = useFeed('note')
  const [index, setIndex] = useState(0)
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [threads, setThreads] = useState<Record<number, Comment[]>>({})
  const scroller = useRef<HTMLDivElement>(null)

  const thoughts = entries.filter(e => !e.image_url && !e.link && e.note)
  const onNewPage = index === NEW_PAGE || thoughts.length === 0
  const thought = onNewPage ? undefined : thoughts[Math.min(index, thoughts.length - 1)]
  const replies = thought ? threads[thought.id] : undefined
  const hasOlder = thoughts.length > 0 && index < thoughts.length - 1
  const hasNewer = index > 0

  // Load a post's thread the first time it is shown
  const thoughtId = thought?.id
  const needsThread = !!thought && thought.comment_count > 0 && !replies
  useEffect(() => {
    if (thoughtId == null || !needsThread) return
    let stale = false
    fetchEntry(String(thoughtId))
      .then(detail => { if (!stale) setThreads(t => ({ ...t, [thoughtId]: detail.comments })) })
      .catch(() => {})
    return () => { stale = true }
  }, [thoughtId, needsThread])

  // Keep the newest reply and the write line in view
  const replyCount = replies?.length ?? 0
  useEffect(() => {
    const el = scroller.current
    if (el && (writing || replyCount > 0)) el.scrollTop = el.scrollHeight
  }, [writing, replyCount, thoughtId])

  async function save() {
    const text = draft.trim()
    if (!text || saveState === 'saving') return
    setSaveState('saving')
    try {
      if (thought) {
        const reply = await postComment(thought.id, text)
        setThreads(t => ({ ...t, [thought.id]: [...(t[thought.id] ?? []), reply] }))
      } else {
        await postEntry(titleFrom(text), undefined, text)
        setIndex(0)
      }
      setDraft('')
      setWriting(false)
      setSaveState('idle')
    } catch {
      // Keep the draft so nothing typed is lost
      setSaveState('error')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter commits; Shift+Enter is a line break. Ignore Enter mid-IME-composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape' && !draft.trim()) {
      setWriting(false)
    }
  }

  function go(to: number, startWriting = false) {
    setIndex(to)
    setWriting(startWriting)
    setDraft('')
    setSaveState('idle')
  }

  return (
    <div
      className="group absolute inset-0 flex flex-col cursor-text"
      style={{ background: '#f4f2ec' }}
      role="group"
      aria-label={thought ? 'Post — click to reply' : 'Click to write a post'}
      tabIndex={0}
      onClick={e => { if (!(e.target as HTMLElement).closest('button')) setWriting(true) }}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); setWriting(true) } }}
    >
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-12 py-5 flex flex-col">
        <div className="my-auto">
          {thought ? (
            <article>
              <p
                className="font-instrument text-black whitespace-pre-wrap break-words"
                style={{ fontSize: 'clamp(14px, calc(1.7vw - 4px), 24px)', lineHeight: 1.25 }}
              >
                {thought.note}
              </p>
              <time dateTime={thought.created_at} className={stampClass}>
                {formatDateTime(thought.created_at)}
              </time>
              {replies && replies.length > 0 && (
                <ol aria-label="Replies" className="mt-3 ml-1 pl-3 border-l border-black/15 space-y-2">
                  {replies.map(reply => (
                    <li key={reply.id}>
                      <p
                        className="font-instrument text-black/85 whitespace-pre-wrap break-words"
                        style={{ fontSize: '15px', lineHeight: 1.25 }}
                      >
                        {reply.body}
                      </p>
                      <time dateTime={reply.created_at} className={stampClass}>
                        {formatDateTime(reply.created_at)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ) : (
            !writing && (
              <p className="font-sans text-xs text-black/40 text-center">
                {loading ? '' : error ? 'couldn’t load' : 'click to write'}
              </p>
            )
          )}

          {writing && (
            <div className={thought ? 'mt-3 ml-1 pl-3 border-l border-black/15' : ''}>
              <textarea
                autoFocus
                aria-label={thought ? 'Reply to this post' : 'Write a post'}
                placeholder={thought ? 'Reply, then press Enter' : 'Write, then press Enter'}
                rows={2}
                value={draft}
                disabled={saveState === 'saving'}
                onChange={e => { setDraft(e.target.value); if (saveState === 'error') setSaveState('idle') }}
                onKeyDown={handleKeyDown}
                onBlur={() => { if (!draft.trim() && saveState !== 'saving') setWriting(false) }}
                className="block w-full resize-none bg-transparent border-0 p-0 font-instrument text-black placeholder:text-black/30 outline-none disabled:opacity-50"
                style={{ fontSize: thought ? '15px' : 'clamp(14px, calc(1.7vw - 4px), 24px)', lineHeight: 1.25 }}
              />
              {saveState === 'error' && (
                <p role="alert" className="font-sans text-[11px] text-red-700">
                  Didn’t save — press Enter to try again.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Same arrows as the photo box: back in time on the left, forward on the right */}
      {hasOlder && (
        <button
          aria-label="Older post"
          onClick={() => go(Math.min(Math.max(index, NEW_PAGE) + 1, thoughts.length - 1))}
          className={`${arrowClass} left-2`}
          style={arrowStyle}
        >
          ‹
        </button>
      )}
      {hasNewer && (
        <button aria-label="Newer post" onClick={() => go(index - 1)} className={`${arrowClass} right-2`} style={arrowStyle}>
          ›
        </button>
      )}
      {/* New entry: on the newest post only, where the newer arrow would be — same circle, same hover */}
      {!onNewPage && !hasNewer && (
        <button aria-label="New entry" onClick={() => go(NEW_PAGE, true)} className={`${arrowClass} right-2`} style={arrowStyle}>
          +
        </button>
      )}
    </div>
  )
}
