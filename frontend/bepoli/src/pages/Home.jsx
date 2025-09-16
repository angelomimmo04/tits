import React, { useState } from "react";
import Header from "../components/Header";
import MonitorButtons from "../components/MonitorButtons";
import CreatePostForm from "../components/CreatePostForm";
import Feed from "../components/Feed";
import useGeolocation from "../components/hooks/useGeolocation";
import styles from "../assets/Home.module.css";

export default function Home({ user }) {
    // Stato GPS e manuale separati
    const [gpsZone, setGpsZone] = useState("Fuori dalle aree conosciute");
    const [manualZone, setManualZone] = useState("");

    // Hook geolocalizzazione
    const {
        coords,
        accuracy,
        status,
        startTracking,
        stopTracking,
    } = useGeolocation((detectedZone) => {
        // Aggiorna la zona solo se l'utente NON ha scelto manualmente
        if (!manualZone) {
            setGpsZone(detectedZone);
        }
    });

    // Zona corrente: se l'utente ha scelto manualmente, prende manualZone
    const currentLocation = manualZone || gpsZone;

    return (

            <div className={styles.homeWrapper}>
            <Header
                coords={coords}
                accuracy={accuracy}
                zoneName={currentLocation}
                status={status}
            />

            <MonitorButtons
                startTracking={startTracking}
                stopTracking={stopTracking}
                currentLocation={currentLocation}
                setCurrentLocation={setManualZone} // menu a tendina aggiorna manualZone
            />

            <CreatePostForm user={user} />
            <Feed key={currentLocation} location={currentLocation} />
                </div>

    );
}
