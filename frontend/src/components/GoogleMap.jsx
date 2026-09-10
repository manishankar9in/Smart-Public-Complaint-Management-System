import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

export default function GoogleMap({ center, markers = [], zoom = 13, height = "300px" }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !mapRef.current) return;

    const tryInit = () => {
      if (window.google?.maps?.Map && mapRef.current) {
        initializeMap();
      }
    };

    if (window.google?.maps?.Map) {
      tryInit();
      return;
    }

    // Check if script already exists in document
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener("load", tryInit);
      return () => existingScript.removeEventListener("load", tryInit);
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = tryInit;
    document.head.appendChild(script);
  }, [GOOGLE_MAPS_API_KEY]);

  useEffect(() => {
    if (mapInstanceRef.current && window.google?.maps?.Marker) {
      // Clear existing markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];

      // Add new markers
      markers.forEach(markerData => {
        const marker = new window.google.maps.Marker({
          position: { lat: markerData.lat, lng: markerData.lng },
          map: mapInstanceRef.current,
          title: markerData.title || "Complaint Location",
          icon: markerData.icon || {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: markerData.color || "#16a34a",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });

        if (markerData.infoWindow && window.google.maps.InfoWindow) {
          const infoWindow = new window.google.maps.InfoWindow({
            content: markerData.infoWindow,
          });

          marker.addListener("click", () => {
            infoWindow.open(mapInstanceRef.current, marker);
          });
        }

        markersRef.current.push(marker);
      });
    }
  }, [markers]);

  const initializeMap = () => {
    if (!mapRef.current || !window.google?.maps?.Map || mapInstanceRef.current) return;

    const mapOptions = {
      center: center || { lat: 17.6868, lng: 83.2185 }, // Default to Anantapur
      zoom,
      mapTypeId: "roadmap",
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    };

    try {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, mapOptions);
    } catch (err) {
      console.warn("Could not construct Google Map instance:", err);
    }
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50"
        style={{ height }}
      >
        <div className="text-center p-4">
          <MapPin className="mx-auto mb-2 text-slate-400" size={32} />
          <p className="text-sm text-slate-500">Google Maps API Key not configured</p>
          <p className="text-xs text-slate-400">Add VITE_GOOGLE_MAPS_API_KEY to .env.local</p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} style={{ height, width: "100%" }} className="rounded-lg border border-slate-200" />;
}
