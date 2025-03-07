import express from "express";
import { Client } from "pg";
import { fileURLToPath } from "url";
import path from "path";
import "dotenv/config";

const app = express();
const port = process.env.PORT;

// EJS TEMPLATE
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

const db = new Client({
    connectionString: process.env.DATABASE_URL,
});

db.connect();

app.get("/", async (req, res) => {

    try {
        const result = await db.query("SELECT * FROM tracker");
        const data = result.rows;
        res.render("index.ejs", {
            bookData: data
        });
    } catch (error) {
        res.status(500).send("Error qurying database");
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});