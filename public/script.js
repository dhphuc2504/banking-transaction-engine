const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');

let currentUserId = null;
const identifierInput = document.getElementById('identifier');
const passwordInput = document.getElementById('password');

const triggerLoginOnEnter = (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Stops the browser from doing any default Enter key actions
        loginBtn.click();       // Magically clicks the Log In button for them!
    }
};

identifierInput.addEventListener('keypress', triggerLoginOnEnter);
passwordInput.addEventListener('keypress', triggerLoginOnEnter);
loginBtn.addEventListener('click', async () => {
    // Take the value in the textbox
    const emailToSubmit = identifierInput.value;
    const passwordToSubmit = passwordInput.value;

    // Clear out any old red error messages
    loginError.textContent = "";

    try {
        // Send the JSON envelope to your Express backend
        const response = await fetch('http://localhost:3000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: emailToSubmit,
                password: passwordToSubmit
            })
        });

        // Unpack the JSON response from Express
        const data = await response.json();

        // Check if the status code was 200 OK
        if (response.ok) {
            console.log("Login Success!", data);

            // Save the user_id for the transfer function to use later
            currentUserId = data.user.user_id;
            loadHistory(); // Fetch the ledger as soon as they log in
            // Switch the screens! Hide the login view, show the dashboard.
            loginView.classList.add('hidden');
            dashboardView.classList.remove('hidden');
        } else {
            // If it was a 400 error (Invalid credentials), show it on the screen
            loginError.textContent = data.error;
        }
    } catch (error) {
        // This fires if your backend server is turned off or crashed
        console.error("Network Error:", error);
        loginError.textContent = "Could not connect to the server.";
    }
});

const transferBtn = document.getElementById('transfer-btn');
const transferMessage = document.getElementById('transfer-message');

transferBtn.addEventListener('click', async () => {
    // Extract the new bank number fields
    const senderBankNumber = document.getElementById('sender-bank-number').value;
    const receiverBankNumber = document.getElementById('receiver-bank-number').value;
    const amount = document.getElementById('amount').value;
    const passcode = document.getElementById('transfer-passcode').value;
    
    // Clear any old transfer messages
    transferMessage.textContent = "";
    
    try {
        const response = await fetch('http://localhost:3000/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: currentUserId,
                sender_bank_number: senderBankNumber,
                receiver_bank_number: receiverBankNumber,
                amount: amount,
                passcode: passcode
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log("Transfer successful!");
            transferMessage.textContent = data.message; 
            transferMessage.style.color = "#10b981";
            loadHistory(); // Refresh the ledger immediately after a successful transfer 
        } else {
            console.log(data.error);
            transferMessage.textContent = data.error;
            transferMessage.style.color = "#ef4444"; 
        }
    } catch (error) {
        console.error("Network Error:", error);
        transferMessage.textContent = "Could not make the transaction";
        transferMessage.style.color = "#ef4444";
    }
});
// Function to fetch and render the transaction history
const loadHistory = async () => {
    const tbody = document.getElementById('history-tbody');
    tbody.innerHTML = ""; // Clear the old table rows before loading new ones

    try {
        const response = await fetch(`http://localhost:3000/history/${currentUserId}`);
        const data = await response.json();

        if (response.ok) {
            // Loop through each transaction in the array
            data.transactions.forEach(trx => {
                // Format the messy database timestamp into a clean, readable date
                const dateObj = new Date(trx.created_at);
                const cleanDate = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Choose the right CSS color class based on the status
                const statusClass = trx.status === 'SUCCESS' ? 'status-success' : 'status-failed';

                // Create a new HTML row and inject the data
                const row = `
                    <tr>
                        <td>${cleanDate}</td>
                        <td>#${trx.sender_wallet_id}</td>
                        <td>#${trx.receiver_wallet_id}</td>
                        <td>${trx.amount} VND</td>
                        <td class="${statusClass}">${trx.status}</td>
                    </tr>
                `;
                
                // Add the row to the table body
                tbody.insertAdjacentHTML('beforeend', row);
            });
        }
    } catch (error) {
        console.error("Failed to load history:", error);
    }
};