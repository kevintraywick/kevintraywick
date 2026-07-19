import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PhotoPanel } from './PhotoPanel'
import { uploadImage } from '../hooks/useFeed'

const mockNavigate = vi.fn()
const mockPostEntry = vi.fn()
const mockUpdateEntryPan = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock('../hooks/useFeed', () => ({
  useFeed: () => ({
    entries: [
      { id: 4, title: 'Text-only entry', note: 'no image', created_at: '2026-07-14T00:00:00', comment_count: 0 },
      { id: 3, title: 'Newest photo', created_at: '2026-07-12T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/new.jpg', pan_x: 50, pan_y: 85 },
      { id: 2, title: 'Middle photo', created_at: '2026-06-01T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/mid.jpg' },
      { id: 1, title: 'Oldest photo', created_at: '2026-05-01T00:00:00', comment_count: 0, image_url: 'https://cdn.example.com/old.jpg' },
    ],
    loading: false,
    postEntry: mockPostEntry,
    postComment: vi.fn(),
    updateEntryPan: mockUpdateEntryPan,
  }),
  uploadImage: vi.fn(),
}))

beforeEach(() => {
  mockNavigate.mockClear()
  mockPostEntry.mockClear()
  mockUpdateEntryPan.mockClear()
  mockUpdateEntryPan.mockResolvedValue(undefined)
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

// --- Pan ---

// A 1000×2000 photo in a 300×300 panel: object-cover renders it 300×600,
// so there are 300px of vertical overflow to pan through and none horizontally.
function makePannable(img: HTMLImageElement) {
  Object.defineProperty(img, 'naturalWidth', { value: 1000 })
  Object.defineProperty(img, 'naturalHeight', { value: 2000 })
  img.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 300, width: 300, height: 300, toJSON: () => ({}),
  }) as DOMRect
}

test('dragging the photo pans it vertically and saves to the entry', () => {
  renderPanel()
  fireEvent.click(screen.getByLabelText('Older photo'))
  const img = screen.getByAltText('Middle photo') as HTMLImageElement
  makePannable(img)

  fireEvent.pointerDown(img, { pointerId: 1, clientX: 150, clientY: 150 })
  fireEvent.pointerMove(img, { pointerId: 1, clientX: 150, clientY: 90 })
  fireEvent.pointerUp(img, { pointerId: 1 })

  // Dragged up 60px of 300px overflow → object-position moves 20% toward the bottom
  expect(img.style.objectPosition).toBe('50% 70%')
  expect(mockUpdateEntryPan).toHaveBeenCalledWith(2, 50, 70)
})

test('a pan position saved on the entry is applied on render', () => {
  renderPanel()
  const img = screen.getByAltText('Newest photo') as HTMLImageElement
  expect(img.style.objectPosition).toBe('50% 85%')
})

test('pan resets to center when stepping to a photo without a saved position', () => {
  renderPanel()
  fireEvent.click(screen.getByLabelText('Older photo'))
  const img = screen.getByAltText('Middle photo') as HTMLImageElement
  expect(img.style.objectPosition).toBe('50% 50%')
})

test('a click without movement does not save a pan position', () => {
  renderPanel()
  const img = screen.getByAltText('Newest photo') as HTMLImageElement
  makePannable(img)

  fireEvent.pointerDown(img, { pointerId: 1, clientX: 150, clientY: 150 })
  fireEvent.pointerUp(img, { pointerId: 1 })

  expect(mockUpdateEntryPan).not.toHaveBeenCalled()
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
