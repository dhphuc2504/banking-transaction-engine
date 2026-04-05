require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors'); 
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json()); // Allows the API to read JSON bodies in POST requests
app.use(express.static(path.join(__dirname, 'public')));
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

app.post('/set-passcode', async (req, res) => {
    const {user_id, passcode} = req.body; 
    try {
        if(!user_id || !passcode) return res.status(400).json({ error: 'Please input 4-digit passcode'});
        if (passcode.toString().length !== 4) {
            return res.status(400).json({ error: 'Passcode must be exactly 4 digits long.'});
        }
        const hash_passcode = await bcrypt.hash(passcode.toString(), 10);

        await pool.query(
            'UPDATE users SET passcode_hash = $1 WHERE user_id = $2',
            [hash_passcode, user_id]
        );
        return res.status(200).json({
            message: 'Passcode set successfully'
        });
    } catch (error) {
        console.log(error.message);
        return res.status(500).json({
            error: 'Server Error'
        })
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
                user_id: userResult.rows[0].user_id,
                email: userResult.rows[0].email,
                has_passcode: userResult.rows[0].passcode_hash !== null // It's for the front-end work. If user doesn't have the passcode, we pop up the create passcode screen
            }
        })
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/transfer', async (req, res) => {
    const { sender_id, sender_bank_number, receiver_bank_number, amount, passcode } = req.body;
    
    try {
        // 1. Basic Input Validation
        if (!sender_bank_number || !receiver_bank_number || !amount) return res.status(400).json({ error: 'Please provide both bank numbers and amount.' });
        if (amount <= 0) return res.status(400).json({ error: 'Transfer amount must be greater than zero.' });
        if (!passcode) return res.status(400).json({ error: 'Please provide your 4-digit passcode.' });
        if (sender_bank_number === receiver_bank_number) return res.status(400).json({ error: 'Sender and receiver cannot be the same.' });

        // 2. Fetch ALL sender info in one trip (wallet_id, balance, and owner)
        const senderWalletResult = await pool.query(
            'SELECT wallet_id, balance, user_id FROM wallet WHERE bank_number = $1',
            [sender_bank_number]
        );
        
        // Prevent crash if wallet doesn't exist
        if (senderWalletResult.rows.length === 0) {
            return res.status(400).json({ error: 'Sender wallet not found.' });
        }

        const senderWallet = senderWalletResult.rows[0];

        // 3. SECURITY CHECK: Does the person logged in actually own this wallet?
        if (senderWallet.user_id !== sender_id) {
            return res.status(403).json({ error: 'Unauthorized: You do not own this wallet.' });
        }

        // 4. Validate Balance
        if (senderWallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance.' });
        }

        // 5. Fetch receiver info
        const receiverWalletResult = await pool.query(
            'SELECT wallet_id FROM wallet WHERE bank_number = $1',
            [receiver_bank_number]
        );
        
        if (receiverWalletResult.rows.length === 0) {
            return res.status(400).json({ error: 'Receiver bank number not found.' });
        }

        const receiverWalletID = receiverWalletResult.rows[0].wallet_id;
        const senderWalletID = senderWallet.wallet_id;

        // 6. Check for the passcode
        const senderUserResult = await pool.query(
            'SELECT passcode_hash FROM users WHERE user_id = $1',
            [sender_id]
        );
        const passcodeHash = senderUserResult.rows[0].passcode_hash;
        
        if (!passcodeHash) {
            return res.status(403).json({ error: 'Please set up a transfer passcode first.' });
        }
        
        const isPasscodeValid = await bcrypt.compare(passcode.toString(), passcodeHash);
        if (!isPasscodeValid) {
            return res.status(401).json({ error: 'Invalid passcode. Transfer blocked.' });
        }

        // 7. Start the ACID Transaction
        const client = await pool.connect(); 

        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE wallet SET balance = balance - $1 WHERE bank_number = $2',
                [amount, sender_bank_number]
            );
            await client.query(
                'UPDATE wallet SET balance = balance + $1 WHERE bank_number = $2',
                [amount, receiver_bank_number]
            );
            await client.query(
                'INSERT INTO transactions (sender_wallet_id, receiver_wallet_id, amount, status, created_at) VALUES ($1, $2, $3, $4, NOW())',
                [senderWalletID, receiverWalletID, amount, 'SUCCESS']
            );

            await client.query('COMMIT');
            return res.status(200).json({ message: 'Transfer successful!' });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Transaction failed, rolling back:", error.message);
            
            await pool.query(
                'INSERT INTO transactions (sender_wallet_id, receiver_wallet_id, amount, status, created_at) VALUES ($1, $2, $3, $4, NOW())',
                [senderWalletID, receiverWalletID, amount, 'FAILED']
            );
            return res.status(500).json({ error: 'Transfer failed. Please try again.' });
            
        } finally {
            client.release();
        }

    } catch (error) {
        console.log(error.message);
        return res.status(500).json({ error: 'Server Error' });
    }
});

app.get('/history/:user_id', async(req, res) => {
    const user_id = req.params.user_id;
    try {
        const historyResult = await pool.query(
            `SELECT transaction_id, sender_wallet_id, receiver_wallet_id, amount, status, created_at
             FROM transactions
             WHERE sender_wallet_id IN (SELECT wallet_id FROM wallet WHERE user_id = $1)
                OR receiver_wallet_id IN (SELECT wallet_id FROM wallet WHERE user_id = $1)
             ORDER BY created_at DESC
            `,
            [user_id]
        );
        return res.status(200).json({
            message: 'Transaction history retrieved successfully',
            count: historyResult.rowCount,
            transactions: historyResult.rows
        })
    } catch(error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Server Error' });
    }
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
