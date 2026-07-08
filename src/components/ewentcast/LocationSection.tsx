'use client'

import { useEffect, useRef, useState } from 'react'
import type { EventFormData } from '@/lib/publish-event'
import { ALL_CHANNELS, CH_META } from './config'
import {
  COUNTRIES, citiesForCountry, countryCenter, type CityInfo,
} from './location-data'

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

// Minimal Leaflet surface we use (types package isn't installed).
type LeafletMap = {
  setView: (c: [number, number], z: number) => LeafletMap
  on: (ev: string, cb: (e: { latlng: { lat: number; lng: number } }) => void) => void
  remove: () => void
  invalidateSize: () => void
}
type LeafletMarker = {
  setLatLng: (c: [number, number]) => LeafletMarker
  on: (ev: string, cb: () => void) => void
  getLatLng: () => { lat: number; lng: number }
  addTo: (m: LeafletMap) => LeafletMarker
}
type Leaflet = {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LeafletMap) => void }
  marker: (c: [number, number], opts?: Record<string, unknown>) => LeafletMarker
}
declare global {
  interface Window { L?: Leaflet }
}

let leafletPromise: Promise<Leaflet> | null = null
function loadLeaflet(): Promise<Leaflet> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise<Leaflet>((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Leaflet failed')))
      return
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet failed'))
    script.onerror = () => reject(new Error('Leaflet failed to load'))
    document.body.appendChild(script)
  })
  return leafletPromise
}

const COUNTRY_ALIASES: Record<string, string> = {
  'united states of america': 'United States',
  usa: 'United States',
  uk: 'United Kingdom',
  'great britain': 'United Kingdom',
  uae: 'United Arab Emirates',
}
function matchCountry(name?: string): string | null {
  if (!name) return null
  const key = name.trim().toLowerCase()
  const target = (COUNTRY_ALIASES[key] || name).toLowerCase()
  const found = COUNTRIES.find(c => c.name.toLowerCase() === target)
  return found ? found.name : null
}

function AllDots() {
  return (
    <span className="ew-dots">
      {ALL_CHANNELS.map(c => <i key={c} style={{ background: CH_META[c].color }} />)}
    </span>
  )
}

function Field({
  label, hint, full, children,
}: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`ew-field${full ? ' full' : ''}`}>
      <label>
        <span className="lab">{label}{hint && <span className="hint"> · {hint}</span>}</span>
        <AllDots />
      </label>
      {children}
    </div>
  )
}

type SearchHit = { display_name: string; lat: string; lon: string }
type NominatimAddress = Record<string, string | undefined>

interface Props {
  ev: EventFormData
  setField: (k: string, v: string | boolean) => void
}

