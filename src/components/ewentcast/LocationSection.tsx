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
    importLibrary?: (name: string) => Promise<Record<string, unknown>>
    event: {
      addListener: (instance: unknown, name: string, handler: (...args: never[]) => void) => { remove: () => void }
      clearInstanceListeners: (instance: unknown) => void
    }
    places: {
      AutocompleteService?: new () => GoogleAutocompleteService
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions: (
          req: AutocompleteSuggestionRequest,
        ) => Promise<{ suggestions: AutocompleteSuggestionItem[] }>
      }
      PlacesService?: new (attrContainer: HTMLElement | GoogleMap) => GooglePlacesService
      PlacesServiceStatus?: { OK: string; ZERO_RESULTS: string }
      Place?: new (opts: { id: string }) => GooglePlace
    }
    GeocoderStatus: { OK: string }
  }
}

type AutocompleteSuggestionRequest = {
  input: string
  includedRegionCodes?: string[]
  locationBias?: LatLngLiteral | { center: LatLngLiteral; radius: number }
}

type AutocompleteSuggestionItem = {
  placePrediction?: {
    placeId?: string
    text?: { text?: string; toString?: () => string }
    mainText?: { text?: string; toString?: () => string }
    toPlace?: () => GooglePlace
  }
}

type GooglePlace = {
  id?: string
  displayName?: string
  formattedAddress?: string
  location?: { lat: () => number; lng: () => number } | LatLngLiteral
  addressComponents?: Array<{
    longText?: string
    shortText?: string
    long_name?: string
    short_name?: string
    types: string[]
  }>
  types?: string[]
  fetchFields: (opts: { fields: string[] }) => Promise<void>
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

type GooglePlacesService = {
  getDetails: (
    req: { placeId: string; fields?: string[] },
    cb: (place: GooglePlaceDetails | null, status: string) => void,
  ) => void
}

type GooglePrediction = {
  description: string
  place_id: string
  structured_formatting?: {
    main_text?: string
    secondary_text?: string
  }
}

type GooglePlaceDetails = {
  name?: string
  formatted_address?: string
  place_id?: string
  geometry?: { location?: { lat: () => number; lng: () => number } }
  address_components?: GoogleGeocodeResult['address_components']
  types?: string[]
}

type SearchHit = {
  description: string
  placeId: string
  /** Establishment / venue name from autocomplete (e.g. "Venus Hill"). */
  name?: string
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
    // v=weekly + places library: supports AutocompleteSuggestion (new) and legacy fallback
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}` +
      '&v=weekly&libraries=places&loading=async&callback=__ewGoogleMapsCb'
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

function placesStatusOk(g: GoogleMapsApi, status: string): boolean {
  return status === 'OK' || status === g.maps.places.PlacesServiceStatus?.OK
}

function placeLatLng(loc: GooglePlace['location']): LatLngLiteral | null {
  if (!loc) return null
  if (typeof (loc as { lat?: unknown }).lat === 'function') {
    const ll = loc as { lat: () => number; lng: () => number }
    return { lat: ll.lat(), lng: ll.lng() }
  }
  const lit = loc as LatLngLiteral
  if (typeof lit.lat === 'number' && typeof lit.lng === 'number') return lit
  return null
}

function placeToGeocodeResult(place: GooglePlace): GoogleGeocodeResult {
  return {
    formatted_address: place.formattedAddress,
    types: place.types,
    address_components: place.addressComponents?.map(c => ({
      long_name: c.longText || c.long_name || '',
      short_name: c.shortText || c.short_name || '',
      types: c.types,
    })),
    geometry: (() => {
      const ll = placeLatLng(place.location)
      if (!ll) return undefined
      return { location: { lat: () => ll.lat, lng: () => ll.lng } }
    })(),
  }
}

function predictionText(value?: { text?: string; toString?: () => string }): string {
  if (!value) return ''
  if (typeof value.text === 'string' && value.text) return value.text
  if (typeof value.toString === 'function') {
    const s = value.toString()
    return s === '[object Object]' ? '' : s
  }
  return ''
}

/**
 * Soft country-level bias only. Pin/city bias hides valid venues outside the
 * current city (e.g. "Venus Hill" while pinned in Manchester → ZERO_RESULTS).
 */
function searchBias(
  _lat: number | null,
  _lng: number | null,
  country: string,
  _city: string,
  map: GoogleMap | null,
): { location: LatLngLiteral; radius: number } | null {
  const center = countryCenter(country)
  if (center) return { location: { lat: center.lat, lng: center.lng }, radius: 500_000 }
  const mapCenter = map?.getCenter?.()
  if (mapCenter) {
    return { location: { lat: mapCenter.lat(), lng: mapCenter.lng() }, radius: 200_000 }
  }
  return null
}

/** Drop geocode hits that don't actually match what the user typed. */
function geocodeMatchesQuery(label: string, query: string): boolean {
  const qTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
  if (!qTokens.length) return true
  const d = label.toLowerCase()
  const hits = qTokens.filter(t => d.includes(t) || d.includes(t.replace(/s$/, '')))
  return hits.length >= Math.max(1, Math.ceil(qTokens.length / 2))
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
  const placesRef = useRef<GooglePlacesService | null>(null)
  const googleRef = useRef<GoogleMapsApi | null>(null)

  const [mapError, setMapError] = useState('')
  const [mapsReady, setMapsReady] = useState(false)
  const [resolving, setResolving] = useState(false)
  const seedQuery = [ev.address, ev.city, ev.region, ev.country]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(', ')
  const [query, setQuery] = useState(seedQuery)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchedEmpty, setSearchedEmpty] = useState(false)
  const skipSearchRef = useRef(!!seedQuery)
  const searchGenRef = useRef(0)
  const seededFromEvRef = useRef('')

  const lat = ev.lat ? parseFloat(String(ev.lat)) : null
  const lng = ev.lng ? parseFloat(String(ev.lng)) : null

  // When edit form loads (or address fields hydrate), seed the map search box once.
  useEffect(() => {
    const next = [ev.address, ev.city, ev.region, ev.country]
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(', ')
    if (!next || next === seededFromEvRef.current) return
    // Don't clobber an in-progress user search
    if (query && query !== seedQuery && query !== seededFromEvRef.current) return
    seededFromEvRef.current = next
    skipSearchRef.current = true
    setQuery(next)
  }, [ev.address, ev.city, ev.region, ev.country, query, seedQuery])

  const applyGeocodeResult = (
    result: GoogleGeocodeResult,
    opts?: { venueName?: string; keepQuery?: string },
  ) => {
    const venueName = (opts?.venueName || '').trim()
    const label = opts?.keepQuery?.trim() || (venueName
      ? [venueName, readablePlaceLabel(result)].filter(Boolean).join(' — ')
      : readablePlaceLabel(result))
    if (label) {
      skipSearchRef.current = true
      setQuery(label)
    }

    if (venueName) setField('venue', venueName)

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

  const reverseGeocode = (la: number, ln: number, venueName?: string) => {
    const geocoder = geocoderRef.current
    if (!geocoder || !googleRef.current) return
    setResolving(true)
    geocoder.geocode({ location: { lat: la, lng: ln } }, (results, status) => {
      setResolving(false)
      if (status !== googleRef.current!.maps.GeocoderStatus.OK || !results?.length) return
      const best = pickBestGeocodeResult(results)
      if (!best) return
      // Keep an already-chosen venue name (e.g. "Venus Hill") in the search box / field
      const keepVenue = (venueName || String(ev.venue || '')).trim()
      applyGeocodeResult(
        best,
        keepVenue ? { venueName: keepVenue } : undefined,
      )
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

  const placeMarker = (la: number, ln: number, zoom = 13, reverse = false, venueName?: string) => {
    setField('lat', la.toFixed(6))
    setField('lng', ln.toFixed(6))
    const map = mapRef.current
    const g = googleRef.current
    if (map && g) {
      map.setCenter({ lat: la, lng: ln })
      map.setZoom(zoom)
      attachMarker(g, map, la, ln)
    }
    if (reverse) reverseGeocode(la, ln, venueName)
  }

  // Keep the pin centered when lat/lng arrive after the map is ready (edit load / geocode).
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !googleRef.current) return
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return
    mapRef.current.setCenter({ lat, lng })
    mapRef.current.setZoom(13)
    attachMarker(googleRef.current, mapRef.current, lat, lng)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsReady, lat, lng])

  useEffect(() => {
    if (!showPhysical) return
    let cancelled = false

    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !mapEl.current || mapRef.current) return
        googleRef.current = g
        geocoderRef.current = new g.maps.Geocoder()
        if (g.maps.places.AutocompleteService) {
          autocompleteRef.current = new g.maps.places.AutocompleteService()
        }

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
        if (g.maps.places.PlacesService) {
          placesRef.current = new g.maps.places.PlacesService(map)
        }
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
    placesRef.current = null
    googleRef.current = null
  }, [])

  // On edit load, Luma/HT often return a single address blob without region/postal/lat.
  // Geocode once to fill the missing structured fields.
  const fillKeyRef = useRef('')
  useEffect(() => {
    if (!showPhysical || !mapsReady || !geocoderRef.current || !googleRef.current) return
    const needsFill =
      !String(ev.region || '').trim()
      || !String(ev.postal || '').trim()
      || !String(ev.lat || '').trim()
      || !String(ev.lng || '').trim()
      || !String(ev.venue || '').trim()
    if (!needsFill) return

    const address = [ev.venue, ev.address, ev.city, ev.region, ev.postal, ev.country]
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(', ')
    if (address.length < 5) return
    if (fillKeyRef.current === address) return
    fillKeyRef.current = address

    const geocoder = geocoderRef.current
    const g = googleRef.current
    geocoder.geocode({ address }, (results, status) => {
      if (status !== g.maps.GeocoderStatus.OK || !results?.length) return
      const best = pickBestGeocodeResult(results)
      if (!best) return
      const loc = best.geometry?.location
      if (loc && (!ev.lat || !ev.lng)) {
        const la = loc.lat()
        const ln = loc.lng()
        setField('lat', la.toFixed(6))
        setField('lng', ln.toFixed(6))
        const map = mapRef.current
        if (map && g) {
          map.setCenter({ lat: la, lng: ln })
          map.setZoom(13)
          attachMarker(g, map, la, ln)
        }
      }
      applyGeocodeResult(best)
      // Prefer keeping an existing venue name if the user/API already set one
      if (!String(ev.venue || '').trim()) {
        const name =
          componentOf(best, 'point_of_interest')
          || componentOf(best, 'premise')
          || componentOf(best, 'establishment')
        if (name) setField('venue', name)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPhysical, mapsReady, ev.address, ev.city, ev.country, ev.venue, ev.region, ev.postal, ev.lat, ev.lng])

  const doSearch = (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setHits([])
      setSearchedEmpty(false)
      setSearching(false)
      return
    }
    const service = autocompleteRef.current
    const geocoder = geocoderRef.current
    const g = googleRef.current

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
      if (!geocoder || !g) {
        applyHits([])
        return
      }
      // Search the typed query alone — appending city turns "venus hills" into Manchester
      geocoder.geocode(
        {
          address: trimmed,
          ...(countryCode ? { componentRestrictions: { country: countryCode } } : {}),
        },
        (results, status) => {
          if (gen !== searchGenRef.current) return
          const mapResults = (list: GoogleGeocodeResult[]) =>
            list
              .slice(0, 5)
              .map((r, i) => {
                const description = readablePlaceLabel(r) || r.formatted_address || trimmed
                if (!geocodeMatchesQuery(description, trimmed)) return null
                return {
                  description,
                  placeId: `geocode:${i}:${r.geometry?.location?.lat()},${r.geometry?.location?.lng()}`,
                  name: description.split(',')[0]?.trim(),
                  lat: r.geometry?.location?.lat(),
                  lng: r.geometry?.location?.lng(),
                  result: r,
                } satisfies SearchHit
              })
              .filter((h): h is SearchHit => !!h)

          if (status === g.maps.GeocoderStatus.OK && results?.length) {
            const hits = mapResults(results)
            if (hits.length) {
              applyHits(hits)
              return
            }
          }
          if (countryCode) {
            geocoder.geocode({ address: trimmed }, (retryResults, retryStatus) => {
              if (gen !== searchGenRef.current) return
              if (retryStatus !== g.maps.GeocoderStatus.OK || !retryResults?.length) {
                applyHits([])
                return
              }
              applyHits(mapResults(retryResults))
            })
            return
          }
          applyHits([])
        },
      )
    }

    const finishWithLegacyAutocomplete = () => {
      if (!service || !g) {
        finishWithGeocodeFallback()
        return
      }

      let settled = false
      const settle = (next: SearchHit[] | null) => {
        if (settled || gen !== searchGenRef.current) return
        settled = true
        if (next) applyHits(next)
        else finishWithGeocodeFallback()
      }

      const hangTimer = window.setTimeout(() => settle(null), 4500)

      // Prefer country lock without pin/city location — tight bias hides out-of-city venues
      service.getPlacePredictions(
        {
          input: trimmed,
          ...(countryCode ? { componentRestrictions: { country: countryCode } } : {}),
        },
        (predictions, status) => {
          if (gen !== searchGenRef.current) return
          if (placesStatusOk(g, status) && predictions?.length) {
            window.clearTimeout(hangTimer)
            settle(
              predictions.slice(0, 8).map(p => ({
                description: p.description,
                placeId: p.place_id,
                name: p.structured_formatting?.main_text || p.description.split(',')[0]?.trim(),
              })),
            )
            return
          }

          // Retry unrestricted (and optionally soft country bias)
          service.getPlacePredictions(
            {
              input: trimmed,
              ...(bias ? { location: bias.location, radius: bias.radius } : {}),
            },
            (retryPredictions, retryStatus) => {
              window.clearTimeout(hangTimer)
              if (gen !== searchGenRef.current) return
              if (placesStatusOk(g, retryStatus) && retryPredictions?.length) {
                settle(
                  retryPredictions.slice(0, 8).map(p => ({
                    description: p.description,
                    placeId: p.place_id,
                    name: p.structured_formatting?.main_text || p.description.split(',')[0]?.trim(),
                  })),
                )
                return
              }
              settle(null)
            },
          )
        },
      )
    }

    const runServerAutocomplete = async () => {
      try {
        const params = new URLSearchParams({ q: trimmed })
        if (countryCode) params.set('country', countryCode)
        const res = await fetch(`/api/places/autocomplete?${params}`)
        if (gen !== searchGenRef.current) return
        if (res.ok) {
          const data = (await res.json()) as {
            predictions?: Array<{ description: string; placeId: string; name?: string }>
          }
          const hits = (data.predictions || [])
            .filter(p => p.placeId && p.description)
            .map(p => ({
              description: p.description,
              placeId: p.placeId,
              name: p.name || p.description.split(',')[0]?.trim(),
            }))
          if (hits.length) {
            applyHits(hits.slice(0, 8))
            return
          }
        }
      } catch {
        // fall through to client Places / geocode
      }
      if (gen !== searchGenRef.current) return
      finishWithLegacyAutocomplete()
    }

    void runServerAutocomplete()
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
    // Only re-search when the query (or maps readiness) changes.
    // Country/city updates from a pick must not re-open the hits list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mapsReady])

  const onCountryChange = (value: string) => {
    setField('country', value)
    setField('city', '')
    setCustomCity(citiesForCountry(value).length === 0)
    const c = countryCenter(value)
    if (c && mapRef.current) {
      mapRef.current.setCenter({ lat: c.lat, lng: c.lng })
      mapRef.current.setZoom(5)
    }
    // Re-bias search for the current query under the new country
    if (query.trim().length >= 2) {
      skipSearchRef.current = false
      doSearch(query)
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
    const venueHint = (h.name || h.description.split(',')[0] || '').trim()
    setQuery(h.description)

    // Geocode-fallback hits already have coordinates / a full result
    if (h.result?.geometry?.location) {
      const loc = h.result.geometry.location
      placeMarker(loc.lat(), loc.lng(), 15, false)
      applyGeocodeResult(h.result, {
        venueName: venueHint,
        keepQuery: h.description,
      })
      return
    }
    if (h.lat != null && h.lng != null) {
      if (venueHint) setField('venue', venueHint)
      placeMarker(h.lat, h.lng, 15, true, venueHint)
      return
    }

    const places = placesRef.current
    const geocoder = geocoderRef.current
    const g = googleRef.current
    if (!g || h.placeId.startsWith('geocode:')) return

    setResolving(true)

    const finishFromGeocode = () => {
      if (!geocoder) {
        setResolving(false)
        if (venueHint) setField('venue', venueHint)
        return
      }
      geocoder.geocode({ placeId: h.placeId }, (results, status) => {
        setResolving(false)
        if (status !== g.maps.GeocoderStatus.OK || !results?.[0]?.geometry?.location) {
          if (venueHint) setField('venue', venueHint)
          return
        }
        const loc = results[0].geometry.location
        placeMarker(loc.lat(), loc.lng(), 15, false)
        applyGeocodeResult(results[0], {
          venueName: venueHint,
          keepQuery: h.description,
        })
      })
    }

    const finishFromLegacyPlaces = () => {
      if (!places) {
        finishFromGeocode()
        return
      }
      places.getDetails(
        {
          placeId: h.placeId,
          fields: ['name', 'formatted_address', 'geometry', 'address_components', 'types', 'place_id'],
        },
        (place, status) => {
          if (placesStatusOk(g, status) && place?.geometry?.location) {
            setResolving(false)
            const loc = place.geometry.location
            placeMarker(loc.lat(), loc.lng(), 15, false)
            applyGeocodeResult(
              {
                formatted_address: place.formatted_address,
                address_components: place.address_components,
                types: place.types,
                geometry: place.geometry,
              },
              {
                venueName: (place.name || venueHint).trim(),
                keepQuery: h.description,
              },
            )
            return
          }
          finishFromGeocode()
        },
      )
    }

    const finishFromNewPlace = async () => {
      try {
        let PlaceCtor = g.maps.places.Place
        if (!PlaceCtor && g.maps.importLibrary) {
          const lib = await g.maps.importLibrary('places') as {
            Place?: GoogleMapsApi['maps']['places']['Place']
          }
          PlaceCtor = lib.Place || g.maps.places.Place
        }
        if (!PlaceCtor) {
          finishFromLegacyPlaces()
          return
        }

        const place = new PlaceCtor({ id: h.placeId })
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'types', 'id'],
        })
        const ll = placeLatLng(place.location)
        if (!ll) {
          finishFromLegacyPlaces()
          return
        }
        setResolving(false)
        placeMarker(ll.lat, ll.lng, 15, false)
        applyGeocodeResult(placeToGeocodeResult(place), {
          venueName: (place.displayName || venueHint).trim(),
          keepQuery: h.description,
        })
      } catch {
        finishFromLegacyPlaces()
      }
    }

    void finishFromNewPlace()
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
