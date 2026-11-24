import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, Bus, Clock3, Copy, MapPin, Plus, Radio, RefreshCw, Signal, Wifi, WifiOff, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './bus-gps-tracker.css'

type BusRow = { id: string; registration_number: string; route_id: string; status: string; capacity: number }
type RouteRow = { id: string; route_name: string }
type DeviceRow = { id: string; bus_id: string; provider_name: string; model_name: string | null; protocol_type: string; integration_mode: string; device_imei: string; sim_number: string | null; device_label: string | null; status: string; last_seen_at: string | null }
type PositionRow = { id: number; bus_id: string; device_id: string; latitude: number; longitude: number; speed_kph: number | null; recorded_at: string; source: string }
const protocolNames: Record<string, string> = { http_json: 'HTTP JSON', vendor_cloud: 'Vendor cloud', gt06_tcp: 'GT06 TCP', tk103_tcp: 'TK103 TCP', custom_gateway: 'Custom gateway' }
const ago = (value: string) => { const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return mins < 1 ? 'Just now' : mins < 60 ? mins + ' min ago' : mins < 1440 ? Math.floor(mins / 60) + ' hr ago' : new Date(value).toLocaleString('en-IN') }

export default function BusGpsTracker({ schoolId, schoolName, notify }: { schoolId: string; schoolName: string; notify: (message: string) => void }) {
  const [buses, setBuses] = useState<BusRow[]>([])
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busId, setBusId] = useState('')
  const [provider, setProvider] = useState('Other')
  const [modelName, setModelName] = useState('')
  const [protocolType, setProtocolType] = useState('http_json')
  const [providerDeviceId, setProviderDeviceId] = useState('')
  const [imei, setImei] = useState('')
  const [simNumber, setSimNumber] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')
  const [newDeviceToken, setNewDeviceToken] = useState('')

  const load = async () => {
    setLoading(true)
    const [b, r, d, p] = await Promise.all([
      supabase.from('school_transport_buses').select('id,registration_number,route_id,status,capacity').eq('school_id', schoolId).order('registration_number'),
      supabase.from('school_transport_routes').select('id,route_name').eq('school_id', schoolId).order('route_name'),
      supabase.from('school_bus_gps_devices').select('id,bus_id,provider_name,model_name,protocol_type,integration_mode,device_imei,sim_number,device_label,status,last_seen_at').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('school_bus_gps_positions').select('id,bus_id,device_id,latitude,longitude,speed_kph,recorded_at,source').eq('school_id', schoolId).order('recorded_at', { ascending: false }).limit(250),
    ])
    const error = b.error || r.error || d.error || p.error
    if (error) notify('GPS data could not be loaded: ' + error.message)
    setBuses((b.data || []) as BusRow[]); setRoutes((r.data || []) as RouteRow[])
    setDevices((d.data || []) as DeviceRow[]); setPositions((p.data || []) as PositionRow[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
    const channel = supabase.channel('school-bus-gps-' + schoolId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_bus_gps_positions', filter: 'school_id=eq.' + schoolId }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_bus_gps_devices', filter: 'school_id=eq.' + schoolId }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [schoolId])

  const latest = useMemo(() => { const map = new Map<string, PositionRow>(); positions.forEach(p => { if (!map.has(p.bus_id)) map.set(p.bus_id, p) }); return map }, [positions])
  const registered = new Set(devices.map(d => d.bus_id))
  const signalCount = buses.filter(bus => { const device = devices.find(d => d.bus_id === bus.id); const p = latest.get(bus.id); return device?.status !== 'inactive' && p && Date.now() - new Date(p.recorded_at).getTime() <= 300000 }).length

  const createDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!busId || !imei.trim()) return
    setSaving(true)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    const tokenHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
    const { error } = await supabase.from('school_bus_gps_devices').insert({
      school_id: schoolId, bus_id: busId, provider_name: provider, model_name: modelName.trim() || null, protocol_type: protocolType,
      integration_mode: protocolType === 'vendor_cloud' ? 'vendor_cloud' : ['gt06_tcp','tk103_tcp'].includes(protocolType) ? 'tcp_gateway' : protocolType === 'custom_gateway' ? 'custom_gateway' : 'device_webhook',
      payload_format: protocolType === 'http_json' ? 'json' : protocolType === 'vendor_cloud' ? 'vendor_json' : 'custom_json',
      provider_device_id: providerDeviceId.trim() || null, device_imei: imei.trim().replace(/\\D/g, ''),
      sim_number: simNumber.trim() || null, device_label: deviceLabel.trim() || null, status: 'pending', ingest_token_hash: tokenHash,
    })
    if (error) notify(error.message)
    else { setNewDeviceToken(token); notify('GPS device registered. Copy its one-time token now.'); setBusId(''); setImei(''); setModelName(''); setProviderDeviceId(''); setSimNumber(''); setDeviceLabel(''); await load() }
    setSaving(false)
  }
  const updateStatus = async (device: DeviceRow, status: string) => {
    const { error } = await supabase.from('school_bus_gps_devices').update({ status, updated_at: new Date().toISOString() }).eq('school_id', schoolId).eq('id', device.id)
    if (error) notify(error.message); else { notify('Device status updated.'); await load() }
  }
  const removeDevice = async (device: DeviceRow) => {
    const { error } = await supabase.from('school_bus_gps_devices').delete().eq('school_id', schoolId).eq('id', device.id)
    if (error) notify(error.message); else { notify('GPS device removed.'); await load() }
  }

  if (loading) return <section className="workspace-panel bus-gps-admin"><div className="bus-gps-loading"><RefreshCw size={17}/> Loading GPS devices and telemetry…</div></section>
  return <section className="workspace-panel bus-gps-admin">
    <div className="workspace-heading bus-gps-heading"><div><span className="section-eyebrow">TRANSPORT CONNECTOR</span><h2>GPS Bus Tracking</h2><p>{schoolName} · Register GPS hardware and monitor the latest device locations.</p></div><span className="bus-preview-pill"><Radio size={13}/> Device integration</span></div>
    <div className="gps-summary-grid"><article><Bus/><span>Registered buses</span><b>{buses.length}</b></article><article><Wifi/><span>GPS devices</span><b>{devices.length}</b></article><article><Signal/><span>Recent GPS signals</span><b>{signalCount}</b></article></div>
    <form className="module-form gps-device-form" onSubmit={createDevice}>
      <div className="gps-form-heading"><div><b>Register GPS device</b><p>Each bus can use a different brand, model and supported protocol. Register the hardware details separately.</p></div><span className="gps-pending-tag">Awaiting first signal</span></div>
      <div className="form-three-col">
        <label>School bus<select value={busId} onChange={e => setBusId(e.target.value)} required><option value="">Choose bus</option>{buses.filter(bus => !registered.has(bus.id)).map(bus => <option key={bus.id} value={bus.id}>{bus.registration_number} · {routes.find(r => r.id === bus.route_id)?.route_name || 'Route not set'}</option>)}</select></label>
        <label>GPS brand / provider<select value={provider} onChange={e => setProvider(e.target.value)}><option>Other</option><option>Teltonika</option><option>Concox</option><option>Queclink</option><option>Jimi IoT</option><option>Fleet management provider</option><option>Local GPS vendor</option><option>Custom / OEM</option></select></label>
        <label>Device model<input value={modelName} onChange={e => setModelName(e.target.value)} placeholder="e.g. FMC920, GT06N, JM-VL03" /></label>
        <label>Device protocol<select value={protocolType} onChange={e => setProtocolType(e.target.value)}><option value="http_json">HTTP JSON webhook</option><option value="vendor_cloud">Vendor cloud webhook</option><option value="gt06_tcp">GT06 / Concox TCP</option><option value="tk103_tcp">TK103 TCP</option><option value="custom_gateway">Other / custom gateway</option></select></label>
        <label>Provider device ID <span className="field-hint">(optional)</span><input value={providerDeviceId} onChange={e => setProviderDeviceId(e.target.value)} placeholder="ID in vendor portal" /></label>
        <label>Device IMEI<input value={imei} onChange={e => setImei(e.target.value)} inputMode="numeric" placeholder="15-digit device IMEI" minLength={10} maxLength={20} required/></label>
        <label>SIM mobile number <span className="field-hint">(optional)</span><input value={simNumber} onChange={e => setSimNumber(e.target.value)} placeholder="GPS SIM number"/></label>
        <label>Device label <span className="field-hint">(optional)</span><input value={deviceLabel} onChange={e => setDeviceLabel(e.target.value)} placeholder="Front dashboard tracker"/></label>
      </div>
      <button className="primary-action" type="submit" disabled={saving || !buses.some(bus => !registered.has(bus.id))}><Plus size={16}/> Register GPS device</button>
      {!buses.length && <p className="gps-empty-note">Register a bus under Transport → Buses before adding its GPS device.</p>}
      {!!buses.length && registered.size === buses.length && <p className="gps-empty-note">Every registered bus already has a GPS device record.</p>}
    </form>
    {newDeviceToken && <div className="gps-token-panel"><div><b>One-time device token</b><p>Copy this token now. Only its hash is stored; it cannot be shown again after leaving this screen.</p></div><code>{newDeviceToken}</code><button type="button" className="transport-refresh" onClick={() => { void navigator.clipboard.writeText(newDeviceToken).then(() => notify('GPS device token copied.')).catch(() => notify('Clipboard access is unavailable.')) }}><Copy size={15}/> Copy token</button><div className="gps-endpoint"><b>Telemetry endpoint</b><code>https://rofbsjdsxqwbccnoyvyp.supabase.co/functions/v1/gps-ingest</code><b>Required JSON body</b><pre>{'{"imei":"DEVICE_IMEI","latitude":12.3456,"longitude":78.9012,"speed_kph":32,"heading":180,"recorded_at":"2026-11-24T08:30:00Z"}'}</pre><span>Send the token as Authorization: Bearer YOUR_DEVICE_TOKEN. HTTP JSON and compatible vendor webhooks can forward location data here. GT06/TK103 serial/TCP devices need a GPS gateway to decode their protocol and forward normalized JSON; a raw TCP tracker cannot post directly to this HTTPS endpoint.</span></div><button type="button" className="notice-text-button" onClick={() => setNewDeviceToken('')}>I have saved the token</button></div>}
    <div className="gps-section-heading"><div><b>Bus location status</b><span>Live status is based on received device telemetry, not generated sample coordinates.</span></div><button className="transport-refresh" type="button" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></div>
    <div className="gps-bus-list">{buses.map(bus => {
      const device = devices.find(d => d.bus_id === bus.id)
      const position = latest.get(bus.id)
      const fresh = Boolean(device && device.status !== 'inactive' && position && Date.now() - new Date(position.recorded_at).getTime() <= 300000)
      return <article className="gps-bus-card" key={bus.id}>
        <div className="gps-bus-card-top"><div className="gps-bus-icon"><Bus size={20}/></div><div className="gps-bus-title"><b>{bus.registration_number}</b><span>{routes.find(r => r.id === bus.route_id)?.route_name || 'Route not assigned'} · {bus.capacity} seats</span></div><span className={fresh ? 'gps-signal-pill online' : 'gps-signal-pill'}>{fresh ? <><Signal size={12}/> GPS signal</> : <><WifiOff size={12}/> No live signal</>}</span></div>
        {device ? <div className="gps-device-details"><div><small>Device / model</small><b>{device.provider_name}{device.model_name ? ' · ' + device.model_name : ''}</b><span className="gps-device-subline">{device.device_imei}</span></div><div><small>Protocol</small><b>{protocolNames[device.protocol_type] || device.protocol_type}</b></div><div><small>Device status</small><b>{device.status === 'inactive' ? 'Inactive' : fresh ? 'Connected' : 'Awaiting telemetry'}</b></div><div><small>Last update</small><b>{position ? ago(position.recorded_at) : 'Never received'}</b></div></div> : <div className="gps-unregistered"><Radio size={16}/> No GPS device registered for this bus.</div>}
        {position && <div className="gps-position-row"><div><MapPin size={15}/><span>{Number(position.latitude).toFixed(5)}, {Number(position.longitude).toFixed(5)}</span></div><span>{position.speed_kph == null ? 'Speed unavailable' : Number(position.speed_kph).toFixed(0) + ' km/h'}</span><a href={'https://www.google.com/maps?q=' + position.latitude + ',' + position.longitude} target="_blank" rel="noreferrer">Open map</a></div>}
        {device && <div className="gps-device-actions"><label>Device state<select value={device.status} onChange={e => void updateStatus(device, e.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button className="transport-icon-button" type="button" onClick={() => void removeDevice(device)} aria-label="Remove GPS device"><Trash2 size={15}/> Remove</button></div>}
      </article>
    })}{!buses.length && <div className="empty-module"><Bus size={24}/><b>No buses registered</b><span>Register buses before setting up GPS tracking.</span></div>}</div>
    <div className="gps-integration-note"><Activity size={17}/><div><b>Multi-brand integration rules</b><p>One school can mix Teltonika, Concox, Queclink, Jimi IoT, local and OEM trackers. Each bus keeps its own brand, model and protocol profile. HTTP JSON / vendor cloud webhooks can feed the shared secure endpoint after adding the device token. GT06, TK103 and other raw TCP protocols require a gateway adapter. Vendor API credentials belong in server-side secrets, never in this browser form.</p></div></div>
    <div className="gps-last-sync"><Clock3 size={13}/> {positions.length} location update(s) available · This screen listens for new Supabase GPS updates</div>
  </section>
}

export type BusTrackingPayload = {
  routeName: string
  busNumber: string
  driver: string
  schoolName: string
  updatedAt: string
  currentLocation: string
  stops: { name: string; status: 'passed' | 'current' | 'upcoming'; expected: string; actual?: string; minutes?: number }[]
}

export function readBusTrackingPayload(): BusTrackingPayload | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('busTrack')
    if (!raw) return null
    const value = JSON.parse(raw) as BusTrackingPayload
    if (!value.routeName || !value.busNumber || !Array.isArray(value.stops)) return null
    return value
  } catch { return null }
}

