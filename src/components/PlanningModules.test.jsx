/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createHrModel } from '../data/hrModel'
import PlanningModules from './PlanningModules'

afterEach(cleanup)

describe('Recruitment analytics view', () => {
  it('renders the separate time-to-hire and time-to-fill measures and source dates', () => {
    const model = createHrModel({
      recruitment: { completeMonths: ['2025-04'], rows: [{
        requisitionId: 'SYN-REQ-01', company: 'Synthetic Company', reportingMonth: '2025-04', department: 'Engineering',
        designation: 'Sample Analyst', status: 'Closed', requisitionDate: '2025-04-01', approvedPositions: 1,
        filledPositions: 1, offersExtended: 1, offersAccepted: 1, offerDate: '2025-04-05',
        offerAcceptedDate: '2025-04-08', joiningDate: '2025-04-21',
      }] },
    })
    render(<PlanningModules page="recruitment" dataSource="imported" model={model} selectedMonth="2025-04" selectedDate="2025-04-30" filters={{}} />)

    expect(screen.getByText('Avg. time to hire')).toBeTruthy()
    expect(screen.getByText('Avg. time to fill')).toBeTruthy()
    expect(screen.getByText('7 days')).toBeTruthy()
    expect(screen.getByText('20 days')).toBeTruthy()
    expect(screen.getByText('Offer Accepted Date')).toBeTruthy()
    expect(screen.getByText('2025-04-08')).toBeTruthy()
  })
})
