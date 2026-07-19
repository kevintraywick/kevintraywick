import { useState, useEffect } from 'react'

export const API_URL: string = import.meta.env.VITE_API_URL || ''

export interface Entry {
  id: number
  title: string
  link?: string
  note?: string
  image_url?: string
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

export function useFeed() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/entries`)
      .then(r => r.json())
      .then(setEntries)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  async function postEntry(title: string, link?: string, note?: string, imageUrl?: string): Promise<Entry> {
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

  return { entries, loading, error, postEntry, postComment, updateEntryPan }
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
