const express = require("express");
const axios = require("axios");

const app = express();
const PORT = 5000;

// ZenRows API Key
const API_KEY = "c5a61db0080d04438a7e467d416048d005676d7d";

// Middleware
app.use(express.json());

// Scraping Route
app.get("/scrape", async (req, res) => {
    try {
        // const targetUrl = req.query.url; // URL ko request se lena
        const targetUrl = "https://app.zenrows.com/plans"
        if (!targetUrl) {
            return res.status(400).json({ error: "Please provide a URL to scrape." });
        }

        const response = await axios.get("https://api.zenrows.com/v1/", {
            params: {
                url: targetUrl,
                apikey: API_KEY,
            },
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Server Start
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
