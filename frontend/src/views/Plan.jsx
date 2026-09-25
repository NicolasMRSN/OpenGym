import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, weekOrder, weekStartOf, uid, exCount, routineCount, fmtDate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, dayAddRoutineSheet, starterPlanSheet, planToolsSheet, weekTemplateSheet, weekAssignSheet, recoveryLabel } from '../sheets.jsx'
import { DEFAULT_WEEK, weekOf, recoveryWeekOf, templateById, removeFromDay as removeRoutineFromDay, upcomingWeeks, recoveryActivity } from '../lib/week-plan.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { coachAvailable } from '../lib/coach.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const config = useStore(s => s.config)
  const coachMode = useStore(s => s.coachLocal?.mode)
  const user = useStore(s => s.user)

  /* The Coach's only entry point in the app. Its screens have existed since the UI landed and
     nothing linked to them, so the feature was reachable only by typing the URL — enabled,
     configured, and invisible. The same predicate every other Coach surface uses gates it, so
     an instance without the feature sees exactly the Plan screen it saw before. */
  const showCoach = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, coachMode })

  // Swap with the neighbour, the way the routine editor moves an exercise. `S.routines` is the
  // one order the whole app reads, so this is all there is to it (#142).
  const moveRoutine = (i, delta) => update(s => {
    const to = i + delta
    if (to < 0 || to >= s.routines.length) return
    const [moved] = s.routines.splice(i, 1)
    s.routines.splice(to, 0, moved)
  })

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  // Which week the schedule below edits: the default week (S.week) or one of the week
  // templates (lib/week-plan.js). A template that has since been deleted reads as the default.
  const [picked, setTarget] = useState(DEFAULT_WEEK)
  const templates = S.weekTemplates || []
  const target = picked !== DEFAULT_WEEK && templateById(S, picked) ? picked : DEFAULT_WEEK
  const week = weekOf(S, target)
  const recovery = recoveryWeekOf(S, target)
  const tpl = target !== DEFAULT_WEEK ? templateById(S, target) : null

  // Pull one routine off a weekday; drop the key when the day empties (never store []).
  const removeFromDay = (d, rid) => update(s => removeRoutineFromDay(s, target, d, rid))

  const weekLabel = (w, i) => i === 0 ? t('This week') : i === 1 ? t('Next week') : fmtDate(w.start) + ' – ' + fmtDate(w.end)
  const weekName = id => id === DEFAULT_WEEK ? t('Default week') : (templateById(S, id)?.name || t('Untitled week'))

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    {showCoach && <button className="coach-cta" onClick={() => nav('/coach')}>
      <span className="coach-cta-av"><Icon name="sparkles" /></span>
      <span className="coach-cta-t">
        <b>{t('Coach')}</b>
        <span>{t('Plan design and reviews, from your own training')}</span>
      </span>
      <Icon name="chevronRight" className="coach-cta-chev" />
    </button>}

    <div className="cols"><div>
      <h4 className="sec">{t('Week schedule')}</h4>
      {/* The default week is what every calendar week follows; a week template is an alternative
          week you can hand any calendar week below — e.g. Upper/Lower + Push/Pull/Legs most
          weeks, Upper/Lower ×2 on a lighter one. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <button className={'chip' + (target === DEFAULT_WEEK ? ' on' : '')} aria-pressed={target === DEFAULT_WEEK} onClick={() => setTarget(DEFAULT_WEEK)}>{t('Default week')}</button>
        {templates.map(w => <button key={w.id} className={'chip' + (target === w.id ? ' on' : '')} aria-pressed={target === w.id} onClick={() => setTarget(w.id)}>{w.name || t('Untitled week')}</button>)}
        <button className="chip chip-i" onClick={() => weekTemplateSheet({ copyFrom: target, onSaved: setTarget })}><Icon name="plus" /> {t('Week template')}</button>
      </div>
      {tpl && <div className="row between" style={{ marginBottom: 8, gap: 8 }}>
        <div className="small muted">{t('Editing week template “{0}”', tpl.name || t('Untitled week'))}</div>
        <Button size="sm" variant="ghost" icon="pencil" onClick={() => weekTemplateSheet({ id: tpl.id, onSaved: setTarget })}>{t('Rename')}</Button>
      </div>}
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {weekOrder(weekStartOf(S)).map(d => {
          const dayRoutines = [].concat(week[d] || []).map(id => S.routines.find(x => x.id === id)).filter(Boolean)
          const rec = recoveryActivity(recovery[d]) ? recovery[d] : null
          // An empty day stays one tappable row → pick its first routine (today's behaviour),
          // or a recovery activity for the rest day.
          if (!dayRoutines.length) return <div key={d} className="item" {...tappable(() => dayAssignSheet(d, target))}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div>{rec && <div className="ss">{t('Recovery: {0}', recoveryLabel(rec))}</div>}</div>
            {rec ? <span className="tag"><Icon name={recoveryActivity(rec).icon} /> {t('Recovery')}</span> : <span className="tag">{t('Rest')}</span>}
            <Icon name="chevronRight" className="chev" /></div>
          // A populated day: always-visible routine sub-rows + inline ✕, then ＋ Add routine.
          return <div key={d} className="item" style={{ display: 'block', padding: '10px 14px' }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div className="tt">{t(DAYN[d])}</div>
              <div className="small dim">{routineCount(dayRoutines.length)}</div>
            </div>
            {dayRoutines.map(r => <div key={r.id} className="row" style={{ gap: 8, padding: '4px 0 4px 8px' }}>
              <span className="lrow-i" style={{ width: 26, height: 26, fontSize: 14 }}><Icon name={glyphOf(r.emoji)} /></span>
              <div className="grow" style={{ minWidth: 0 }}><div className="tt" style={{ fontSize: 14 }}>{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
              <button className="iconbtn sm" aria-label={t('Remove')} onClick={() => removeFromDay(d, r.id)}><Icon name="xmark" /></button>
            </div>)}
            <button className="btn ghost sm" style={{ marginTop: 4, marginLeft: 8 }} onClick={() => dayAddRoutineSheet(d, target)}>
              <Icon name="plus" /> {t('Add routine')}
            </button>
          </div>
        })}
      </div>
      {/* Loading a starter plan asks which days it takes, so two plans can share a week. */}
      {S.routines.length > 0 && <div style={{ marginTop: 8 }}>
        <Button size="sm" variant="ghost" icon="sparkles" onClick={() => starterPlanSheet(target)}>{t('Add a starter plan to this week')}</Button>
      </div>}
      {templates.length > 0 && <>
        <h4 className="sec" style={{ marginTop: 22 }}>{t('Upcoming weeks')}</h4>
        <div className="list">
          {upcomingWeeks(S, todayISO(), 6).map((w, i) => <div key={w.key} className="item" {...tappable(() => weekAssignSheet(w.key, weekLabel(w, i)))}>
            <div className="grow"><div className="tt">{weekLabel(w, i)}</div><div className="ss">{weekName(w.target)}</div></div>
            {w.target !== DEFAULT_WEEK && <span className="tag acc">{t('Template')}</span>}
            <Icon name="chevronRight" className="chev" />
          </div>)}
        </div>
      </>}
    </div><div>
      <div className="row between" style={{ marginTop: 22, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map((r, i) => <div key={r.id} className="item" {...tappable(() => nav('/plan/r/' + r.id))}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        {/* The order of this list is the order of `S.routines`, and every other screen reads the
            same array — the Start screen, the day-assignment sheets, the routine pickers. So
            moving a routine here moves it everywhere, which is what the request asked for (#142). */}
        {S.routines.length > 1 && <div style={{ display: 'flex', gap: 2, flex: 'none' }}>
          <button className="iconbtn" aria-label={t('Move up')} title={t('Move up')} disabled={i === 0}
            style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }}
            onClick={ev => { ev.stopPropagation(); moveRoutine(i, -1) }}><Icon name="chevronUp" /></button>
          <button className="iconbtn" aria-label={t('Move down')} title={t('Move down')} disabled={i === S.routines.length - 1}
            style={{ width: 28, height: 24, borderRadius: 7, fontSize: 12 }}
            onClick={ev => { ev.stopPropagation(); moveRoutine(i, 1) }}><Icon name="chevronDown" /></button>
        </div>}
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={() => starterPlanSheet(target)}>{t('Load starter plan')}</Button>
      </>}
    </div></div>
  </>
}