export function LocationSection({ ev, setField }: Props) {
  const format = String(ev.format ?? '')
  const country = String(ev.country ?? '')
  const city = String(ev.city ?? '')
  const showPhysical = format !== 'Online'
  const showOnline = format === 'Online' || format === 'Hybrid'

  const cities = citiesForCountry(country)
  const cityIsCustom = !!city && !cities.some(c => c.name === city)
  const [customCity, setCustomCity] = useState(cities.length === 0 || cityIsCustom)

  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const [mapError, setMapError] = useState(false)
  const [resolving, setResolving] = useState(false)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const skipSearchRef = useRef(false)

  const lat = ev.lat ? parseFloat(String(ev.lat)) : null
  const lng = ev.lng ? parseFloat(String(ev.lng)) : null

  // Reverse-geocode a pinned point and select the matching location fields.
  const reverseGeocode = async (la: number, ln: number) => {
    setResolving(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=16&lat=${la}&lon=${ln}`,
        { headers: { 'Accept-Language': 'en' } },
      )
      const data = await res.json() as { display_name?: string; address?: NominatimAddress }
      const a = data.address || {}
      if (data.display_name) {
        skipSearchRef.current = true
        setQuery(data.display_name.split(',').slice(0, 3).join(', ').trim())
      }
      const canonCountry = a.country ? (matchCountry(a.country) || a.country) : country
      if (a.country) setField('country', canonCountry)
      const cityName = a.city || a.town || a.village || a.municipality || a.county || a.state_district || ''
      if (cityName) {
        setField('city', cityName)
        setCustomCity(!citiesForCountry(canonCountry).some(c => c.name === cityName))
      }
      if (a.state) setField('region', a.state)
      if (a.postcode) setField('postal', a.postcode)
      const street = [a.house_number, a.road].filter(Boolean).join(' ')
      if (street) setField('address', street)
    } catch {
      /* keep manual values on failure */
    } finally {
      setResolving(false)
    }
  }

  // Latest pin-moved handler, read from marker/map callbacks bound once at init.
  const onPinMovedRef = useRef<(la: number, ln: number) => void>(() => {})
  useEffect(() => {
    onPinMovedRef.current = (la, ln) => {
      setField('lat', la.toFixed(6))
      setField('lng', ln.toFixed(6))
      reverseGeocode(la, ln)
    }
  })

  const attachMarker = (L: Leaflet, map: LeafletMap, la: number, ln: number) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([la, ln])
    } else {
      const m = L.marker([la, ln], { draggable: true }).addTo(map)
      m.on('dragend', () => {
        const p = m.getLatLng()
        onPinMovedRef.current(p.lat, p.lng)
      })
      markerRef.current = m
    }
  }

  const placeMarker = (la: number, ln: number, zoom = 13, reverse = false) => {
    setField('lat', la.toFixed(6))
    setField('lng', ln.toFixed(6))
    const map = mapRef.current
    const L = typeof window !== 'undefined' ? window.L : undefined
    if (map && L) {
      map.setView([la, ln], zoom)
      attachMarker(L, map, la, ln)
    }
    if (reverse) reverseGeocode(la, ln)
  }

  useEffect(() => {
    if (!showPhysical) return
    let cancelled = false
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return
        const center = countryCenter(country)
        const start: [number, number] = lat != null && lng != null
          ? [lat, lng]
          : (center ? [center.lat, center.lng] : [20, 0])
        const zoom = lat != null && lng != null ? 13 : (country ? 5 : 2)
        const map = L.map(mapEl.current, { scrollWheelZoom: false, zoomControl: true }).setView(start, zoom)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 20,
        }).addTo(map)
        map.on('click', (e) => {
          const { lat: la, lng: ln } = e.latlng
          attachMarker(L, map, la, ln)
          onPinMovedRef.current(la, ln)
        })
        mapRef.current = map
        if (lat != null && lng != null) attachMarker(L, map, lat, lng)
        setTimeout(() => map.invalidateSize(), 60)
      })
      .catch(() => { if (!cancelled) setMapError(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPhysical])

  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  // Live search as the user types (debounced, no button needed).
  const doSearch = async (q: string) => {
    if (q.trim().length < 3) { setHits([]); return }
    setSearching(true)
    try {
      const scoped = [q, city, country].filter(Boolean).join(', ')
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(scoped)}`,
        { headers: { 'Accept-Language': 'en' } },
      )
      setHits(await res.json() as SearchHit[])
    } catch {
      setHits([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (skipSearchRef.current) { skipSearchRef.current = false; return }
    const id = setTimeout(() => { doSearch(query) }, 400)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const onCountryChange = (value: string) => {
    setField('country', value)
    setField('city', '')
    setCustomCity(citiesForCountry(value).length === 0)
    const c = countryCenter(value)
    if (c && mapRef.current) mapRef.current.setView([c.lat, c.lng], 5)
  }

  const onCityChange = (value: string) => {
    if (value === '__custom__') { setCustomCity(true); setField('city', ''); return }
    setField('city', value)
    const info: CityInfo | undefined = cities.find(c => c.name === value)
    if (info) placeMarker(info.lat, info.lng, 12)
  }

  const pickHit = (h: SearchHit) => {
    setHits([])
    skipSearchRef.current = true
    setQuery(h.display_name.split(',').slice(0, 2).join(', '))
    placeMarker(parseFloat(h.lat), parseFloat(h.lon), 15, true)
  }

  return (
    <div className="ew-grid2 ew-loc">
      <Field label="Format">
        <select value={format} onChange={e => setField('format', e.target.value)}>
          <option value="">Select…</option>
          {['In person', 'Online', 'Hybrid'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>

      {showPhysical && (
        <>
          <Field label="Venue name">
            <input
              value={String(ev.venue ?? '')}
              placeholder="e.g. The Grand Hall"
              onChange={e => setField('venue', e.target.value)}
            />
          </Field>

          <Field label="Country">
            <select value={COUNTRIES.some(c => c.name === country) ? country : ''} onChange={e => onCountryChange(e.target.value)}>
              <option value="">Select a country…</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="City">
            {customCity ? (
              <input
                value={city}
                placeholder="Enter city"
                onChange={e => setField('city', e.target.value)}
                onBlur={() => { if (cities.length && !city) setCustomCity(false) }}
              />
            ) : (
              <select
                value={cities.some(c => c.name === city) ? city : ''}
                disabled={!country}
                onChange={e => onCityChange(e.target.value)}
              >
                <option value="">{country ? 'Select a city…' : 'Pick a country first'}</option>
                {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="__custom__">Other…</option>
              </select>
            )}
          </Field>

          <Field label="Street address" full>
            <input
              value={String(ev.address ?? '')}
              placeholder="123 Main St"
              onChange={e => setField('address', e.target.value)}
            />
          </Field>

          <Field label="Region / State">
            <input
              value={String(ev.region ?? '')}
              onChange={e => setField('region', e.target.value)}
            />
          </Field>

          <Field label="Postal code">
            <input
              value={String(ev.postal ?? '')}
              onChange={e => setField('postal', e.target.value)}
            />
          </Field>

          <div className="ew-field full ew-loc-map-field">
            <label>
              <span className="lab">Pick location on map{resolving && <span className="hint"> · finding address…</span>}</span>
              <AllDots />
            </label>
            <div className="ew-loc-search">
              <input
                value={query}
                placeholder="Type to search a place or address…"
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(query) } }}
              />
              {searching && <span className="ew-loc-searching">Searching…</span>}
            </div>
            {hits.length > 0 && (
              <ul className="ew-loc-hits">
                {hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => pickHit(h)}>{h.display_name}</button>
                  </li>
                ))}
              </ul>
            )}
            {mapError ? (
              <div className="ew-loc-map-fallback">
                Map could not load. Search above or paste coordinates as
                {' '}<code>lat, lng</code> below.
                <input
                  className="ew-loc-coord-input"
                  placeholder="e.g. 24.8607, 67.0011"
                  onChange={e => {
                    const [la, ln] = e.target.value.split(',').map(s => parseFloat(s.trim()))
                    if (!Number.isNaN(la) && !Number.isNaN(ln)) {
                      setField('lat', la.toFixed(6)); setField('lng', ln.toFixed(6))
                    }
                  }}
                />
              </div>
            ) : (
              <div ref={mapEl} className="ew-loc-map" />
            )}
            <div className="ew-loc-coords">
              {lat != null && lng != null ? (
                <>📍 Pinned at <strong>{lat.toFixed(5)}, {lng.toFixed(5)}</strong> — drag the marker or click anywhere on the map; the address updates automatically.</>
              ) : (
                <>Click the map or drag the pin to set the exact spot — country, city and address fill in automatically.</>
              )}
            </div>
          </div>
        </>
      )}

      {showOnline && (
        <Field label="Online link" hint="online / hybrid" full>
          <input
            value={String(ev.onlineUrl ?? '')}
            placeholder="https://…"
            onChange={e => setField('onlineUrl', e.target.value)}
          />
        </Field>
      )}
    </div>
  )
}
