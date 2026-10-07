import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskCompletionDialog } from './TaskCompletionDialog'
afterEach(cleanup)
describe('completion dialog', () => {
  it('preserves the request ID and draft on an uncertain result and passes the next step together', async () => {
    const save = vi.fn().mockResolvedValue(false), close = vi.fn()
    render(<TaskCompletionDialog title="Follow up" onClose={close} onComplete={save}/>)
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'Discussed order' } })
    fireEvent.click(screen.getByLabelText('Schedule the next follow-up'))
    fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Confirm shipment' } })
    fireEvent.change(screen.getByLabelText('Follow-up date and time'), { target: { value: '2099-10-10T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete & create follow-up' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Complete & create follow-up' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[0][0]).toMatchObject({ summary: 'Discussed order', nextAction: 'Confirm shipment' })
    expect(save.mock.calls[0][0].requestId).toBe(save.mock.calls[1][0].requestId)
    expect(close).not.toHaveBeenCalled()
  })
})
