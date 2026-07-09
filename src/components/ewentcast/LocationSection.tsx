'use client'

import { useEffect, useRef, useState } from 'react'
import type { EventFormData } from '@/lib/publish-event'
import { ALL_CHANNELS, CH_META } from './config'
import {
  COUNTRIES, citiesForCountry, countryCenter, canonicalizeCountry, type CityInfo,
} from './location-data'

const GOOGLE_MAPS_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_LOCATION_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  ''

type LatLngLiteral = { lat: number; lng: number }

type GoogleMapsApi = {
  maps: {
    Map: new (el: HTMLElement, opts?: Record<string, unknown>) => GoogleMap
    Marker: new (opts?: Record<string, unknown>) => GoogleMarker
    Geocoder: new () => GoogleGeocoder
    event: {
      addListener: (instance: unknown, name: string, handler: (...args: never[]) => void) => { remove: () => void }
      clearInstanceListeners: (instance: unknown) => void
    }
    places: {
      AutocompleteService: new () => GoogleAutocompleteService
      PlacesServiceStatus: { OK: string; ZERO_RESULTS: string }
    }
    GeocoderStatus: { OK: string }
  }
}

type GoogleMap = {
  setCenter: (c: LatLngLiteral) => void
  setZoom: (z: number) => void
  panTo: (c: LatLngLiteral) => void
  getCenter: () => { lat: () => number; lng: () => number } | null | undefined
  addListener: (name: string, handler: (e: { latLng?: { lat: () => number; lng: () => number } | null }) => void) => { remove: () => void }
}

type GoogleMarker = {
  setPosition: (c: LatLngLiteral) => void
  getPosition: () => { lat: () => number; lng: () => number } | null
  setMap: (map: GoogleMap | null) => void
  addListener: (name: string, handler: () => void) => { remove: () => void }
}

type GoogleGeocoder = {
  geocode: (
    req: {
      location?: LatLngLiteral
      address?: string
      placeId?: string
      componentRestrictions?: { country?: string }
    },
    cb: (results: GoogleGeocodeResult[] | null, status: string) => void,
  ) => void
}

type GoogleGeocodeResult = {
  formatted_address?: string
  types?: string[]
  address_components?: Array<{
    long_name: string
    short_name: string
    types: string[]
  }>
  geometry?: { location?: { lat: () => number; lng: () => number } }
}

type GoogleAutocompleteService = {
  getPlacePredictions: (
    req: {
      input: string
      types?: string[]
      location?: LatLngLiteral
      radius?: number
      componentRestrictions?: { country?: string | string[] }
    },
    cb: (predictions: GooglePrediction[] | null, status: string) => void,
  ) => void
}

type GooglePrediction = {
  description: string
  place_id: string
}

type SearchHit = {
  description: string
  placeId: string
  lat?: number
  lng?: number
  result?: GoogleGeocodeResult
}

declare global {
  interface Window {
    google?: GoogleMapsApi
    __ewGoogleMapsCb?: () => void
  }
}

let googleMapsPromise: Promise<GoogleMapsApi> | null = null

