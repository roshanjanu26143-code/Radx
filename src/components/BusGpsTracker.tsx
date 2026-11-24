import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Activity, Bus, Clock3, MapPin, Plus, Radio, RefreshCw, Signal, Wifi, WifiOff, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './bus-gps-tracker.css'

type BusRow = { id: string; registration_number: string; route_id: string; status: string; capacity: number }
type RouteRow = { id: string; route_name: string }
type DeviceRow = { id: string; bus_id: string; provider_name: string; device_imei: string; sim_number: string | null; device_label: string | null; status: string; last_seen_at: string | null }
type PositionRow = { id: number; bus_id: string; device_id: string; latitude: number; longitude: number; speed_kph: number | null; recorded_at: string; source: string }
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
  const [imei, setImei] = useState('')
  const [simNumber, setSimNumber] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')

  const load = async () => {
    setLoading(true)
    const [b, r, d, p] = await Promise.all([
      supabase.from('school_transport_buses').select('id,registration_number,route_id,status,capacity').eq('school_id', schoolId).order('registration_number'),
      supabase.from('school_transport_routes').select('id,route_name').eq('school_id', schoolId).order('route_name'),
      supabase.from('school_bus_gps_devices').select('id,bus_id,provider_name,device_imei,sim_number,device_label,status,last_seen_at').eq('school_id', schoolId).order('created_at', { ascending: false }),
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
  const signalCount = buses.filter(bus => { const p = latest.get(bus.id); return p && Date.now() - new Date(p.recorded_at).getTime() <= 300000 }).length

  const createDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!busId || !imei.trim()) return
    setSaving(true)
    const { error } = await supabase.from('school_bus_gps_devices').insert({
      school_id: schoolId, bus_id: busId, provider_name: provider, device_imei: imei.trim().replace(/\s/g, ''),
      sim_number: simNumber.trim() || null, device_label: deviceLabel.trim() || null, status: 'pending',
    })
    if (error) notify(error.message)
    else { notify('GPS device registered. Waiting for its first telemetry update.'); setBusId(''); setImei(''); setSimNumber(''); setDeviceLabel(''); await load() }
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
      <div className="gps-form-heading"><div><b>Register GPS device</b><p>Link one physical GPS tracker to a registered bus using its IMEI.</p></div><span className="gps-pending-tag">Awaiting first signal</span></div>
      <div className="form-three-col">
        <label>School bus<select value={busId} onChange={e => setBusId(e.target.value)} required><option value="">Choose bus</option>{buses.filter(bus => !registered.has(bus.id)).map(bus => <option key={bus.id} value={bus.id}>{bus.registration_number} · {routes.find(r => r.id === bus.route_id)?.route_name || 'Route not set'}</option>)}</select></label>
        <label>GPS provider<select value={provider} onChange={e => setProvider(e.target.value)}><option>Other</option><option>Teltonika</option><option>Concox</option><option>Queclink</option><option>Jimi IoT</option><option>Fleet management provider</option></select></label>
        <label>Device IMEI<input value={imei} onChange={e => setImei(e.target.value)} inputMode="numeric" placeholder="15-digit device IMEI" minLength={10} maxLength={20} required/></label>
        <label>SIM mobile number <span className="field-hint">(optional)</span><input value={simNumber} onChange={e => setSimNumber(e.target.value)} placeholder="GPS SIM number"/></label>
        <label>Device label <span className="field-hint">(optional)</span><input value={deviceLabel} onChange={e => setDeviceLabel(e.target.value)} placeholder="Front dashboard tracker"/></label>
      </div>
      <button className="primary-action" type="submit" disabled={saving || !buses.some(bus => !registered.has(bus.id))}><Plus size={16}/> Register GPS device</button>
      {!buses.length && <p className="gps-empty-note">Register a bus under Transport → Buses before adding its GPS device.</p>}
      {!!buses.length && registered.size === buses.length && <p className="gps-empty-note">Every registered bus already has a GPS device record.</p>}
    </form>
    <div className="gps-section-heading"><div><b>Bus location status</b><span>Live status is based on received device telemetry, not generated sample coordinates.</span></div><button className="transport-refresh" type="button" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></div>
    <div className="gps-bus-list">{buses.map(bus => {
      const device = devices.find(d => d.bus_id === bus.id)
      const position = latest.get(bus.id)
      const fresh = Boolean(position && Date.now() - new Date(position.recorded_at).getTime() <= 300000)
      return <article className="gps-bus-card" key={bus.id}>
        <div className="gps-bus-card-top"><div className="gps-bus-icon"><Bus size={20}/></div><div className="gps-bus-title"><b>{bus.registration_number}</b><span>{routes.find(r => r.id === bus.route_id)?.route_name || 'Route not assigned'} · {bus.capacity} seats</span></div><span className={fresh ? 'gps-signal-pill online' : 'gps-signal-pill'}>{fresh ? <><Signal size={12}/> GPS signal</> : <><WifiOff size={12}/> No live signal</>}</span></div>
        {device ? <div className="gps-device-details"><div><small>Device</small><b>{device.provider_name} · {device.device_imei}</b></div><div><small>Device status</small><b>{device.status === 'inactive' ? 'Inactive' : fresh ? 'Connected' : 'Awaiting telemetry'}</b></div><div><small>Last update</small><b>{position ? ago(position.recorded_at) : 'Never received'}</b></div></div> : <div className="gps-unregistered"><Radio size={16}/> No GPS device registered for this bus.</div>}
        {position && <div className="gps-position-row"><div><MapPin size={15}/><span>{Number(position.latitude).toFixed(5)}, {Number(position.longitude).toFixed(5)}</span></div><span>{position.speed_kph == null ? 'Speed unavailable' : Number(position.speed_kph).toFixed(0) + ' km/h'}</span><a href={'https://www.google.com/maps?q=' + position.latitude + ',' + position.longitude} target="_blank" rel="noreferrer">Open map</a></div>}
        {device && <div className="gps-device-actions"><label>Device state<select value={device.status} onChange={e => void updateStatus(device, e.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button className="transport-icon-button" type="button" onClick={() => void removeDevice(device)} aria-label="Remove GPS device"><Trash2 size={15}/> Remove</button></div>}
      </article>
    })}{!buses.length && <div className="empty-module"><Bus size={24}/><b>No buses registered</b><span>Register buses before setting up GPS tracking.</span></div>}</div>
    <div className="gps-integration-note"><Activity size={17}/><div><b>Live device feed is not connected yet</b><p>Registering a device stores its IMEI and bus mapping. Actual coordinates appear only after the GPS provider sends authenticated telemetry to the school backend. Provider API credentials must be configured server-side; never paste GPS secrets into this browser form.</p></div></div>
    <div className="gps-last-sync"><Clock3 size={13}/> {positions.length} location update(s) available · This screen listens for new Supabase GPS updates</div>
  </section>
}
