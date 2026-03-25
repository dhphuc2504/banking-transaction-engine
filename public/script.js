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
    // Grab the receiver ID, amount, and passcode from the HTML inputs using document.getElementById().value
    const receiverEmail = document.getElementById('receiver-email').value;
    const amount = document.getElementById('amount').value;
    const passcode = document.getElementById('transfer-passcode').value;
    // Clear any old transfer messages by setting transferMessage.textContent = ""
    transferMessage.textContent = "";
    try {
        const response = await fetch('http://localhost:3000/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: currentUserId,
                receiver_email: receiverEmail,
                amount: amount,
                passcode: passcode
            })
        });

        const data = await response.json();
        if(response.ok) {
            console.log("Transfer successful!");
            // 3. Fixed: Changed .context to .textContent
            transferMessage.textContent = data.message; 
            transferMessage.style.color = "#10b981";
        } else {
            console.log(data.error);
            transferMessage.textContent = data.error;
            transferMessage.style.color = "#ef4444";
        }
    } catch (error) {
        console.error("Network Error:", error);
        transferMessage.textContent = "Could not make the transaction";
    }
});