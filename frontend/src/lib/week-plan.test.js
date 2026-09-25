import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEEK, templateForDate, targetForDate, weekOf, plannedIdsFor, recoveryFor, recoveryDoneOn,
  setDay, addToDay, removeFromDay, setDayRecovery, removeRoutineEverywhere, newTemplate, deleteTemplate,
  assignWeek, upcomingWeeks, trainingDaysIn, distributeDays
} from './week-plan.js'
import { effectiveRoutineIds, nextTrainingDay } from './history.js'

const R = (id, n = 1) => ({ id, name: id, emoji: 'barbell', ex: Array.from({ length: n }, (_, i) => ({ id: String(i) })) })

// 2026-09-21 is a Monday; that week's key (Monday start) is the date itself.
const MON = '2026-09-21', WED = '2026-09-23', SAT = '2026-09-26'
const NEXT_MON = '2026-09-28', NEXT_WED = '2026-09-30'

// The mixed default week from the request: Upper/Lower Monday–Tuesday, Push/Pull/Legs Wednesday–Friday,
// and an "Upper/Lower ×2" template for a lighter week.
const base = () => ({
  weekStart: 1,
  routines: ['upA', 'loA', 'upB', 'loB', 'push', 'pull', 'legs'].map(id => R(id)),
  week: { 1: ['upA'], 2: ['loA'], 3: ['push'], 4: ['pull'], 5: ['legs'] },
  dayPlan: {},
  recovery: { 6: 'walk', 0: 'swim' },
  weekTemplates: [{ id: 'ul2', name: 'Upper/Lower ×2', week: { 1: ['upA'], 2: ['loA'], 4: ['upB'], 5: ['loB'] }, recovery: { 3: 'yoga' } }],
  weekPlan: {},
  dayRecovery: {},
  recoveryLog: []
})

describe('which week a date follows', () => {
  it('is the default week unless its calendar week was given a template', () => {
    const S = base()
    expect(targetForDate(S, WED)).toBe(DEFAULT_WEEK)
    expect(templateForDate(S, WED)).toBeNull()
    S.weekPlan[NEXT_MON] = 'ul2'
    expect(targetForDate(S, NEXT_WED)).toBe('ul2')
    expect(targetForDate(S, WED)).toBe(DEFAULT_WEEK)   // only that one week
  })

  it('reads a week template that was deleted as the default week', () => {
    const S = base()
    S.weekPlan[MON] = 'gone'
    expect(targetForDate(S, WED)).toBe(DEFAULT_WEEK)
    expect(weekOf(S, 'gone')).toBe(S.week)
  })

  it('keys weeks by their first day, following the Sunday-start setting', () => {
    const S = { ...base(), weekStart: 0 }
    S.weekPlan['2026-09-20'] = 'ul2'                   // the Sunday that starts the week of WED
    expect(targetForDate(S, WED)).toBe('ul2')
    expect(targetForDate(S, SAT)).toBe('ul2')
    expect(targetForDate(S, '2026-09-27')).toBe(DEFAULT_WEEK)
  })
})

describe('effectiveRoutineIds through a week template', () => {
  it('mixes plans in the default week and switches whole weeks to a template', () => {
    const S = base()
    expect(plannedIdsFor(S, WED)).toEqual(['push'])
    expect(effectiveRoutineIds(S, WED)).toEqual(['push'])
    S.weekPlan[NEXT_MON] = 'ul2'
    expect(effectiveRoutineIds(S, NEXT_WED)).toEqual([])       // rest in the Upper/Lower ×2 week
    expect(effectiveRoutineIds(S, '2026-10-01')).toEqual(['upB'])
  })

  it('still lets a per-date override win over the template', () => {
    const S = base()
    S.weekPlan[NEXT_MON] = 'ul2'
    S.dayPlan[NEXT_WED] = 'legs'
    expect(effectiveRoutineIds(S, NEXT_WED)).toEqual(['legs'])
  })

  it('makes nextTrainingDay look past a template rest day', () => {
    const S = base()
    S.weekPlan[NEXT_MON] = 'ul2'
    const next = nextTrainingDay(S, '2026-09-29')             // Tuesday of the template week
    expect(next.iso).toBe('2026-10-01')
    expect(next.routine.id).toBe('upB')
  })
})

