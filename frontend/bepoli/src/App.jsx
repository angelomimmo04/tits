import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Header from "./components/Header";
import MonitorButtons from "./components/MonitorButtons";
import CreatePostForm from "./components/CreatePostForm";
import Feed from "./components/Feed";
import Login from "./components/Login.jsx";

import "./assets/style9.css";

function Home({ user }) {
    return (
        <div>
            <Header />
            <CreatePostForm user={user} />
            <Feed /> {/* Usa il Feed avanzato con like, commenti, immagini e paginazione */}
        </div>
    );
}

export default function App() {
    const [user, setUser] = useState(() => {
        // Recupera utente salvato in sessionStorage
        const savedUser = sessionStorage.getItem("user");
        return savedUser ? JSON.parse(savedUser) : null;
    });

    useEffect(() => {
        // Animazione logo
        const playAnimation = sessionStorage.getItem("playLogoAnimation");
        if (playAnimation === "true") {
            const logo = document.getElementById("logo");
            if (logo) logo.classList.add("logo-entrance");
            sessionStorage.removeItem("playLogoAnimation");
        }
    }, []);

    return (
        <Router>
            <Routes>
                {/* Login */}
                <Route
                    path="/login"
                    element={user ? <Navigate to="/" /> : <Login onLogin={setUser} />}
                />

                {/* Home protetta */}
                <Route
                    path="/"
                    element={user ? <Home user={user} /> : <Navigate to="/login" />}
                />

                {/* Fallback per qualsiasi altro percorso */}
                <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} />
            </Routes>
        </Router>
    );
}
