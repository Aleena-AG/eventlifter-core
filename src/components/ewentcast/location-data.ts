export type CityInfo = { name: string; lat: number; lng: number }

/** Curated country list (ISO name + 2-letter code + rough centre for map fallback). */
export const COUNTRIES: { name: string; code: string; lat: number; lng: number }[] = [
  { name: 'Pakistan', code: 'PK', lat: 30.3753, lng: 69.3451 },
  { name: 'United States', code: 'US', lat: 39.8283, lng: -98.5795 },
  { name: 'United Kingdom', code: 'GB', lat: 55.3781, lng: -3.436 },
  { name: 'United Arab Emirates', code: 'AE', lat: 23.4241, lng: 53.8478 },
  { name: 'India', code: 'IN', lat: 20.5937, lng: 78.9629 },
  { name: 'Canada', code: 'CA', lat: 56.1304, lng: -106.3468 },
  { name: 'Australia', code: 'AU', lat: -25.2744, lng: 133.7751 },
  { name: 'Germany', code: 'DE', lat: 51.1657, lng: 10.4515 },
  { name: 'France', code: 'FR', lat: 46.2276, lng: 2.2137 },
  { name: 'Spain', code: 'ES', lat: 40.4637, lng: -3.7492 },
  { name: 'Italy', code: 'IT', lat: 41.8719, lng: 12.5674 },
  { name: 'Netherlands', code: 'NL', lat: 52.1326, lng: 5.2913 },
  { name: 'Saudi Arabia', code: 'SA', lat: 23.8859, lng: 45.0792 },
  { name: 'Qatar', code: 'QA', lat: 25.3548, lng: 51.1839 },
  { name: 'Turkey', code: 'TR', lat: 38.9637, lng: 35.2433 },
  { name: 'Singapore', code: 'SG', lat: 1.3521, lng: 103.8198 },
  { name: 'Malaysia', code: 'MY', lat: 4.2105, lng: 101.9758 },
  { name: 'Indonesia', code: 'ID', lat: -0.7893, lng: 113.9213 },
  { name: 'China', code: 'CN', lat: 35.8617, lng: 104.1954 },
  { name: 'Japan', code: 'JP', lat: 36.2048, lng: 138.2529 },
  { name: 'South Korea', code: 'KR', lat: 35.9078, lng: 127.7669 },
  { name: 'Brazil', code: 'BR', lat: -14.235, lng: -51.9253 },
  { name: 'Mexico', code: 'MX', lat: 23.6345, lng: -102.5528 },
  { name: 'South Africa', code: 'ZA', lat: -30.5595, lng: 22.9375 },
  { name: 'Nigeria', code: 'NG', lat: 9.082, lng: 8.6753 },
  { name: 'Egypt', code: 'EG', lat: 26.8206, lng: 30.8025 },
  { name: 'Bangladesh', code: 'BD', lat: 23.685, lng: 90.3563 },
  { name: 'Ireland', code: 'IE', lat: 53.4129, lng: -8.2439 },
  { name: 'Switzerland', code: 'CH', lat: 46.8182, lng: 8.2275 },
  { name: 'Sweden', code: 'SE', lat: 60.1282, lng: 18.6435 },
  { name: 'Norway', code: 'NO', lat: 60.472, lng: 8.4689 },
  { name: 'Denmark', code: 'DK', lat: 56.2639, lng: 9.5018 },
  { name: 'Belgium', code: 'BE', lat: 50.5039, lng: 4.4699 },
  { name: 'Portugal', code: 'PT', lat: 39.3999, lng: -8.2245 },
  { name: 'Poland', code: 'PL', lat: 51.9194, lng: 19.1451 },
  { name: 'New Zealand', code: 'NZ', lat: -40.9006, lng: 174.886 },
]

