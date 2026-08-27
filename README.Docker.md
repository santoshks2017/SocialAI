# CarDekho Social AI — Docker Desktop Setup

This project is containerized to run the full stack (Frontend Web UI and Backend Fastify API) seamlessly in **Docker Desktop**.

---

## Quick Access URLs

Once running, the application services are mapped directly to your local ports:

- **Frontend Web UI:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:3001](http://localhost:3001)
- **API Health Check:** [http://localhost:3001/v1/health](http://localhost:3001/v1/health)

---

## Managing in Docker Desktop

1. **Open Docker Desktop:** Launch Docker Desktop from `/Applications/Docker.app`.
2. **Containers View:** Look for the **`cardekhosocialaiapp`** container group:
   - **`cardekho-web`**: Fast, lightweight Nginx container serving the React single-page application on port `5173`.
   - **`cardekho-api`**: Node.js container running the Fastify API server with Prisma and native image compositors on port `3001`.
3. **One-Click Actions:**
   - **Start / Stop:** Click the play/pause or stop button next to the container group anytime.
   - **Logs:** Click on any container name to inspect real-time server output and access logs.
   - **Open in Browser:** Click the port link (`5173:80` or `3001:3001`) to open the app directly in your browser.

---

## Terminal Commands (Alternative)

To start both services in the background:
```bash
docker compose up -d
```

To view live combined logs:
```bash
docker compose logs -f
```

To stop the containers:
```bash
docker compose down
```

To rebuild after source code modifications:
```bash
docker compose up --build -d
```

---

## Architecture in Docker

- **Database Connectivity:** Configured with `host.docker.internal` so the API container communicates directly with PostgreSQL and Redis on the host machine.
- **Client-Side Routing:** Nginx handles HTML5 history pushState navigation (`try_files $uri $uri/ /index.html;`) so page reloads on routes like `/dashboard`, `/posts`, and `/calendar` work seamlessly.