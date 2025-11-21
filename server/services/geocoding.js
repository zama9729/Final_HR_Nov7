/**
 * Geocoding service for address resolution
 * Supports Google Maps Geocoding API and OpenStreetMap Nominatim
 */

/**
 * Geocode an address string to coordinates
 * @param {string} address - Address string to geocode
 * @returns {Promise<{lat: number, lon: number, formatted_address: string}>}
 */
export async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required');
  }

  // Try Google Maps first if API key is available
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleApiKey}`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const result = data.results[0];
        return {
          lat: result.geometry.location.lat,
          lon: result.geometry.location.lng,
          formatted_address: result.formatted_address,
        };
      }
    } catch (error) {
      console.warn('Google Maps geocoding failed, falling back to Nominatim:', error.message);
    }
  }

  // Fallback to OpenStreetMap Nominatim (free, but rate-limited)
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      {
        headers: {
          'User-Agent': 'HR-Suite/1.0' // Required by Nominatim
        }
      }
    );
    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        formatted_address: result.display_name,
      };
    }
  } catch (error) {
    console.error('Nominatim geocoding failed:', error.message);
  }

  throw new Error('Unable to geocode address');
}

/**
 * Reverse geocode coordinates to address
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string>} Formatted address string
 */
export async function reverseGeocode(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    throw new Error('Valid coordinates are required');
  }

  // Try Google Maps first
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey) {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${googleApiKey}`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (error) {
      console.warn('Google Maps reverse geocoding failed, falling back to Nominatim:', error.message);
    }
  }

  // Fallback to Nominatim
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'HR-Suite/1.0'
        }
      }
    );
    const data = await response.json();
    
    if (data && data.display_name) {
      return data.display_name;
    }
  } catch (error) {
    console.error('Nominatim reverse geocoding failed:', error.message);
  }

  return `${lat}, ${lon}`; // Fallback to coordinates
}


