import React from "react";

export default function MonitorButtons({ currentLocation, setCurrentLocation, startTracking, stopTracking }) {
    // Gestione cambio selezione nel menu a tendina
    const handleSelectChange = (e) => {
        const selectedZone = e.target.value || "Fuori dalle aree conosciute";
        setCurrentLocation(selectedZone);
        console.log("Zona selezionata dal menu:", selectedZone); // log debug
    };

    return (
        <div className="monitor-buttons">
            {/* Bottoni monitoraggio */}
            <button className="monitor-btn start" onClick={startTracking}>
                ▶ Avvia Monitoraggio
            </button>
            <button className="monitor-btn stop" onClick={stopTracking}>
                ⛔ Ferma Monitoraggio
            </button>

            {/* Menu a tendina per posizione */}
            <div className="location-filter" style={{ marginTop: "10px" }}>
                <label htmlFor="locationSelect">Scegli posizione:</label>
                <select
                    id="locationSelect"
                    value={currentLocation === "Fuori dalle aree conosciute" ? "" : currentLocation}
                    onChange={handleSelectChange}
                >
                    <option value="">Tutte le posizioni</option>
                    <option value="architettura">architettura</option>
                    <option value="Atrio">Atrio</option>
                    <option value="Aula Magna">Aula Magna</option>
                    <option value="Bar">Bar</option>
                    <option value="casa dell'acqua">casa dell'acqua</option>
                    <option value="classi A-C">classi A-C</option>
                    <option value="classi D-AM">classi D-AM</option>
                    <option value="classi G-I">classi G-I</option>
                    <option value="classi L-N">classi L-N</option>
                    <option value="control room">control room</option>
                    <option value="Cortile">Cortile</option>
                    <option value="Corridoio Aule A-I">Corridoio Aule A-I</option>
                    <option value="Corridoio Aule D-L">Corridoio Aule D-L</option>
                    <option value="DEI">DEI</option>
                    <option value="entrata orabona">entrata orabona</option>
                    <option value="entrata re david">entrata re david</option>
                    <option value="Poli library">Poli library</option>
                    <option value="Radio Frequenza Libera">Radio Frequenza Libera</option>
                    <option value="Student">Student</option>
                </select>
            </div>
        </div>
    );
}
