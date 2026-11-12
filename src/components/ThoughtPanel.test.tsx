import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThoughtPanel } from './ThoughtPanel'

const mockPostEntry = vi.fn()

vi.mock('../hooks/useFeed', () => ({
  useFeed: () => ({
    entries: [
      { id: 9, title: 'A photo', created_at: '2026-11-03 10:00:00', comment_count: 0, image_url: 'https://cdn.example.com/p.jpg' },
      { id: 8, title: 'Newest', note: 'Newest thought', created_at: '2026-11-02 18:05:00', comment_count: 0 },
      { id: 7, title: 'A link', note: 'link note', link: 'https://example.com', created_at: '2026-11-01 10:00:00', comment_count: 0 },
      { id: 6, title: 'Older', note: 'Older thought', created_at: '2026-10-01 09:30:00', comment_count: 0 },
    ],
    loading: false,
    error: false,
    postEntry: mockPostEntry,
  }),
}))

beforeEach(() => {
  mockPostEntry.mockReset()
  mockPostEntry.mockResolvedValue({})
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

test('shows the newest thought with a date and time, skipping photos and links', () => {
  render(<ThoughtPanel />)
  expect(screen.getByText('Newest thought')).toBeInTheDocument()
  expect(screen.getByText(/Nov 2, 2026 · \d{1,2}:\d\d/)).toBeInTheDocument()
})

test('arrows step back and forward in time', () => {
  render(<ThoughtPanel />)
  expect(screen.queryByLabelText('Newer thought')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Older thought'))
  expect(screen.getByText('Older thought')).toBeInTheDocument()
  expect(screen.queryByLabelText('Older thought')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Newer thought'))
  expect(screen.getByText('Newest thought')).toBeInTheDocument()
})

test('visitors get no write box', () => {
  render(<ThoughtPanel />)
  expect(screen.queryByLabelText('Write a thought')).not.toBeInTheDocument()
})

test('?write turns the write box on and remembers it', () => {
  window.history.replaceState(null, '', '/?write')
  render(<ThoughtPanel />)
  expect(screen.getByLabelText('Write a thought')).toBeInTheDocument()
  expect(localStorage.getItem('kt_write')).toBe('1')
  expect(window.location.search).toBe('')
})

test('Enter posts the thought and clears the box; Shift+Enter does not post', async () => {
  localStorage.setItem('kt_write', '1')
  render(<ThoughtPanel />)
  const box = screen.getByLabelText('Write a thought') as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: '  one two three four five six seven  ' } })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(mockPostEntry).not.toHaveBeenCalled()
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(mockPostEntry).toHaveBeenCalledWith('one two three four five six…', undefined, 'one two three four five six seven')
  await waitFor(() => expect(box.value).toBe(''))
})

test('an empty box does not post', () => {
  localStorage.setItem('kt_write', '1')
  render(<ThoughtPanel />)
  fireEvent.keyDown(screen.getByLabelText('Write a thought'), { key: 'Enter' })
  expect(mockPostEntry).not.toHaveBeenCalled()
})

test('a failed save keeps the draft and says so', async () => {
  mockPostEntry.mockRejectedValue(new Error('nope'))
  localStorage.setItem('kt_write', '1')
  render(<ThoughtPanel />)
  const box = screen.getByLabelText('Write a thought') as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: 'keep me' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t save/i)
  expect(box.value).toBe('keep me')
})
