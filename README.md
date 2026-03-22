# Banking Transaction Engine (API)

A robust, RESTful backend service simulating a digital banking environment. This API handles user authentication, wallet management, and secure financial transactions between users. 

Built with a strong emphasis on system design, data integrity, and enterprise-grade architecture.

## Core Features
* **Secure User Management:** JWT-based authentication and bcrypt password hashing.
* **Wallet System:** Real-time balance tracking and currency management.
* **ACID-Compliant Transactions:** Strict relational database transactions ensuring that funds are never lost during transfer failures or system errors.
* **Optimized History Lookups:** B-Tree indexing on transaction records for high-performance financial auditing and history retrieval.

## Tech Stack
* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** PostgreSQL
* **Infrastructure:** Docker & Nginx (Planned)

## Database Schema Highlights
The system utilizes a strictly typed, relational database design:
* `users`: Stores scalable UUIDs, unique emails, and hashed credentials.
* `wallets`: Linked 1:1 with users, utilizing exact `DECIMAL` types to prevent floating-point math errors.
* `transactions`: An immutable, append-only ledger tracking sender, receiver, amount, and status, supported by performance indexes.

## Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/dhphuc2504/banking-transaction-engine.git](https://github.com/dhphuc2504/banking-transaction-engine.git)
   cd banking-transaction-engine
