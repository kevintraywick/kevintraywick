import { useState, useEffect } from 'react'

export const API_URL: string = import.meta.env.VITE_API_URL || ''

export interface Entry {
  id: number
  title: string
  link?: string
  note?: string
  image_url?: string
  // 'note' = a blog post even though it has an image (shown in the thoughts box)
  kind?: 'note' | null
  pan_x?: number | null
  pan_y?: number | null
  created_at: string
  comment_count: number
}

export interface Comment {
  id: number
  entry_id: number
  body: string
  created_at: string
}

export interface EntryDetail extends Omit<Entry, 'comment_count'> {
  comments: Comment[]
}

export type EntryKind = 'photo' | 'note'

// `kind` asks the API for just photos or just written notes, so each homepage
// box pages through its own history (unfiltered, the API returns the 20 newest
// of everything and one kind can crowd out the other).
export function useFeed(kind?: EntryKind) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/entries${kind ? `?kind=${kind}` : ''}`)
      .then(r => r.json())
      .then(setEntries)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [kind])

  async function postEntry(title: string, link?: string, note?: string, imageUrl?: string, kind?: 'note'): Promise<Entry> {
    const secret = import.meta.env.VITE_POST_SECRET
    const res = await fetch(`${API_URL}/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({
        title,
        link: link || undefined,
        note: note || undefined,
        image_url: imageUrl || undefined,
        kind,
      }),
    })
    if (!res.ok) throw new Error('Post failed')
    const entry: Entry = await res.json()
    setEntries(prev => [{ ...entry, comment_count: 0 }, ...prev])
    return entry
  }

  async function postComment(entryId: number, body: string): Promise<Comment> {
    const res = await fetch(`${API_URL}/entries/${entryId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) throw new Error('Comment failed')
    const comment: Comment = await res.json()
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, comment_count: e.comment_count + 1 } : e
    ))
    return comment
  }

  async function updateEntryPan(entryId: number, panX: number, panY: number): Promise<void> {
    const secret = import.meta.env.VITE_POST_SECRET
    const res = await fetch(`${API_URL}/entries/${entryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({ pan_x: panX, pan_y: panY }),
    })
    if (!res.ok) throw new Error('Pan update failed')
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, pan_x: panX, pan_y: panY } : e
    ))
  }

  // Rewrites a post's words in place: same id, same date, same replies.
  // An empty note clears an image post's caption.
  async function updateEntryText(entryId: number, title: string, note: string): Promise<void> {
    const secret = import.meta.env.VITE_POST_SECRET
    const res = await fetch(`${API_URL}/entries/${entryId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify({ title, note }),
    })
    if (!res.ok) throw new Error('Edit failed')
    const saved: Entry = await res.json()
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, title: saved.title, note: saved.note ?? undefined } : e
    ))
  }

  return { entries, loading, error, postEntry, postComment, updateEntryPan, updateEntryText }
}

export async function fetchEntry(id: string): Promise<EntryDetail> {
  const res = await fetch(`${API_URL}/entries/${id}`)
  if (!res.ok) throw new Error('Not found')
  return res.json()
}

export async function uploadImage(file: File): Promise<string> {
  const secret = import.meta.env.VITE_POST_SECRET
  const body = new FormData()
  body.append('image', file)
  const res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${secret}` },
    body,
  })
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json()
  return data.url as string
}