export function PublicBusTrackingPage({ payload }: { payload: BusTrackingPayload }) {
  return <main className="public-bus-page">
    <header className="public-bus-header"><div className="public-bus-brand"><div><Bus size={20}/></div><span>AI <b>ACADAMIX</b><small>BUS TRACKING</small></span></div><span className="public-demo-tag"><Signal size={12}/> SHARED TRACKING</span></header>
    <section className="public-bus-content">
      <div className="public-route-title"><span className="section-eyebrow">PARENT BUS TRACKER</span><h1>{payload.routeName}</h1><p>{payload.schoolName}</p></div>
      <div className="public-bus-status"><div className="public-bus-icon"><Bus size={25}/></div><div><small>Bus number · {payload.busNumber}</small><b>{payload.currentLocation}</b><span>Driver: {payload.driver || 'Not provided'}</span></div></div>
      <section className="public-stop-card"><div className="public-stop-heading"><div><h2>Route journey</h2><p>Shared location snapshot</p></div><span>Updated {payload.updatedAt}</span></div>
        {payload.stops.map((stop,index)=><article className={'public-stop-row '+stop.status} key={stop.name+index}><div className="public-stop-name"><b>{stop.name}</b><span>{stop.status==='passed'?'Passed':stop.status==='current'?'Current point':'Upcoming'}</span></div><div className="public-stop-time"><b>{stop.status==='passed'?stop.actual:stop.status==='current'?'Now':stop.expected}</b></div></article>)}
      </section>
      <div className="public-bus-disclaimer"><Radio size={15}/><span>This is a previously shared route snapshot. Real-time coordinates require an active GPS device feed.</span></div>
      <footer className="public-bus-footer">Powered by AI ACADAMIX · RADX</footer>
    </section>
  </main>
}
