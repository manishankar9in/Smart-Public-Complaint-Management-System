import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, MapPin, RotateCcw, Loader2, Navigation, Satellite } from "lucide-react";
import { getCurrentLocation, watchLiveLocation, formatAccuracy } from "../utils/geolocation";
import { toast } from "react-toastify";

export default function GPSCamera({ onCapture, label = "Live GPS Photo Proof" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const stopGpsRef = useRef(null);
  const liveCoordsRef = useRef(null);

  const [active, setActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [liveCoords, setLiveCoords] = useState(null);
  const [gpsLock, setGpsLock] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [captureMeta, setCaptureMeta] = useState(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (stopGpsRef.current) {
      stopGpsRef.current();
      stopGpsRef.current = null;
    }
    setActive(false);
    setVideoReady(false);
    setGpsLock(false);
    setGpsError(null);
  }, []);

  const startLiveGps = useCallback(() => {
    if (stopGpsRef.current) stopGpsRef.current();
    stopGpsRef.current = watchLiveLocation(
      (pos) => {
        liveCoordsRef.current = pos;
        setLiveCoords(pos);
        setGpsLock(true);
        setGpsError(null);
      },
      (err) => {
        setGpsLock(false);
        setGpsError(err?.message || "GPS unavailable");
      }
    );
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !streamRef.current || !video) return;

    video.srcObject = streamRef.current;
    video.muted = true;
    video.playsInline = true;

    const markReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) setVideoReady(true);
    };

    video.addEventListener("loadeddata", markReady);
    video.addEventListener("canplay", markReady);
    video.play().catch(() => {});

    return () => {
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("canplay", markReady);
    };
  }, [active]);

  const startCamera = async () => {
    try {
      stopCamera();
      startLiveGps();
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = mediaStream;
      setActive(true);
      setVideoReady(false);
      toast.info("Live GPS tracking started. Allow location access for accurate lock.");
    } catch {
      toast.error("Camera access denied. Enable camera permission in browser settings.");
    }
  };

  const drawGpsOverlay = (ctx, w, h, position, timestamp) => {
    const now = new Date();
    const lines = [
      `LAT: ${position.lat.toFixed(6)} | LNG: ${position.lng.toFixed(6)}`,
      `ACCURACY: ${formatAccuracy(position.accuracy)}`,
      `ALTITUDE: ${position.altitude ? `${position.altitude.toFixed(1)}m` : 'N/A'}`,
      `CAPTURED: ${timestamp}`,
      `DEVICE TIME: ${now.toLocaleTimeString()}`,
    ];
    const boxH = 140;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, h - boxH, w, boxH);
    
    // Header
    ctx.fillStyle = "#4ade80";
    ctx.font = "bold 18px Arial,sans-serif";
    ctx.fillText("● GOVERNMENT GPS VERIFIED PROOF", 16, h - boxH + 26);
    
    // Divider
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, h - boxH + 36);
    ctx.lineTo(w - 16, h - boxH + 36);
    ctx.stroke();
    
    // GPS data
    ctx.fillStyle = "#fff";
    ctx.font = "13px Arial,sans-serif";
    lines.forEach((line, i) => {
      ctx.fillText(line, 16, h - boxH + 54 + i * 18);
    });
    
    // Warning text
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 11px Arial,sans-serif";
    ctx.fillText("⚠ FRAUDULENT IMAGES ARE PUNISHABLE", 16, h - 12);
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current || !videoReady) {
      toast.warn("Wait for camera preview to load.");
      return;
    }
    setCapturing(true);
    try {
      let position = liveCoordsRef.current;
      if (!position) {
        try {
          position = await getCurrentLocation();
          setLiveCoords(position);
        } catch {
          toast.error("GPS lock failed. Enable location and wait for live lock.");
          setCapturing(false);
          return;
        }
      }

      const video = videoRef.current;
      const originalW = video.videoWidth;
      const originalH = video.videoHeight;
      
      // Compress image: max 1280x720 resolution for mobile
      const maxDimension = 1280;
      let w = originalW;
      let h = originalH;
      
      if (w > maxDimension || h > maxDimension) {
        const ratio = Math.min(maxDimension / w, maxDimension / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      
      const canvas = canvasRef.current;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      const timestamp = new Date().toLocaleString();
      drawGpsOverlay(ctx, w, h, position, timestamp);

      // Use lower quality (0.7) for faster mobile upload
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const meta = { image: dataUrl, coords: { lat: position.lat, lng: position.lng }, timestamp, accuracy: position.accuracy };
      setCaptured(dataUrl);
      setCaptureMeta(meta);
      stopCamera();
      onCapture?.(meta);
      toast.success("Photo captured with live GPS lock.");
    } catch {
      toast.error("Capture failed. Try again.");
    } finally {
      setCapturing(false);
    }
  };

  const retake = () => {
    setCaptured(null);
    setCaptureMeta(null);
    setLiveCoords(null);
    liveCoordsRef.current = null;
    startCamera();
  };

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{label}</p>
        {active && (
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${gpsLock ? "text-green-700" : "text-amber-700"}`}>
            <Satellite size={12} className={gpsLock ? "animate-pulse" : ""} />
            {gpsLock ? "Live GPS active" : "Acquiring GPS…"}
          </span>
        )}
      </div>

      {!captured ? (
        <>
          <div className="relative aspect-video overflow-hidden rounded-md bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            {active && liveCoords && (
              <div className="pointer-events-none absolute left-2 top-2 max-w-[90%] rounded bg-black/70 px-2 py-1.5 text-[10px] text-white">
                <div className="flex items-center gap-1 font-bold text-green-400">
                  <Navigation size={10} /> LIVE
                </div>
                <div>{liveCoords.lat.toFixed(6)}, {liveCoords.lng.toFixed(6)}</div>
                <div className="text-slate-300">{formatAccuracy(liveCoords.accuracy)}</div>
              </div>
            )}
            {!active && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80 text-white">
                <Camera size={32} />
                <p className="text-xs">Start camera for live GPS + photo proof</p>
              </div>
            )}
            {active && !videoReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="animate-spin text-white" size={28} />
              </div>
            )}
          </div>

          {gpsError && active && (
            <p className="mt-2 text-[10px] text-red-600">GPS: {gpsError}. Enable location in browser settings.</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!active ? (
              <button type="button" onClick={startCamera} className="btn-primary cursor-pointer px-3 py-2 text-xs">
                <Camera size={14} /> Start Live GPS Camera
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={capture}
                  disabled={!videoReady || capturing || !gpsLock}
                  className="btn-primary cursor-pointer px-3 py-2 text-xs disabled:opacity-50"
                >
                  {capturing ? <Loader2 className="animate-spin" size={14} /> : <Camera size={14} />}
                  {capturing ? " Capturing…" : " Capture with GPS Lock"}
                </button>
                <button type="button" onClick={stopCamera} className="btn-secondary cursor-pointer px-3 py-2 text-xs">
                  Stop
                </button>
              </>
            )}
            {liveCoords && (
              <span className="flex items-center gap-1 text-[10px] text-green-700">
                <MapPin size={12} /> {liveCoords.lat.toFixed(5)}, {liveCoords.lng.toFixed(5)}
              </span>
            )}
          </div>
        </>
      ) : (
        <div>
          <img src={captured} alt="GPS proof" className="w-full rounded-md border border-slate-200" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] text-green-800">
              <MapPin size={12} />
              {captureMeta?.coords
                ? `${captureMeta.coords.lat.toFixed(6)}, ${captureMeta.coords.lng.toFixed(6)} · ${formatAccuracy(captureMeta.accuracy)}`
                : "No GPS"}
            </span>
            <button type="button" onClick={retake} className="btn-secondary cursor-pointer px-2 py-1.5 text-xs">
              <RotateCcw size={12} /> Retake
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
