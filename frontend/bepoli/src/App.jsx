import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./components/Login.jsx";
import SearchPage from "./pages/SearchPage.jsx"; // percorso corretto





import "./assets/style9.css";

export default function App() {
    const [user, setUser] = useState(() => {
        const savedUser = sessionStorage.getItem("user");
        return savedUser ? JSON.parse(savedUser) : null;
    });

    useEffect(() => {
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

                {/* Fallback */}
                <Route
                    path="*"
                    element={<Navigate to={user ? "/" : "/login"} />}
                />

                <Route path="/search" element={<SearchPage />} />

            </Routes>
        </Router>
    );
}
