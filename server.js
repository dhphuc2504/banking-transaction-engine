require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
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

app.post('/register', async (req, res) => {
    const {username, email, password} = req.body;
    try {
        // Hash the password using bcrypt
        const hash_password = await bcrypt.hash(password, 10);
        // Insert the new user into the database
        const userResult = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id',
            [username, email, hash_password]
        );
        //Take that new used_id to create a new wallet
        const newUserId = userResult.rows[0].user_id;
        //Insert new wallet for the new user with default balance and currency
        await pool.query(
            'INSERT INTO wallet (user_id, balance, currency) VALUES ($1, $2, $3)',
            [newUserId, 0.00, 'VND']
        )
        //Send response
        res.status(201).json({
            message: "User registered successfully",
            user_id: newUserId
        });
    } catch (error) {
        console.log(error.message);
        // Check for unique constraint violation (duplicate username or email) 23505 is the error code for unique violation in PostgreSQL
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Username or email already exists.' });
        }
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/login', async (req, res) => {
    const {identifier, password} = req.body; // require identifier (username or email) and password to login
    try {
        // Check if identifier and password are provided
        if(!identifier || !password) {
            return res.status(400).json({ error: 'Please provide a username/email and password.' });
        }
        // Query the database to find the user byy username or email
        const userResult = await pool.query(
            'SELECT user_id, username, email, password_hash FROM users WHERE username = $1 OR email = $1',
            [identifier]
        );
        // If no user is found, that means the credentials are invalid
        if(userResult.rows.length ===0) {
            return res.status(400).json({ error: 'Invalid credentials.'});
        }
        // Compare the provided password with the stored password hash
        const passwordHash = userResult.rows[0].password_hash;
        const isPasswordValid = await bcrypt.compare(password, passwordHash);
        if(!isPasswordValid){
            return res.status(400).json({ error: 'Invalid credentials.' });
        }
        // If everything is valid, give the user a success response
        return res.status(200).json({
            message: "Login successful!:",
            user: {
                username: userResult.rows[0].username,
                email: userResult.rows[0].email
            }
        })
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/transfer', async (req, res) => {
    const { sender_id, receiver_id, amount } = req.body;
    
    try {
        // Basic Validation
        if (!sender_id || !receiver_id || !amount) return res.status(400).json({ error: 'Please provide sender_id, receiver_id and amount.' });
        if (sender_id === receiver_id) return res.status(400).json({ error: 'Sender and receiver cannot be the same.' });
        if (amount <= 0) return res.status(400).json({ error: 'Transfer amount must be greater than zero.' });

        // Check if the receiver exists
        const receiverResult = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [receiver_id]);
        if (receiverResult.rows.length === 0) return res.status(400).json({ error: 'Receiver not found.' });

        // Check if sender exists and has funds
        const senderWalletBalance = await pool.query('SELECT balance FROM wallet WHERE user_id = $1', [sender_id]);
        if (senderWalletBalance.rows.length === 0) return res.status(400).json({ error: 'Sender not found.' });
        if (senderWalletBalance.rows[0].balance < amount) return res.status(400).json({ error: 'Insufficient balance.' });

        // Start transaction
        // Get one connection from the pool
        const client = await pool.connect(); 

        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE wallet SET balance = balance - $1 WHERE user_id = $2',
                [amount, sender_id]
            );
            await client.query(
                'UPDATE wallet SET balance = balance + $1 WHERE user_id = $2',
                [amount, receiver_id]
            );
            await client.query(
                'INSERT INTO transactions (sender_wallet_id, receiver_wallet_id, amount, status, created_at) VALUES ($1, $2, $3, $4, NOW())',
                [sender_id, receiver_id, amount, 'SUCCESS'] // Assuming sender_id = wallet_id 
            );

            await client.query('COMMIT');
            return res.status(200).json({ message: 'Transfer successful!' });

        } catch (error) {
            // Undo if the server crashes
            await client.query('ROLLBACK');
            console.error("Transaction failed, rolling back:", error.message);
            
            // Log the failure safely outside the rolled-back transaction
            await pool.query(
                'INSERT INTO transactions (sender_wallet_id, receiver_wallet_id, amount, status, created_at) VALUES ($1, $2, $3, $4, NOW())',
                [sender_id, receiver_id, amount, 'FAILED']
            );
            return res.status(500).json({ error: 'Transfer failed. Please try again.' });
            
        } finally {
            client.release(); // Give the connection back to the pool so other users can use it!
        }

    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ error: 'Server Error' });
    }
});
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});