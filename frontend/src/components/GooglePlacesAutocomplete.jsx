import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, X } from "lucide-react";

export default function GooglePlacesAutocomplete({ onPlaceSelect, placeholder = "Search address...", defaultValue = "" }) {
  const [query, setQuery] = useState(defaultValue);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Google Maps API Key - User will add this
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  
  // Log API key status for debugging (remove in production)
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn("Google Maps API Key not found. Add VITE_GOOGLE_MAPS_API_KEY to .env.local");
    } else {
      console.log("Google Maps API Key loaded (length:", GOOGLE_MAPS_API_KEY.length, ")");
    }
  }, [GOOGLE_MAPS_API_KEY]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && !inputRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query || query.length < 2 || !GOOGLE_MAPS_API_KEY) {
      setPredictions([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=geocode&components=country:in&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        
        console.log("Google Places API response:", data.status, data);
        
        if (data.status === "OK" && data.predictions) {
          setPredictions(data.predictions);
          setShowDropdown(true);
        } else if (data.status === "REQUEST_DENIED") {
          console.error("Google Maps API key invalid or restricted:", data.error_message);
          setPredictions([]);
        } else if (data.status === "ZERO_RESULTS") {
          setPredictions([]);
        } else {
          console.error("Google Places API error:", data.status, data.error_message);
          setPredictions([]);
        }
      } catch (error) {
        console.error("Google Places API fetch error:", error);
        if (error.message?.includes('CORS') || error.message?.includes('fetch')) {
          console.error("CORS error: Add http://localhost:5173/* to Google Cloud Console API key referrers");
        }
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [query, GOOGLE_MAPS_API_KEY]);

  const handlePlaceSelect = async (place) => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=geometry,formatted_address,address_components&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();

      if (data.status === "OK" && data.result) {
        const result = data.result;
        const addressComponents = result.address_components || [];
        
        // Extract address components
        const getAddressComponent = (types) => {
          const component = addressComponents.find(comp => 
            types.some(type => comp.types.includes(type))
          );
          return component ? component.long_name : "";
        };

        const placeData = {
          fullAddress: result.formatted_address,
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          state: getAddressComponent(["administrative_area_level_1"]),
          district: getAddressComponent(["administrative_area_level_2", "district"]),
          city: getAddressComponent(["locality", "administrative_area_level_3"]),
          pincode: getAddressComponent(["postal_code"]),
          village: getAddressComponent(["sublocality", "sublocality_level_1", "neighborhood"]),
          country: getAddressComponent(["country"]),
        };

        setQuery(result.formatted_address);
        setShowDropdown(false);
        setPredictions([]);
        onPlaceSelect?.(placeData);
      }
    } catch (error) {
      console.error("Place details error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setPredictions([]);
    setShowDropdown(false);
    onPlaceSelect?.(null);
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="relative">
        <div className="input-field flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border-amber-200">
          <MapPin size={16} />
          <span className="font-medium">Google Maps API Key not configured. Using manual address entry.</span>
        </div>
      </div>
    );
  }

  // Show warning if CORS error might occur
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalhost) {
    console.warn("Google Maps: If autocomplete fails, add http://localhost:5173/* to API key referrers in Google Cloud Console");
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500" size={16} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query && setShowDropdown(true)}
          placeholder={placeholder}
          className="input-field min-h-[40px] pl-9 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-green-500" size={16} />
        )}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handlePlaceSelect(prediction)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
            >
              <div className="font-medium text-slate-800">{prediction.structured_formatting.main_text}</div>
              <div className="text-xs text-slate-500">{prediction.structured_formatting.secondary_text}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
