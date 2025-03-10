import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import {Strategy} from "passport-local";
import { fileURLToPath } from "url";
import path from "path";
import flash from "connect-flash";
import "dotenv/config";

const app = express();
const port = process.env.PORT;
const saltRounds = 10;

// DATABASE CONNECTION TO SUPABASE
const {Pool} = pg;
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
db.connect((err) => {
    if (err) throw err
    console.log("Connect to PostgreSQL successfully!")
});

// SET EJS TEMPLATE
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// MIDDLEWARE AND STYLING FOLDER
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

// SESSION INITIALIZE
app.use(session({
    secret: "booktracker",
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
    }
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

app.use((req, res, next) => {
    res.locals.successMessage = req.flash("success");
    res.locals.errorMessage = req.flash("error");
    next();
});

// GET ROUTES
app.get("/", (req, res) => {
    res.render("index.ejs");
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

// DISPLAY BOOKS - ADMIN
app.get("/admin", async (req, res) => {
    if(!req.isAuthenticated()) {
        res.redirect("/");
    }

    try {
        const result = await db.query("SELECT * FROM tracker");
            const bookData = result.rows.slice(0, 3);
            res.render("admin.ejs", {
                data: bookData,
                searchTerm: "",
                allBooks: bookData,
                user: req.user
            });
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching data");
    }
});

// DISPLAY BOOKS - USER
app.get("/user", async (req, res) => {
    if(!req.isAuthenticated()) {
        res.redirect("/");
    }

    const sectionId = req.user["section_id"];
    const userId = req.user["id"];

    try {
        const result = await db.query("SELECT * FROM tracker WHERE section_id = $1 AND user_id = $2", [
            sectionId, userId
        ]);
            const bookData = result.rows.slice(0, 3);
            res.render("user.ejs", {
                data: bookData,
                searchTerm: "",
                allBooks: bookData, 
                user: req.user
            });
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching data");
    }
});

// SEARCH BOOKS - ADMIN
app.get("/searchadmin", async (req, res) => {
    const getSearch = req.query.search;
        
    try {
        const result = await db.query("SELECT * FROM tracker WHERE (book_name ILIKE $1 OR date_received ILIKE $1)", [
            getSearch
        ]);
            const bookData = result.rows;
            res.render("admin.ejs", {
                data: bookData,
                searchTerm: getSearch,
                allBooks: await db.query("SELECT * FROM tracker"),
                user: req.user
            });
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching data");
    }

});

// SEARCH BOOKS - USER
app.get("/search", async (req, res) => {
    const getSearch = req.query.search;
    const sectionId = req.user["section_id"];
    const userId = req.user["id"];
        
    try {
        const result = await db.query("SELECT * FROM tracker WHERE (book_name ILIKE $1 OR date_received ILIKE $1) AND (section_id = $2 AND user_id = $3)", [
            getSearch, sectionId, userId
        ]);
            const bookData = result.rows;
            res.render("user.ejs", {
                data: bookData,
                searchTerm: getSearch,
                allBooks: await db.query("SELECT * FROM tracker"),
                user: req.user
            });
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching data");
    }

});

// USER REGISTRATION - GET ALL SECTIONS
app.get("/register", async (req, res) => {
    try {
        const getSection = await db.query("SELECT * FROM sections ORDER BY id ASC");
        res.render("register.ejs", {
            sections: getSection.rows
        });
    } catch (err) {
        console.log(err);
        res.status(500).send("Error fetching data");
    }
});

// EDIT - DISPLAY SPECIFIC RECORD
app.get("/edit/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query("SELECT * FROM tracker WHERE book_id = $1", [ id ]);
        if (result.rows.length > 0) {
            res.render("edit.ejs", {
                data: result.rows[0],
                user: req.user
            });
        } else {
            res.status(404).send("Record not found");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Error Fetching Record");
    }
});

// DELETE - ADMIN
app.get("/delete/:id", async (req, res) => {
    const bookId = req.params.id;

    try {
        await db.query("DELETE FROM tracker WHERE book_id = $1", [bookId]);
        req.flash("success", "Data deleted successfully");
        res.redirect("/admin");
    } catch (err) {
        console.log(err);
        req.flash("error", err.message);
        res.status(500).send("Error Deleting Data");
    }
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if(err) {
            return next(err);
        }
        res.redirect("/");
    });
});



// UPDATE RETURNED BOOKS - ADMIN
app.post("/update", async(req, res) => {
    try {
        for (const key in req.body) {
            if(req.body.hasOwnProperty(key)) {
                const recordID = key.split('_')[1];
                const isChecked = req.body[key] === "on";

                await db.query("UPDATE tracker SET returned = $1 WHERE book_id = $2 ", [isChecked, recordID]);
            }
        }
        req.flash("success", "Returned books updated successfully");
        res.redirect("/admin");
    } catch (err) {
        console.log("Error updating records", err);
        req.flash("error", err.message);
        res.status(500).send("Server error");
    }
});



// EDIT BOOK - ADMIN
app.post("/edit/:id", async (req, res) => {
    const { id } = req.params;
    const { book_name, date_received, good, damage, total } = req.body;

    try {
        await db.query("UPDATE tracker SET book_name = $1, date_received = $2, good = $3, damage = $4, total = $5 WHERE book_id = $6", [
            book_name, date_received, good, damage, total, id
        ]);
        res.redirect("/admin");
    } catch (err) {
        console.log(err);
        res.status(500).send("Error Updating Item");
    }
});



// EDIT BOOK - USER
app.post("/editBookUser/:id", async (req, res) => {
    const { id } = req.params;
    const { book_name, date_received, good, damage, total } = req.body;

    try {
        await db.query("UPDATE tracker SET book_name = $1, date_received = $2, good = $3, damage = $4, total = $5 WHERE book_id = $6", [
            book_name, date_received, good, damage, total, id
        ]);
        res.redirect("/user");
    } catch (err) {
        console.log(err);
        res.status(500).send("Error Updating Item");
    }
});



// INSERT BOOKS - USER
app.post("/submit", async (req, res) => {
    const bookName = req.body["bookName"];
    const dateReceived = req.body["dateReceived"];
    const good = req.body["good"];
    const damage = req.body["damage"];
    const total = req.body["total"];
    const sectionId = req.user["section_id"];
    const userId = req.user["id"];

    try {
        await db.query("INSERT INTO tracker (book_name, date_received, good, damage, total, section_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
            bookName, dateReceived, good, damage, total, sectionId, userId
        ]);
        req.flash("success", "Book inserted successfully");
        res.redirect("/user");
    } catch (err) {
        req.flash("error", err.message);
        res.send(err);
    }
});

