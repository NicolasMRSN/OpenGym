// Week templates, per-week choices and recovery days.
//
// The weekly plan (`S.week`) used to be the only week there was: every calendar week repeated
// the same seven days, so an "Upper/Lower on Monday–Tuesday, Push/Pull/Legs Wednesday–Friday"
// week and an "Upper/Lower ×2" week could not both exist. This module adds the missing layer
// without changing what `S.week` means:
//
//   S.week            the default week — what every calendar week follows unless told otherwise
//   S.weekTemplates   [{ id, name, week: { [weekday]: routineId[] }, recovery: { [weekday]: key } }]
//                     named alternative weeks, same shape as S.week (+ their own recovery days)
//   S.weekPlan        { [weekKey]: templateId } — which template a given calendar week follows.
//                     The key is the ISO date of that week's first day (format.js weekKey).
//   S.recovery        { [weekday]: key } — the default week's recovery activity per rest day
//   S.dayRecovery     { [iso]: key | 'none' } — one date's recovery activity, over the week's
//   S.recoveryLog     [{ id, d, type }] — recovery sessions marked as done
//
// A week "target" names the week being edited: 'default' for S.week, or a template id.
// Everything here is pure; the store and the screens only call it.
import { isoOf, weekKey, weekStartOf, uid } from './format.js'

export const DEFAULT_WEEK = 'default'

/* Recovery activities offered on a rest day. `label` is the English source string — screens
   pass it through t() (the literal copies live in sheets.jsx so check-source-strings sees them). */
export const RECOVERY_ACTIVITIES = [
  { key: 'walk', icon: 'figureWalk' },
  { key: 'swim', icon: 'swim' },
  { key: 'bike', icon: 'bike' },
  { key: 'run', icon: 'figureRun' },
  { key: 'yoga', icon: 'stretch' },
  { key: 'mobility', icon: 'heart' }
]
export const recoveryActivity = key => RECOVERY_ACTIVITIES.find(a => a.key === key) || null

const list = v => [].concat(v || [])
const templatesOf = S => (Array.isArray(S?.weekTemplates) ? S.weekTemplates : [])

export const templateById = (S, id) => templatesOf(S).find(tpl => tpl.id === id) || null

/** The template a calendar date's week follows, or null for the default week. */
export function templateForDate(S, iso) {
  const id = S?.weekPlan?.[weekKey(iso, weekStartOf(S))]
  return id ? templateById(S, id) : null
}

/** The target ('default' or a template id) the week holding `iso` follows. */
export const targetForDate = (S, iso) => templateForDate(S, iso)?.id || DEFAULT_WEEK

/** The weekday → routine-id-list map of a target. Unknown template ids read as the default week. */
export function weekOf(S, target = DEFAULT_WEEK) {
  if (target !== DEFAULT_WEEK) {
    const tpl = templateById(S, target)
    if (tpl) return tpl.week || {}
  }
  return S?.week || {}
}

/** The weekday → recovery-key map of a target. */
export function recoveryWeekOf(S, target = DEFAULT_WEEK) {
  if (target !== DEFAULT_WEEK) {
    const tpl = templateById(S, target)
    if (tpl) return tpl.recovery || {}
  }
  return S?.recovery || {}
}

/** The routine ids a date's week plans for its weekday — before any per-date override. */
export function plannedIdsFor(S, iso) {
  const wd = new Date(iso + 'T12:00:00').getDay()
  return list(weekOf(S, targetForDate(S, iso))[wd])
}

/**
 * The recovery activity planned for a date, or null. Only a rest day carries one: `isRest` is
 * the caller's verdict (effectiveRoutineIds(S, iso).length === 0), passed in so this module does
 * not have to import history.js. A per-date choice beats the week's, and 'none' clears it.
 */
export function recoveryFor(S, iso, isRest = true) {
  if (!isRest) return null
  const own = S?.dayRecovery?.[iso]
  if (own === 'none') return null
  if (own && recoveryActivity(own)) return own
  const wd = new Date(iso + 'T12:00:00').getDay()
  const key = recoveryWeekOf(S, targetForDate(S, iso))[wd]
  return key && recoveryActivity(key) ? key : null
}

/** The recovery session logged on a date, if any (the last one wins, like workouts). */
export const recoveryDoneOn = (S, iso) => (Array.isArray(S?.recoveryLog) ? S.recoveryLog : []).filter(e => e?.d === iso).at(-1) || null

/**
 * Mutators — take the draft state `s` (inside the store's update()) and a target. They keep the
 * one storage rule S.week already follows: an empty day drops its key, never stores [].
 */
