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


const distPath = path.join(__dirname, 'dist');

const CLIENT_ID =
    process.env.GOOGLE_CLIENT_ID ||
    "42592859457-ausft7g5gohk7mf96st2047ul9rk8o0v.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);

const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express();

// --- Middleware ---
const allowedOrigins = [
    "http://localhost:5173",
    "https://be-poli-pxil.onrender.com",
    "http://localhost:3000",
    "https://bepoli.onrender.com"
];

app.use(
    cors({
        origin: function(origin, callback) {
            if (!origin) return callback(null, true); // richieste senza origin (Postman, ecc.)
            if (allowedOrigins.indexOf(origin) === -1) {
                return callback(new Error(`CORS policy non permette l'origine ${origin}`), false);
            }
            return callback(null, true);
        },
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
            location: String,
            createdAt: { type: Date, default: Date.now },
        },
    ],
});
const Post = mongoose.model("Post", postSchema);

// --- Funzioni ---
function checkSession(req, res, next) {
    if (!req.session.user)
        return res.status(401).json({ message: "Non autorizzato" });
    next();
}

function getFingerprint(req) {
    return req.headers["user-agent"] || "";
}

function checkFingerprint(req, res, next) {
    if (!req.session.user) return res.status(401).json({ message: "Non autorizzato" });

    const currentFp = getFingerprint(req);
    const savedFp = req.session.fingerprint;

    if (!savedFp) {
        req.session.fingerprint = currentFp;
        return next();
    }

    if (savedFp !== currentFp) {
        req.session.destroy((err) => {
            if (err) console.error("Errore distruggendo sessione:", err);
            return res.status(403).json({ message: "Sessione invalida, login richiesto." });
        });
    } else {
        next();
    }
}



// CSRF con cookie
const csrfProtection = csrf({ cookie: true });

// Middleware per leggere CSRF token da header
app.use((req, res, next) => {
    if (req.headers["csrf-token"]) req.body._csrf = req.headers["csrf-token"];
    next();
});





// --- Rotte Auth ---
app.get("/csrf-token", csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.post("/register", csrfProtection, async (req, res) => {
    const { nome, username, password } = req.body;
    if (!nome || !username || !password)
        return res.status(400).json({ message: "Dati mancanti" });

    try {
        if (await Utente.findOne({ username }))
            return res.status(400).json({ message: "Username già esistente" });

        const hash = await bcrypt.hash(password, 10);
        const nuovoUtente = new Utente({
            nome,
            username,
            password: hash,
            bio: "",
            profilePic: { data: null, contentType: null },
        });

        await nuovoUtente.save();
        res.status(201).json({ message: "Registrazione completata" });
    } catch (err) {
        res.status(500).json({ message: "Errore server" });
    }
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
        req.session.fingerprint = getFingerprint(req);

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
                profilePic: { data: null, contentType: null },
            });
            await utente.save();
        }

        req.session.user = {
            id: utente._id,
            nome: utente.nome,
            username: utente.username,
        };
        req.session.fingerprint = getFingerprint(req);

        res.json({ message: "Login Google effettuato", user: req.session.user });
    } catch {
        res.status(401).json({ message: "Token non valido" });
    }
});

app.post("/logout", checkFingerprint, csrfProtection, (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ message: "Errore logout" });
        res.clearCookie("connect.sid");
        res.json({ message: "Logout effettuato" });
    });
});

app.get("/api/auth-token", checkFingerprint, (req, res) => {
    const payload = {
        id: req.session.user.id,
        username: req.session.user.username,
        nome: req.session.user.nome,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-jwt-secret", {
        expiresIn: "15m",
    });
    res.json({ token });
});

// --- Rotte Utente ---
app.get("/api/user", checkFingerprint, async (req, res) => {
    try {
        const user = await Utente.findById(req.session.user.id).select(
            "username nome bio followers following"
        );
        if (!user) return res.status(404).json({ message: "Utente non trovato" });

        res.json({
            _id: user._id,
            username: user.username,
            nome: user.nome,
            bio: user.bio,
            followersCount: user.followers.length,
            followingCount: user.following.length,
        });
    } catch {
        res.status(500).json({ message: "Errore server" });
    }
});

app.post("/api/update-profile", checkFingerprint, csrfProtection, upload.single("profilePic"), async (req, res) => {
    const userId = req.session.user.id;
    const updateData = {};
    if (req.body.bio) updateData.bio = req.body.bio;
    if (req.file) updateData.profilePic = { data: req.file.buffer, contentType: req.file.mimetype };

    try {
        const updated = await Utente.findByIdAndUpdate(userId, { $set: updateData }, { new: true });
        if (!updated) return res.status(404).json({ message: "Utente non trovato" });

        res.json({ message: "Profilo aggiornato" });
    } catch (err) {
        res.status(500).json({ message: "Errore salvataggio profilo" });
    }
});

app.get("/api/user-photo/:userId", async (req, res) => {
    try {
        const user = await Utente.findById(req.params.userId);
        if (!user?.profilePic?.data) return res.status(404).send("Nessuna foto");

        res.contentType(user.profilePic.contentType);
        res.send(user.profilePic.data);
    } catch {
        res.status(500).send("Errore immagine utente");
    }
});

