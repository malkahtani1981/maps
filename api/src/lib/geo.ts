/**
 * Geocoding, map tile sources, and external verification helpers.
 *
 * These are optional, presentation-only features. The core routing still uses
 * the local OSM extract, but users can cross-check any point against public
 * maps (OpenStreetMap, Google Maps, Google Earth) or view it on free satellite
 * tiles (ESRI World Imagery). Google Maps API verification is gated behind the
 * GOOGLE_MAPS_API_KEY environment variable so the project stays free to run.
 */

import { logger } from "./logger";

export interface MapSource {
  id: string;
  name: string;
  type: "raster";
  tiles: string[];
  tileSize: number;
  attribution: string;
  default?: boolean;
}

export interface LocationInfo {
  lat: number;
  lon: number;
  displayName: string | null;
  address: Record<string, string> | null;
  links: {
    openstreetmap: string;
    googleMaps: string;
    googleEarth: string;
    googleMapsDirections: string | null;
  };
}

export interface GoogleVerifyResult {
  available: boolean;
  googleDistanceMeters?: number;
  googleDurationSeconds?: number;
  googlePolyline?: string;
  error?: string;
}

/** Tile sources available to the frontend. No API keys are exposed here. */
export function getMapSources(): MapSource[] {
  return [
    {
      id: "osm",
      name: "OpenStreetMap",
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      default: true,
    },
    {
      id: "satellite",
      name: "Satellite (ESRI)",
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
    {
      id: "terrain",
      name: "Terrain (OpenTopoMap)",
      type: "raster",
      tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)",
    },
  ];
}

export function buildLinks(lat: number, lon: number, other?: { lat: number; lon: number }): LocationInfo["links"] {
  const q = encodeURIComponent(`${lat},${lon}`);
  return {
    openstreetmap: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${q}`,
    googleEarth: `https://earth.google.com/web/search/${lat},${lon}`,
    googleMapsDirections: other
      ? `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${other.lat},${other.lon}`
      : null,
  };
}

/** Reverse geocode a point using Nominatim (OpenStreetMap's free service). */
export async function reverseGeocode(lat: number, lon: number): Promise<{
  displayName: string | null;
  address: Record<string, string> | null;
}> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GraphMaps-AlUla-PoC/1.0 (educational demo)" },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Nominatim reverse geocode failed");
      return { displayName: null, address: null };
    }
    const data: any = await res.json();
    return {
      displayName: data.display_name ?? null,
      address: data.address ?? null,
    };
  } catch (err) {
    logger.warn({ err }, "Nominatim reverse geocode error");
    return { displayName: null, address: null };
  }
}

export async function buildLocationInfo(lat: number, lon: number): Promise<LocationInfo> {
  const geo = await reverseGeocode(lat, lon);
  return {
    lat,
    lon,
    displayName: geo.displayName,
    address: geo.address,
    links: buildLinks(lat, lon),
  };
}

/**
 * Optional cross-check against Google Maps Directions API.
 * Only active when GOOGLE_MAPS_API_KEY is set.
 */
export async function verifyWithGoogle(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Promise<GoogleVerifyResult> {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) {
    return { available: false, error: "Set GOOGLE_MAPS_API_KEY to enable Google Maps verification" };
  }
  const origin = `${fromLat},${fromLon}`;
  const destination = `${toLat},${toLon}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { available: false, error: `Google API returned HTTP ${res.status}` };
    }
    const data: any = await res.json();
    if (data.status !== "OK") {
      return { available: false, error: `Google API status: ${data.status}` };
    }
    const leg = data.routes?.[0]?.legs?.[0];
    if (!leg) return { available: false, error: "No route legs returned" };
    return {
      available: true,
      googleDistanceMeters: leg.distance?.value,
      googleDurationSeconds: leg.duration?.value,
      googlePolyline: data.routes?.[0]?.overview_polyline?.points,
    };
  } catch (err) {
    logger.warn({ err }, "Google Maps verification failed");
    return { available: false, error: "Network error while calling Google Maps API" };
  }
}