function mutableWeek(s, target) {
  if (target === DEFAULT_WEEK) return (s.week ||= {})
  const tpl = (s.weekTemplates || []).find(x => x.id === target)
  return tpl ? (tpl.week ||= {}) : null
}
function mutableRecovery(s, target) {
  if (target === DEFAULT_WEEK) return (s.recovery ||= {})
  const tpl = (s.weekTemplates || []).find(x => x.id === target)
  return tpl ? (tpl.recovery ||= {}) : null
}

/** Replace a weekday with one routine, or make it a rest day (`rid` falsy). */
export function setDay(s, target, day, rid) {
  const week = mutableWeek(s, target)
  if (!week) return
  if (rid) week[day] = [rid]; else delete week[day]
}

/** Append a routine to a weekday (no-op when it is already there). */
export function addToDay(s, target, day, rid) {
  const week = mutableWeek(s, target)
  if (!week || !rid) return
  const cur = list(week[day])
  if (!cur.includes(rid)) week[day] = [...cur, rid]
}

/** Pull one routine off a weekday. */
export function removeFromDay(s, target, day, rid) {
  const week = mutableWeek(s, target)
  if (!week) return
  const next = list(week[day]).filter(id => id !== rid)
  if (next.length) week[day] = next; else delete week[day]
}

/** Set (or clear, with a falsy key) a weekday's recovery activity. */
export function setDayRecovery(s, target, day, key) {
  const rec = mutableRecovery(s, target)
  if (!rec) return
  if (key && recoveryActivity(key)) rec[day] = key; else delete rec[day]
}

/** Forget a deleted routine in every week that names it: the default week and each template. */
export function removeRoutineEverywhere(s, rid) {
  const scrub = week => Object.keys(week || {}).forEach(k => {
    const next = list(week[k]).filter(id => id !== rid)
    if (next.length) week[k] = next; else delete week[k]
  })
  scrub(s.week)
  ;(s.weekTemplates || []).forEach(tpl => scrub(tpl.week))
}

/** A new template, optionally a copy of an existing week (its routines and recovery days). */
export function newTemplate(name, fromWeek = {}, fromRecovery = {}) {
  const week = {}
  Object.entries(fromWeek || {}).forEach(([d, ids]) => { if (list(ids).length) week[d] = list(ids) })
  return { id: uid(), name: name || '', week, recovery: { ...(fromRecovery || {}) } }
}

/** Delete a template and every calendar week that pointed at it (they fall back to the default). */
export function deleteTemplate(s, id) {
  s.weekTemplates = (s.weekTemplates || []).filter(tpl => tpl.id !== id)
  Object.keys(s.weekPlan || {}).forEach(k => { if (s.weekPlan[k] === id) delete s.weekPlan[k] })
}

/** Make the week starting `wk` (a weekKey) follow `target`; the default week clears the choice. */
export function assignWeek(s, wk, target) {
  s.weekPlan ||= {}
  if (!target || target === DEFAULT_WEEK || !(s.weekTemplates || []).some(tpl => tpl.id === target)) delete s.weekPlan[wk]
  else s.weekPlan[wk] = target
}

/**
 * `count` consecutive calendar weeks starting with the one holding `iso`:
 * [{ key, start, end, target }] — start/end are ISO dates, target what that week follows.
 */
export function upcomingWeeks(S, iso, count = 5) {
  const ws = weekStartOf(S)
  const first = new Date(weekKey(iso, ws) + 'T12:00:00')
  const out = []
  for (let i = 0; i < count; i++) {
    const start = new Date(first); start.setDate(first.getDate() + i * 7)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    const key = isoOf(start)
    out.push({ key, start: key, end: isoOf(end), target: targetForDate(S, key) })
  }
  return out
}

/** Days with at least one routine in a week map — a combined day counts once. */
export const trainingDaysIn = week => Object.values(week || {}).filter(ids => list(ids).length).length

/**
 * Spread a plan's routines over the weekdays you picked, in week order, cycling through the
 * routines: Upper/Lower on Monday + Tuesday gives Upper A, Lower A; Push/Pull/Legs on six days
 * runs through it twice. `order` is the display order of weekdays (format.js weekOrder).
 * Returns [{ day, index }] where index points into the plan's routine list.
 */
export function distributeDays(days, routineCount, order = [1, 2, 3, 4, 5, 6, 0]) {
  if (!routineCount) return []
  const picked = order.filter(d => days.includes(d))
  return picked.map((day, i) => ({ day, index: i % routineCount }))
}
