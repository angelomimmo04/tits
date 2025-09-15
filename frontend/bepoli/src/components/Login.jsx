import { useState, useEffect } from "react";

export default function Login({ onLogin }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [csrfToken, setCsrfToken] = useState("");
    const [error, setError] = useState("");

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
    console.log("BACKEND_URL:", BACKEND_URL); // controlla che stampi l'URL corretto

    // Recupera token CSRF dal server
    useEffect(() => {
        fetch(`${BACKEND_URL}/csrf-token`, { credentials: "include" })
            .then((res) => res.json())
            .then((data) => {
                console.log("CSRF ricevuto:", data.csrfToken);
                setCsrfToken(data.csrfToken);
            })
            .catch((err) => console.error("Errore CSRF:", err));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${BACKEND_URL}/login`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "csrf-token": csrfToken, // token inviato nell'header
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();
            if (res.ok) {
                sessionStorage.setItem("user", JSON.stringify(data.user));
                await fetchAuthToken();
                onLogin(data.user);
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError("Errore di rete");
            console.error(err);
        }
    };

    async function fetchAuthToken() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth-token`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                sessionStorage.setItem("token", data.token);
            }
        } catch (err) {
            console.error("Errore fetchAuthToken:", err);
        }
    }

    // Login Google
    useEffect(() => {
        window.handleCredentialResponse = async (response) => {
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
            } catch (err) {
                console.error(err);
                alert("Errore durante login Google");
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
    }, [onLogin]);

    return (
        <div className="login-page" style={{ textAlign: "center", padding: "20px" }}>
            <header>
                <img src="/logobepoli.png" alt="Logo" className="logo" />
            </header>
            <form onSubmit={handleSubmit} style={{ maxWidth: "400px", margin: "20px auto" }}>
                <h2>BePoli</h2>
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
            </form>
            <div>
                <span>oppure</span>
                <div id="googleSignInButton" style={{ marginTop: "10px" }}></div>
            </div>
        </div>
    );
}
