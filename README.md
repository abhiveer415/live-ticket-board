# Live Ticket Board (Express + PostgreSQL + SSE)

A simple real-time ticket board built with Node.js, Express, PostgreSQL, and Server-Sent Events (SSE).
Open the app in two browser windows to see live updates instantly.

## Features
- Create tickets (title, requester, priority)
- Move tickets across statuses (Open / In Progress / Done)
- Delete tickets
- Real-time updates via SSE (no refresh)
- PostgreSQL persistence

## Tech Stack
- Frontend: HTML, CSS, Vanilla JS
- Backend: Node.js, Express
- Database: PostgreSQL
- Realtime: Server-Sent Events (SSE)

## Setup (Local)
1. Create database `ticketboard`
2. Run the SQL in `db/init.sql` to create the `tickets` table
3. Create `.env` with:
   ```env
   PORT=3000
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/ticketboard
