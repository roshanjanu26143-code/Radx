import { useEffect, useState } from 'react'
import { ChevronDown, Clock3 } from 'lucide-react'
import './TimeRangePicker.css'

type Props = { start: string; end: string; onSave: (start: string, end: string) => void }

export default function TimeRangePicker({ start, end, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState(start)
  const [draftEnd, setDraftEnd] = useState(end)
  useEffect(() => { setDraftStart(start); setDraftEnd(end) }, [start, end])
  return <div className="radx-time-picker">
    <button type="button" className="radx-time-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Clock3 size={16}/><span>{start || 'Start'} – {end || 'End'}</span><ChevronDown size={15}/>
    </button>
    {open && <div className="radx-time-popover">
      <div className="radx-time-fields">
        <label>Start time<input type="time" min="00:00" max="23:59" value={draftStart} onChange={event => setDraftStart(event.target.value)} required/></label>
        <label>End time<input type="time" min="00:00" max="23:59" value={draftEnd} onChange={event => setDraftEnd(event.target.value)} required/></label>
      </div>
      <div className="radx-time-actions">
        <button type="button" className="radx-time-cancel" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="radx-time-save" onClick={() => { onSave(draftStart, draftEnd); setOpen(false) }}>Save time</button>
      </div>
    </div>}
  </div>
}
