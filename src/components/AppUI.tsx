import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, FileUp, Info, LoaderCircle, X, HardDrive, Trash2, ShieldCheck, ChevronRight } from 'lucide-react'
import './AppUI.css'

type ToastTone = 'success' | 'info' | 'warning' | 'danger'
type ToastItem = { id: number; title: string; message?: string; tone: ToastTone }
type ToastContextValue = { notify: (message: string, tone?: ToastTone, title?: string) => void }
const ToastContext = createContext<ToastContextValue | null>(null)

export function AppUIProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<number[]>([])
  const notify = useCallback((message: string, tone: ToastTone = 'success', title?: string) => {
    const id = Date.now() + Math.random()
    setItems(current => [...current.slice(-3), { id, title: title || ({success:'Completed',info:'Information',warning:'Needs attention',danger:'Something went wrong'}[tone]), message, tone }])
    const timer = window.setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 5000)
    timers.current.push(timer)
  }, [])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])
  const value = useMemo(() => ({ notify }), [notify])
  return <ToastContext.Provider value={value}>
    {children}
    <div className="radx-toast-viewport" aria-live="polite" aria-relevant="additions">
      {items.map(item => <div className={`radx-toast radx-toast-${item.tone}`} role={item.tone === 'danger' || item.tone === 'warning' ? 'alert' : 'status'} key={item.id}>
        <span className="radx-toast-icon">{item.tone === 'success' ? <CheckCircle2/> : item.tone === 'danger' ? <AlertCircle/> : <Info/>}</span>
        <div className="radx-toast-copy"><b>{item.title}</b>{item.message && <span>{item.message}</span>}</div>
        <button type="button" aria-label="Dismiss notification" onClick={() => setItems(current => current.filter(x => x.id !== item.id))}><X size={16}/></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}
export function useAppToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useAppToast must be used inside AppUIProvider')
  return context
}

export function AppStepper({ steps, current }: { steps: { title: string; description: string }[]; current: number }) {
  return <ol className="radx-stepper" aria-label="Setup progress">
    {steps.map((step, index) => <li key={step.title} className={index < current ? 'complete' : index === current ? 'current' : ''}>
      <span className="radx-step-number">{index < current ? <CheckCircle2 size={18}/> : index + 1}</span>
      <span className="radx-step-copy"><b>{step.title}</b><small>{step.description}</small></span>
      {index < steps.length - 1 && <ChevronRight className="radx-step-chevron" size={16}/>}
    </li>)}
  </ol>
}

export function ProgressBar({ value, label, tone = 'brand' }: { value: number; label?: string; tone?: 'brand' | 'warning' | 'danger' }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  return <div className="radx-progress-wrap">
    <div className="radx-progress-track" role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className={`radx-progress-fill tone-${tone}`} style={{ width: safe + '%' }}>{safe >= 15 && <span>{safe}%</span>}</div>
    </div>
    {safe < 15 && <small>{safe}%</small>}
  </div>
}

export function LoadingButton({ children, onClick, className = 'primary-action', minimumMs = 900, disabled = false }: {
  children: ReactNode; onClick: () => void | Promise<void>; className?: string; minimumMs?: number; disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    if (loading || disabled) return
    setLoading(true)
    const start = Date.now()
    try { await onClick() } finally {
      const remaining = Math.max(0, minimumMs - (Date.now() - start))
      if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining))
      setLoading(false)
    }
  }
  return <button type="button" className={className} onClick={() => void handle()} disabled={disabled || loading}>
    {loading && <LoaderCircle className="radx-spin" size={16}/>} {loading ? 'Please wait…' : children}
  </button>
}

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const MAX_FILE_BYTES = 5 * 1024 * 1024
export function FileUploadField({ name = 'documents', label = 'Upload supporting documents', helper = 'PDF, JPG or PNG · Maximum 5 MB per file', multiple = true, onFilesChange }: {
  name?: string; label?: string; helper?: string; multiple?: boolean; onFilesChange?: (files: File[]) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || [])
    const invalid = chosen.find(file => !ALLOWED_MIME.has(file.type) || file.size > MAX_FILE_BYTES || file.size === 0)
    if (invalid) {
      setError(!ALLOWED_MIME.has(invalid.type) ? `${invalid.name}: unsupported format. Use PDF, JPG or PNG.` : invalid.size > MAX_FILE_BYTES ? `${invalid.name}: file exceeds 5 MB.` : `${invalid.name}: file is empty.`)
      event.target.value = ''
      return
    }
    setError('')
    const next = multiple ? [...files, ...chosen].filter((file, index, all) => all.findIndex(x => x.name === file.name && x.size === file.size) === index) : chosen.slice(0, 1)
    setFiles(next)
    onFilesChange?.(next)
    event.target.value = ''
  }
  const remove = (file: File) => {
    const next = files.filter(item => item !== file)
    setFiles(next)
    onFilesChange?.(next)
  }
  return <div className="radx-upload-field">
    <div className="radx-upload-head"><b>{label}</b><small>{helper}</small></div>
    <input ref={inputRef} name={name} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple={multiple} onChange={onChange} hidden/>
    <button type="button" className="radx-upload-drop" onClick={() => inputRef.current?.click()}>
      <FileUp size={22}/><span><b>Choose files</b><small>Browse from your device</small></span>
    </button>
    {error && <div className="radx-upload-error" role="alert"><AlertCircle size={15}/>{error}</div>}
    {files.length > 0 ? <ul className="radx-file-list">{files.map((file,index)=><li key={file.name+file.size+index}><span><b>{file.name}</b><small>{(file.size/1024/1024).toFixed(2)} MB</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => remove(file)}><X size={15}/></button></li>)}</ul> :
      <div className="radx-pending-doc"><Info size={16}/><span><b>Documents pending?</b> Add the student's transfer certificate, birth certificate or other required records here.</span></div>}
  </div>
}

