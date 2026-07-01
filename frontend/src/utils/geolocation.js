export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(formatPosition(position));
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000, // Increased to 30s for mobile devices
        maximumAge: 0,
      }
    );
  });
};

export const formatPosition = (position) => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
  accuracy: position.coords.accuracy,
  altitude: position.coords.altitude,
  heading: position.coords.heading,
  speed: position.coords.speed,
  timestamp: position.timestamp,
});

/**
 * Live GPS watch — returns cleanup function to stop tracking.
 */
export const watchLiveLocation = (onUpdate, onError) => {
  if (!navigator.geolocation) {
    onError?.(new Error("Geolocation is not supported by your browser."));
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => onUpdate(formatPosition(position)),
    (error) => onError?.(error),
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    }
  );

  return () => navigator.geolocation.clearWatch(watchId);
};

export const formatAccuracy = (meters) => {
  if (meters == null || Number.isNaN(meters)) return "—";
  if (meters < 10) return `±${Math.round(meters)}m (high)`;
  if (meters < 50) return `±${Math.round(meters)}m`;
  return `±${Math.round(meters)}m (low)`;
};
