import { useState, useRef, useCallback } from "react";

// Definisci qui le tue zone
const zones = [
    { name: "Radio Frequenza Libera", points: [
            {lat: 41.108692, lon: 16.879609},
            {lat: 41.108730, lon: 16.879755},
            {lat: 41.108786, lon: 16.879728},
            {lat: 41.108755, lon: 16.879577}
        ] },
    // ... aggiungi tutte le altre zone qui
];

// Funzione punto nel poligono (ray-casting)
function isInsidePolygon(lat, lon, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lon;
        const xj = polygon[j].lat, yj = polygon[j].lon;
        const intersect = ((yi > lon) !== (yj > lon)) &&
            (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Distanza punto-segmento in km
function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const x0 = lon * toRad, y0 = lat * toRad;
    const x1 = lon1 * toRad, y1 = lat1 * toRad;
    const x2 = lon2 * toRad, y2 = lat2 * toRad;

    const A = x0 - x1, B = y0 - y1;
    const C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    const param = len_sq !== 0 ? dot / len_sq : -1;

    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }

    const dx = x0 - xx;
    const dy = y0 - yy;
    return 6371 * Math.sqrt(dx*dx + dy*dy); // km
}

function distanceToPolygon(lat, lon, polygon) {
    let minDist = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i+1) % polygon.length];
        const dist = pointToSegmentDistance(lat, lon, p1.lat, p1.lon, p2.lat, p2.lon);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

/**
 * Hook: useGeolocation
 * @param {Function} onZoneChange callback(currentZoneName)
 */
export default function useGeolocation(onZoneChange, stabilityThreshold = 3) {
    const [coords, setCoords] = useState(null);
    const [accuracy, setAccuracy] = useState(null);
    const [zoneName, setZoneName] = useState("Fuori dalle aree conosciute");
    const [status, setStatus] = useState("idle"); // idle | tracking | error
    const watchId = useRef(null);
    const stabilityCounter = useRef(0);
    const lastZoneName = useRef(null);

    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            setStatus("error");
            return;
        }

        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);

        setStatus("tracking");
        stabilityCounter.current = 0;

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const acc = position.coords.accuracy;

                setCoords({ lat, lon });
                setAccuracy(acc);

                let insideZones = [];
                let nearZones = [];

                for (const zone of zones) {
                    const inside = isInsidePolygon(lat, lon, zone.points);
                    const edgeDist = distanceToPolygon(lat, lon, zone.points);

                    if (inside) insideZones.push({ zone, edgeDist });
                    else if (edgeDist < 0.02) nearZones.push({ zone, edgeDist });
                }

                let currentZone = "Fuori dalle aree conosciute";
                let selectedZone = null;

                if (insideZones.length > 0) {
                    insideZones.sort((a,b) => a.edgeDist - b.edgeDist);
                    selectedZone = insideZones[0].zone;
                    currentZone = selectedZone.name;
                } else if (nearZones.length > 0) {
                    nearZones.sort((a,b) => a.edgeDist - b.edgeDist);
                    selectedZone = nearZones[0].zone;
                    currentZone = "Vicino a: " + selectedZone.name;
                }

                if (currentZone === lastZoneName.current) {
                    stabilityCounter.current++;
                } else {
                    lastZoneName.current = currentZone;
                    stabilityCounter.current = 1;
                }

                if (stabilityCounter.current >= stabilityThreshold) {
                    if (currentZone !== zoneName) {
                        setZoneName(currentZone);
                        if (onZoneChange) onZoneChange(currentZone);
                    }
                }
            },
            (err) => {
                setStatus("error");
                console.error("Errore geolocalizzazione:", err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [onZoneChange, zoneName, stabilityThreshold]);

    const stopTracking = useCallback(() => {
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
        setCoords(null);
        setAccuracy(null);
        setZoneName("Fuori dalle aree conosciute");
        setStatus("idle");
    }, []);

    return { coords, accuracy, zoneName, status, startTracking, stopTracking };
}