app.get("/api/recent-users", checkFingerprint, async (req, res) => {
    try {
        const utente = await Utente.findById(req.session.user.id)
            .populate("utentiRecenti", "username nome _id")
            .exec();

        const recenti = utente.utentiRecenti.map((u) => ({
            id: u._id,
            username: u.username,
            nome: u.nome,
            profilePicUrl: `/api/user-photo/${u._id}`,
        }));

        res.json(recenti);
    } catch {
        res.status(500).json({ message: "Errore caricamento recenti" });
    }
});

// --- Ricerca utenti ---
app.get("/api/search-users", checkFingerprint, async (req, res) => {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!query) return res.status(400).json({ message: "Query mancante" });

    try {
        const results = await Utente.find({ username: new RegExp(query, "i") }, "username nome _id")
            .skip(skip)
            .limit(limit);

        res.json(
            results.map((u) => ({
                id: u._id,
                username: u.username,
                nome: u.nome,
                profilePicUrl: `/api/user-photo/${u._id}`,
            }))
        );
    } catch {
        res.status(500).json({ message: "Errore ricerca" });
    }
});

// --- Visit user ---
app.post("/api/visit-user/:id", checkFingerprint, async (req, res) => {
    const userId = req.session.user.id;
    const visitedId = req.params.id;

    if (userId === visitedId) return res.status(400).json({ message: "Non puoi visitare te stesso" });

    try {
        const utente = await Utente.findById(userId);
        if (!utente) return res.status(404).json({ message: "Utente non trovato" });

        utente.utentiRecenti = utente.utentiRecenti.filter(id => id.toString() !== visitedId);
        utente.utentiRecenti.unshift(visitedId);
        utente.utentiRecenti = utente.utentiRecenti.slice(0, 5);

        await utente.save();
        res.json({ message: "Utente salvato come visitato" });
    } catch (err) {
        console.error("Errore salvataggio visitato:", err);
        res.status(500).json({ message: "Errore server" });
    }
});

// --- Follow/Unfollow ---
app.post("/api/follow/:id", checkFingerprint, async (req, res) => {
    const followerId = req.session.user.id;
    const targetId = req.params.id;

    if (followerId === targetId)
        return res.status(400).json({ message: "Non puoi seguire te stesso" });

    try {
        const [follower, target] = await Promise.all([
            Utente.findById(followerId),
            Utente.findById(targetId)
        ]);
        if (!follower || !target)
            return res.status(404).json({ message: "Utente non trovato" });

        const isFollowing = follower.following.includes(target._id);
        if (isFollowing) {
            follower.following.pull(target._id);
            target.followers.pull(follower._id);
        } else {
            follower.following.addToSet(target._id);
            target.followers.addToSet(follower._id);
        }

        await Promise.all([follower.save(), target.save()]);
        res.json({
            following: !isFollowing,
            followersCount: target.followers.length,
            followingCount: follower.following.length
        });
    } catch (err) {
        console.error("Errore follow:", err);
        res.status(500).json({ message: "Errore follow" });
    }
});

// --- Follow info ---
app.get("/api/follow-info/:id", checkFingerprint, async (req, res) => {
    const viewerId = req.session.user.id;
    const targetId = req.params.id;

    try {
        const [viewer, target] = await Promise.all([
            Utente.findById(viewerId),
            Utente.findById(targetId)
        ]);
        if (!target || !viewer) return res.status(404).json({ message: "Utente non trovato" });

        const isFollowing = viewer.following.includes(target._id);

        res.json({
            followersCount: target.followers.length,
            followingCount: target.following.length,
            isFollowing
        });
    } catch {
        res.status(500).json({ message: "Errore follow-info" });
    }
});

// --- Rotte Post ---
app.post("/api/posts", checkFingerprint, upload.single("image"), async (req, res) => {
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

app.get("/api/posts", async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const locationFilter = (req.query.location || "").trim();

    try {
        const query = {};
        if (locationFilter && locationFilter !== "Fuori dalle aree conosciute") {
            query.location = {
                $regex: `(^${locationFilter}$|^Vicino a: ${locationFilter}$)`,
                $options: "i",
            };
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
            }))
        );
    } catch (err) {
        console.error("Errore caricamento post:", err);
        res.status(500).json({ message: "Errore caricamento post" });
    }
});

app.get("/api/post-image/:id", async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post?.image?.data) return res.status(404).send("Nessuna immagine");

        res.contentType(post.image.contentType);
        res.send(post.image.data);
    } catch {
        res.status(500).send("Errore immagine");
    }
});





// Serve tutti i file statici nella cartella assets
app.use('/assets', express.static(path.join(distPath, 'assets')));

app.use(express.static(distPath));


// API esempio
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello World' });
});

// Fallback SPA per tutte le altre richieste
app.use((req, res, next) => {
    // Se la richiesta è per API o file statico, passa oltre
    if (req.path.startsWith('/api') || req.path.includes('.')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
});





// Fallback SPA
app.use((req, res, next) => {
    // se la richiesta è per un file statico, passa oltre
    if (req.path.startsWith('/api') || req.path.includes('.')) return next();

    // altrimenti serve index.html
    res.sendFile(path.join(distPath, 'index.html'));
});



// --- Avvio server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server attivo su porta ${PORT}`));
