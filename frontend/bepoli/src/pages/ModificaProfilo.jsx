import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../assets/ModificaProfilePage.module.css";

export default function ModificaProfilo() {
    const [user, setUser] = useState(null);
    const [bio, setBio] = useState("");
    const [charCount, setCharCount] = useState(0);
    const [profilePic, setProfilePic] = useState(null);
    const [csrfToken, setCsrfToken] = useState("");
    const navigate = useNavigate();
    const maxLength = 66;

    useEffect(() => {
        async function init() {
            try {
                // Recupera utente loggato
                const userRes = await fetch("http://localhost:3000/api/user", { credentials: "include" });
                if (!userRes.ok) {
                    alert("Devi prima effettuare il login.");
                    navigate("/login");
                    return;
                }
                const userData = await userRes.json();
                setUser(userData);
                setBio(userData.bio || "");
                setCharCount((userData.bio || "").length);

                // Salva dati essenziali in sessionStorage
                const { _id, nome, username, bio } = userData;
                sessionStorage.setItem("user", JSON.stringify({ _id, nome, username, bio }));

                // Recupera CSRF token
                const csrfRes = await fetch("http://localhost:3000/csrf-token", { credentials: "include" });
                if (csrfRes.ok) {
                    const csrfData = await csrfRes.json();
                    setCsrfToken(csrfData.csrfToken);
                }
            } catch (err) {
                console.error("Errore durante l'inizializzazione:", err);
            }
        }
        init();
    }, [navigate]);

    const handleBioChange = (e) => {
        const value = e.target.value.slice(0, maxLength);
        setBio(value);
        setCharCount(value.length);
    };

    const handleFileChange = (e) => {
        setProfilePic(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append("bio", bio);
        if (profilePic) formData.append("profilePic", profilePic);

        try {
            const response = await fetch("http://localhost:3000/api/update-profile", {
                method: "POST",
                credentials: "include",
                headers: {
                    "csrf-token": csrfToken,
                },
                body: formData,
            });

            if (response.ok) {
                alert("Profilo aggiornato con successo!");
                navigate("/profile");
            } else {
                const errData = await response.json();
                alert("Errore durante il salvataggio: " + (errData.message || ""));
            }
        } catch (err) {
            alert("Errore di rete durante il salvataggio.");
            console.error(err);
        }
    };

    if (!user) return <p>Caricamento...</p>;

    return (
        <div className={styles.editProfilePage}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <img
                        className={styles.profileImg}
                        src={user._id ? `http://localhost:3000/api/user-photo/${user._id}` : "/fotoprofilo.png"}
                        alt="Profilo utente"
                        onError={(e) => (e.target.src = "/fotoprofilo.png")}
                    />
                </div>

                <form className={styles.form} onSubmit={handleSubmit} encType="multipart/form-data">
                    <label className={styles.label} htmlFor="bioInput">
                        Bio:
                    </label>
                    <textarea
                        id="bioInput"
                        className={styles.textarea}
                        value={bio}
                        onChange={handleBioChange}
                        maxLength={maxLength}
                    />
                    <div className={styles.charCount}>{charCount}/{maxLength}</div>

                    <label className={styles.label} htmlFor="profilePicInput">
                        Carica immagine profilo:
                    </label>
                    <input
                        type="file"
                        id="profilePicInput"
                        className={styles.fileInput}
                        accept="image/*"
                        onChange={handleFileChange}
                    />

                    <button type="submit" className={styles.button}>
                        Salva
                    </button>
                </form>

                <footer>
                    <img
                        className={styles.footerLogo}
                        src="/logobepoli.png"
                        alt="Logo"
                        onClick={() => navigate("/")}
                    />
                </footer>
            </div>
        </div>
    );
}
