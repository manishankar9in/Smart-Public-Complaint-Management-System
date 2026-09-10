import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Navigation, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { reverseGeocode } from "../utils/mapErrorHandler";
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState } from "../data/indianStatesDistricts";

export default function WorkerLocationPicker({
  latitude,
  longitude,
  onLocationChange,
  state,
  city,
  ward,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);

  const [detectingLocation, setDetectingLocation] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lastGeocodedQuery, setLastGeocodedQuery] = useState("");

  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  // Initialize or load Google Maps script
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setMapLoaded(false);
      return;
    }

    if (window.google && window.google.maps) {
      setMapLoaded(true);
      return;
    }

    // Check if script tag already exists
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const handleLoad = () => setMapLoaded(true);
      existingScript.addEventListener("load", handleLoad);
      return () => existingScript.removeEventListener("load", handleLoad);
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setMapLoaded(true);
    script.onerror = () => {
      console.warn("Failed to load Google Maps script. Using fallback geocoding.");
      setMapLoaded(false);
    };
    document.head.appendChild(script);
  }, [GOOGLE_MAPS_API_KEY]);

  // Helper to match state and district against standardized lists
  const matchStateAndDistrict = (rawState, rawDistrict) => {
    const stateName = String(rawState || "").trim();
    const matchedState =
      Object.keys(INDIAN_STATES_WITH_DISTRICTS).find(
        (s) => s.toLowerCase() === stateName.toLowerCase()
      ) || stateName;

    const districtName = String(rawDistrict || "").trim();
    let matchedDistrict = "";
    if (matchedState) {
      const districts = getDistrictsForState(matchedState) || [];
      matchedDistrict =
        districts.find((d) => d.toLowerCase() === districtName.toLowerCase()) ||
        districts.find(
          (d) =>
            districtName.toLowerCase().includes(d.toLowerCase()) ||
            d.toLowerCase().includes(districtName.toLowerCase())
        ) ||
        districtName;
    }
    return { matchedState, matchedDistrict };
  };

  // Handle position update
  const handlePositionSelect = useCallback(
    async (lat, lng, shouldReverseGeocode = false) => {
      const roundedLat = parseFloat(Number(lat).toFixed(6));
      const roundedLng = parseFloat(Number(lng).toFixed(6));

      if (markerRef.current && mapInstanceRef.current && window.google) {
        const newPos = new window.google.maps.LatLng(roundedLat, roundedLng);
        markerRef.current.setPosition(newPos);
        mapInstanceRef.current.panTo(newPos);
      }

      let extraDetails = {};
      if (shouldReverseGeocode) {
        try {
          if (window.google && window.google.maps && geocoderRef.current) {
            geocoderRef.current.geocode(
              { location: { lat: roundedLat, lng: roundedLng } },
              (results, status) => {
                if (status === "OK" && results && results[0]) {
                  const result = results[0];
                  const comps = result.address_components || [];
                  const getComp = (types) =>
                    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name || "";

                  const detectedCity =
                    getComp(["locality", "administrative_area_level_3"]) ||
                    getComp(["administrative_area_level_2", "district"]);
                  const detectedState = getComp(["administrative_area_level_1"]);
                  const detectedWard =
                    getComp(["sublocality", "sublocality_level_1", "neighborhood"]) ||
                    result.formatted_address;

                  const { matchedState, matchedDistrict } = matchStateAndDistrict(detectedState, detectedCity);

                  onLocationChange({
                    latitude: roundedLat,
                    longitude: roundedLng,
                    city: matchedDistrict,
                    state: matchedState,
                    ward: detectedWard,
                  });
                  return;
                }
              }
            );
          } else {
            const data = await reverseGeocode(roundedLat, roundedLng);
            if (data) {
              const addr = data.rawAddress || {};
              const rawState = data.state || addr.state || "";
              const rawDistrict = addr.state_district || addr.county || addr.district || data.city || addr.city || "";
              const { matchedState, matchedDistrict } = matchStateAndDistrict(rawState, rawDistrict);
              const localArea = addr.suburb || addr.village || addr.neighbourhood || addr.road || data.address || "";

              extraDetails = {
                city: matchedDistrict,
                state: matchedState,
                ward: localArea,
              };
            }
          }
        } catch (err) {
          console.warn("Reverse geocoding warning:", err);
        }
      }

      onLocationChange({
        latitude: roundedLat,
        longitude: roundedLng,
        ...extraDetails,
      });
    },
    [onLocationChange]
  );

  // Initialize Google Map once script is loaded
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google || mapInstanceRef.current) return;

    const initialLat = latitude || 9.5872;
    const initialLng = longitude || 77.9624;
    const initialCenter = { lat: initialLat, lng: initialLng };

    const map = new window.google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: latitude && longitude ? 15 : 12,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    const marker = new window.google.maps.Marker({
      position: initialCenter,
      map,
      draggable: true,
      title: "Worker Base Location",
      animation: window.google.maps.Animation.DROP,
      icon: {
        path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#2563eb",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });

    geocoderRef.current = new window.google.maps.Geocoder();

    // Map click: move marker and update coordinates
    map.addListener("click", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      handlePositionSelect(lat, lng, true);
    });

    // Marker dragend: update coordinates
    marker.addListener("dragend", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      handlePositionSelect(lat, lng, true);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
  }, [mapLoaded, handlePositionSelect]);

  // Forward geocode when State / City / Ward changes if worker hasn't manually clicked on map
  useEffect(() => {
    if (!city && !state) return;
    const query = [ward, city, state, "India"].filter(Boolean).join(", ");
    if (query === lastGeocodedQuery) return;

    const debounceTimer = setTimeout(() => {
      setLastGeocodedQuery(query);

      // If Google Geocoder is available
      if (window.google && window.google.maps && geocoderRef.current && mapInstanceRef.current) {
        geocoderRef.current.geocode({ address: query }, (results, status) => {
          if (status === "OK" && results && results[0]) {
            const loc = results[0].geometry.location;
            const newLat = parseFloat(loc.lat().toFixed(6));
            const newLng = parseFloat(loc.lng().toFixed(6));

            if (markerRef.current) markerRef.current.setPosition(loc);
            mapInstanceRef.current.panTo(loc);
            mapInstanceRef.current.setZoom(ward ? 15 : 13);

            onLocationChange({
              latitude: newLat,
              longitude: newLng,
            });
          }
        });
      } else {
        // Fallback geocoding with OpenStreetMap Nominatim
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data[0]) {
              const newLat = parseFloat(Number(data[0].lat).toFixed(6));
              const newLng = parseFloat(Number(data[0].lon).toFixed(6));
              onLocationChange({
                latitude: newLat,
                longitude: newLng,
              });
            }
          })
          .catch(() => {});
      }
    }, 600);

    return () => clearTimeout(debounceTimer);
  }, [ward, city, state, lastGeocodedQuery, onLocationChange]);

  // "📍 Use Current GPS Location" button handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    setDetectingLocation(true);
    const toastId = toast.loading("Acquiring GPS lock & detecting coordinates...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));

        handlePositionSelect(lat, lng, true);

        if (mapInstanceRef.current && markerRef.current && window.google) {
          const newPos = new window.google.maps.LatLng(lat, lng);
          markerRef.current.setPosition(newPos);
          mapInstanceRef.current.panTo(newPos);
          mapInstanceRef.current.setZoom(16);
        }

        toast.update(toastId, {
          render: `GPS Lock Acquired: ${lat}, ${lng}`,
          type: "success",
          isLoading: false,
          autoClose: 3000,
        });
        setDetectingLocation(false);
      },
      (err) => {
        console.warn("Geolocation error:", err);
        let msg = "Could not detect location. Please select on the map.";
        if (err.code === 1) msg = "Location permission denied. Please allow GPS access or click the map.";
        else if (err.code === 3) msg = "Location request timed out. Please click on the map.";
        
        toast.update(toastId, {
          render: msg,
          type: "error",
          isLoading: false,
          autoClose: 4000,
        });
        setDetectingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const hasCoordinates = latitude != null && longitude != null;

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-md">
      {/* Header with Title & Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-widest text-white/90 sm:text-xs">
            Worker Base Location &amp; GPS Coordinates *
          </label>
          <p className="text-[10px] text-white/60">
            Click on map, drag the pin, or click &ldquo;Use Current Location&rdquo;.
          </p>
        </div>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={detectingLocation}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow transition-all cursor-pointer disabled:opacity-50"
        >
          {detectingLocation ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Navigation size={14} className="text-white" />
          )}
          <span>{detectingLocation ? "Detecting GPS..." : "📍 Use Current Location"}</span>
        </button>
      </div>

      {/* Coordinate Status Badge */}
      <div className="flex items-center justify-between rounded-xl bg-black/40 px-3 py-2 border border-white/10 text-xs">
        <div className="flex items-center gap-2">
          {hasCoordinates ? (
            <>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {latitude.toFixed(5)}°, {longitude.toFixed(5)}°
              </span>
              <span className="text-[10px] text-white/60 hidden sm:inline">
                ({city || state || "Location Locked"})
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={14} className="text-amber-400" />
              <span className="text-amber-300 text-[11px]">
                No GPS coordinates set yet. Select on map or use current location.
              </span>
            </>
          )}
        </div>
        {hasCoordinates && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
            <CheckCircle size={11} /> Auto-Saved
          </span>
        )}
      </div>

      {/* Google Map Container */}
      <div className="relative overflow-hidden rounded-xl border border-white/15 shadow-inner">
        {GOOGLE_MAPS_API_KEY ? (
          <div
            ref={mapRef}
            className="w-full h-52 sm:h-60 bg-slate-900"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 bg-slate-900/80 p-4 text-center">
            <MapPin size={28} className="text-blue-400 mb-2" />
            <p className="text-xs font-semibold text-white/90">Google Maps API key not found in .env.local</p>
            <p className="text-[10px] text-white/60 mt-1">
              Click &ldquo;Use Current Location&rdquo; above to automatically detect your GPS coordinates via browser.
            </p>
          </div>
        )}

        {/* Map overlay hint */}
        <div className="absolute bottom-2 left-2 pointer-events-none rounded-lg bg-black/70 px-2 py-1 text-[9px] text-white/80 backdrop-blur-sm">
          💡 Click or drag the blue marker to adjust your duty station
        </div>
      </div>
    </div>
  );
}
