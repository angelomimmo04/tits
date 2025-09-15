import React, { useEffect, useState, useRef } from "react";

export default function SearchPage() {
    const [utenteLoggato, setUtenteLoggato] = useState(null);
    const [risultati, setRisultati] = useState([]);
    const [recenti, setRecenti] = useState([]);
    const [queryCorrente, setQueryCorrente] = useState("");
    const [paginaCorrente, setPaginaCorrente] = useState(1);
    const [fineLista, setFineLista] = useState(false);
    const [loading, setLoading] = useState(false);
    const timeoutRef = useRef(null);

    const limitePerPagina = 10;

    // Recupera utente loggato
    useEffect(() => {
        fetch("/api/user", { credentials: "include" })
            .then((res) => res.json())
            .then(setUtenteLoggato)
            .catch(() => setUtenteLoggato(null));
    }, []);

    // Mostra utenti recenti
    const mostraRecenti = () => {
        fetch("/api/recent-users", { credentials: "include" })
            .then((res) => res.json())
            .then(setRecenti)
            .catch(console.error);
    };

    useEffect(() => {
        mostraRecenti();
    }, []);

    const salvaInCronologia = (utente) => {
        fetch(`/api/visit-user/${utente.id}`, {
            method: "POST",
            credentials: "include",
        })
            .then(() => mostraRecenti())
            .catch(console.error);
    };

    const cercaUtente = async (query, page = 1) => {
        if (query.length < 1) {
            setRisultati([]);
            setPaginaCorrente(1);
            setFineLista(false);
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(
                `/api/search-users?q=${encodeURIComponent(query)}&page=${page}&limit=${limitePerPagina}`,
                { credentials: "include" }
            );

            if (!res.ok) {
                setFineLista(true);
                setRisultati([
                    { id: "error", username: `Errore ${res.status}` },
                ]);
                return;
            }

            const data = await res.json();
            let utenti = Array.isArray(data) ? data : Array.isArray(data.results) ? data.results : [];

            // Filtra l'utente loggato
            if (utenteLoggato) {
                utenti = utenti.filter((u) => u.id !== utenteLoggato._id && u.id !== utenteLoggato.id);
            }

            if (page === 1) {
                setRisultati(utenti);
                setFineLista(utenti.length < limitePerPagina);
            } else {
                setRisultati((prev) => [...prev, ...utenti]);
                setFineLista(utenti.length < limitePerPagina);
            }
            setPaginaCorrente(page);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        clearTimeout(timeoutRef.current);
        const value = e.target.value.trim();
        setQueryCorrente(value);
        setPaginaCorrente(1);
        timeoutRef.current = setTimeout(() => cercaUtente(value, 1), 300);
    };

    const handleLoadMore = () => {
        if (!fineLista && !loading) {
            cercaUtente(queryCorrente, paginaCorrente + 1);
        }
    };

    const renderUtente = (user) => (
        <div
            key={user.id || user._id}
            onClick={() => {
                salvaInCronologia(user);
                window.location.href = `/profile.html?id=${user.id || user._id}`;
            }}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                margin: "8px 0",
                borderRadius: "10px",
                cursor: "pointer",
                backgroundColor: "#fff",
                border: "1px solid #e1e4e8",
            }}
        >
            <img
                src={user.profilePicUrl || "fotoprofilo.png"}
                onError={(e) => (e.target.src = "fotoprofilo.png")}
                alt="avatar"
                style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid #ccc" }}
            />
            <strong>{user.username}</strong>
        </div>
    );

    return (
        <div style={{ padding: 20, fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", background: "#f7f9fc", color: "#333" }}>
            <h2>Cerca Utente</h2>
            <input
                type="text"
                placeholder="Scrivi un username..."
                value={queryCorrente}
                onChange={handleInputChange}
                style={{
                    width: "100%",
                    maxWidth: 400,
                    padding: "12px 16px",
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    fontSize: 16,
                    marginBottom: 20,
                }}
            />

            <div id="risultati">{risultati.map(renderUtente)}</div>
            {!fineLista && risultati.length > 0 && (
                <button className="btn" onClick={handleLoadMore} disabled={loading} style={{ margin: "10px auto", display: "block" }}>
                    {loading ? "Caricamento..." : "Carica altri"}
                </button>
            )}

            <h3>Visitati di recente</h3>
            <div id="recenti">{recenti.map(renderUtente)}</div>
        </div>
    );
}
