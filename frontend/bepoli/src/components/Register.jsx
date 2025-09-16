import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import styles from "../assets/Register.module.css";

export default function Register() {
    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [csrfToken, setCsrfToken] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

    // --- Recupera token CSRF all'inizio ---
    useEffect(() => {
        fetch(`${BACKEND_URL}/csrf-token`, { credentials: "include" })
            .then(res => res.json())
            .then(data => setCsrfToken(data.csrfToken))
            .catch(err => console.error("Errore CSRF:", err));
    }, [BACKEND_URL]);

    // --- Animazione logo + redirect ---
    function startLogoTransition(redirectUrl) {
        const logo = document.querySelector(`.${styles.logo}`);
        if (logo) {
            logo.classList.add(styles.logoTransition);
            setTimeout(() => navigate(redirectUrl), 1200);
        } else {
            navigate(redirectUrl);
        }
    }

    // --- Registrazione tradizionale ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Le password non coincidono");
            return;
        }

        if (!csrfToken) {
            setError("CSRF token mancante, ricarica la pagina");
            return;
        }

        try {
            const res = await fetch(`${BACKEND_URL}/register`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "csrf-token": csrfToken
                },
                body: JSON.stringify({ nome: name, username, password }),
            });

            const contentType = res.headers.get("content-type");
            let data = {};
            if (contentType && contentType.includes("application/json")) {
                data = await res.json();
            } else {
                const text = await res.text();
                console.error("Risposta server non JSON:", text);
            }

            if (res.ok) {
                alert("Registrazione completata! Effettua il login.");
                navigate("/login");
            } else {
                setError(data.message || "Errore durante la registrazione");
            }
        } catch (err) {
            console.error("Errore di rete:", err);
            setError("Errore di rete");
        }
    };

    // --- Login Google ---
    useEffect(() => {
        window.handleCredentialResponse = async (response) => {
            try {
                const res = await fetch(`${BACKEND_URL}/auth/google`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_token: response.credential }),
                    credentials: "include",
                });

                if (!res.ok) throw new Error("Errore login Google");

                const data = await res.json();
                sessionStorage.setItem("user", JSON.stringify(data.user));
                alert("Login effettuato con successo!");
                startLogoTransition("/");
            } catch (err) {
                console.error(err);
                alert("Errore durante il login con Google");
            }
        };

        if (window.google) {
            window.google.accounts.id.initialize({
                client_id: "42592859457-ausft7g5gohk7mf96st2047ul9rk8o0v.apps.googleusercontent.com",
                callback: window.handleCredentialResponse,
            });

            window.google.accounts.id.renderButton(
                document.getElementById("googleSignInButton"),
                { theme: "outline", size: "large" }
            );

            window.google.accounts.id.prompt();
        }
    }, [BACKEND_URL]);

    return (
        <div className={styles.registerPage}>
            <header>
                <img src="/logobepoli.png" alt="Logo" className={styles.logo} />
            </header>

            <form onSubmit={handleSubmit} className={styles.form}>
                <h2>BePoli</h2>
                <h3>Condividi il momento, solo con chi lo vive</h3>

                <input
                    type="text"
                    placeholder="Name"
                    value={name}
                    required
                    onChange={(e) => setName(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    required
                    onChange={(e) => setUsername(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    required
                    onChange={(e) => setPassword(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    required
                    onChange={(e) => setConfirmPassword(e.target.value)}
                />

                <button type="submit" disabled={!csrfToken}>
                    Sign in
                </button>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.loginLink}>
                    <span>Sei già iscritto?</span> <Link to="/login">Accedi</Link>
                </div>
            </form>

            <span>oppure</span>
            <div id="googleSignInButton" className={styles.googleWrapper}></div>
        </div>
    );
}
