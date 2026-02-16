const form = document.getElementById("ticketForm");
const formError = document.getElementById("formError");

const connPill = document.getElementById("connPill");

const colOpen = document.getElementById("colOpen");
const colProgress = document.getElementById("colProgress");
const colDone = document.getElementById("colDone");

const searchInput = document.getElementById("search");
const statusFilter = document.getElementById("statusFilter");

let tickets = [];

function setConn(text, ok) {
  connPill.textContent = text;
  connPill.style.color = ok ? "#bfffd1" : "#ffd6d6";
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[m]);
}

function matchesFilters(ticket) {
  const q = searchInput.value.trim().toLowerCase();
  const sf = statusFilter.value;

  if (sf !== "All" && ticket.status !== sf) return false;

  if (!q) return true;
  const hay = `${ticket.title} ${ticket.requester} ${ticket.priority} ${ticket.status}`.toLowerCase();
  return hay.includes(q);
}

function render() {
  colOpen.innerHTML = "";
  colProgress.innerHTML = "";
  colDone.innerHTML = "";

  const visible = tickets.filter(matchesFilters);

  for (const t of visible) {
    const el = document.createElement("div");
    el.className = "ticket";

    el.innerHTML = `
      <div class="ticket-top">
        <div>
          <p class="ticket-title">${escapeHtml(t.title)}</p>
          <p class="meta">Requested by <b>${escapeHtml(t.requester)}</b> • ${new Date(t.createdAt).toLocaleString()}</p>
        </div>
        <div class="badges">
          <span class="badge ${t.priority.toLowerCase()}">${escapeHtml(t.priority)}</span>
          <span class="badge">${escapeHtml(t.status)}</span>
        </div>
      </div>

      <div class="actions">
        ${t.status !== "Open" ? `<button data-action="open" data-id="${t.id}">To Open</button>` : ""}
        ${t.status !== "In Progress" ? `<button data-action="progress" data-id="${t.id}">To In Progress</button>` : ""}
        ${t.status !== "Done" ? `<button data-action="done" data-id="${t.id}">To Done</button>` : ""}
        <button data-action="delete" data-id="${t.id}">Delete</button>
      </div>
    `;

    const target =
      t.status === "Open" ? colOpen :
      t.status === "In Progress" ? colProgress :
      colDone;

    target.appendChild(el);
  }
}

async function createTicket(payload) {
  const res = await fetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create ticket");
  return data.ticket;
}

async function setStatus(id, status) {
  const res = await fetch(`/api/tickets/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update status");
  return data.ticket;
}

async function deleteTicket(id) {
  const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete ticket");
  return true;
}

// Form submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const fd = new FormData(form);
  const payload = {
    title: fd.get("title"),
    requester: fd.get("requester"),
    priority: fd.get("priority")
  };

  try {
    await createTicket(payload);
    form.reset();
  } catch (err) {
    formError.textContent = err.message;
  }
});

// Board actions (event delegation)
document.getElementById("columns").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  try {
    if (action === "delete") {
      await deleteTicket(id);
    } else if (action === "open") {
      await setStatus(id, "Open");
    } else if (action === "progress") {
      await setStatus(id, "In Progress");
    } else if (action === "done") {
      await setStatus(id, "Done");
    }
  } catch (err) {
    alert(err.message);
  }
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);

// SSE connection
function connectStream() {
  const es = new EventSource("/api/stream");

  es.addEventListener("open", () => setConn("Connected • Live", true));
  es.addEventListener("error", () => setConn("Disconnected • Reconnecting…", false));

  es.addEventListener("snapshot", (msg) => {
    const data = JSON.parse(msg.data);
    tickets = data.tickets ?? [];
    render();
  });

  es.addEventListener("created", (msg) => {
    const { ticket } = JSON.parse(msg.data);
    // Avoid duplicates
    if (!tickets.some((t) => t.id === ticket.id)) tickets.unshift(ticket);
    render();
  });

  es.addEventListener("updated", (msg) => {
    const { ticket } = JSON.parse(msg.data);
    const idx = tickets.findIndex((t) => t.id === ticket.id);
    if (idx >= 0) tickets[idx] = ticket;
    render();
  });

  es.addEventListener("deleted", (msg) => {
    const { id } = JSON.parse(msg.data);
    tickets = tickets.filter((t) => t.id !== id);
    render();
  });
}

connectStream();
