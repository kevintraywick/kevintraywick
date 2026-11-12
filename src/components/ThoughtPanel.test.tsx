import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThoughtPanel } from './ThoughtPanel'
import { fetchEntry } from '../hooks/useFeed'

const mockPostEntry = vi.fn()
const mockPostComment = vi.fn()

vi.mock('../hooks/useFeed', () => ({
  useFeed: () => ({
    entries: [
      { id: 9, title: 'A photo', created_at: '2026-11-03 10:00:00', comment_count: 0, image_url: 'https://cdn.example.com/p.jpg' },
      { id: 8, title: 'Newest', note: 'Newest thought', created_at: '2026-11-02 18:05:00', comment_count: 0 },
      { id: 7, title: 'A link', note: 'link note', link: 'https://example.com', created_at: '2026-11-01 10:00:00', comment_count: 0 },
      { id: 6, title: 'Older', note: 'Older thought', created_at: '2026-10-01 09:30:00', comment_count: 1 },
    ],
    loading: false,
    error: false,
    postEntry: mockPostEntry,
    postComment: mockPostComment,
  }),
  fetchEntry: vi.fn(),
}))

beforeEach(() => {
  mockPostEntry.mockReset()
  mockPostEntry.mockResolvedValue({})
  mockPostComment.mockReset()
  mockPostComment.mockResolvedValue({ id: 50, entry_id: 8, body: 'a reply', created_at: '2026-11-05 12:00:00' })
  vi.mocked(fetchEntry).mockReset()
  vi.mocked(fetchEntry).mockResolvedValue({
    id: 6, title: 'Older', created_at: '2026-10-01 09:30:00',
    comments: [{ id: 40, entry_id: 6, body: 'An earlier reply', created_at: '2026-10-02 08:00:00' }],
  })
})

test('shows the newest post with a date and time, skipping photos and links', () => {
  render(<ThoughtPanel />)
  expect(screen.getByText('Newest thought')).toBeInTheDocument()
  expect(screen.getByText(/Nov 2, 2026 · \d{1,2}:\d\d/)).toBeInTheDocument()
})

test('"+ new entry" is offered on every post, not just the newest', () => {
  render(<ThoughtPanel />)
  expect(screen.getByLabelText('New entry')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Older post'))
  expect(screen.getByLabelText('New entry')).toBeInTheDocument()
})

test('arrows step back and forward in time', () => {
  render(<ThoughtPanel />)
  expect(screen.queryByLabelText('Newer post')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Older post'))
  expect(screen.getByText('Older thought')).toBeInTheDocument()
  expect(screen.queryByLabelText('Older post')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Newer post'))
  expect(screen.getByText('Newest thought')).toBeInTheDocument()
})

test('there is no write line until the box is clicked', () => {
  render(<ThoughtPanel />)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Newest thought'))
  expect(screen.getByLabelText('Reply to this post')).toHaveFocus()
})

test('clicking an arrow does not open the write line', () => {
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByLabelText('Older post'))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('writing on an existing post adds a reply under it, not a new post', async () => {
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByText('Newest thought'))
  const box = screen.getByLabelText('Reply to this post')
  fireEvent.change(box, { target: { value: '  a reply  ' } })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(mockPostComment).not.toHaveBeenCalled()
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(mockPostComment).toHaveBeenCalledWith(8, 'a reply')
  expect(mockPostEntry).not.toHaveBeenCalled()
  expect(await screen.findByRole('list', { name: 'Replies' })).toHaveTextContent('a reply')
  expect(screen.getByText('Newest thought')).toBeInTheDocument()
  // committed: the write line is gone
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('a post that has replies shows its thread', async () => {
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByLabelText('Older post'))
  expect(await screen.findByText('An earlier reply')).toBeInTheDocument()
  expect(fetchEntry).toHaveBeenCalledWith('6')
})

test('"+ new entry" opens a blank page ready to type, and writing there makes a new post', async () => {
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByLabelText('New entry'))
  expect(screen.queryByText('Newest thought')).not.toBeInTheDocument()
  const box = screen.getByLabelText('Write a post')
  expect(box).toHaveFocus()
  fireEvent.change(box, { target: { value: 'one two three four five six seven' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(mockPostEntry).toHaveBeenCalledWith('one two three four five six…', undefined, 'one two three four five six seven')
  expect(mockPostComment).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
})

test('the blank page steps back to the newest post', () => {
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByLabelText('New entry'))
  fireEvent.click(screen.getByLabelText('Older post'))
  expect(screen.getByText('Newest thought')).toBeInTheDocument()
})

test('an empty write line does not post, and closes when left', () => {
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByText('Newest thought'))
  const box = screen.getByLabelText('Reply to this post')
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(mockPostComment).not.toHaveBeenCalled()
  fireEvent.blur(box)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
})

test('a failed save keeps the draft and says so', async () => {
  mockPostComment.mockRejectedValue(new Error('nope'))
  render(<ThoughtPanel />)
  fireEvent.click(screen.getByText('Newest thought'))
  const box = screen.getByLabelText('Reply to this post') as HTMLTextAreaElement
  fireEvent.change(box, { target: { value: 'keep me' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t save/i)
  expect(box.value).toBe('keep me')
})
