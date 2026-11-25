import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bus, MapPin, Users, Route as RouteIcon, Plus, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './TransportManagement.css'
import TransportLiveTracking from './TransportLiveTracking'

type Person = { id: string; type: string; name: string; details: Record<string, string> }
type RouteRow = { id: string; route_name: string; start_point: string; end_point: string; is_active: boolean; stops: StopRow[] }
type StopRow = { id: string; route_id: string; stop_name: string; stop_order: number; pickup_time: string | null; drop_time: string | null }
type BusRow = { id: string; route_id: string; registration_number: string; capacity: number; driver_person_id: string | null; cleaner_person_id: string | null; status: string; route?: { route_name: string } }
type AllotmentRow = { id: string; student_person_id: string; route_id: string; bus_id: string; pickup_stop_id: string | null; monthly_fee: number; status: string; student?: Person }

export default function TransportManagement({ schoolId, peopleRecords, page, notify }: {
  schoolId: string
  peopleRecords: Person[]
  page: string
  notify: (message: string) => void
}) {
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [buses, setBuses] = useState<BusRow[]>([])
  const [allotments, setAllotments] = useState<AllotmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [startPoint, setStartPoint] = useState('')
  const [endPoint, setEndPoint] = useState('School')
  const [stopLines, setStopLines] = useState('')
  const [busNumber, setBusNumber] = useState('')
  const [capacity, setCapacity] = useState('40')
  const [busRoute, setBusRoute] = useState('')
  const [driverId, setDriverId] = useState('')
  const [cleanerId, setCleanerId] = useState('')
  const [townFilter, setTownFilter] = useState('')
  const [villageFilter, setVillageFilter] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedRoute, setSelectedRoute] = useState('')
  const [selectedBus, setSelectedBus] = useState('')
  const [selectedStop, setSelectedStop] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('0')
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  const students = useMemo(() => peopleRecords.filter(person => person.type === 'Student'), [peopleRecords])
  const drivers = useMemo(() => peopleRecords.filter(person => person.type === 'Driver & Cleaner' && (person.details.work_role || 'Driver') === 'Driver'), [peopleRecords])
  const cleaners = useMemo(() => peopleRecords.filter(person => person.type === 'Driver & Cleaner' && (person.details.work_role || 'Driver') === 'Cleaner'), [peopleRecords])
  const activeRoute = routes.find(route => route.id === selectedRoute)
  const filteredStudents = useMemo(() => students.filter(student => {
    const details = student.details
    const town = [details.city_town, details.town_city, details.city, details.town].filter(Boolean).join(' ')
    const village = [details.sub_town, details.village, details.locality].filter(Boolean).join(' ')
    const addressMatch = (!townFilter || town.toLowerCase().includes(townFilter.toLowerCase())) && (!villageFilter || village.toLowerCase().includes(villageFilter.toLowerCase()))
    return addressMatch && (!studentSearch || student.name.toLowerCase().includes(studentSearch.toLowerCase()) || student.id.toLowerCase().includes(studentSearch.toLowerCase()))
  }), [students, townFilter, villageFilter, studentSearch])

  const load = async () => {
    setLoading(true)
    const [routeResult, stopResult, busResult, allotmentResult] = await Promise.all([
      supabase.from('school_transport_routes').select('id,route_name,start_point,end_point,is_active').eq('school_id', schoolId).order('created_at', { ascending: false }),
      supabase.from('school_transport_stops').select('id,route_id,stop_name,stop_order,pickup_time,drop_time').eq('school_id', schoolId).order('stop_order'),
      supabase.from('school_transport_buses').select('id,route_id,registration_number,capacity,driver_person_id,cleaner_person_id,status').eq('school_id', schoolId).order('registration_number'),
      supabase.from('school_transport_allotments').select('id,student_person_id,route_id,bus_id,pickup_stop_id,monthly_fee,status').eq('school_id', schoolId).order('created_at', { ascending: false }),
    ])
    const error = routeResult.error || stopResult.error || busResult.error || allotmentResult.error
    if (error) notify('Transport data could not be loaded: ' + error.message)
    const stopRows = (stopResult.data || []) as StopRow[]
    setRoutes(((routeResult.data || []) as Omit<RouteRow, 'stops'>[]).map(route => ({ ...route, stops: stopRows.filter(stop => stop.route_id === route.id) })))
    setBuses((busResult.data || []) as BusRow[])
    setAllotments(((allotmentResult.data || []) as AllotmentRow[]).map(row => ({ ...row, student: students.find(person => person.id === row.student_person_id) })))
    setLoading(false)
  }

  useEffect(() => { void load() }, [schoolId, peopleRecords])

  const createRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!routeName.trim() || !startPoint.trim() || !endPoint.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('school_transport_routes').insert({
      school_id: schoolId, route_name: routeName.trim(), start_point: startPoint.trim(), end_point: endPoint.trim(),
    }).select('id').single()
    if (error || !data) { notify(error?.message || 'Route could not be created.'); setSaving(false); return }
    const stops = stopLines.split(/\n|,/).map(name => name.trim()).filter(Boolean)
    if (stops.length) {
      const { error: stopError } = await supabase.from('school_transport_stops').insert(stops.map((stop_name, index) => ({
        school_id: schoolId, route_id: data.id, stop_name, stop_order: index + 1,
      })))
      if (stopError) notify('Route saved, but stops could not be saved: ' + stopError.message)
    else notify('Route and stops saved.')
    } else notify('Route saved.') 
    setRouteName(''); setStartPoint(''); setEndPoint('School'); setStopLines('')
    await load(); setSaving(false)
  }

  const deleteRoute = async (route: RouteRow) => {
    if (buses.some(bus => bus.route_id === route.id)) { notify('Move or remove buses assigned to this route before deleting it.'); return }
    if (allotments.some(row => row.route_id === route.id)) { notify('Reassign or remove student allotments before deleting this route.'); return }
    const { error } = await supabase.from('school_transport_routes').delete().eq('school_id', schoolId).eq('id', route.id)
    if (error) notify(error.message); else { notify('Route deleted.'); await load() }
  }

  const createBus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!busRoute || !busNumber.trim()) return
    setSaving(true)
    const { error } = await supabase.from('school_transport_buses').insert({
      school_id: schoolId, route_id: busRoute, registration_number: busNumber.trim().toUpperCase(),
      capacity: Number(capacity), driver_person_id: driverId || null, cleaner_person_id: cleanerId || null,
    })
    if (error) notify(error.message); else { notify('Bus registered successfully.'); setBusNumber(''); setDriverId(''); setCleanerId(''); await load() }
    setSaving(false)
  }

  const updateBusStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('school_transport_buses').update({ status, updated_at: new Date().toISOString() }).eq('school_id', schoolId).eq('id', id)
    if (error) notify(error.message); else { notify('Bus status updated.'); await load() }
  }

  const toggleStudent = (id: string) => setSelectedStudents(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const saveAllotments = async () => {
    if (!selectedRoute || !selectedBus || !selectedStudents.length) { notify('Choose a route, bus and at least one student.'); return }
    const targetBus = buses.find(bus => bus.id === selectedBus)
    if (!targetBus || targetBus.route_id !== selectedRoute || targetBus.status !== 'active') { notify('Choose an active bus assigned to this route.'); return }
    const alreadyOnBus = selectedStudents.filter(studentId => allotments.some(row => row.student_person_id === studentId && row.bus_id === selectedBus && row.status === 'active')).length
    const currentOnBus = allotments.filter(row => row.bus_id === selectedBus && row.status === 'active').length
    const projectedOccupancy = currentOnBus + selectedStudents.length - alreadyOnBus
    if (projectedOccupancy > targetBus.capacity) { notify('Bus capacity exceeded: this allotment would assign ' + projectedOccupancy + ' students to a ' + targetBus.capacity + '-seat bus.'); return }
    setSaving(true)
    const rows = selectedStudents.map(student_person_id => ({
      school_id: schoolId, student_person_id, route_id: selectedRoute, bus_id: selectedBus,
      pickup_stop_id: selectedStop || null, monthly_fee: Math.max(0, Number(monthlyFee) || 0), status: 'active', updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('school_transport_allotments').upsert(rows, { onConflict: 'school_id,student_person_id' })
    if (error) notify(error.message); else { notify(selectedStudents.length + ' student transport allotment(s) saved.'); setSelectedStudents([]); await load() }
    setSaving(false)
  }

  const changeAllotmentStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('school_transport_allotments').update({ status, updated_at: new Date().toISOString() }).eq('school_id', schoolId).eq('id', id)
    if (error) notify(error.message); else { notify('Student transport status updated.'); await load() }
  }

  const pageTitle = page === 'Routes' ? 'Routes & Stops' : page === 'Buses' ? 'Bus Fleet' : 'Student Transport'
  const pageDescription = page === 'Routes' ? 'Plan pickup and drop routes, organise stops and keep every journey structured.' : page === 'Buses' ? 'Manage your school fleet, vehicle capacity, drivers, cleaners and service status.' : 'Assign students to the right route, bus and pickup stop using their locality details.'
  const pageSummary = <div className="transport-summary">
    <div><RouteIcon/><span>Routes configured</span><b>{routes.length}</b><small>Pickup & drop networks</small></div>
    <div><Bus/><span>Active fleet</span><b>{buses.filter(bus => bus.status === 'active').length} / {buses.length}</b><small>{buses.filter(bus => bus.status === 'maintenance').length} in maintenance</small></div>
    <div><Users/><span>Students allotted</span><b>{allotments.filter(row => row.status === 'active').length}</b><small>Active transport users</small></div>
  </div>

  if (page === 'Live tracking') return <section className="transport-page"><div className="transport-page-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>Live fleet tracking</h2><p>Monitor school buses, GPS signals and route progress in one place.</p></div><button className="transport-refresh" onClick={() => void load()}><RefreshCw size={15}/> Refresh data</button></div>{pageSummary}<TransportLiveTracking schoolId={schoolId} schoolName="" peopleRecords={peopleRecords} notify={notify}/></section>

  if (loading) return <section className="workspace-panel transport-panel"><div className="transport-page-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>{pageTitle}</h2><p>{pageDescription}</p></div></div><div className="transport-loading"><RefreshCw size={18}/> Loading transport records…</div></section>

  return <section className="workspace-panel transport-panel">
    <div className="transport-page-heading"><div><span className="section-eyebrow">TRANSPORT MANAGEMENT</span><h2>{pageTitle}</h2><p>{pageDescription}</p></div><button className="transport-refresh" onClick={() => void load()}><RefreshCw size={15}/> Refresh data</button></div>
    
    {pageSummary}

    {page === 'Routes' && <>
      <form className="module-form transport-form" onSubmit={createRoute}>
        <div className="form-two-col"><label>Route name<input value={routeName} onChange={e => setRouteName(e.target.value)} placeholder="Route 01 – North" required/></label><label>Starting point<input value={startPoint} onChange={e => setStartPoint(e.target.value)} placeholder="Town / Bus stand" required/></label></div>
        <div className="form-two-col"><label>End point<input value={endPoint} onChange={e => setEndPoint(e.target.value)} placeholder="School" required/></label><label>Stops <span className="field-hint">(one per line or comma separated)</span><textarea value={stopLines} onChange={e => setStopLines(e.target.value)} placeholder={'Main road\nMarket\nBus stand'} rows={3}/></label></div>
        <button className="primary-action" type="submit" disabled={saving}><Plus size={16}/> Create route</button>
      </form>
      <div className="transport-route-grid">{routes.map(route => <article className="transport-card" key={route.id}><header><div><b>{route.route_name}</b><small>{route.stops.length + 2} route points</small></div><button className="transport-icon-button" onClick={() => void deleteRoute(route)} aria-label="Delete route"><Trash2 size={16}/></button></header><div className="transport-route-line"><span className="transport-stop start">{route.start_point}</span>{route.stops.map(stop => <span className="transport-stop" key={stop.id}>{stop.stop_name}</span>)}<span className="transport-stop end">{route.end_point}</span></div></article>)}{!routes.length && <div className="empty-module"><MapPin size={24}/><b>No routes created</b><span>Create your first school route above.</span></div>}</div>
    </>}

    {page === 'Buses' && <>
      <form className="module-form transport-form" onSubmit={createBus}>
        <div className="form-two-col"><label>Registration number<input value={busNumber} onChange={e => setBusNumber(e.target.value)} placeholder="TN 38 AB 1234" required/></label><label>Route<select value={busRoute} onChange={e => setBusRoute(e.target.value)} required><option value="">Choose route</option>{routes.map(route => <option key={route.id} value={route.id}>{route.route_name}</option>)}</select></label></div>
        <div className="form-three-col"><label>Seating capacity<input type="number" min="1" max="100" value={capacity} onChange={e => setCapacity(e.target.value)} required/></label><label>Driver<select value={driverId} onChange={e => setDriverId(e.target.value)}><option value="">Not assigned</option>{drivers.map(person => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select></label><label>Cleaner<select value={cleanerId} onChange={e => setCleanerId(e.target.value)}><option value="">Not assigned</option>{cleaners.map(person => <option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}</select></label></div>
        <button className="primary-action" type="submit" disabled={saving || !routes.length}><Plus size={16}/> Register bus</button>{!routes.length && <span className="field-hint">Create a route before registering a bus.</span>}
      </form>
      <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>Bus</th><th>Route</th><th>Driver / Cleaner</th><th>Capacity</th><th>Status</th></tr></thead><tbody>{buses.map(bus => <tr key={bus.id}><td><b>{bus.registration_number}</b></td><td>{routes.find(route => route.id === bus.route_id)?.route_name || '—'}</td><td>{peopleRecords.find(person => person.id === bus.driver_person_id)?.name || 'Not assigned'}<small>{peopleRecords.find(person => person.id === bus.cleaner_person_id)?.name || 'Cleaner not assigned'}</small></td><td>{bus.capacity}</td><td><select className="transport-status" value={bus.status} onChange={e => void updateBusStatus(bus.id, e.target.value)}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></td></tr>)}</tbody></table>{!buses.length && <div className="empty-table">No buses registered yet.</div>}</div>
    </>}

    {(page === 'Allotment' || page === 'Students') && <>
      <div className="module-form transport-form">
        <div className="form-two-col"><label>Route<select value={selectedRoute} onChange={e => { setSelectedRoute(e.target.value); setSelectedBus(''); setSelectedStop('') }}><option value="">Choose route</option>{routes.map(route => <option key={route.id} value={route.id}>{route.route_name}</option>)}</select></label><label>Bus<select value={selectedBus} onChange={e => setSelectedBus(e.target.value)}><option value="">Choose bus</option>{buses.filter(bus => bus.route_id === selectedRoute && bus.status === 'active').map(bus => <option key={bus.id} value={bus.id}>{bus.registration_number} · {bus.capacity} seats</option>)}</select></label></div>
        <div className="form-three-col"><label>Pickup stop<select value={selectedStop} onChange={e => setSelectedStop(e.target.value)}><option value="">Not specified</option>{(activeRoute?.stops || []).map(stop => <option key={stop.id} value={stop.id}>{stop.stop_name}</option>)}</select></label><label>Monthly transport fee (₹)<input type="number" min="0" step="0.01" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)}/></label><label>Search student<input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Name or admission ID"/></label></div>
        <div className="form-two-col"><label>Town / City<input value={townFilter} onChange={e => setTownFilter(e.target.value)} placeholder="Filter by town / city"/></label><label>Sub-town / Village<input value={villageFilter} onChange={e => setVillageFilter(e.target.value)} placeholder="Filter by locality / village"/></label></div>
        <div className="transport-student-list"><div className="transport-list-heading"><b>Students</b><span>{selectedStudents.length} selected · {filteredStudents.length} matching</span></div>{filteredStudents.map(student => { const existing = allotments.find(row => row.student_person_id === student.id && row.status === 'active'); return <label className="transport-student-row" key={student.id}><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={() => toggleStudent(student.id)}/><span><b>{student.name}</b><small>{student.id} · {student.details.joining_standard || 'Standard not set'} {student.details.section || ''}</small></span><em>{existing ? 'Already allotted' : 'Not allotted'}</em></label> })}{!filteredStudents.length && <div className="empty-table">No students match the selected filters. Check that student address details are filled in.</div>}</div>
        <button className="primary-action" type="button" onClick={() => void saveAllotments()} disabled={saving || !selectedStudents.length}><Users size={16}/> Save allotment for {selectedStudents.length} student(s)</button>
      </div>
      <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>Student</th><th>Route / Bus</th><th>Pickup stop</th><th>Monthly fee</th><th>Status</th></tr></thead><tbody>{allotments.map(row => <tr key={row.id}><td><b>{row.student?.name || row.student_person_id}</b><small>{row.student_person_id}</small></td><td>{routes.find(route => route.id === row.route_id)?.route_name || '—'}<small>{buses.find(bus => bus.id === row.bus_id)?.registration_number || '—'}</small></td><td>{routes.flatMap(route => route.stops).find(stop => stop.id === row.pickup_stop_id)?.stop_name || '—'}</td><td>₹{Number(row.monthly_fee).toLocaleString('en-IN')}</td><td><select className="transport-status" value={row.status} onChange={e => void changeAllotmentStatus(row.id, e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="withdrawn">Withdrawn</option></select></td></tr>)}</tbody></table>{!allotments.length && <div className="empty-table">No student transport allotments yet.</div>}</div>
    </>}
  </section>
}
