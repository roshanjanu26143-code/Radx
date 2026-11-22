import { useMemo, useState } from 'react'
import { ArrowLeft, Bus, Check, Clock3, Copy, MapPin, Navigation, Radio, Share2, Signal, Timer, Wifi } from 'lucide-react'
import './bus-gps-tracker.css'

type RouteInput = { name: string; start: string; stops: string[]; end: string }
type BusInput = { number: string; driver: string; cleaner: string; route: string }
type StopStatus = 'passed' | 'current' | 'upcoming'
type TrackingStop = { name: string; status: StopStatus; expected: string; actual?: string; minutes?: number }
export type BusTrackingPayload = {
  routeName: string
  busNumber: string
  driver: string
  schoolName: string
  updatedAt: string
  currentLocation: string
  stops: TrackingStop[]
}

const sampleRoute: RouteInput = {
  name: 'Route 01 · Ambur – School',
  start: 'Ambur Bus Stand',
  stops: ['Sugarmill', 'Vengili', 'Zameen', 'Madhanur', 'School Gate'],
  end: 'Smart Valley School',
}

function makeTrackingPayload(route: RouteInput, bus: BusInput | undefined, schoolName: string): BusTrackingPayload {
  const points = [route.start, ...route.stops, route.end].filter(Boolean)
  const now = new Date()
  const currentIndex = Math.min(2, Math.max(0, points.length - 1))
  const stops = points.map((name, index): TrackingStop => {
    const expected = new Date(now.getTime() + (index - currentIndex) * 8 * 60000)
    const format = (date: Date) => date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    if (index < currentIndex) return { name, status: 'passed', expected: format(expected), actual: format(new Date(now.getTime() - (currentIndex - index) * 7 * 60000)) }
    if (index === currentIndex) return { name, status: 'current', expected: 'Now', actual: 'Bus is here' }
    return { name, status: 'upcoming', expected: format(expected), minutes: (index - currentIndex) * 8 }
  })
  return {
    routeName: route.name,
    busNumber: bus?.number || 'TN 23 AB 1234',
    driver: bus?.driver || 'R. Kumar',
    schoolName: schoolName || 'AI ACADAMIX School',
    updatedAt: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    currentLocation: points[currentIndex] || 'On route',
    stops,
  }
}

function createShareUrl(payload: BusTrackingPayload) {
  return window.location.origin + window.location.pathname + '?busTrack=' + encodeURIComponent(JSON.stringify(payload))
}

export default function BusGpsTracker({ routes, buses, schoolName, notify }: {
  routes: RouteInput[]
  buses: BusInput[]
  schoolName: string
  notify: (message: string) => void
}) {
  const [routeIndex, setRouteIndex] = useState(0)
  const [selectedBusNumber, setSelectedBusNumber] = useState('')
  const availableRoutes = routes.length ? routes : [sampleRoute]
  const route = availableRoutes[Math.min(routeIndex, availableRoutes.length - 1)]
  const routeBuses = buses.filter(bus => !bus.route || bus.route === route.name)
  const bus = routeBuses.find(item => item.number === selectedBusNumber) || routeBuses[0] || buses[0]
  const payload = useMemo(() => makeTrackingPayload(route, bus, schoolName), [route, bus, schoolName])
  const shareUrl = createShareUrl(payload)
  const message = `🚌 ${schoolName || 'School'} Bus Live Tracking\nRoute: ${payload.routeName}\nBus: ${payload.busNumber}\nTrack the bus and check stop-wise arrival time here:\n${shareUrl}\n\nETA is a frontend preview until live GPS is connected.`
  const shareWhatsApp = () => window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer')
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      notify('Bus tracking link copied.')
    } catch {
      notify('Copy is not available in this browser. Use Share on WhatsApp instead.')
    }
  }

  return <section className="workspace-panel bus-gps-admin">
    <div className="workspace-heading bus-gps-heading">
      <div><span className="section-eyebrow">PARENT LIVE TRACKING</span><h2>Bus GPS & Route Sharing</h2><p>Share a route-specific tracking page directly to the parents’ WhatsApp group.</p></div>
      <span className="bus-preview-pill"><Radio size={13}/> Preview mode</span>
    </div>
    <div className="bus-share-controls">
      <label>Choose route<select value={routeIndex} onChange={event => setRouteIndex(Number(event.target.value))}>{availableRoutes.map((item, index) => <option value={index} key={item.name + index}>{item.name}</option>)}</select></label>
      <label>Choose route bus<select value={bus?.number || ''} onChange={event => setSelectedBusNumber(event.target.value)}>{(routeBuses.length ? routeBuses : buses).length ? (routeBuses.length ? routeBuses : buses).map((item, index) => <option value={item.number} key={item.number + index}>{item.number} · {item.driver || 'Driver not assigned'}</option>) : <option value="">Demo bus · TN 23 AB 1234</option>}</select></label>
      <div className="bus-share-meta"><span><Bus size={15}/> {payload.busNumber}</span><span><Navigation size={14}/> {payload.currentLocation}</span></div>
    </div>
    <div className="bus-gps-preview">
      <div className="bus-gps-map-top"><div><span className="live-dot"/> BUS ROUTE STATUS <small>DEMO LOCATION</small></div><span><Wifi size={13}/> GPS not connected</span></div>
      <div className="bus-live-summary"><div className="bus-live-icon"><Bus size={23}/></div><div><small>Current bus location</small><b>{payload.currentLocation}</b><span>Bus {payload.busNumber} · Driver {payload.driver}</span></div><div className="bus-live-eta"><small>Next stop ETA</small><b>{payload.stops.find(stop => stop.status === 'upcoming')?.minutes ?? 0} min</b></div></div>
      <div className="bus-route-track">
        <div className="bus-track-line"/>
        {payload.stops.map((stop, index) => <div className={'bus-track-stop ' + stop.status} key={stop.name + index}>
          <div className="bus-track-marker">{stop.status === 'passed' ? <Check size={12}/> : stop.status === 'current' ? <Bus size={15}/> : <span/>}</div>
          <div className="bus-track-stop-copy"><b>{stop.name}</b><span>{stop.status === 'passed' ? 'Bus passed' : stop.status === 'current' ? 'Current bus location' : 'Upcoming stop'}</span></div>
          <div className="bus-track-stop-time">{stop.status === 'passed' ? <><b>{stop.actual}</b><span>Actual</span></> : stop.status === 'current' ? <><b>Now</b><span>Live point</span></> : <><b>{stop.expected}</b><span>Expected · {stop.minutes} min</span></>}</div>
        </div>)}
      </div>
      <div className="bus-gps-foot"><span><Clock3 size={13}/> Last updated {payload.updatedAt}</span><span>Arrival times are sample data</span></div>
    </div>
    <div className="bus-share-panel">
      <div><b>Share with parents</b><p>Send this route’s tracking link to its WhatsApp group. Parents can open it without an ACADAMIX login.</p></div>
      <div className="bus-share-link"><span>{shareUrl}</span><button type="button" onClick={copyLink} aria-label="Copy tracking link"><Copy size={16}/></button></div>
      <div className="bus-share-actions"><button type="button" className="bus-whatsapp-button" onClick={shareWhatsApp}><Share2 size={16}/> Share to WhatsApp group</button><span>Link is a shareable demo snapshot; live GPS needs backend integration.</span></div>
    </div>
  </section>
}

