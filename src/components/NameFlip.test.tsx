import { render, screen, fireEvent } from '@testing-library/react'
import { NameFlip } from './NameFlip'

test('shows the name, and the phone number with its country code behind it', () => {
  render(<NameFlip />)
  expect(screen.getByText('Kevin Traywick')).toBeInTheDocument()
  expect(screen.getByText('+1 206 860 8292')).toBeInTheDocument()
  expect(screen.getByRole('link')).toHaveAttribute('href', 'tel:+12068608292')
})

test('a mouse over it flips to the number and back', () => {
  const { container } = render(<NameFlip />)
  const card = container.querySelector('.name-flip-card')!
  expect(card).toHaveAttribute('data-flipped', 'false')
  fireEvent.pointerEnter(screen.getByRole('link'), { pointerType: 'mouse' })
  expect(card).toHaveAttribute('data-flipped', 'true')
  fireEvent.pointerLeave(screen.getByRole('link'), { pointerType: 'mouse' })
  expect(card).toHaveAttribute('data-flipped', 'false')
})

test('a first tap flips instead of dialling', () => {
  const { container } = render(<NameFlip />)
  const notPrevented = fireEvent.click(screen.getByRole('link'))
  expect(notPrevented).toBe(false)
  expect(container.querySelector('.name-flip-card')).toHaveAttribute('data-flipped', 'true')
})