describe('recovery activities', () => {
  it('comes from the week a rest day follows', () => {
    const S = base()
    expect(recoveryFor(S, SAT)).toBe('walk')
    S.weekPlan[NEXT_MON] = 'ul2'
    expect(recoveryFor(S, NEXT_WED)).toBe('yoga')
    expect(recoveryFor(S, '2026-10-03')).toBeNull()             // template has nothing on Saturday
  })

  it('is never offered on a training day', () => {
    expect(recoveryFor(base(), WED, false)).toBeNull()
  })

  it('takes a per-date choice over the week, and "none" clears it', () => {
    const S = base()
    S.dayRecovery[SAT] = 'swim'
    expect(recoveryFor(S, SAT)).toBe('swim')
    S.dayRecovery[SAT] = 'none'
    expect(recoveryFor(S, SAT)).toBeNull()
  })

  it('ignores a key it does not know', () => {
    const S = base()
    S.recovery[6] = 'skydiving'
    expect(recoveryFor(S, SAT)).toBeNull()
  })

  it('finds the logged recovery for a date', () => {
    const S = base()
    expect(recoveryDoneOn(S, SAT)).toBeNull()
    S.recoveryLog.push({ id: 'a', d: SAT, type: 'walk' })
    expect(recoveryDoneOn(S, SAT).type).toBe('walk')
    expect(recoveryDoneOn({}, SAT)).toBeNull()
  })
})

describe('editing a week', () => {
  it('writes the default week or a template, never storing an empty day', () => {
    const s = base()
    setDay(s, 'ul2', 3, 'push')
    addToDay(s, 'ul2', 3, 'pull')
    addToDay(s, 'ul2', 3, 'pull')                                // no duplicate
    expect(s.weekTemplates[0].week[3]).toEqual(['push', 'pull'])
    removeFromDay(s, 'ul2', 3, 'push')
    removeFromDay(s, 'ul2', 3, 'pull')
    expect(3 in s.weekTemplates[0].week).toBe(false)
    setDay(s, DEFAULT_WEEK, 1, '')
    expect(1 in s.week).toBe(false)
    expect(s.weekTemplates[0].week[1]).toEqual(['upA'])         // the template is untouched
  })

  it('sets and clears a recovery activity per weekday', () => {
    const s = base()
    setDayRecovery(s, 'ul2', 6, 'swim')
    expect(s.weekTemplates[0].recovery[6]).toBe('swim')
    setDayRecovery(s, DEFAULT_WEEK, 6, null)
    expect(6 in s.recovery).toBe(false)
    setDayRecovery(s, DEFAULT_WEEK, 6, 'nonsense')
    expect(6 in s.recovery).toBe(false)
  })

  it('removes a deleted routine from every week', () => {
    const s = base()
    removeRoutineEverywhere(s, 'upA')
    expect(1 in s.week).toBe(false)
    expect(1 in s.weekTemplates[0].week).toBe(false)
    expect(s.weekTemplates[0].week[4]).toEqual(['upB'])
  })
})

describe('templates and calendar weeks', () => {
  it('copies a week into a new template without sharing its arrays', () => {
    const s = base()
    const tpl = newTemplate('Copy', s.week, s.recovery)
    expect(tpl.week).toEqual(s.week)
    tpl.week[1].push('x')
    expect(s.week[1]).toEqual(['upA'])
    expect(tpl.recovery).toEqual({ 6: 'walk', 0: 'swim' })
  })

  it('deleting a template sends its weeks back to the default', () => {
    const s = base()
    assignWeek(s, NEXT_MON, 'ul2')
    expect(s.weekPlan[NEXT_MON]).toBe('ul2')
    deleteTemplate(s, 'ul2')
    expect(s.weekTemplates).toEqual([])
    expect(s.weekPlan).toEqual({})
  })

  it('assigning the default week (or an unknown template) clears the choice', () => {
    const s = base()
    assignWeek(s, MON, 'ul2')
    assignWeek(s, MON, DEFAULT_WEEK)
    expect(MON in s.weekPlan).toBe(false)
    assignWeek(s, MON, 'nope')
    expect(MON in s.weekPlan).toBe(false)
  })

  it('lists the coming weeks with what each follows', () => {
    const S = base()
    S.weekPlan[NEXT_MON] = 'ul2'
    const weeks = upcomingWeeks(S, WED, 3)
    expect(weeks.map(w => [w.key, w.end, w.target])).toEqual([
      [MON, '2026-09-27', DEFAULT_WEEK],
      [NEXT_MON, '2026-10-04', 'ul2'],
      ['2026-10-05', '2026-10-11', DEFAULT_WEEK]
    ])
  })

  it('counts training days, a combined day once', () => {
    expect(trainingDaysIn({ 1: ['a', 'b'], 2: [], 3: ['c'] })).toBe(2)
    expect(trainingDaysIn(undefined)).toBe(0)
  })
})

describe('distributeDays', () => {
  it('spreads routines over the picked days in week order, cycling', () => {
    expect(distributeDays([2, 1], 4)).toEqual([{ day: 1, index: 0 }, { day: 2, index: 1 }])
    expect(distributeDays([1, 2, 3, 4, 5, 6], 3).map(x => x.index)).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('follows a Sunday-first order', () => {
    expect(distributeDays([1, 0], 2, [0, 1, 2, 3, 4, 5, 6])).toEqual([{ day: 0, index: 0 }, { day: 1, index: 1 }])
  })

  it('returns nothing without routines or days', () => {
    expect(distributeDays([1, 2], 0)).toEqual([])
    expect(distributeDays([], 3)).toEqual([])
  })
})
