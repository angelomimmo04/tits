import { useEffect, useState } from "react";
import PostCard from "./PostCard";

export default function Feed({ location }) {
    const [posts, setPosts] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [finished, setFinished] = useState(false);
    const [loading, setLoading] = useState(false);

    const pageSize = 10;

    // Funzione per caricare post filtrati
    const caricaPost = async (page = 1) => {
        if (loading || finished) return;
        setLoading(true);

        try {
            const locationParam = encodeURIComponent(
                (location || "Fuori dalle aree conosciute").replace(/^Vicino a:\s*/, "").trim()
            );

            console.log("Richiesta post per location:", locationParam);

            const res = await fetch(
                `/api/posts?page=${page}&pageSize=${pageSize}&location=${locationParam}`,
                { credentials: "include" }
            );

            if (!res.ok) throw new Error(`Errore ${res.status}`);
            const data = await res.json();

            // Se è la prima pagina sostituisci, altrimenti aggiungi
            setPosts(page === 1 ? data : [...posts, ...data]);
            setCurrentPage(page);
            setFinished(data.length < pageSize);

            console.log(`Post caricati (${data.length}):`, data);
        } catch (err) {
            console.error("Errore nel caricamento post:", err);
        } finally {
            setLoading(false);
        }
    };

    // Gestione like
    const handleLike = async (postId, index) => {
        try {
            const res = await fetch(`/api/posts/${postId}/like`, { method: "POST", credentials: "include" });
            if (!res.ok) throw new Error(`Errore like ${res.status}`);
            const updated = await res.json();
            setPosts(posts.map((p, i) => (i === index ? { ...p, likes: updated.likes } : p)));
        } catch (err) {
            console.error("Errore like:", err);
        }
    };

    // Gestione commenti
    const handleComment = async (postId, index, text) => {
        if (!text.trim()) return;

        try {
            const res = await fetch(`/api/posts/${postId}/comment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ text }),
            });
            if (!res.ok) throw new Error(`Errore commento ${res.status}`);
            const updated = await res.json();

            if (updated.comment) {
                setPosts(posts.map((p, i) =>
                    i === index
                        ? { ...p, comments: updated.comments, commentsData: [...(p.commentsData || []), updated.comment] }
                        : p
                ));
            }
        } catch (err) {
            console.error("Errore commento:", err);
        }
    };

    // Aggiorna il feed ogni volta che cambia la location
    useEffect(() => {
        setFinished(false); // resetta stato "finito" quando cambia location
        caricaPost(1);
    }, [location]);

    return (
        <main className="feed-container">
            {posts.map((post, i) => (
                <PostCard
                    key={post._id}
                    post={post}
                    index={i}
                    handleLike={handleLike}
                    handleComment={handleComment}
                />
            ))}

            {!finished && (
                <button onClick={() => caricaPost(currentPage + 1)} disabled={loading}>
                    {loading ? "Caricamento..." : "Carica altri"}
                </button>
            )}
        </main>
    );
}
