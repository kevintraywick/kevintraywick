import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PhotoPanel } from './PhotoPanel'
import { uploadImage } from '../hooks/useFeed'

const mockNavigate = vi.fn()
const mockPostEntry = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock('../hooks/useFeed', () => ({
  useFeed: () => ({
    entries: [
      { id: 4, title: 'Text-only entry', note: 'no image', created_at: '2026-07-14T00:00:00', comment_count: 0 },
      { id: 3, title: 'Newest photo', created_at: '2026-07-12T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/new.jpg' },
      { id: 2, title: 'Middle photo', created_at: '2026-06-01T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/mid.jpg' },
      { id: 1, title: 'Oldest photo', created_at: '2026-05-01T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/old.jpg' },
    ],
    loading: false,
    postEntry: mockPostEntry,
    postComment: vi.fn(),
  }),
  uploadImage: vi.fn(),
}))

beforeEach(() => {
  mockNavigate.mockClear()
  mockPostEntry.mockClear()
  vi.mocked(uploadImage).mockClear()
})

function renderPanel() {
  return render(<MemoryRouter><PhotoPanel /></MemoryRouter>)
}

// --- Slideshow ---

test('shows the newest photo entry, skipping entries without images', () => {
  renderPanel()
  expect(screen.getByAltText('Newest photo')).toHaveAttribute('src', 'https://cdn.example.com/new.jpg')
})

test('left arrow steps back in time', () => {
  renderPanel()
  fireEvent.click(screen.getByLabelText('Older photo'))
  expect(screen.getByAltText('Middle photo')).toBeInTheDocument()
})

test('right arrow only appears after going back, and returns forward', () => {
  renderPanel()
  expect(screen.queryByLabelText('Newer photo')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Older photo'))
  fireEvent.click(screen.getByLabelText('Newer photo'))
  expect(screen.getByAltText('Newest photo')).toBeInTheDocument()
})

test('left arrow disappears at the oldest photo', () => {
  renderPanel()
  fireEvent.click(screen.getByLabelText('Older photo'))
  fireEvent.click(screen.getByLabelText('Older photo'))
  expect(screen.getByAltText('Oldest photo')).toBeInTheDocument()
  expect(screen.queryByLabelText('Older photo')).not.toBeInTheDocument()
})

// --- Drop zone ---

test('dragging a file over shows the drop overlay without removing the photo', () => {
  const { container } = renderPanel()
  const panel = container.firstChild as HTMLElement
  fireEvent.dragOver(panel, { dataTransfer: { types: ['Files'], files: [] } })
  expect(screen.getByText('Drop photo')).toBeInTheDocument()
  expect(screen.getByAltText('Newest photo')).toBeInTheDocument()
})

test('dropping an image uploads it and posts a new entry without navigating', async () => {
  vi.mocked(uploadImage).mockResolvedValueOnce('https://cdn.example.com/uploaded.jpg')
  mockPostEntry.mockResolvedValueOnce({ id: 5 })

  const { container } = renderPanel()
  const panel = container.firstChild as HTMLElement
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  fireEvent.drop(panel, {
    dataTransfer: { files: [file], types: ['Files'], getData: () => '' },
  })

  await waitFor(() => expect(mockPostEntry).toHaveBeenCalled())
  const [title, link, note, imageUrl] = mockPostEntry.mock.calls[0]
  expect(title).toBeTruthy()
  expect(link).toBeUndefined()
  expect(note).toBeUndefined()
  expect(imageUrl).toBe('https://cdn.example.com/uploaded.jpg')
  expect(mockNavigate).not.toHaveBeenCalled()
})

test('dropping a non-image file does nothing', () => {
  const { container } = renderPanel()
  const panel = container.firstChild as HTMLElement
  const file = new File(['data'], 'document.pdf', { type: 'application/pdf' })

  fireEvent.drop(panel, {
    dataTransfer: { files: [file], types: ['Files'], getData: () => '' },
  })

  expect(vi.mocked(uploadImage)).not.toHaveBeenCalled()
  expect(mockPostEntry).not.toHaveBeenCalled()
})

test('failed upload shows error state and does not post an entry', async () => {
  vi.mocked(uploadImage).mockRejectedValueOnce(new Error('Upload failed'))

  const { container } = renderPanel()
  const panel = container.firstChild as HTMLElement
  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  fireEvent.drop(panel, {
    dataTransfer: { files: [file], types: ['Files'], getData: () => '' },
  })

  await waitFor(() => expect(vi.mocked(uploadImage)).toHaveBeenCalled())
  expect(mockPostEntry).not.toHaveBeenCalled()
})

test('dropping a URL still opens the blog composer', () => {
  const { container } = renderPanel()
  const panel = container.firstChild as HTMLElement

  fireEvent.drop(panel, {
    dataTransfer: {
      files: [],
      types: ['text/uri-list'],
      getData: (type: string) => type === 'text/uri-list' ? 'https://example.com' : '',
    },
  })

  expect(mockNavigate).toHaveBeenCalledWith('/blog', {
    state: { title: 'example.com', link: 'https://example.com' },
  })
})
