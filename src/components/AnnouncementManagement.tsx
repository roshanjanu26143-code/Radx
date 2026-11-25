import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CalendarClock, CheckCircle2, FileText, Megaphone, MessageCircle, Send, X, Paperclip, Smartphone } from 'lucide-react'
import './AnnouncementManagement.css'
import TimeRangePicker from './TimeRangePicker'

type Standard = { name: string; sections: string[] }
type Announcement = {
  id: string; title: string; body: string; content_type: 'message' | 'circular'
  audience_type: 'all' | 'standard' | 'section'; standard_name: string | null; section_name: string | null
  status: 'draft' | 'scheduled' | 'published' | 'archived' | 'expired'; scheduled_for: string | null; expires_at: string | null
  delivery_channels: string[]; attachments: { path: string; name: string; type?: string; size?: number }[]
  created_at: string; published_at: string | null
}
type Props = { schoolId: string; standards: Standard[]; notify: (message: string) => void }

export default function AnnouncementManagement({ schoolId, standards, notify }: Props) {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contentType, setContentType] = useState<'message' | 'circular'>('message')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [deliveryChannels, setDeliveryChannels] = useState<string[]>(['in_app','whatsapp','sms','push'])
  const [audience, setAudience] = useState<'all' | 'standard' | 'section'>('all')
  const [standardName, setStandardName] = useState(standards[0]?.name || '')
  const [sectionName, setSectionName] = useState('')
  const [publishMode, setPublishMode] = useState<'now' | 'schedule' | 'draft'>('now')
  const [publishDate, setPublishDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [showPreview, setShowPreview] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const selectedStandard = standards.find(item => item.name === standardName)
  const sections = selectedStandard?.sections || []
  const publishedCount = useMemo(() => items.filter(item => item.status === 'published').length, [items])
  const scheduledCount = useMemo(() => items.filter(item => item.status === 'scheduled').length, [items])

  const loadItems = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('school_announcements')
      .select('id,title,body,content_type,audience_type,standard_name,section_name,status,scheduled_for,expires_at,delivery_channels,attachments,created_at,published_at')
      .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(100)
    if (error) notify('Announcements could not be loaded: ' + error.message)
    else setItems((data || []) as Announcement[])
    setLoading(false)
  }
  useEffect(() => { void loadItems() }, [schoolId])

  const insertAtCursor = (before: string, after = '') => {
    const el = editorRef.current
    if (!el) return
    const from = el.selectionStart, to = el.selectionEnd
    const selected = body.slice(from, to)
    const next = body.slice(0, from) + before + (selected || 'text') + after + body.slice(to)
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from + before.length, from + before.length + (selected || 'text').length) })
  }

  const saveAnnouncement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !body.trim()) { notify('Enter a title and message before saving.'); return }
    if (audience !== 'all' && !standardName) { notify('Choose a standard for this audience.'); return }
    if (audience === 'section' && !sectionName) { notify('Choose a section for this audience.'); return }
    if (!deliveryChannels.length) { notify('Choose at least one delivery channel.'); return }
    if (attachments.some(file => file.size > 10 * 1024 * 1024)) { notify('Each attachment must be 10 MB or smaller.'); return }
    if (publishMode === 'schedule') {
      if (!publishDate || !startTime || !endTime || endTime <= startTime) { notify('Choose a valid schedule. End time must be after start time.'); return }
      if (new Date(publishDate + 'T' + startTime).getTime() <= Date.now()) { notify('Scheduled publish time must be in the future.'); return }
    }
    setSaving(true)
    const scheduledFor = publishMode === 'schedule' ? new Date(publishDate + 'T' + startTime).toISOString() : null
    const expiresAt = publishMode === 'schedule' ? new Date(publishDate + 'T' + endTime).toISOString() : null
    const status = publishMode === 'draft' ? 'draft' : publishMode === 'schedule' ? 'scheduled' : 'published'
    const { data: created, error } = await supabase.from('school_announcements').insert({
      school_id: schoolId, title: title.trim(), body: body.trim(), content_type: contentType,
      audience_type: audience, standard_name: audience === 'all' ? null : standardName,
      section_name: audience === 'section' ? sectionName : null,
      status: 'draft', delivery_channels: deliveryChannels,
      scheduled_for: scheduledFor, expires_at: expiresAt,
      published_at: null,
    }).select('id').single()
    if (error || !created) { setSaving(false); notify('Could not save announcement: ' + (error?.message || 'No record returned')); return }
    const uploaded: {path:string;name:string;type?:string;size?:number}[] = []
    for (const file of attachments) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
      const path = schoolId + '/' + created.id + '/' + Date.now() + '-' + safeName
      const { error: uploadError } = await supabase.storage.from('school-announcements').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (uploadError) { setSaving(false); notify('Announcement saved, but attachment upload failed: ' + uploadError.message); await loadItems(); return }
      uploaded.push({ path, name: file.name, type: file.type, size: file.size })
    }
    const { error: updateError } = await supabase.from('school_announcements').update({
      attachments: uploaded, status, published_at: status === 'published' ? new Date().toISOString() : null,
    }).eq('id', created.id).eq('school_id', schoolId)
    setSaving(false)
    if (updateError) { notify('Announcement saved but could not activate its publish status: ' + updateError.message); await loadItems(); return }
    if (status === 'published') void supabase.functions.invoke('dispatch-announcement-deliveries', { body: { source: 'admin-publish' } })
    notify(status === 'published' ? 'Published. Parent delivery jobs have been queued for the selected channels.' : status === 'scheduled' ? 'Scheduled. RADX will publish it automatically at the selected time.' : 'Draft saved.')
    setTitle(''); setBody(''); setAttachments([]); setDeliveryChannels(['in_app','whatsapp','sms','push']); setContentType('message'); setAudience('all'); setSectionName(''); setPublishMode('now'); setShowPreview(false)
    await loadItems()
  }

  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const audienceLabel = (item: Announcement) => item.audience_type === 'all' ? 'All parents' : item.audience_type === 'section' ? item.standard_name + ' · ' + item.section_name : item.standard_name

  return <div className="announcement-workspace">
    <div className="announcement-overview">
      <div className="announcement-intro"><span className="section-eyebrow">SCHOOL COMMUNICATION</span><h2>Announcements & Circulars</h2><p>Prepare parent messages, publish official circulars and schedule school updates.</p><a className="announcement-parent-setup-link" href="/parent-notifications" target="_blank" rel="noreferrer">Open parent notification setup ↗</a></div>
      <div className="announcement-stats"><div><MessageCircle size={17}/><b>{items.length}</b><span>Total</span></div><div><CheckCircle2 size={17}/><b>{publishedCount}</b><span>Published</span></div><div><CalendarClock size={17}/><b>{scheduledCount}</b><span>Scheduled</span></div></div>
    </div>

    <div className="announcement-layout">
      <section className="announcement-composer">
        <div className="announcement-composer-head"><div><span className="section-eyebrow">CREATE COMMUNICATION</span><h3>New parent update</h3></div><span className="announcement-secure-label">School workspace</span></div>
        <div className="announcement-type-switch">
          <button type="button" className={contentType === 'message' ? 'active' : ''} onClick={() => setContentType('message')}><MessageCircle size={16}/> Parent message</button>
          <button type="button" className={contentType === 'circular' ? 'active' : ''} onClick={() => setContentType('circular')}><FileText size={16}/> Official circular</button>
        </div>
        <form onSubmit={saveAnnouncement}>
          <label className="announcement-field">Title<input value={title} onChange={event => setTitle(event.target.value)} placeholder={contentType === 'circular' ? 'e.g. School holiday circular' : 'e.g. Tomorrow school will close early'} maxLength={180} required/></label>
          <div className="announcement-audience">
            <label>Send to</label>
            <div className="announcement-audience-grid">
              <button type="button" className={audience === 'all' ? 'selected' : ''} onClick={() => setAudience('all')}>All parents</button>
              <button type="button" className={audience === 'standard' ? 'selected' : ''} onClick={() => setAudience('standard')}>A standard</button>
              <button type="button" className={audience === 'section' ? 'selected' : ''} onClick={() => setAudience('section')}>A section</button>
            </div>
            {audience !== 'all' && <div className="announcement-audience-selects"><select value={standardName} onChange={event => { setStandardName(event.target.value); setSectionName('') }} required><option value="">Choose standard</option>{standards.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>{audience === 'section' && <select value={sectionName} onChange={event => setSectionName(event.target.value)} required><option value="">Choose section</option>{sections.map(section => <option key={section} value={section}>{section}</option>)}</select>}</div>}
          </div>
          <div className="announcement-editor">
            <div className="announcement-toolbar" aria-label="Message formatting">
              <button type="button" title="Bold" onClick={() => insertAtCursor('**', '**')}><b>B</b></button>
              <button type="button" title="Italic" onClick={() => insertAtCursor('_', '_')}><i>I</i></button>
              <button type="button" title="Underline" onClick={() => insertAtCursor('<u>', '</u>')}><u>U</u></button>
              <span/>
              <button type="button" title="Bullet list" onClick={() => insertAtCursor('\n• ')}>• List</button>
              <button type="button" title="Numbered list" onClick={() => insertAtCursor('\n1. ')}>1. List</button>
              <button type="button" title="Add a smile" onClick={() => insertAtCursor(' 😊 ')}>😊</button>
            </div>
            <label className="sr-only" htmlFor="announcement-message">Message body</label>
            <textarea id="announcement-message" ref={editorRef} rows={9} value={body} onChange={event => setBody(event.target.value)} placeholder={contentType === 'circular' ? 'Write the circular details, dates, instructions and signature...' : 'Write a clear message for parents...'} required/>
            <div className="announcement-editor-foot"><span>{body.length}/10000 characters</span><button type="button" onClick={() => setShowPreview(value => !value)}>{showPreview ? 'Hide preview' : 'Preview message'}</button></div>
          </div>
          {showPreview && <div className="announcement-preview"><span>PREVIEW</span><h4>{title || 'Your announcement title'}</h4><p>{body || 'Your message will appear here.'}</p></div>}
          <div className="announcement-delivery-channels">
            <div className="announcement-schedule-heading"><div><Smartphone size={16}/><b>Parent delivery channels</b></div><span>Choose one or more</span></div>
            <div className="announcement-channel-grid">{[{id:'in_app',label:'In-app inbox'},{id:'whatsapp',label:'WhatsApp'},{id:'sms',label:'SMS'},{id:'push',label:'Push notification'}].map(channel => <label key={channel.id}><input type="checkbox" checked={deliveryChannels.includes(channel.id)} onChange={event => setDeliveryChannels(current => event.target.checked ? [...current,channel.id] : current.filter(value => value !== channel.id))}/><span>{channel.label}</span></label>)}</div>
          </div>
          <div className="announcement-attachments"><label htmlFor="announcement-files"><Paperclip size={15}/> Attach circular files</label><input id="announcement-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx" onChange={event => setAttachments(Array.from(event.target.files || []))}/><span>PDF, images, DOCX or XLSX · 10 MB per file</span>{attachments.length>0 && <ul>{attachments.map((file,index)=><li key={file.name+index}>{file.name}<button type="button" onClick={()=>setAttachments(current=>current.filter((_,i)=>i!==index))} aria-label={'Remove '+file.name}><X size={12}/></button></li>)}</ul>}</div>
          <div className="announcement-schedule">
            <div className="announcement-schedule-heading"><div><CalendarClock size={17}/><b>Publishing</b></div><span>Choose when it becomes visible</span></div>
            <div className="announcement-mode-options">
              <label><input type="radio" name="publishMode" checked={publishMode === 'now'} onChange={() => setPublishMode('now')}/> Publish now</label>
              <label><input type="radio" name="publishMode" checked={publishMode === 'schedule'} onChange={() => setPublishMode('schedule')}/> Schedule</label>
              <label><input type="radio" name="publishMode" checked={publishMode === 'draft'} onChange={() => setPublishMode('draft')}/> Save draft</label>
            </div>
            {publishMode === 'schedule' && <div className="announcement-schedule-fields"><label>Publish date<input type="date" min={new Date().toISOString().slice(0,10)} value={publishDate} onChange={event => setPublishDate(event.target.value)}/></label><div><span className="announcement-small-label">Publish and expiry time</span><TimeRangePicker start={startTime} end={endTime} onSave={(start,end) => {setStartTime(start);setEndTime(end)}}/></div></div>}
          </div>
          <div className="announcement-form-actions"><button type="button" className="announcement-preview-button" onClick={() => { setShowPreview(true); window.scrollTo({top:0,behavior:'smooth'}) }}>Review</button><button type="submit" className="announcement-publish-button" disabled={saving}><Send size={16}/>{saving ? 'Saving…' : publishMode === 'draft' ? 'Save draft' : publishMode === 'schedule' ? 'Save schedule' : 'Save as published'}</button></div>
          <p className="announcement-delivery-note">Published messages are queued for in-app inbox, WhatsApp, SMS and push according to your selections. WhatsApp/SMS require verified Twilio senders; browser push requires parent device registration and VAPID keys.</p>
        </form>
      </section>

      <aside className="announcement-history">
        <div className="announcement-history-head"><div><span className="section-eyebrow">COMMUNICATION LOG</span><h3>Recent announcements</h3></div><button type="button" onClick={() => void loadItems()} aria-label="Refresh announcements"><X size={15}/></button></div>
        {loading ? <div className="announcement-empty">Loading announcements…</div> : items.length === 0 ? <div className="announcement-empty"><Megaphone size={25}/><b>No announcements yet</b><span>Your published messages and circulars will appear here.</span></div> : <div className="announcement-history-list">{items.map(item => <article key={item.id} className="announcement-history-item"><div className="announcement-history-item-top"><span className={item.content_type === 'circular' ? 'circular-tag' : 'message-tag'}>{item.content_type === 'circular' ? 'CIRCULAR' : 'MESSAGE'}</span><span className={'announcement-status '+item.status}>{item.status}</span></div><h4>{item.title}</h4><p>{item.body}</p><div className="announcement-history-meta"><span>{audienceLabel(item)}</span><time>{formatDate(item.published_at || item.scheduled_for || item.created_at)}</time></div>{item.attachments?.length>0 && <div className="announcement-history-files">{item.attachments.map(file=><span key={file.path}><Paperclip size={11}/>{file.name}</span>)}</div>}</article>)}</div>}
      </aside>
    </div>
  </div>
}
