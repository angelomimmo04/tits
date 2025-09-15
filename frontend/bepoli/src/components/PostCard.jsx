// PostCard.jsx
import { useState } from "react";

export default function PostCard({ post, index, handleLike, handleComment }) {
    const [showComments, setShowComments] = useState(false);
    const [commentInput, setCommentInput] = useState("");

    return (
        <article className="post-card">
            <header className="post-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <img
                        src={`/api/user-photo/${post.userId._id}`}
                        alt="Profilo"
                        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                        onError={(e) => (e.target.src = "fotoprofilo.png")}
                    />
                    <a href={`/profile/${post.userId._id}`} style={{ color: "blue", textDecoration: "none" }}>
                        {post.userId.nome || "Utente"}
                    </a>
                </div>
                <p>{post.location || "Posizione sconosciuta"}</p>
                <time>{new Date(post.createdAt).toLocaleString("it-IT")}</time>
            </header>

            {post.imageUrl && (
                <div className="post-image-container">
                    <img
                        src={post.imageUrl}
                        alt="Post"
                        style={{ maxWidth: "100%" }}
                        onError={(e) => (e.target.src = "placeholder.png")}
                    />
                </div>
            )}

            <div className="post-actions">
                <button onClick={() => handleLike(post._id, index)}>❤ {post.likes}</button>
                <button onClick={() => setShowComments(!showComments)}>💬 {post.comments}</button>
            </div>

            <div>
                <p>{post.desc}</p>
            </div>

            {showComments && (
                <div>
                    {post.commentsData?.map((c, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <img
                                src={c.userId?._id ? `/api/user-photo/${c.userId._id}` : "fotoprofilo.png"}
                                alt="comment-user"
                                style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
                                onError={(e) => (e.target.src = "fotoprofilo.png")}
                            />
                            <div>
                                <strong>{c.userId?.nome || "Utente"}</strong>: {c.text}
                                <br />
                                <span>{new Date(c.createdAt).toLocaleString("it-IT")}</span>
                            </div>
                        </div>
                    ))}

                    <input
                        type="text"
                        placeholder="Scrivi un commento..."
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        onKeyDown={async (e) => {
                            if (e.key === "Enter" && commentInput.trim()) {
                                await handleComment(post._id, index, commentInput);
                                setCommentInput("");
                            }
                        }}
                    />
                </div>
            )}
        </article>
    );
}
