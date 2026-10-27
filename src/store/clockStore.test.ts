import { describe, it, expect, beforeEach } from 'vitest'
import { useClockStore, controlOf, formatClock } from './clockStore'

const store = () => useClockStore.getState()

describe('clockStore', () => {
  beforeEach(() => {
    store().setControl('5+0')
  })

  it('initializes both clocks to the base time', () => {
    expect(store().whiteMs).toBe(300000)
    expect(store().blackMs).toBe(300000)
    expect(store().running).toBeNull()
  })

  it('unlimited control never runs a clock', () => {
    store().setControl('unlimited')
    store().onTurnChange('w', null, true)
    expect(store().running).toBeNull()
    expect(store().tick(1000)).toBe(false)
  })

  it('starts white clock on game start and hands over after each move', () => {
    store().onTurnChange('w', null, true)
    expect(store().running).toBe('w')

    store().tick(10000)
    expect(store().whiteMs).toBe(290000)

    // White moved -> clock to black
    store().onTurnChange('b', 'w', true)
    expect(store().running).toBe('b')

    store().tick(5000)
    expect(store().blackMs).toBe(295000)
  })

  it('applies the increment to the side that just moved', () => {
    store().setControl('15+10')
    store().onTurnChange('w', null, true)
    store().tick(60000)
    store().onTurnChange('b', 'w', true)
    expect(store().whiteMs).toBe(900000 - 60000 + 10000)
  })

  it('tick reports flag fall at zero', () => {
    store().onTurnChange('w', null, true)
    expect(store().tick(299999)).toBe(false)
    expect(store().tick(1)).toBe(true)
  })

  it('stop halts the clock and silences tick', () => {
    store().onTurnChange('w', null, true)
    store().stop()
    expect(store().running).toBeNull()
    expect(store().tick(5000)).toBe(false)
  })

  it('formatClock renders mm:ss and tenths under 20s', () => {
    expect(formatClock(300000)).toBe('5:00')
    expect(formatClock(61500)).toBe('1:01')
    expect(formatClock(19900)).toBe('0:19.9')
    expect(formatClock(0)).toBe('0:00.0')
  })

  it('controlOf falls back to unlimited for unknown ids', () => {
    expect(controlOf('bogus' as never).id).toBe('unlimited')
  })
})
