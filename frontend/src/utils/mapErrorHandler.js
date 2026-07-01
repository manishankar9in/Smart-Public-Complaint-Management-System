// Map Error Handler Utility
export const handleMapError = (error, fallbackMessage = "Map loading failed") => {
  console.error('Map Error:', error);
  
  if (error.message) {
    if (error.message.includes('NetworkError')) {
      return "Network error: Unable to load map tiles. Check your internet connection.";
    }
    if (error.message.includes('404')) {
      return "Map service unavailable: Tile server not responding.";
    }
    if (error.message.includes('timeout')) {
      return "Map loading timeout: Please refresh the page.";
    }
  }
  
  return fallbackMessage;
};

export const handleLocationError = (error) => {
  console.error('Location Error:', error);
  
  switch (error.code) {
    case 1:
      return "Location permission denied. Please enable location access in your browser settings.";
    case 2:
      return "Location unavailable. Position could not be determined.";
    case 3:
      return "Location timeout. Request timed out. Please try again.";
    default:
      return "Unable to get your location. Please check location permissions.";
  }
};

export const validateCoordinates = (lat, lng) => {
  if (!lat || !lng) return false;
  
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  
  return (
    !isNaN(latNum) && 
    !isNaN(lngNum) && 
    latNum >= -90 && 
    latNum <= 90 && 
    lngNum >= -180 && 
    lngNum <= 180
  );
};

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const reverseGeocode = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    return {
      address: data.display_name || '',
      city: data.address?.city || data.address?.town || data.address?.village || '',
      state: data.address?.state || '',
      country: data.address?.country || '',
      postcode: data.address?.postcode || '',
      rawAddress: data.address || {}
    };
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    return null;
  }
};

export const getMapCenter = (locations) => {
  if (!locations || locations.length === 0) {
    return { lat: 14.6819, lng: 77.6006 }; // Default center
  }
  
  const validLocations = locations.filter(loc => 
    validateCoordinates(loc.gps_lat, loc.gps_long)
  );
  
  if (validLocations.length === 0) {
    return { lat: 14.6819, lng: 77.6006 };
  }
  
  // Calculate average center
  const avgLat = validLocations.reduce((sum, loc) => sum + loc.gps_lat, 0) / validLocations.length;
  const avgLng = validLocations.reduce((sum, loc) => sum + loc.gps_long, 0) / validLocations.length;
  
  return { lat: avgLat, lng: avgLng };
};
