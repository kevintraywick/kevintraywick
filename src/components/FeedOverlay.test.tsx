import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FeedOverlay } from './FeedOverlay'
import { uploadImage } from '../hooks/useFeed'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock('../hooks/useFeed', () => ({
  useFeed: () => ({
    entries: [
      { id: 1, title: 'Test entry', note: 'A note here', created_at: '2026-03-20T00:00:00', comment_count: 0 },
      { id: 2, title: 'Image post', created_at: '2026-03-21T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/img.jpg' },
    ],
    loading: false,
    postEntry: vi.fn(),
    postComment: vi.fn(),
  }),
  uploadImage: vi.fn(),
}))

beforeEach(() => {
  mockNavigate.mockClear()
  vi.mocked(uploadImage).mockClear()
})

// --- Existing render tests ---

test('renders entry title', () => {
  render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  expect(screen.getByText('Test entry')).toBeInTheDocument()
})

test('renders entry note preview', () => {
  render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  expect(screen.getByText('A note here')).toBeInTheDocument()
})

test('renders comment input for each entry', () => {
  render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  expect(screen.getAllByPlaceholderText('Add a comment…')).toHaveLength(2)
})

// --- Thumbnail tests ---

test('shows thumbnail for entry with image_url', () => {
  const { container } = render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  const imgs = container.querySelectorAll('img')
  expect(imgs).toHaveLength(1)
  expect(imgs[0]).toHaveAttribute('src', 'https://cdn.example.com/img.jpg')
})

test('only renders thumbnail for entries that have image_url', () => {
  const { container } = render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  // One entry has image_url, one does not
  expect(container.querySelectorAll('img')).toHaveLength(1)
})

// --- Drop tests ---

test('dropping image file calls uploadImage and navigates to /blog with imageUrl state', async () => {
  vi.mocked(uploadImage).mockResolvedValueOnce('https://cdn.example.com/uploaded.jpg')

  const { container } = render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  const overlay = container.firstChild as HTMLElement

  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  fireEvent.drop(overlay, {
    dataTransfer: {
      files: [file],
      types: ['Files'],
      getData: () => '',
    },
  })

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/blog', {
    state: { imageUrl: 'https://cdn.example.com/uploaded.jpg', title: 'photo.jpg' },
  }))
  expect(vi.mocked(uploadImage)).toHaveBeenCalledWith(file)
})

test('dropping non-image file does nothing', () => {
  const { container } = render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  const overlay = container.firstChild as HTMLElement

  const file = new File(['data'], 'document.pdf', { type: 'application/pdf' })

  fireEvent.drop(overlay, {
    dataTransfer: {
      files: [file],
      types: ['Files'],
      getData: () => '',
    },
  })

  expect(vi.mocked(uploadImage)).not.toHaveBeenCalled()
  expect(mockNavigate).not.toHaveBeenCalled()
})

test('when uploadImage fails, navigate is not called', async () => {
  vi.mocked(uploadImage).mockRejectedValueOnce(new Error('Upload failed'))

  const { container } = render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  const overlay = container.firstChild as HTMLElement

  const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

  fireEvent.drop(overlay, {
    dataTransfer: {
      files: [file],
      types: ['Files'],
      getData: () => '',
    },
  })

  await waitFor(() => expect(vi.mocked(uploadImage)).toHaveBeenCalled())
  expect(mockNavigate).not.toHaveBeenCalled()
})

test('dropping URL navigates to /blog with link state', () => {
  const { container } = render(<MemoryRouter><FeedOverlay /></MemoryRouter>)
  const overlay = container.firstChild as HTMLElement

  fireEvent.drop(overlay, {
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
