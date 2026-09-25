// @vitest-environment happy-dom
// The chooser is where a starter plan can quietly do the wrong thing: overwrite a weekday
// without asking, ask when there was nothing to overwrite, or apply a plan the user cancelled.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { loadStarterPlan, starterPlanSheet } from './sheets.jsx'

const mounted = []

const S = () => useStore.getState().S
// S.week[day] is a routine-id list now; the starter plan writes a one-element list per day.
const nameOn = day => S().routines.find(r => r.id === [].concat(S().week[day] ?? [])[0])?.name

// Renders whatever sheet is on top and returns its host element.
function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

const rowFor = (host, name) => [...host.querySelectorAll('.item')].find(el => el.querySelector('.tt')?.textContent === name)
const buttonFor = (host, label) => [...host.querySelectorAll('button')].find(b => b.textContent === label)

// Opens the chooser and taps one of its rows.
function choose(name) {
  starterPlanSheet()
  const host = renderTop()
  act(() => { rowFor(host, name).click() })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState(s => ({
    S: { ...s.S, routines: [{ id: 'mine', name: 'My routine', emoji: 'star', ex: [] }], week: {}, active: null },
  }))
  document.body.innerHTML = ''
})

afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
})

describe('starter plan chooser', () => {
  it('lists every plan with its day count', () => {
    starterPlanSheet()
    const host = renderTop()
    expect([...host.querySelectorAll('.item .tt')].map(el => el.textContent))
      .toEqual(['Push / Pull / Legs', 'Upper / Lower', 'Full Body', '5×5'])
    expect(rowFor(host, 'Upper / Lower').querySelector('.ss').textContent).toContain('4 days per week')
  })

  it('opens a day picker on the plan’s own days, and loads them as before', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 0: ['mine'], 6: ['mine'] } } }))
    choose('Upper / Lower')

    const picker = renderTop()
    expect(picker.querySelector('h3').textContent).toBe('Upper / Lower')
    const on = [...picker.querySelectorAll('.chip.on')].map(b => b.textContent)
    expect(on).toEqual(['Mo', 'Tu', 'Th', 'Fr'])
    expect(picker.textContent).not.toContain('replaces current')   // nothing on those days

    act(() => { buttonFor(picker, 'Load plan').click() })
    expect(nameOn(1)).toBe('Upper A')
    expect(nameOn(2)).toBe('Lower A')
    expect(nameOn(4)).toBe('Upper B')
    expect(nameOn(5)).toBe('Lower B')
    expect(S().week[0]).toEqual(['mine'])             // untouched weekdays stay put
    expect(S().week[6]).toEqual(['mine'])
    expect(S().routines[0].name).toBe('My routine')   // and nothing is deleted
    expect(useUI.getState().toastMsg).toBe('Upper / Lower loaded')
  })

  it('says which taken days a plan will replace, and changes nothing until confirmed', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 3: ['mine'] } } }))
    choose('Full Body')

    const picker = renderTop()
    expect(picker.textContent).toContain('replaces current')
    expect(picker.textContent).toContain('Days replaced: Wednesday')
    expect(S().week[3]).toEqual(['mine'])                  // nothing applied yet
    expect(S().routines).toHaveLength(1)

    act(() => { buttonFor(picker, 'Load plan').click() })
    expect(nameOn(1)).toBe('Full Body A')
    expect(nameOn(3)).toBe('Full Body B')
    expect(nameOn(5)).toBe('Full Body C')
  })

  it('leaves everything alone when the day picker is cancelled', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 1: ['mine'] } } }))
    const before = structuredClone(S())
    choose('5×5')

    const picker = renderTop()
    act(() => { buttonFor(picker, 'Cancel').click() })
    expect(S()).toEqual(before)
    expect(useUI.getState().toastMsg).toBe('')
  })

  it('mixes two plans in one week: Upper/Lower Mon–Tue, Push/Pull/Legs Wed–Fri', () => {
    useStore.setState(s => ({ S: { ...s.S, week: {} } }))
    const pickDays = (plan, days) => {
      choose(plan)
      const picker = renderTop()
      const chip = label => [...picker.querySelectorAll('.chip')].find(b => b.textContent === label)
      // clear the plan's own days, then tap the ones asked for
      ;[...picker.querySelectorAll('.chip.on')].forEach(b => act(() => { b.click() }))
      days.forEach(d => act(() => { chip(d).click() }))
      act(() => { buttonFor(picker, 'Load plan').click() })
    }
    pickDays('Upper / Lower', ['Mo', 'Tu'])
    pickDays('Push / Pull / Legs', ['We', 'Th', 'Fr'])

    expect([1, 2, 3, 4, 5].map(nameOn)).toEqual(['Upper A', 'Lower A', 'Push Day', 'Pull Day', 'Leg Day'])
    expect(S().week[0]).toBeUndefined()
    expect(S().week[6]).toBeUndefined()
  })
})

describe('loadStarterPlan', () => {
  it('appends independent routines each time the same plan is loaded', () => {
    loadStarterPlan('ppl')
    const first = S().routines.slice(1).map(r => r.id)
    loadStarterPlan('ppl')
    const second = S().routines.slice(4).map(r => r.id)
    expect(S().routines).toHaveLength(7)
    expect(new Set([...first, ...second]).size).toBe(6)
    expect(second.some(id => first.includes(id))).toBe(false)
  })

  it('reuses routines of the same name instead of copying them when asked', () => {
    loadStarterPlan('upper-lower', { days: [1, 2] })
    const ids = S().routines.map(r => r.id)
    loadStarterPlan('upper-lower', { days: [4, 5], reuse: true })
    expect(S().routines.map(r => r.id)).toEqual(ids)          // nothing new was added
    expect([1, 2, 4, 5].map(nameOn)).toEqual(['Upper A', 'Lower A', 'Upper A', 'Lower A'])
  })

  it('writes into a week template, leaving the default week alone', () => {
    useStore.setState(s => ({ S: { ...s.S, week: { 1: ['mine'] }, weekTemplates: [{ id: 'light', name: 'Light', week: {}, recovery: {} }] } }))
    loadStarterPlan('upper-lower', { days: [1, 3], target: 'light' })
    expect(S().week).toEqual({ 1: ['mine'] })
    const tpl = S().weekTemplates[0].week
    const name = id => S().routines.find(r => r.id === id)?.name
    expect(name(tpl[1][0])).toBe('Upper A')
    expect(name(tpl[3][0])).toBe('Lower A')
  })

  it('refuses a plan it does not know and changes nothing', () => {
    const before = structuredClone(S())
    expect(loadStarterPlan('nope')).toBe(false)
    expect(loadStarterPlan(undefined)).toBe(false)
    expect(S()).toEqual(before)
    expect(useUI.getState().toastMsg).toBe('')
  })
})
