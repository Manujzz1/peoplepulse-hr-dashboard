// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ImportBatchReview from './ImportBatchReview'

afterEach(cleanup)

const batch = { id: 'synthetic-batch', status: 'Validated', dataset_type: 'department_master' }
const firstPage = { rows: [{ name: 'Synthetic first page' }], issues: [], hasMore: true }
const secondPage = { rows: [{ name: 'Synthetic second page' }], issues: [], hasMore: false }

it('lets an independent reviewer recover from a failed page without reviewing unseen rows', async () => {
  const inspect = vi.fn()
    .mockResolvedValueOnce(firstPage)
    .mockRejectedValueOnce(new Error('Inspection temporarily unavailable.'))
    .mockResolvedValueOnce(secondPage)
    .mockResolvedValueOnce(firstPage)
  const review = vi.fn()

  render(<ImportBatchReview batch={batch} inspect={inspect} close={vi.fn()} review={review} busy={false} />)
  expect(await screen.findByText('Synthetic first page')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Inspection temporarily unavailable.')
  expect(screen.queryByText('Synthetic first page')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeTruthy()
  expect(review).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Retry inspection' }))
  expect(await screen.findByText('Synthetic second page')).toBeTruthy()
  expect(inspect).toHaveBeenLastCalledWith(batch.id, 50)
  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(await screen.findByText('Synthetic first page')).toBeTruthy()
  expect(inspect).toHaveBeenLastCalledWith(batch.id, 0)
})
