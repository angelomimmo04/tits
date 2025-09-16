import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function ProfilePage() {
    const [user, setUser] = useState(null);
    const [isOwnProfile, setIsOwnProfile] = useState(false);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalType, setModalType] = useState("followers");
    const [modalUsers, setModalUsers] = useState([]);
    const [modalPage, setModalPage] = useState(1);
    const [modalHasMore, setModalHasMore] = useState(true);

    const { id } = useParams();
    const navigate = useNavigate();

    // Carica dati utente
    useEffect(() => {
        async function loadUser() {
            try {
                let res;
                if (id) {
                    res = await fetch(`/api/user-public/${id}`, { credentials: "include" });
                    setIsOwnProfile(false);
                } else {
                    res = await fetch("/api/user", { credentials: "include" });
                    setIsOwnProfile(true);
                }
                if (!res.ok) throw new Error("Utente non trovato");
                const data = await res.json();

                // se non è il proprio profilo, chiedo anche follow-info
                if (id) {
                    try {
                        const followRes = await fetch(`/api/follow-info/${data._id}`, {
                            credentials: "include",
                        });
                        if (followRes.ok) {
                            const followData = await followRes.json();
                            data.isFollowing = followData.isFollowing;
                        }
                    } catch {}
                }

                setUser(data);
            } catch (err) {
                console.error(err);
                navigate("/login");
            }
        }
        loadUser();
    }, [id, navigate]);

    // Carica post utente
    useEffect(() => {
        if (!user) return;
        async function loadPosts() {
            try {
                const userId = user._id;
                const res = await fetch(`/api/user/${userId}/posts?page=1&pageSize=10`, {
                    credentials: "include",
                });
                if (!res.ok) {
                    console.error("Errore HTTP:", res.status, await res.text());
                    setPosts([]);
                    return;
                }
                const data = await res.json();
                setPosts(data);
            } catch (err) {
                console.error("Errore caricamento post", err);
            } finally {
                setLoading(false);
            }
        }
        loadPosts();
    }, [user]);

    // Follow/unfollow
    const handleFollowToggle = async () => {
        if (!user) return;
        try {
            const res = await fetch(`/api/follow/${user._id}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
            });
            const result = await res.json();
            if (res.ok) {
                setUser((prev) => ({
                    ...prev,
                    followersCount: result.followersCount,
                    isFollowing: result.following,
                }));
            } else {
                alert("Errore: " + result.message);
            }
        } catch (err) {
            console.error("Errore follow/unfollow", err);
        }
    };

    // Apri modale followers/following
    const openModal = async (type) => {
        setModalType(type);
        setModalUsers([]);
        setModalPage(1);
        setModalHasMore(true);
        setModalOpen(true);
        await loadMoreUsers(type, 1);
    };

    // Carica utenti nella modale
    const loadMoreUsers = async (type = modalType, page = modalPage) => {
        if (!user || !modalHasMore) return;
        const userId = user._id;
        const endpoint =
            type === "followers"
                ? `/api/user/${userId}/followers?page=${page}&limit=9`
                : `/api/user/${userId}/following?page=${page}&limit=9`;
        try {
            const res = await fetch(endpoint, { credentials: "include" });
            if (!res.ok) return;
            const data = await res.json();
            const users = type === "followers" ? data.followers : data.following;
            setModalUsers((prev) => [...prev, ...users]);
            setModalPage(page + 1);
            setModalHasMore(users.length >= 9);
        } catch (err) {
            console.error("Errore caricamento utenti modale", err);
        }
    };

    const apriProfiloUtente = (u) => {
        if ((u._id || u.id) === user._id) {
            navigate("/profile");
        } else {
            navigate(`/profile/${u._id || u.id}`);
        }
        setModalOpen(false);
    };

    if (!user) return <p>Caricamento...</p>;

    const userId = user._id;

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
            <header>
                <img
                    src="/logobepoli.png"
                    alt="Logo"
                    id="logo"
                    style={{ height: 40, cursor: "pointer" }}
                    onClick={() => navigate("/")}
                />
            </header>

            <div id="info" style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <img
                    src={`/api/user-photo/${userId}`}
                    alt="Profilo"
                    style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover" }}
                    onError={(e) => (e.target.src = "/fotoprofilo.png")}
                />
                <div>
                    <p>@{user.username}</p>
                    <h2>{user.nome}</h2>
                    <p>{user.bio || "Nessuna bio"}</p>

                    <div style={{ display: "flex", gap: 15, marginTop: 10 }}>
                        <span style={{ cursor: "pointer" }} onClick={() => openModal("followers")}>
                            Follower: {user.followersCount || 0}
                        </span>
                        <span style={{ cursor: "pointer" }} onClick={() => openModal("following")}>
                            Seguiti: {user.followingCount || 0}
                        </span>
                        <span>Post: {posts.length}</span>
                    </div>

                    {isOwnProfile ? (
                        <button className="btn" onClick={() => navigate("/modificaprofilo")}>
                            Modifica profilo
                        </button>
                    ) : (
                        <button className="btn" onClick={handleFollowToggle}>
                            {user.isFollowing ? "Smetti di seguire" : "Segui"}
                        </button>
                    )}
                </div>
            </div>

            <hr />

            <h3>{isOwnProfile ? "I tuoi post" : "Post"}</h3>
            {loading ? (
                <p>Caricamento post...</p>
            ) : (
                <div
                    style={{
                        marginTop: 20,
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                        gap: 16,
                    }}
                >
                    {posts.map((p) => (
                        <div
                            key={p._id}
                            className="post-card"
                            style={{ border: "1px solid #ccc", borderRadius: 10, padding: 10 }}
                        >
                            {p.imageUrl && (
                                <img
                                    src={p.imageUrl}
                                    alt="Post"
                                    style={{
                                        width: "100%",
                                        borderRadius: 8,
                                        maxHeight: 300,
                                        objectFit: "cover",
                                    }}
                                />
                            )}
                            <div className="post-desc">{p.desc}</div>
                            <div className="post-meta">
                                ❤️ {p.likes} | 💬 {p.comments}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODALE */}
            {modalOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                    onClick={() => setModalOpen(false)}
                >
                    <div
                        style={{
                            background: "#fff",
                            padding: 20,
                            borderRadius: 8,
                            width: "80%",
                            maxWidth: 500,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2>{modalType === "followers" ? "Follower" : "Seguiti"}</h2>
                        <ul style={{ listStyle: "none", padding: 0 }}>
                            {modalUsers.map((u) => (
                                <li
                                    key={u._id || u.id}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "8px 0",
                                        cursor: "pointer",
                                    }}
                                    onClick={() => apriProfiloUtente(u)}
                                >
                                    <img
                                        src={`/api/user-photo/${u._id || u.id}`}
                                        alt="Foto profilo"
                                        style={{ width: 32, height: 32, borderRadius: "50%" }}
                                        onError={(e) => (e.target.src = "/fotoprofilo.png")}
                                    />
                                    <span>@{u.username}</span>
                                </li>
                            ))}
                        </ul>
                        {modalHasMore && (
                            <button className="btn" onClick={() => loadMoreUsers()}>
                                Carica altri
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