export function PublicBusTrackingPage({ payload }: { payload: BusTrackingPayload }) {
  return <main className="public-bus-page">
    <header className="public-bus-header"><div className="public-bus-brand"><div><Bus size={20}/></div><span>AI <b>ACADAMIX</b><small>BUS TRACKING</small></span></div><span className="public-demo-tag"><Signal size={12}/> DEMO TRACKING</span></header>
    <section className="public-bus-content">
      <button className="public-back-link" onClick={() => { window.location.href = window.location.pathname }}><ArrowLeft size={15}/> School portal</button>
      <div className="public-route-title"><span className="section-eyebrow">PARENT BUS TRACKER</span><h1>{payload.routeName}</h1><p>{payload.schoolName}</p></div>
      <div className="public-bus-status"><div className="public-bus-icon"><Bus size={25}/></div><div><small>Bus number · {payload.busNumber}</small><b>{payload.currentLocation}</b><span>Driver: {payload.driver || 'Not provided'}</span></div><div className="public-bus-status-chip"><i/> On route</div></div>
      <div className="public-eta-card"><div><small>Next stop arrival</small><b>{payload.stops.find(stop => stop.status === 'upcoming')?.minutes ?? 0} min</b><span>Estimated time remaining</span></div><div className="public-eta-icon"><Timer size={22}/></div></div>
      <section className="public-stop-card"><div className="public-stop-heading"><div><h2>Route journey</h2><p>Stops passed and upcoming stops</p></div><span>Updated {payload.updatedAt}</span></div>
        <div className="public-stop-timeline"><div className="public-stop-line"/>
          {payload.stops.map((stop, index) => <article className={'public-stop-row ' + stop.status} key={stop.name + index}>
            <div className="public-stop-dot">{stop.status === 'passed' ? <Check size={13}/> : stop.status === 'current' ? <Bus size={16}/> : <MapPin size={13}/>}</div>
            <div className="public-stop-name"><b>{stop.name}</b><span>{stop.status === 'passed' ? 'Bus passed this stop' : stop.status === 'current' ? 'Bus is currently here' : 'Bus is on the way'}</span></div>
            <div className="public-stop-time"><b>{stop.status === 'passed' ? stop.actual : stop.status === 'current' ? 'Now' : stop.expected}</b><span>{stop.status === 'passed' ? 'Actual arrival' : stop.status === 'current' ? 'Current location' : `Expected · ${stop.minutes} min`}</span></div>
          </article>)}
        </div>
      </section>
      <div className="public-bus-disclaimer"><Radio size={15}/><span><b>Demo tracking view.</b> The route and arrival times shown here are sample data. Live location, actual arrival detection and automatic ETA updates will be enabled after the school connects its GPS device and backend.</span></div>
      <footer className="public-bus-footer">Powered by AI ACADAMIX · RADX</footer>
    </section>
  </main>
}

export function readBusTrackingPayload(): BusTrackingPayload | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('busTrack')
    if (!raw) return null
    const data = JSON.parse(raw) as BusTrackingPayload
    if (!data.routeName || !Array.isArray(data.stops)) return null
    return data
  } catch {
    return null
  }
}
