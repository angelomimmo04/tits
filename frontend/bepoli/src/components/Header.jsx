export default function Header() {
    return (
        <header className="header">
            <a href="/home">
                <img src="/logobepoli.png" alt="Logo" className="logo" id="logo" />
            </a>
            <nav className="nav">
                <a href="/profile">Profilo</a>
                <a href="/home" className="active">Home</a>
                <a href="/search">Cerca</a>
                <a href="#" onClick={inviaDatiUtente}>Messaggi</a>
            </nav>

            <div className="coords-nav">
                <p id="coords">Coordinate: --</p>
                <p id="location">Luogo: --</p>
                <p id="locationStatus">Attendere il rilevamento della posizione...</p>
                <p id="accuracy">Accuratezza: -- metri</p>
            </div>
        </header>
    );
}

function inviaDatiUtente() {
    const popup = window.open("", "_blank");
    if (!popup) return console.error("Popup bloccato");

    fetch("http://localhost:3000/api/auth-token", { credentials: "include" })
        .then(res => res.json())
        .then(({ token }) => {
            popup.location.href = `https://bepoliby-1-2.onrender.com?token=${token}`;
        })
        .catch(err => {
            popup.close();
            console.error(err);
        });
}
