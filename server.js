import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { pool } from "./db/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- SSE clients ---
const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

// --- Utils ---
function makeId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function validateNewTicket(body) {
  const title = String(body.title ?? "").trim();
  const requester = String(body.requester ?? "").trim();
  const priority = String(body.priority ?? "Medium").trim();

  if (title.length < 3) return { ok: false, message: "Title must be at least 3 characters." };
  if (requester.length < 2) return { ok: false, message: "Requester must be at least 2 characters." };

  const allowed = new Set(["Low", "Medium", "High"]);
  if (!allowed.has(priority)) return { ok: false, message: "Priority must be Low, Medium, or High." };

  return { ok: true, value: { title, requester, priority } };
}

// --- DB helpers ---
async function getAllTickets() {
  const { rows } = await pool.query(
    `SELECT id, title, requester, priority, status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM tickets
     ORDER BY created_at DESC`
  );
  return rows;
}

async function insertTicket({ id, title, requester, priority }) {
  const { rows } = await pool.query(
    `INSERT INTO tickets (id, title, requester, priority, status)
     VALUES ($1, $2, $3, $4, 'Open')
     RETURNING id, title, requester, priority, status,
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [id, title, requester, priority]
  );
  return rows[0];
}

async function updateTicketStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE tickets
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, title, requester, priority, status,
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [id, status]
  );
  return rows[0] || null;
}

async function deleteTicketById(id) {
  const result = await pool.query(`DELETE FROM tickets WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

// --- Routes ---
app.get("/api/tickets", async (req, res) => {
  try {
    const tickets = await getAllTickets();
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tickets." });
  }
});

// Real-time stream
app.get("/api/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  clients.add(res);

  // Send initial snapshot from DB
  try {
    const tickets = await getAllTickets();
    res.write(`event: snapshot\ndata: ${JSON.stringify({ tickets })}\n\n`);
  } catch {
    res.write(`event: snapshot\ndata: ${JSON.stringify({ tickets: [] })}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

// Create ticket
app.post("/api/tickets", async (req, res) => {
  const v = validateNewTicket(req.body);
  if (!v.ok) return res.status(400).json({ error: v.message });

  try {
    const ticket = await insertTicket({
      id: makeId(),
      title: v.value.title,
      requester: v.value.requester,
      priority: v.value.priority
    });

    broadcast("created", { ticket });
    res.status(201).json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ticket." });
  }
});

// Update status
app.patch("/api/tickets/:id/status", async (req, res) => {
  const id = req.params.id;
  const status = String(req.body.status ?? "").trim();
  const allowed = new Set(["Open", "In Progress", "Done"]);

  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Status must be Open, In Progress, or Done." });
  }

  try {
    const ticket = await updateTicketStatus(id, status);
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });

    broadcast("updated", { ticket });
    res.json({ ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update ticket." });
  }
});

// Delete ticket
app.delete("/api/tickets/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const ok = await deleteTicketById(id);
    if (!ok) return res.status(404).json({ error: "Ticket not found." });

    broadcast("deleted", { id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete ticket." });
  }
});

// Start server (verify DB connection first)
async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Connected to PostgreSQL");
    app.listen(PORT, () => console.log(`✅ Running at http://localhost:${PORT}`));
  } catch (err) {
    console.error("❌ Could not connect to PostgreSQL.");
    console.error(err.message);
    process.exit(1);
  }
}

start();
