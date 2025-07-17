const express = require('express');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize Twilio client
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Serve HTML file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Send SMS endpoint
app.post('/send-sms', async (req, res) => {
    const { to, message } = req.body;

    // Validate input
    if (!to || !message) {
        return res.status(400).json({
            success: false,
            error: 'Phone number and message are required'
        });
    }

    try {
        // Send SMS using Twilio
        const messageResponse = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to
        });

        console.log('Message sent successfully:', messageResponse.sid);
        
        res.json({
            success: true,
            messageSid: messageResponse.sid,
            message: 'SMS sent successfully!'
        });

    } catch (error) {
        console.error('Error sending SMS:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send SMS'
        });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});