// INSERT BOOKS - ADMIN
app.post("/submitAdmin", async (req, res) => {
    const bookName = req.body["bookName"];
    const dateReceived = req.body["dateReceived"];
    const good = req.body["good"];
    const damage = req.body["damage"];
    const total = req.body["total"];
    const sectionId = req.user["section_id"];
    const userId = 1;

    try {
        await db.query("INSERT INTO tracker (book_name, date_received, good, damage, total, section_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
            bookName, dateReceived, good, damage, total, sectionId, userId
        ]);
        req.flash("success", "Book Inserted successfully");
        res.redirect("/admin");
    } catch (err) {
        req.flash("error", err.message);
        res.send(err);
    }
});

// REGISTER USER
app.post("/register", async (req, res) => {
    const name = req.body["name"];
    const username = req.body["username"];
    const password = req.body["password"];
    const role = "user";
    const sectionId = req.body["section"];

    try {
        const checkEmail = await db.query("SELECT * FROM users WHERE username = $1",[
            username
        ]);

        if (checkEmail.rows.length > 0) {
            res.send("Username already exist");
        } else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    res.send(err);
                } else {
                    const insertUser = await db.query("INSERT INTO users (name, username, password, role, section_id) VALUES ($1, $2, $3, $4, $5)", [
                        name, username, hash, role, sectionId
                    ]);
                    res.render("login.ejs");
                }
            });
        }
    } catch (err) {
        console.log(err);
    }
});



// LOGIN
app.post("/login", passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/login",
    failureFlash: true
}), (req, res, next) => {
    console.log("User Authenticated");
    next();
});

app.get("/dashboard", async (req, res) => {
    if(!req.isAuthenticated()) {
        req.flash("error", "Something went wrong!");
        res.redirect("/login");
    }

    try {
        const user = req.user;

        const result = await db.query("Select * FROM users WHERE role = $1", [user.role]);
        const role = result.rows[0].role;

        if (role === "admin") {
            res.redirect("/admin");
        } else if (role === "user") {
            res.redirect("/user");
        } else {
            res.redirect("/login");
        }

    } catch (err) {
        console.log(err);
    }
});

passport.use(new Strategy(async function verify(username, password, cb) {
    try {
        const checkUser = await db.query("SELECT * FROM users WHERE username = $1", [
            username
        ]);
    
        if(checkUser.rows.length > 0) {
            const user = checkUser.rows[0];
            const storedPassword = user.password;
    
            bcrypt.compare(password, storedPassword, (err, result) => {
                if (err) {
                    return cb(err);
                } else {
                    if (result) {
                        return cb(null, user);
                    } else {
                        return cb(null, false, { message: "Invalid password!" });
                    }
                }
            });
        } else {
            return cb(null, false, { message: "user not found" });
        }
    } catch (err) {
        return cb(err);
    }
}));

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});