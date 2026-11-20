import { useEffect, useRef, useState } from 'react'
import { useFeed, fetchEntry, uploadImage, type Comment } from '../hooks/useFeed'
import { formatDate, formatDateTime } from '../utils/format'
import { downscaleImage } from '../utils/image'

function titleFrom(text: string) {
  const words = text.split(/\s+/)
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '')
}

// -1 is the blank page ("+ new entry"), where writing starts a new post.
const NEW_PAGE = -1

const circleClass =
  'absolute w-8 h-8 rounded-full flex items-center justify-center text-black/70 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'
const arrowClass = `${circleClass} top-1/2 -translate-y-1/2`
const arrowStyle = { background: 'rgba(0,0,0,0.08)', fontSize: '20px', lineHeight: 1, paddingBottom: '2px' } as const
const stampClass = 'block mt-1 font-sans text-[11px] tracking-wide text-black/45'

// One post at a time. Clicking the box opens a write line: on a post it adds a
// reply under it (a thread), on the blank page it starts a new post. Enter
// commits either one. The pencil in the top corner turns the post's own words
// into the write line: Enter saves them in place (same date, same replies),
// Escape puts them back. Replies are not editable. Dropping an image
// anywhere on the box posts it as a new entry (kind 'note', so it stays out of
// the photo box); text waiting on the blank page goes along as its caption.
export function ThoughtPanel() {
  const { entries, loading, error, postEntry, postComment, updateEntryText } = useFeed('note')
  const [index, setIndex] = useState(0)
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [threads, setThreads] = useState<Record<number, Comment[]>>({})
  const [dropState, setDropState] = useState<'idle' | 'over' | 'posting' | 'error' | 'not-image'>('idle')
  const scroller = useRef<HTMLDivElement>(null)
  const editBox = useRef<HTMLTextAreaElement>(null)

  const thoughts = entries.filter(e => e.kind === 'note' || (!e.image_url && !e.link && e.note))
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

  // The edit box is as tall as the words in it
  useEffect(() => {
    const el = editBox.current
    if (!editing || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing, draft])

  function startEdit() {
    if (!thought) return
    setDraft(thought.note ?? '')
    setWriting(false)
    setEditing(true)
    setSaveState('idle')
  }

  function cancelEdit() {
    setEditing(false)
    setDraft('')
    setSaveState('idle')
  }

  async function save() {
    const text = draft.trim()
    if (saveState === 'saving') return
    // Only a picture's caption may be emptied; a post of words needs words
    if (!text && !(editing && thought?.image_url)) return
    if (editing && thought && text === (thought.note ?? '')) return cancelEdit()
    setSaveState('saving')
    try {
      if (editing && thought) {
        // An image post with no caption is titled by its date, as when it was posted
        const title = text ? titleFrom(text) : formatDateTime(thought.created_at).split(' · ')[0]
        await updateEntryText(thought.id, title, text)
        setEditing(false)
      } else if (thought) {
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
    } else if (e.key === 'Escape' && editing) {
      cancelEdit()
    } else if (e.key === 'Escape' && !draft.trim()) {
      setWriting(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (dropState === 'idle') setDropState('over')
  }

  function handleDragLeave(e: React.DragEvent) {
    if (dropState === 'over' && !e.currentTarget.contains(e.relatedTarget as Node)) setDropState('idle')
  }

  async function handleDrop(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (dropState === 'posting') return
    const flash = (state: 'error' | 'not-image') => {
      setDropState(state)
      setTimeout(() => setDropState('idle'), 1800)
    }
    const file = e.dataTransfer.files[0]
    if (!file?.type.startsWith('image/')) return flash('not-image')
    // Text waiting on the blank page becomes the caption (a reply in progress never does)
    const caption = thought ? '' : draft.trim()
    setDropState('posting')
    try {
      const imageUrl = await uploadImage(await downscaleImage(file))
      const title = caption ? titleFrom(caption) : formatDate(new Date().toISOString(), true)
      await postEntry(title, undefined, caption || undefined, imageUrl, 'note')
      go(0)
      setDropState('idle')
    } catch {
      flash('error')
    }
  }

  function go(to: number, startWriting = false) {
    setIndex(to)
    setWriting(startWriting)
    setEditing(false)
    setDraft('')
    setSaveState('idle')
  }

  return (
    <div
      className="group absolute inset-0 flex flex-col cursor-text"
      style={{ background: '#f4f2ec', containerType: 'size' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="group"
      aria-label={thought ? 'Post — click to reply' : 'Click to write a post'}
      tabIndex={0}
      onClick={e => { if (!editing && !(e.target as HTMLElement).closest('button')) setWriting(true) }}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget && !editing) { e.preventDefault(); setWriting(true) } }}
    >
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-12 py-5 flex flex-col">
        <div className="my-auto">
          {thought ? (
            <article>
              {thought.image_url && (
                // Capped to the box's own height so the picture and its date fit without scrolling
                <img
                  src={thought.image_url}
                  alt={thought.note ? '' : thought.title}
                  draggable={false}
                  className={`block max-w-full w-auto h-auto select-none ${thought.note ? 'mb-2' : ''}`}
                  style={{ maxHeight: '68cqh' }}
                />
              )}
              {editing ? (
                <>
                  <textarea
                    ref={editBox}
                    autoFocus
                    aria-label="Edit this post"
                    placeholder={thought.image_url ? 'Caption, then press Enter' : 'Write, then press Enter'}
                    rows={1}
                    value={draft}
                    disabled={saveState === 'saving'}
                    onChange={e => { setDraft(e.target.value); if (saveState === 'error') setSaveState('idle') }}
                    onKeyDown={handleKeyDown}
                    onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                    className="block w-full resize-none overflow-hidden bg-transparent border-0 p-0 font-instrument text-black placeholder:text-black/30 outline-none disabled:opacity-50"
                    style={{ fontSize: 'clamp(14px, calc(1.7vw - 4px), 22px)', lineHeight: 1.25 }}
                  />
                  <p className="font-sans text-[11px] text-black/45">Enter saves · Esc cancels</p>
                  {saveState === 'error' && (
                    <p role="alert" className="font-sans text-[11px] text-red-700">
                      Didn’t save — press Enter to try again.
                    </p>
                  )}
                </>
              ) : thought.note && (
                <p
                  className="font-instrument text-black whitespace-pre-wrap break-words"
                  style={{ fontSize: 'clamp(14px, calc(1.7vw - 4px), 22px)', lineHeight: 1.25 }}
                >
                  {thought.note}
                </p>
              )}
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
                style={{ fontSize: thought ? '15px' : 'clamp(14px, calc(1.7vw - 4px), 22px)', lineHeight: 1.25 }}
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

      {/* Drop overlay — says what a drop will do, and what happened to it */}
      {dropState !== 'idle' && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(244,242,236,0.88)' }}
        >
          <div className="absolute rounded-lg" style={{ inset: '10px', border: '2px dashed rgba(0,0,0,0.35)' }} />
          <span className={`font-sans text-sm ${dropState === 'error' || dropState === 'not-image' ? 'text-red-700' : 'text-black/70'}`}>
            {dropState === 'over' && 'Drop image to post'}
            {dropState === 'posting' && 'Posting…'}
            {dropState === 'error' && 'Didn’t post — try again'}
            {dropState === 'not-image' && 'Images only'}
          </span>
        </div>
      )}

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
      {/* Edit: the same circle, in the top corner so it never sits under an arrow or the + */}
      {thought && !editing && (
        <button aria-label="Edit this post" onClick={startEdit} className={`${circleClass} top-2 right-2`} style={{ ...arrowStyle, fontSize: '15px', paddingBottom: 0 }}>
          ✎
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