function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google?.maps?.places) return Promise.resolve(window.google)
  if (!GOOGLE_MAPS_KEY) {
    return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_LOCATION_API_KEY'))
  }
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.querySelector('script[data-ew-google-maps="1"]') as HTMLScriptElement | null
    if (existing) {
      if (window.google?.maps?.places) {
        resolve(window.google)
        return
      }
      existing.addEventListener('load', () => {
        if (window.google?.maps?.places) resolve(window.google)
        else reject(new Error('Google Maps failed to load'))
      })
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')))
      return
    }

    window.__ewGoogleMapsCb = () => {
      if (window.google?.maps?.places) resolve(window.google)
      else reject(new Error('Google Maps failed to load'))
    }

    const script = document.createElement('script')
    script.dataset.ewGoogleMaps = '1'
    script.async = true
    script.defer = true
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}` +
      '&libraries=places&callback=__ewGoogleMapsCb'
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(script)
  })

  return googleMapsPromise
}

function matchCountry(name?: string): string | null {
  if (!name) return null
  const canon = canonicalizeCountry(name)
  return COUNTRIES.some(c => c.name === canon) ? canon : null
}

function countryCodeForName(name: string): string | undefined {
  return COUNTRIES.find(c => c.name === name)?.code.toLowerCase()
}

/** Bias autocomplete toward the selected city / pin / country so local venues show up. */
function searchBias(
  lat: number | null,
  lng: number | null,
  country: string,
  city: string,
  map: GoogleMap | null,
): { location: LatLngLiteral; radius: number } | null {
  if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return { location: { lat, lng }, radius: 50_000 }
  }
  const cityInfo = citiesForCountry(country).find(c => c.name === city)
  if (cityInfo) return { location: { lat: cityInfo.lat, lng: cityInfo.lng }, radius: 80_000 }
  const center = countryCenter(country)
  if (center) return { location: { lat: center.lat, lng: center.lng }, radius: 500_000 }
  const mapCenter = map?.getCenter?.()
  if (mapCenter) {
    return { location: { lat: mapCenter.lat(), lng: mapCenter.lng() }, radius: 200_000 }
  }
  return null
}

function componentOf(
  result: GoogleGeocodeResult,
  type: string,
  useShort = false,
): string {
  const c = result.address_components?.find(a => a.types.includes(type))
  if (!c) return ''
  return useShort ? c.short_name : c.long_name
}

function isPlusCodeText(value?: string): boolean {
  if (!value) return false
  // e.g. "85JJXG7C+HJ" or "85JJXG7C+HJ Wyoming, USA"
  return /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i.test(value.trim())
}

function resultHasPlusCode(result: GoogleGeocodeResult): boolean {
  if (result.types?.includes('plus_code')) return true
  if (result.address_components?.some(c => c.types.includes('plus_code'))) return true
  return isPlusCodeText(result.formatted_address)
}

/** Prefer street / locality results over Plus Codes for the search label. */
function pickBestGeocodeResult(results: GoogleGeocodeResult[]): GoogleGeocodeResult | null {
  if (!results.length) return null
  const preference = [
    'street_address',
    'premise',
    'subpremise',
    'route',
    'neighborhood',
    'sublocality',
    'locality',
    'postal_town',
    'administrative_area_level_2',
    'administrative_area_level_1',
    'country',
  ]
  for (const type of preference) {
    const hit = results.find(r => !resultHasPlusCode(r) && r.types?.includes(type))
    if (hit) return hit
  }
  const nonPlus = results.find(r => !resultHasPlusCode(r))
  return nonPlus || results[0]
}

function readablePlaceLabel(result: GoogleGeocodeResult): string {
  const streetNumber = componentOf(result, 'street_number')
  const route = componentOf(result, 'route')
  const street = [streetNumber, route].filter(Boolean).join(' ')
  const city =
    componentOf(result, 'locality') ||
    componentOf(result, 'postal_town') ||
    componentOf(result, 'sublocality') ||
    componentOf(result, 'administrative_area_level_2')
  const region = componentOf(result, 'administrative_area_level_1')
  const country = componentOf(result, 'country')

  const fromParts = [street, city, region, country].filter(Boolean).join(', ')
  if (fromParts && !isPlusCodeText(fromParts)) return fromParts

  const formatted = (result.formatted_address || '').trim()
  if (formatted && !isPlusCodeText(formatted)) {
    // Strip a leading Plus Code if Google prepended one
    const cleaned = formatted.replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}\s*/i, '').trim()
    if (cleaned) return cleaned.split(',').slice(0, 3).join(', ').trim()
    return formatted.split(',').slice(0, 3).join(', ').trim()
  }

  return [city, region, country].filter(Boolean).join(', ') || formatted
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

interface Props {
  ev: EventFormData
  setField: (k: string, v: string | boolean) => void
}

export function LocationSection({ ev, setField }: Props) {
  const format = String(ev.format ?? '')
  const country = canonicalizeCountry(String(ev.country ?? ''))
  const city = String(ev.city ?? '')
  const showPhysical = format !== 'Online'
  const showOnline = format === 'Online' || format === 'Hybrid'

  const cities = citiesForCountry(country)
  const cityIsCustom = !!city && !cities.some(c => c.name === city)
  const [customCity, setCustomCity] = useState(cities.length === 0 || cityIsCustom)

  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const markerRef = useRef<GoogleMarker | null>(null)
  const geocoderRef = useRef<GoogleGeocoder | null>(null)
  const autocompleteRef = useRef<GoogleAutocompleteService | null>(null)
  const googleRef = useRef<GoogleMapsApi | null>(null)

  const [mapError, setMapError] = useState('')
  const [mapsReady, setMapsReady] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedEmpty, setSearchedEmpty] = useState(false)
  const skipSearchRef = useRef(false)
  const searchGenRef = useRef(0)

  const lat = ev.lat ? parseFloat(String(ev.lat)) : null
  const lng = ev.lng ? parseFloat(String(ev.lng)) : null

  const applyGeocodeResult = (result: GoogleGeocodeResult) => {
    const label = readablePlaceLabel(result)
    if (label) {
      skipSearchRef.current = true
      setQuery(label)
    }

    const countryName = componentOf(result, 'country')
    const canonCountry = countryName ? (matchCountry(countryName) || countryName) : country
    if (countryName) setField('country', canonCountry)

    const cityName =
      componentOf(result, 'locality') ||
      componentOf(result, 'postal_town') ||
      componentOf(result, 'administrative_area_level_2') ||
      componentOf(result, 'sublocality') ||
      ''
    if (cityName) {
      setField('city', cityName)
      setCustomCity(!citiesForCountry(canonCountry).some(c => c.name === cityName))
    }

    const region = componentOf(result, 'administrative_area_level_1')
    if (region) setField('region', region)

    const postal = componentOf(result, 'postal_code')
    if (postal) setField('postal', postal)

    const streetNumber = componentOf(result, 'street_number')
    const route = componentOf(result, 'route')
    const street = [streetNumber, route].filter(Boolean).join(' ')
    if (street) setField('address', street)
    else if (cityName || region) {
      // Avoid leaving a Plus Code in the street field for remote pins
      const currentAddress = String(ev.address || '')
      if (!currentAddress || isPlusCodeText(currentAddress)) {
        setField('address', [cityName, region].filter(Boolean).join(', '))
      }
    }
  }

  const reverseGeocode = (la: number, ln: number) => {
    const geocoder = geocoderRef.current
    if (!geocoder || !googleRef.current) return
    setResolving(true)
    geocoder.geocode({ location: { lat: la, lng: ln } }, (results, status) => {
      setResolving(false)
      if (status !== googleRef.current!.maps.GeocoderStatus.OK || !results?.length) return
      const best = pickBestGeocodeResult(results)
      if (best) applyGeocodeResult(best)
    })
  }

  const onPinMovedRef = useRef<(la: number, ln: number) => void>(() => {})
  useEffect(() => {
    onPinMovedRef.current = (la, ln) => {
      setField('lat', la.toFixed(6))
      setField('lng', ln.toFixed(6))
      reverseGeocode(la, ln)
    }
  })

  const attachMarker = (g: GoogleMapsApi, map: GoogleMap, la: number, ln: number) => {
    const pos = { lat: la, lng: ln }
    if (markerRef.current) {
      markerRef.current.setPosition(pos)
      return
    }
    const marker = new g.maps.Marker({
      map,
      position: pos,
      draggable: true,
    })
    marker.addListener('dragend', () => {
      const p = marker.getPosition()
      if (!p) return
      onPinMovedRef.current(p.lat(), p.lng())
    })
    markerRef.current = marker
  }

  const placeMarker = (la: number, ln: number, zoom = 13, reverse = false) => {
    setField('lat', la.toFixed(6))
    setField('lng', ln.toFixed(6))
    const map = mapRef.current
    const g = googleRef.current
    if (map && g) {
      map.setCenter({ lat: la, lng: ln })
      map.setZoom(zoom)
      attachMarker(g, map, la, ln)
    }
    if (reverse) reverseGeocode(la, ln)
  }

  useEffect(() => {
    if (!showPhysical) return
    let cancelled = false

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapEl.current || mapRef.current) return
        googleRef.current = g
        geocoderRef.current = new g.maps.Geocoder()
        autocompleteRef.current = new g.maps.places.AutocompleteService()

        const center = countryCenter(country)
        const start: LatLngLiteral =
          lat != null && lng != null
            ? { lat, lng }
            : center
              ? { lat: center.lat, lng: center.lng }
              : { lat: 20, lng: 0 }
        const zoom = lat != null && lng != null ? 13 : country ? 5 : 2

        const map = new g.maps.Map(mapEl.current, {
          center: start,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        })

        map.addListener('click', (e) => {
          const ll = e.latLng
          if (!ll) return
          const la = ll.lat()
          const ln = ll.lng()
          attachMarker(g, map, la, ln)
          onPinMovedRef.current(la, ln)
        })

        mapRef.current = map
        if (lat != null && lng != null) attachMarker(g, map, lat, lng)
        setMapError('')
        setMapsReady(true)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setMapsReady(false)
          setMapError(
            err.message.includes('Missing')
              ? 'Add NEXT_PUBLIC_GOOGLE_LOCATION_API_KEY to your .env file to enable Google Maps.'
              : 'Google Maps could not load. Check your API key and enabled APIs.',
          )
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPhysical])

  useEffect(() => () => {
    if (markerRef.current) {
      markerRef.current.setMap(null)
      markerRef.current = null
    }
    mapRef.current = null
    geocoderRef.current = null
    autocompleteRef.current = null
    googleRef.current = null
  }, [])

  const doSearch = (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setHits([])
      setSearchedEmpty(false)
      return
    }
    const service = autocompleteRef.current
    const geocoder = geocoderRef.current
    const g = googleRef.current
    if (!g || (!service && !geocoder)) {
      setHits([])
      return
    }

    const gen = ++searchGenRef.current
    setSearching(true)
    setSearchedEmpty(false)
    const countryCode = countryCodeForName(country)
    const bias = searchBias(lat, lng, country, city, mapRef.current)

    const applyHits = (next: SearchHit[]) => {
      if (gen !== searchGenRef.current) return
      setSearching(false)
      setHits(next)
      setSearchedEmpty(next.length === 0)
    }

    const finishWithGeocodeFallback = () => {
      if (!geocoder) {
        applyHits([])
        return
      }
      const address = [trimmed, city, country].filter(Boolean).join(', ')
      geocoder.geocode(
        {
          address,
          ...(countryCode ? { componentRestrictions: { country: countryCode } } : {}),
        },
        (results, status) => {
          if (gen !== searchGenRef.current) return
          if (status !== g.maps.GeocoderStatus.OK || !results?.length) {
            // Retry without country lock — some venues only resolve globally
            if (countryCode) {
              geocoder.geocode({ address: trimmed }, (retryResults, retryStatus) => {
                if (gen !== searchGenRef.current) return
                if (retryStatus !== g.maps.GeocoderStatus.OK || !retryResults?.length) {
                  applyHits([])
                  return
                }
                applyHits(
                  retryResults.slice(0, 5).map((r, i) => ({
                    description: readablePlaceLabel(r) || r.formatted_address || trimmed,
                    placeId: `geocode:${i}:${r.geometry?.location?.lat()},${r.geometry?.location?.lng()}`,
                    lat: r.geometry?.location?.lat(),
                    lng: r.geometry?.location?.lng(),
                    result: r,
                  })),
                )
              })
              return
            }
            applyHits([])
            return
          }
          applyHits(
            results.slice(0, 5).map((r, i) => ({
              description: readablePlaceLabel(r) || r.formatted_address || trimmed,
              placeId: `geocode:${i}:${r.geometry?.location?.lat()},${r.geometry?.location?.lng()}`,
              lat: r.geometry?.location?.lat(),
              lng: r.geometry?.location?.lng(),
              result: r,
            })),
          )
        },
      )
    }

    if (!service) {
      finishWithGeocodeFallback()
      return
    }

    service.getPlacePredictions(
      {
        input: trimmed,
        ...(countryCode ? { componentRestrictions: { country: countryCode } } : {}),
        ...(bias ? { location: bias.location, radius: bias.radius } : {}),
      },
      (predictions, status) => {
        if (gen !== searchGenRef.current) return
        if (
          status === g.maps.places.PlacesServiceStatus.OK &&
          predictions?.length
        ) {
          applyHits(
            predictions.slice(0, 8).map(p => ({
              description: p.description,
              placeId: p.place_id,
            })),
          )
          return
        }

        // Country lock can hide valid venues — retry biased, unrestricted
        if (countryCode) {
          service.getPlacePredictions(
            {
              input: trimmed,
              ...(bias ? { location: bias.location, radius: bias.radius } : {}),
            },
            (retryPredictions, retryStatus) => {
              if (gen !== searchGenRef.current) return
              if (
                retryStatus === g.maps.places.PlacesServiceStatus.OK &&
                retryPredictions?.length
              ) {
                applyHits(
                  retryPredictions.slice(0, 8).map(p => ({
                    description: p.description,
                    placeId: p.place_id,
                  })),
                )
                return
              }
              finishWithGeocodeFallback()
            },
          )
          return
        }

        // No autocomplete hits (or API restricted) — fall back to Geocoder
        finishWithGeocodeFallback()
      },
    )
  }

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }
    const id = setTimeout(() => {
      doSearch(query)
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, country, city, mapsReady])

  const onCountryChange = (value: string) => {
    setField('country', value)
    setField('city', '')
    setCustomCity(citiesForCountry(value).length === 0)
    const c = countryCenter(value)
    if (c && mapRef.current) {
      mapRef.current.setCenter({ lat: c.lat, lng: c.lng })
      mapRef.current.setZoom(5)
    }
  }

  const onCityChange = (value: string) => {
    if (value === '__custom__') {
      setCustomCity(true)
      setField('city', '')
      return
    }
    setField('city', value)
    const info: CityInfo | undefined = cities.find(c => c.name === value)
    if (info) placeMarker(info.lat, info.lng, 12)
  }

  const pickHit = (h: SearchHit) => {
    setHits([])
    skipSearchRef.current = true
    setQuery(h.description.split(',').slice(0, 2).join(', '))

    // Geocode-fallback hits already have coordinates / a full result
    if (h.result?.geometry?.location) {
      const loc = h.result.geometry.location
      placeMarker(loc.lat(), loc.lng(), 15, false)
      applyGeocodeResult(h.result)
      return
    }
    if (h.lat != null && h.lng != null) {
      placeMarker(h.lat, h.lng, 15, true)
      return
    }

    const geocoder = geocoderRef.current
    const g = googleRef.current
    if (!geocoder || !g || h.placeId.startsWith('geocode:')) return

    setResolving(true)
    geocoder.geocode({ placeId: h.placeId }, (results, status) => {
      setResolving(false)
      if (status !== g.maps.GeocoderStatus.OK || !results?.[0]?.geometry?.location) return
      const loc = results[0].geometry.location
      const la = loc.lat()
      const ln = loc.lng()
      placeMarker(la, ln, 15, false)
      applyGeocodeResult(results[0])
    })
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
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    doSearch(query)
                  }
                }}
              />
              {searching && <span className="ew-loc-searching">Searching…</span>}
            </div>
            {hits.length > 0 && (
              <ul className="ew-loc-hits">
                {hits.map((h) => (
                  <li key={h.placeId}>
                    <button type="button" onClick={() => pickHit(h)}>{h.description}</button>
                  </li>
                ))}
              </ul>
            )}
            {searchedEmpty && !searching && query.trim().length >= 2 && (
              <p className="ew-loc-search-empty">
                No places found. Try a fuller address, pick a city first, or click the map to drop a pin.
              </p>
            )}
            {mapError ? (
              <div className="ew-loc-map-fallback">
                {mapError}
                <input
                  className="ew-loc-coord-input"
                  placeholder="e.g. 24.8607, 67.0011"
                  onChange={e => {
                    const [la, ln] = e.target.value.split(',').map(s => parseFloat(s.trim()))
                    if (!Number.isNaN(la) && !Number.isNaN(ln)) {
                      setField('lat', la.toFixed(6))
                      setField('lng', ln.toFixed(6))
                    }
                  }}
                />
              </div>
            ) : (
              <div ref={mapEl} className="ew-loc-map ew-loc-map--google" />
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
