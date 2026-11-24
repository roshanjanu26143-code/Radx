import { useEffect, useMemo, useState } from 'react'
import { Activity, Bus, Clock3, MapPin, Phone, Route as RouteIcon, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Person = { id: string; type: string; name: string; details: Record<string, string> }
type BusItem = { id: string; registration_number: string; route_id: string; capacity: number; status: string; driver_person_id: string | null; cleaner_person_id: string | null }
type RouteItem = { id: string; route_name: string; start_point: string; end_point: string }
type DeviceItem = { id: string; bus_id: string; status: string; provider_name: string; last_seen_at: string | null }
type PositionItem = { id: number; bus_id: string; latitude: number; longitude: number; speed_kph: number | null; recorded_at: string }

const isLive = (position?: PositionItem) => Boolean(position && Date.now() - new Date(position.recorded_at).getTime() <= 5 * 60 * 1000)
const timeAgo = (value?: string) => {
  if (!value) return 'No signal'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  return minutes < 1 ? 'Just now' : minutes < 60 ? minutes + ' min ago' : Math.floor(minutes / 60) + ' hr ago'
}

export default function TransportLiveTracking({ schoolId, peopleRecords, notify }: {
  schoolId: string; schoolName: string; peopleRecords: Person[]; notify: (message: string) => void
}) {
  const [buses, setBuses] = useState<BusItem[]>([])
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [positions, setPositions] = useState<PositionItem[]>([])
  const [selectedBusId, setSelectedBusId] = useState('')
  const [filter, setFilter] = useState<'all' | 'live' | 'delayed'>('all')
  const [search, setSearch] = useState('')
  const [mapMode, setMapMode] = useState<'map' | 'route'>('map')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [b, r, d, p] = await Promise.all([
      supabase.from('school_transport_buses').select('id,registration_number,route_id,capacity,status,driver_person_id,cleaner_person_id').eq('school_id', schoolId).order('registration_number'),
      supabase.from('school_transport_routes').select('id,route_name,start_point,end_point').eq('school_id', schoolId).order('route_name'),
      supabase.from('school_bus_gps_devices').select('id,bus_id,status,provider_name,last_seen_at').eq('school_id', schoolId),
      supabase.from('school_bus_gps_positions').select('id,bus_id,latitude,longitude,speed_kph,recorded_at').eq('school_id', schoolId).order('recorded_at', { ascending: false }).limit(300),
    ])
    const error = b.error || r.error || d.error || p.error
    if (error) notify('Live tracking could not load: ' + error.message)
    const busRows = (b.data || []) as BusItem[]
    setBuses(busRows); setRoutes((r.data || []) as RouteItem[]); setDevices((d.data || []) as DeviceItem[])
    setPositions((p.data || []) as PositionItem[])
    setSelectedBusId(current => current && busRows.some(item => item.id === current) ? current : busRows[0]?.id || '')
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    void load()
    const channel = supabase.channel('transport-live-' + schoolId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_bus_gps_positions', filter: 'school_id=eq.' + schoolId }, () => { if (active) void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'school_bus_gps_devices', filter: 'school_id=eq.' + schoolId }, () => { if (active) void load() })
      .subscribe()
    return () => { active = false; void supabase.removeChannel(channel) }
  }, [schoolId])

  const latestByBus = useMemo(() => {
    const result = new Map<string, PositionItem>()
    positions.forEach(position => { if (!result.has(position.bus_id)) result.set(position.bus_id, position) })
    return result
  }, [positions])
  const liveCount = buses.filter(bus => isLive(latestByBus.get(bus.id)) && devices.find(device => device.bus_id === bus.id)?.status !== 'inactive').length
  const delayedCount = buses.length - liveCount
  const filteredBuses = buses.filter(bus => {
    const position = latestByBus.get(bus.id)
    const live = isLive(position) && devices.find(device => device.bus_id === bus.id)?.status !== 'inactive'
    const matchesFilter = filter === 'all' || (filter === 'live' ? live : !live)
    const route = routes.find(item => item.id === bus.route_id)?.route_name || ''
    return matchesFilter && (bus.registration_number.toLowerCase().includes(search.toLowerCase()) || route.toLowerCase().includes(search.toLowerCase()))
  })
  const selectedBus = buses.find(bus => bus.id === selectedBusId)
  const selectedPosition = selectedBus ? latestByBus.get(selectedBus.id) : undefined
  const selectedRoute = selectedBus ? routes.find(route => route.id === selectedBus.route_id) : undefined
  const selectedDevice = selectedBus ? devices.find(device => device.bus_id === selectedBus.id) : undefined
  const driver = selectedBus ? peopleRecords.find(person => person.id === selectedBus.driver_person_id) : undefined
  const driverPhone = driver?.details.phone || driver?.details.mobile || driver?.details.phone_number || ''
  const selectedLive = isLive(selectedPosition) && selectedDevice?.status !== 'inactive'
  const mapUrl = selectedPosition
    ? 'https://www.openstreetmap.org/export/embed.html?bbox=' + (Number(selectedPosition.longitude) - 0.012) + '%2C' + (Number(selectedPosition.latitude) - 0.008) + '%2C' + (Number(selectedPosition.longitude) + 0.012) + '%2C' + (Number(selectedPosition.latitude) + 0.008) + '&layer=mapnik&marker=' + selectedPosition.latitude + '%2C' + selectedPosition.longitude
    : ''

  if (loading) return <section className="transport-live"><div className="transport-live-loading"><Activity size={18}/> Connecting to live fleet…</div></section>

  return <section className="transport-live">
    <div className="transport-live-fleet">
      <div className="transport-live-fleet-head"><span>ACTIVE FLEET</span><b>{buses.length} buses registered</b></div>
      <label className="transport-live-search"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search bus or route"/></label>
      <div className="transport-live-filters">
        <button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All <b>{buses.length}</b></button>
        <button className={filter === 'live' ? 'selected' : ''} onClick={() => setFilter('live')}>On route <b>{liveCount}</b></button>
        <button className={filter === 'delayed' ? 'selected' : ''} onClick={() => setFilter('delayed')}>Delayed / offline <b>{delayedCount}</b></button>
      </div>
      <div className="transport-live-bus-list">
        {filteredBuses.map((bus, index) => {
          const position = latestByBus.get(bus.id)
          const live = isLive(position) && devices.find(device => device.bus_id === bus.id)?.status !== 'inactive'
          const route = routes.find(item => item.id === bus.route_id)
          const busDriver = peopleRecords.find(person => person.id === bus.driver_person_id)
          return <button type="button" className={'transport-live-bus-card ' + (selectedBusId === bus.id ? 'chosen' : '')} key={bus.id} onClick={() => setSelectedBusId(bus.id)}>
            <span className={'transport-live-bus-icon tone-' + (index % 4)}><Bus size={17}/></span>
            <span className="transport-live-bus-copy"><b>{bus.registration_number}</b><small>{route?.route_name || 'Route not assigned'}</small><em>{busDriver?.name || 'Driver not assigned'} · {bus.capacity} seats</em><i className={live ? 'live' : 'offline'}>{live ? '● On route' : '● No live signal'}</i></span>
            <span className="transport-live-bus-meta"><small>{position ? timeAgo(position.recorded_at) : '—'}</small><b>{position?.speed_kph == null ? '—' : Math.round(Number(position.speed_kph)) + ' km/h'}</b></span>
          </button>
        })}
        {!filteredBuses.length && <div className="transport-live-empty"><Bus size={22}/><b>No buses match</b><span>Register a bus and GPS device to see it here.</span></div>}
      </div>
      <button className="transport-live-manage" type="button" onClick={() => window.dispatchEvent(new CustomEvent('radx-transport-navigate', { detail: 'Buses' }))}>Manage full fleet <span>›</span></button>
    </div>
    <div className="transport-live-map-panel">
      <div className="transport-live-map-toolbar">
        <div><button className={mapMode === 'map' ? 'active' : ''} onClick={() => setMapMode('map')}>Map view</button><button className={mapMode === 'route' ? 'active' : ''} onClick={() => setMapMode('route')}>Route view</button></div>
        <span><i/> On time <i className="delayed-dot"/> Delayed / offline</span>
      </div>
      <div className="transport-live-map">
        {mapUrl ? <iframe title="Selected school bus live location map" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/> : <div className="transport-live-map-empty"><MapPin size={34}/><b>Waiting for GPS location</b><span>When this bus sends its first valid GPS signal, its real location will appear on the map.</span></div>}
        {selectedPosition && <div className="transport-live-map-caption"><b>{selectedBus?.registration_number}</b><span>{selectedLive ? 'Live GPS location' : 'Last known location'} · {timeAgo(selectedPosition.recorded_at)}</span></div>}
        {mapMode === 'route' && <div className="transport-live-route-note"><RouteIcon size={14}/>{selectedRoute ? selectedRoute.start_point + ' → ' + selectedRoute.end_point : 'No route assigned to this bus'}</div>}
      </div>
      <footer className="transport-live-tripbar">
        <div className="transport-live-tripbus"><span><Bus size={18}/></span><div><small>{selectedLive ? 'LIVE TRACKING' : 'LAST KNOWN STATUS'}</small><b>{selectedBus?.registration_number || 'No bus selected'}</b><em>{selectedRoute?.route_name || 'Route not assigned'}</em></div></div>
        <div className="transport-live-metric"><Clock3 size={16}/><span><small>LAST UPDATE</small><b>{selectedPosition ? timeAgo(selectedPosition.recorded_at) : 'No signal'}</b></span></div>
        <div className="transport-live-metric"><Activity size={16}/><span><small>SPEED</small><b>{selectedPosition?.speed_kph == null ? '—' : Math.round(Number(selectedPosition.speed_kph)) + ' km/h'}</b></span></div>
        {driverPhone ? <a className="transport-live-contact" href={'tel:' + driverPhone}><Phone size={14}/> Contact driver</a> : <span className="transport-live-no-contact"><Phone size={14}/> Driver phone unavailable</span>}
      </footer>
      {!buses.length && <div className="transport-live-onboarding">Start by registering a bus under <b>Transport → Buses</b>, then add its GPS tracker under <b>Connectors → GPS - Bus</b>.</div>}
    </div>
  </section>
}

