const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/session', async (req, res) => {
    const phoneNumber = req.query.number;
    if (!phoneNumber) return res.status(400).json({ error: 'Number is required' });

    const sessionDir = path.join(__dirname, 'temp_' + phoneNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Chrome (Linux)", "Chrome", "110.0.5481.177"]
    });

    if (!sock.authState.creds.registered) {
        try {
            await delay(3000);
            const code = await sock.requestPairingCode(phoneNumber);
            res.json({ code: code });
        } catch (error) {
            res.status(500).json({ error: 'Failed to generate code' });
        }
    }

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async (update) => {
        const { connection } = update;
        if (connection === "open") {
            const creds = JSON.parse(fs.readFileSync(path.join(sessionDir, 'creds.json')));
            const sessionID = Buffer.from(JSON.stringify(creds)).toString('base64');
            // এখানে তোমার বটের নাম 'TOM-BOT-X' ব্যবহার করা হয়েছে
            console.log(`Session Active: TOM-BOT-X~${sessionID}`);
            // সেশন হয়ে গেলে ফাইল ডিলিট করে দেওয়া ভালো সিকিউরিটির জন্য
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
    });
});

app.listen(port, () => console.log(`Server running on port ${port}`));
