import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

import styles from "../assets/Login.module.css";

export default function Login({ onLogin }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [csrfToken, setCsrfToken] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

    // --- Redirect se già loggato ---
    useEffect(() => {
        const user = sessionStorage.getItem("user");
        try {
            const parsedUser = JSON.parse(user);
            if (parsedUser && parsedUser.username) {
                sessionStorage.setItem("playLogoAnimation", "true");
                navigate("/");
            }
        } catch {
            console.log("Utente non loggato o sessione malformata");
        }
    }, [navigate]);

    // --- Recupera token CSRF ---
    useEffect(() => {
        fetch(`${BACKEND_URL}/csrf-token`, { credentials: "include" })
            .then((res) => res.json())
            .then((data) => setCsrfToken(data.csrfToken))
            .catch((err) => console.error("Errore CSRF:", err));
    }, [BACKEND_URL]);

    // --- Animazione logo + redirect ---
    const startLogoTransition = (redirectUrl) => {
        const logo = document.querySelector(`.${styles.logo}`);
        if (logo) {
            logo.classList.add(styles.logoTransition);
            setTimeout(() => navigate(redirectUrl), 1200);
        } else {
            navigate(redirectUrl);
        }
    };

    // --- Ottieni JWT ---
    const fetchAuthToken = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth-token`, {
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                sessionStorage.setItem("token", data.token);
            }
        } catch (err) {
            console.error("Errore fetchAuthToken:", err);
        }
    };

    // --- Login tradizionale ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${BACKEND_URL}/login`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "csrf-token": csrfToken,
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();
            if (res.ok) {
                sessionStorage.setItem("user", JSON.stringify(data.user));
                await fetchAuthToken();
                onLogin(data.user);
                sessionStorage.setItem("playLogoAnimation", "true");
                startLogoTransition("/");
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError("Errore di rete");
            console.error(err);
        }
    };

    // --- Login Google ---
    useEffect(() => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);

        script.onload = () => {
            if (!window.google) return;

            window.google.accounts.id.initialize({
                client_id:
                    "42592859457-ausft7g5gohk7mf96st2047ul9rk8o0v.apps.googleusercontent.com",
                callback: async (response) => {
                    try {
                        const res = await fetch(`${BACKEND_URL}/auth/google`, {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id_token: response.credential }),
                        });

                        if (!res.ok) throw new Error("Errore login Google");
                        const data = await res.json();
                        sessionStorage.setItem("user", JSON.stringify(data.user));
                        await fetchAuthToken();
                        onLogin(data.user);
                        sessionStorage.setItem("playLogoAnimation", "true");
                        startLogoTransition("/");
                    } catch (err) {
                        console.error(err);
                        alert("Errore durante login Google");
                    }
                },
            });

            const buttonDiv = document.getElementById("googleSignInButton");
            if (buttonDiv) {
                window.google.accounts.id.renderButton(buttonDiv, {
                    theme: "outline",
                    size: "large",
                });
                window.google.accounts.id.prompt();
            }
        };

        return () => document.body.removeChild(script);
    }, [onLogin, BACKEND_URL]);

    return (
        <div className={styles.loginPage}>
            <header>
                <img src="/logobepoli.png" alt="Logo" className={styles.logo} />
            </header>

            <form onSubmit={handleSubmit} className={styles.formBox}>
                <h2 className={styles.scritta}>BePoli</h2>
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
                <button type="submit">Login</button>
                {error && <p style={{ color: "red" }}>{error}</p>}
                <div className={styles.loginLink}>
                    <span>Non hai un account?</span>
                    <Link to="/register">Iscriviti</Link>
                </div>
            </form>

            <span>oppure</span>
            <div id="googleSignInButton" className={styles.googleButton}></div>
        </div>
    );
}
