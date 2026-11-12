import { useState } from 'react'
import { useFeed } from '../hooks/useFeed'
import { formatDateTime } from '../utils/format'

const WRITE_KEY = 'kt_write'

// The post secret ships in the public bundle, so this isn't security — it just
// keeps the write box off the page for visitors. Opening /?write once turns it
// on for that browser (kept in localStorage); /?write=off turns it back off.
function readWriteMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('write')) {
      if (params.get('write') === 'off') localStorage.removeItem(WRITE_KEY)
      else localStorage.setItem(WRITE_KEY, '1')
      window.history.replaceState(null, '', window.location.pathname)
    }
    return localStorage.getItem(WRITE_KEY) === '1'
  } catch {
    return false
  }
}

function titleFrom(text: string) {
  const words = text.split(/\s+/)
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '')
}

const arrowClass =
  'absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-black/70 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'
const arrowStyle = { background: 'rgba(0,0,0,0.08)', fontSize: '20px', lineHeight: 1, paddingBottom: '2px' } as const

export function ThoughtPanel() {
  const { entries, loading, error, postEntry } = useFeed('note')
  const [canWrite] = useState(readWriteMode)
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')

  const thoughts = entries.filter(e => !e.image_url && !e.link && e.note)
  const thought = thoughts[index] ?? thoughts[thoughts.length - 1]
  const hasOlder = index < thoughts.length - 1
  const hasNewer = index > 0

  async function save() {
    const text = draft.trim()
    if (!text || saveState === 'saving') return
    setSaveState('saving')
    try {
      await postEntry(titleFrom(text), undefined, text)
      setDraft('')
      setIndex(0)
      setSaveState('idle')
    } catch {
      // Keep the draft so nothing typed is lost
      setSaveState('error')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter saves; Shift+Enter is a line break. Ignore Enter mid-IME-composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      save()
    }
  }

  return (
    <div className="group absolute inset-0 flex flex-col" style={{ background: '#f4f2ec' }}>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-12 pt-6 pb-3 flex flex-col">
        {thought ? (
          <article className="my-auto">
            <p
              className="font-instrument text-black whitespace-pre-wrap break-words"
              style={{ fontSize: 'clamp(18px, 1.7vw, 28px)', lineHeight: 1.25 }}
            >
              {thought.note}
            </p>
            <time
              dateTime={thought.created_at}
              className="block mt-3 font-sans text-[11px] tracking-wide text-black/45"
            >
              {formatDateTime(thought.created_at)}
            </time>
          </article>
        ) : (
          <p className="my-auto font-sans text-xs text-black/40 text-center">
            {loading ? '' : error ? 'couldn’t load' : canWrite ? 'nothing yet — write below' : 'nothing yet'}
          </p>
        )}
      </div>

      {canWrite && (
        <div className="shrink-0 px-12 pb-4">
          <textarea
            aria-label="Write a thought"
            placeholder="Write a thought, press Enter"
            rows={2}
            value={draft}
            disabled={saveState === 'saving'}
            onChange={e => { setDraft(e.target.value); if (saveState === 'error') setSaveState('idle') }}
            onKeyDown={handleKeyDown}
            className="block w-full resize-none bg-transparent border-0 border-t border-black/15 pt-2 font-instrument text-black placeholder:text-black/30 outline-none focus:border-black/50 disabled:opacity-50"
            style={{ fontSize: '17px', lineHeight: 1.25 }}
          />
          {saveState === 'error' && (
            <p role="alert" className="font-sans text-[11px] text-red-700">
              Didn’t save — press Enter to try again.
            </p>
          )}
        </div>
      )}

      {/* Same arrows as the photo box: back in time on the left, forward once you've gone back */}
      {hasOlder && (
        <button
          aria-label="Older thought"
          onClick={() => setIndex(i => Math.min(i + 1, thoughts.length - 1))}
          className={`${arrowClass} left-2`}
          style={arrowStyle}
        >
          ‹
        </button>
      )}
      {hasNewer && (
        <button
          aria-label="Newer thought"
          onClick={() => setIndex(i => Math.max(i - 1, 0))}
          className={`${arrowClass} right-2`}
          style={arrowStyle}
        >
          ›
        </button>
      )}
    </div>
  )
}
