export default function Header({ coords, accuracy, zoneName, status }) {
    return (
        <header className="header">
            <a href="/home">
                <img
                    src="/logobepoli.png"
                    alt="Logo"
                    className="logo"
                    id="logo"
                />
            </a>

            <nav className="nav">
                <a href="/profile">Profilo</a>
                <a href="/home" className="active">
                    Home
                </a>
                <a href="/search">Cerca</a>
                <a href="#" onClick={inviaDatiUtente}>
                    Messaggi
                </a>
            </nav>

            <div className="coords-nav">
                <p>
                    Coordinate:{" "}
                    {coords
                        ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`
                        : "--"}
                </p>
                <p>Luogo: {zoneName}</p>
                <p>
                    {status === "tracking"
                        ? "Posizione rilevata"
                        : status === "error"
                            ? "Errore nel rilevamento"
                            : "Monitoraggio non attivo"}
                </p>
                <p>
                    Accuratezza: {accuracy ? `${Math.round(accuracy)} m` : "--"}
                </p>
            </div>
        </header>
    );
}

function inviaDatiUtente() {
    const popup = window.open("", "_blank");
    if (!popup) return console.error("Popup bloccato");

    fetch("http://localhost:3000/api/auth-token", { credentials: "include" })
        .then((res) => res.json())
        .then(({ token }) => {
            popup.location.href = `https://bepoliby-1-2.onrender.com?token=${token}`;
        })
        .catch((err) => {
            popup.close();
            console.error(err);
        });
}