export function StorageStatusCard({ usedBytes, quotaBytes, onUpgrade }: { usedBytes?: number | null; quotaBytes?: number | null; onUpgrade?: () => void }) {
  const available = typeof usedBytes === 'number' && typeof quotaBytes === 'number' && quotaBytes > 0
  const pct = available ? Math.min(100, usedBytes / quotaBytes * 100) : 0
  const format = (n: number) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' GB' : (n / 1024 ** 2).toFixed(1) + ' MB'
  return <section className="radx-storage-card">
    <div className="radx-storage-title"><span><HardDrive size={19}/></span><div><b>School storage</b><small>Private school documents and attachments</small></div><span className="radx-storage-state">{available ? 'Usage tracked' : 'Usage unavailable'}</span></div>
    {available ? <>
      <div className="radx-storage-values"><b>{format(usedBytes)} used</b><span>of {format(quotaBytes)}</span></div>
      <ProgressBar value={pct} tone={pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'brand'}/>
      <small>{format(Math.max(0, quotaBytes-usedBytes))} remaining</small>
    </> : <p className="radx-storage-note">Live storage totals are not exposed by the current school database connection. No estimated usage is shown as a real figure.</p>}
    {onUpgrade && <button type="button" className="radx-storage-link" onClick={onUpgrade}>View storage plans <ChevronRight size={15}/></button>}
  </section>
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Yes, delete', onConfirm, onCancel, destructive = true }: {
  open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; onCancel: () => void; destructive?: boolean
}) {
  const [busy,setBusy] = useState(false)
  useEffect(() => { if (!open) setBusy(false) }, [open])
  if (!open) return null
  const confirm = async () => { if (busy) return; setBusy(true); try { await onConfirm() } finally { setBusy(false) } }
  return <div className="radx-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <section className="radx-modal" role="alertdialog" aria-modal="true" aria-labelledby="radx-confirm-title">
      <button className="radx-modal-close" type="button" onClick={onCancel} disabled={busy} aria-label="Close"><X size={18}/></button>
      <span className="radx-modal-symbol"><Trash2 size={23}/></span><h2 id="radx-confirm-title">{title}</h2><p>{message}</p>
      <div className="radx-modal-actions"><button type="button" className={destructive?'radx-danger-button':'radx-primary-button'} onClick={() => void confirm()} disabled={busy}>{busy && <LoaderCircle size={15} className="radx-spin"/>}{busy?'Working…':confirmLabel}</button><button type="button" className="radx-cancel-button" onClick={onCancel} disabled={busy}>Cancel</button></div>
    </section>
  </div>
}

export function TermsDialog({ open, accepted, onAccept, onDecline }: { open: boolean; accepted: boolean; onAccept: () => void; onDecline: () => void }) {
  if (!open) return null
  return <div className="radx-modal-backdrop">
    <section className="radx-modal radx-terms-modal" role="dialog" aria-modal="true" aria-labelledby="radx-terms-title">
      <span className="radx-modal-symbol"><ShieldCheck size={24}/></span><h2 id="radx-terms-title">RADX platform terms</h2>
      <div className="radx-terms-body">
        <p><b>Account responsibility.</b> The school administrator is responsible for accurate school details, authorized users and secure account credentials.</p>
        <p><b>School data.</b> The school remains responsible for the accuracy and lawful use of student, parent and staff information entered into the platform.</p>
        <p><b>Privacy and access.</b> Access must be limited to authorized school personnel. Do not upload information that the school is not permitted to process.</p>
        <p><b>Availability and integrations.</b> Some features depend on internet connectivity and third-party providers. Provider-dependent services may require separate setup and charges.</p>
        <p><b>Data and backups.</b> The school should maintain appropriate exports and backups for its operational records. RADX does not replace the school's own retention obligations.</p>
        <p className="radx-terms-disclaimer">This is an in-product acceptance summary, not a substitute for the final legal agreement. Publish the reviewed full Terms of Service and Privacy Policy before commercial launch.</p>
      </div>
      <div className="radx-modal-actions"><button type="button" className="radx-primary-button" onClick={onAccept}>I have read and accept</button><button type="button" className="radx-cancel-button" onClick={onDecline}>Not now</button></div>
      {accepted && <small className="radx-accepted-note">Accepted for this registration.</small>}
    </section>
  </div>
}

export function TimePicker({ label, value, onChange, name }: { label: string; value: string; onChange: (value: string) => void; name?: string }) {
  return <label className="radx-time-picker"><span>{label}</span><input type="time" name={name} value={value} onChange={event => onChange(event.target.value)} /></label>
}
