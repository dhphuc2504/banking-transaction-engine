require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json()); // Allows the API to read JSON bodies in POST requests

// Set up the PostgreSQL connection pool
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE
});

// Test the database connection
pool.connect((err) => {
    if (err) {
        console.error('Database connection failed!', err.stack);
    } else {
        console.log('Successfully connected to the PostgreSQL database.');
    }
});

// Phase 2, Step 3: Your first API Endpoint
app.get('/users', async (req, res) => {
    try {
        // Query the database to get all users
        const result = await pool.query('SELECT user_id, username, email FROM users');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});