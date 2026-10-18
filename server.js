const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_SECRET = "AimhackAdmin2026";
const KEYS_FILE = path.join(__dirname, 'keys.json');

function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    } catch (e) {}
    return {
        "AMHK-DEMO-KEY": {
            key: "AMHK-DEMO-KEY",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
            status: "active"
        }
    };
}

function saveKeys(keys) {
    try {
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
    } catch (e) {}
}

let activeLicenses = loadKeys();

const checkAdminAuth = (req, res, next) => {
    if (req.headers['x-admin-auth'] !== ADMIN_SECRET) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
};

app.post('/api/admin/login', (req, res) => {
    if (req.body.password === ADMIN_SECRET) return res.json({ success: true });
    res.status(401).json({ success: false, message: "Invalid password" });
});

app.post('/api/admin/create-key', checkAdminAuth, (req, res) => {
    const { key, days = 0, hours = 1, minutes = 0 } = req.body;
    if (!key) return res.status(400).json({ success: false, message: "Key required" });

    const durationMs = (parseInt(days) * 86400 + parseInt(hours) * 3600 + parseInt(minutes) * 60) * 1000;
    if (durationMs <= 0) return res.status(400).json({ success: false, message: "Invalid duration" });

    const expiresAt = new Date(Date.now() + durationMs).toISOString();

    activeLicenses[key] = {
        key: key,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
        status: "active"
    };

    saveKeys(activeLicenses);
    res.json({ success: true, message: "Key created", data: activeLicenses[key] });
});

app.get('/api/admin/keys', checkAdminAuth, (req, res) => {
    res.json({ success: true, keys: Object.values(activeLicenses) });
});

app.post('/api/admin/delete-key', checkAdminAuth, (req, res) => {
    const { key } = req.body;
    if (activeLicenses[key]) {
        delete activeLicenses[key];
        saveKeys(activeLicenses);
        return res.json({ success: true });
    }
    res.status(404).json({ success: false });
});

app.post('/api/verify', (req, res) => {
    const { key } = req.body;
    const license = activeLicenses[key];

    if (!license || license.status !== "active") {
        return res.status(401).json({ success: false, message: "Invalid key" });
    }

    if (new Date(license.expiresAt) < new Date()) {
        license.status = "expired";
        saveKeys(activeLicenses);
        return res.status(403).json({ success: false, message: "Key expired" });
    }

    res.json({ success: true, expiresAt: license.expiresAt });
});

// DYNAMIC SUBSCRIPTION API (TIMER + QUOTA BAR + WORKING HYSTERIA NODE)
app.get('/api/get-config', (req, res) => {
    const { key } = req.query;
    const license = activeLicenses[key];

    if (!license || license.status !== "active" || new Date(license.expiresAt) < new Date()) {
        if (license) {
            license.status = "expired";
            saveKeys(activeLicenses);
        }
        return res.status(403).send("Key Expired or Invalid");
    }

    const expireUnix = Math.floor(new Date(license.expiresAt).getTime() / 1000);
    const totalBytesQuota = 74109405568; // 69.0 GB

    // Hysteria 2 Link Format for direct proxy connection
    const hy2Link = `hy2://${key}@wraith-bom2.aimhack.shop:443?insecure=0&sni=wraith-bom2.aimhack.shop#Aimhack-${key.slice(-4)}`;

    const subscriptionPayload = 
        `#profile-title: AIMHACK\n` +
        `#subscription-userinfo: upload=0; download=0; total=${totalBytesQuota}; expire=${expireUnix}\n` +
        `#profile-update-interval: 1\n\n` +
        hy2Link;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(subscriptionPayload);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