/** Major cities per country (with coordinates for map centring). */
export const CITIES: Record<string, CityInfo[]> = {
  Pakistan: [
    { name: 'Karachi', lat: 24.8607, lng: 67.0011 },
    { name: 'Lahore', lat: 31.5204, lng: 74.3587 },
    { name: 'Islamabad', lat: 33.6844, lng: 73.0479 },
    { name: 'Rawalpindi', lat: 33.5651, lng: 73.0169 },
    { name: 'Faisalabad', lat: 31.4504, lng: 73.135 },
    { name: 'Multan', lat: 30.1575, lng: 71.5249 },
    { name: 'Peshawar', lat: 34.0151, lng: 71.5249 },
    { name: 'Quetta', lat: 30.1798, lng: 66.975 },
  ],
  'United States': [
    { name: 'New York', lat: 40.7128, lng: -74.006 },
    { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
    { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
    { name: 'Houston', lat: 29.7604, lng: -95.3698 },
    { name: 'San Francisco', lat: 37.7749, lng: -122.4194 },
    { name: 'Miami', lat: 25.7617, lng: -80.1918 },
    { name: 'Seattle', lat: 47.6062, lng: -122.3321 },
    { name: 'Austin', lat: 30.2672, lng: -97.7431 },
  ],
  'United Kingdom': [
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Manchester', lat: 53.4808, lng: -2.2426 },
    { name: 'Birmingham', lat: 52.4862, lng: -1.8904 },
    { name: 'Edinburgh', lat: 55.9533, lng: -3.1883 },
    { name: 'Glasgow', lat: 55.8642, lng: -4.2518 },
    { name: 'Liverpool', lat: 53.4084, lng: -2.9916 },
  ],
  'United Arab Emirates': [
    { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
    { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773 },
    { name: 'Sharjah', lat: 25.3463, lng: 55.4209 },
  ],
  India: [
    { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
    { name: 'Delhi', lat: 28.7041, lng: 77.1025 },
    { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
    { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
    { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
    { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  ],
  Canada: [
    { name: 'Toronto', lat: 43.6532, lng: -79.3832 },
    { name: 'Vancouver', lat: 49.2827, lng: -123.1207 },
    { name: 'Montreal', lat: 45.5017, lng: -73.5673 },
    { name: 'Calgary', lat: 51.0447, lng: -114.0719 },
    { name: 'Ottawa', lat: 45.4215, lng: -75.6972 },
  ],
  Australia: [
    { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
    { name: 'Melbourne', lat: -37.8136, lng: 144.9631 },
    { name: 'Brisbane', lat: -27.4698, lng: 153.0251 },
    { name: 'Perth', lat: -31.9505, lng: 115.8605 },
  ],
  Germany: [
    { name: 'Berlin', lat: 52.52, lng: 13.405 },
    { name: 'Munich', lat: 48.1351, lng: 11.582 },
    { name: 'Hamburg', lat: 53.5511, lng: 9.9937 },
    { name: 'Frankfurt', lat: 50.1109, lng: 8.6821 },
    { name: 'Cologne', lat: 50.9375, lng: 6.9603 },
  ],
  France: [
    { name: 'Paris', lat: 48.8566, lng: 2.3522 },
    { name: 'Marseille', lat: 43.2965, lng: 5.3698 },
    { name: 'Lyon', lat: 45.764, lng: 4.8357 },
    { name: 'Nice', lat: 43.7102, lng: 7.262 },
  ],
  Spain: [
    { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
    { name: 'Barcelona', lat: 41.3874, lng: 2.1686 },
    { name: 'Valencia', lat: 39.4699, lng: -0.3763 },
    { name: 'Seville', lat: 37.3891, lng: -5.9845 },
  ],
  Italy: [
    { name: 'Rome', lat: 41.9028, lng: 12.4964 },
    { name: 'Milan', lat: 45.4642, lng: 9.19 },
    { name: 'Naples', lat: 40.8518, lng: 14.2681 },
    { name: 'Florence', lat: 43.7696, lng: 11.2558 },
  ],
  Netherlands: [
    { name: 'Amsterdam', lat: 52.3676, lng: 4.9041 },
    { name: 'Rotterdam', lat: 51.9244, lng: 4.4777 },
    { name: 'The Hague', lat: 52.0705, lng: 4.3007 },
  ],
  'Saudi Arabia': [
    { name: 'Riyadh', lat: 24.7136, lng: 46.6753 },
    { name: 'Jeddah', lat: 21.4858, lng: 39.1925 },
    { name: 'Mecca', lat: 21.3891, lng: 39.8579 },
  ],
  Qatar: [{ name: 'Doha', lat: 25.2854, lng: 51.531 }],
  Turkey: [
    { name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
    { name: 'Ankara', lat: 39.9334, lng: 32.8597 },
    { name: 'Izmir', lat: 38.4237, lng: 27.1428 },
  ],
  Singapore: [{ name: 'Singapore', lat: 1.3521, lng: 103.8198 }],
  Malaysia: [
    { name: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
    { name: 'Penang', lat: 5.4164, lng: 100.3327 },
  ],
  Indonesia: [
    { name: 'Jakarta', lat: -6.2088, lng: 106.8456 },
    { name: 'Bali (Denpasar)', lat: -8.6705, lng: 115.2126 },
  ],
  China: [
    { name: 'Beijing', lat: 39.9042, lng: 116.4074 },
    { name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
    { name: 'Shenzhen', lat: 22.5431, lng: 114.0579 },
  ],
  Japan: [
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'Osaka', lat: 34.6937, lng: 135.5023 },
    { name: 'Kyoto', lat: 35.0116, lng: 135.7681 },
  ],
  'South Korea': [
    { name: 'Seoul', lat: 37.5665, lng: 126.978 },
    { name: 'Busan', lat: 35.1796, lng: 129.0756 },
  ],
  Brazil: [
    { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
    { name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
  ],
  Mexico: [
    { name: 'Mexico City', lat: 19.4326, lng: -99.1332 },
    { name: 'Guadalajara', lat: 20.6597, lng: -103.3496 },
  ],
  'South Africa': [
    { name: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
    { name: 'Cape Town', lat: -33.9249, lng: 18.4241 },
  ],
  Nigeria: [
    { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
    { name: 'Abuja', lat: 9.0765, lng: 7.3986 },
  ],
  Egypt: [{ name: 'Cairo', lat: 30.0444, lng: 31.2357 }],
  Bangladesh: [{ name: 'Dhaka', lat: 23.8103, lng: 90.4125 }],
  Ireland: [{ name: 'Dublin', lat: 53.3498, lng: -6.2603 }],
  Switzerland: [
    { name: 'Zurich', lat: 47.3769, lng: 8.5417 },
    { name: 'Geneva', lat: 46.2044, lng: 6.1432 },
  ],
  Sweden: [{ name: 'Stockholm', lat: 59.3293, lng: 18.0686 }],
  Norway: [{ name: 'Oslo', lat: 59.9139, lng: 10.7522 }],
  Denmark: [{ name: 'Copenhagen', lat: 55.6761, lng: 12.5683 }],
  Belgium: [{ name: 'Brussels', lat: 50.8503, lng: 4.3517 }],
  Portugal: [
    { name: 'Lisbon', lat: 38.7223, lng: -9.1393 },
    { name: 'Porto', lat: 41.1579, lng: -8.6291 },
  ],
  Poland: [
    { name: 'Warsaw', lat: 52.2297, lng: 21.0122 },
    { name: 'Kraków', lat: 50.0647, lng: 19.945 },
  ],
  'New Zealand': [
    { name: 'Auckland', lat: -36.8485, lng: 174.7633 },
    { name: 'Wellington', lat: -41.2865, lng: 174.7762 },
  ],
}

export function countryCenter(country: string): { lat: number; lng: number } | null {
  const c = COUNTRIES.find(x => x.name === country)
  return c ? { lat: c.lat, lng: c.lng } : null
}

export function citiesForCountry(country: string): CityInfo[] {
  return CITIES[country] || []
}
