require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const CLIENT_ID =
    process.env.GOOGLE_CLIENT_ID ||
    "42592859457-ausft7g5gohk7mf96st2047ul9rk8o0v.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);

const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express();

// --- Middleware ---
app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: process.env.SESSION_SECRET || "dev-secret",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
            maxAge: 1000 * 60 * 30,
            httpOnly: true,
            secure: false,
            sameSite: "lax",
        },
    })
);

// CSRF con cookie
const csrfProtection = csrf({ cookie: true });

// Middleware per leggere CSRF token da header
app.use((req, res, next) => {
    if (req.headers["csrf-token"]) req.body._csrf = req.headers["csrf-token"];
    next();
});

// --- Database ---
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("Connesso a MongoDB"))
    .catch((err) => console.error("Connessione fallita:", err));

// --- Schemi ---
const utenteSchema = new mongoose.Schema({
    nome: String,
    username: { type: String, unique: true },
    password: String,
    bio: String,
    profilePic: { data: Buffer, contentType: String },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
    utentiRecenti: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
});
const Utente = mongoose.model("Utente", utenteSchema);

const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Utente" },
    desc: String,
    image: { data: Buffer, contentType: String },
    location: String,
    createdAt: { type: Date, default: Date.now },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
    comments: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "Utente" },
            text: String,
            createdAt: { type: Date, default: Date.now },
        },
    ],
});
const Post = mongoose.model("Post", postSchema);

// --- Funzioni ---
function checkSession(req, res, next) {
    if (!req.session.user) return res.status(401).json({ message: "Non autorizzato" });
    next();
}

// --- Rotte Auth ---
app.get("/csrf-token", csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.post("/login", csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ message: "Dati mancanti" });

    try {
        const utente = await Utente.findOne({ username });
        if (!utente || !(await bcrypt.compare(password, utente.password)))
            return res.status(400).json({ message: "Username o password errati" });

        req.session.user = {
            id: utente._id,
            nome: utente.nome,
            username: utente.username,
        };

        res.json({ message: "Login riuscito", user: req.session.user });
    } catch {
        res.status(500).json({ message: "Errore server" });
    }
});

app.post("/auth/google", async (req, res) => {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ message: "Token mancante" });

    try {
        const ticket = await client.verifyIdToken({
            idToken: id_token,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();

        let utente = await Utente.findOne({ username: payload.email });
        if (!utente) {
            utente = new Utente({
                nome: payload.name,
                username: payload.email,
                password: "",
                bio: "",
            });
            await utente.save();
        }

        req.session.user = {
            id: utente._id,
            nome: utente.nome,
            username: utente.username,
        };

        res.json({ message: "Login Google effettuato", user: req.session.user });
    } catch {
        res.status(401).json({ message: "Token non valido" });
    }
});

app.get("/api/auth-token", checkSession, (req, res) => {
    const payload = {
        id: req.session.user.id,
        username: req.session.user.username,
        nome: req.session.user.nome,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-jwt-secret", { expiresIn: "15m" });
    res.json({ token });
});

// --- Rotte Post ---
app.post("/api/posts", checkSession, upload.single("image"), async (req, res) => {
    try {
        const userId = req.session.user.id;
        const location = req.body.location || "Posizione sconosciuta";

        const newPost = new Post({
            userId,
            desc: req.body.desc,
            location,
            createdAt: new Date(),
            image: req.file ? { data: req.file.buffer, contentType: req.file.mimetype } : null,
        });

        await newPost.save();
        res.status(201).json(newPost);
    } catch (err) {
        console.error("Errore creazione post:", err);
        res.status(500).json({ message: "Errore del server" });
    }
});

// --- GET posts filtrando anche "Vicino a: " ---
app.get("/api/posts", async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const locationFilter = (req.query.location || "").trim();

    try {
        const query = {};
        if (locationFilter && locationFilter !== "Fuori dalle aree conosciute") {
            // regex per match esatto o "Vicino a: ..."
            query.location = { $regex: `(^${locationFilter}$|^Vicino a: ${locationFilter}$)`, $options: "i" };
        }

        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .populate("userId", "username nome _id")
            .populate("comments.userId", "username nome _id");

        res.json(
            posts.map((post) => ({
                _id: post._id,
                userId: { _id: post.userId._id, username: post.userId.username, nome: post.userId.nome },
                desc: post.desc,
                location: post.location,
                createdAt: post.createdAt,
                imageUrl: post.image?.data ? `/api/post-image/${post._id}` : null,
                likes: post.likes.length,
                comments: post.comments.length,
                commentsData: post.comments.map((c) => ({
                    text: c.text,
                    createdAt: c.createdAt,
                    userId: { _id: c.userId?._id, username: c.userId?.username, nome: c.userId?.nome },
                })),
            }))
        );
    } catch (err) {
        console.error("Errore caricamento post:", err);
        res.status(500).json({ message: "Errore caricamento post" });
    }
});

// --- Immagini pubbliche ---
app.get("/api/post-image/:id", async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post?.image?.data) return res.status(404).send("Nessuna immagine");

        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Access-Control-Allow-Origin", "http://localhost:5173");
        res.contentType(post.image.contentType);
        res.send(post.image.data);
    } catch {
        res.status(500).send("Errore immagine");
    }
});

app.get("/api/user-photo/:userId", async (req, res) => {
    try {
        const user = await Utente.findById(req.params.userId);
        if (!user?.profilePic?.data) return res.status(404).send("Nessuna foto");

        res.set("Access-Control-Allow-Credentials", "true");
        res.set("Access-Control-Allow-Origin", "http://localhost:5173");
        res.contentType(user.profilePic.contentType);
        res.send(user.profilePic.data);
    } catch {
        res.status(500).send("Errore immagine utente");
    }
});

// --- Like e Commenti ---
app.post("/api/posts/:id/like", checkSession, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: "Post non trovato" });

        const userId = req.session.user.id;
        const index = post.likes.indexOf(userId);

        if (index === -1) post.likes.push(userId);
        else post.likes.splice(index, 1);

        await post.save();
        res.json({ likes: post.likes.length });
    } catch (err) {
        console.error("Errore like:", err);
        res.status(500).json({ message: "Errore like" });
    }
});

app.post("/api/posts/:id/comment", checkSession, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ message: "Post non trovato" });

        const newComment = { text: req.body.text, userId: req.session.user.id };
        post.comments.push(newComment);
        await post.save();

        res.json({ comments: post.comments.length, comment: newComment });
    } catch (err) {
        console.error("Errore commento:", err);
        res.status(500).json({ message: "Errore commento" });
    }
});

// --- Serve SPA React ---
app.use(express.static(path.join(__dirname, "public")));

// --- Avvio server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server attivo su porta ${PORT}`));
