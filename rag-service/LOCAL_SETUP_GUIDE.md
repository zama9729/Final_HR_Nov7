# RAG Service Local Setup Guide

This guide provides step-by-step instructions for setting up and running the RAG service locally.

## Prerequisites

Before you begin, ensure you have the following installed:

1.  **Docker & Docker Compose**: For running the service and its dependencies (Postgres, Redis, Chroma).
2.  **Git**: To clone the repository.
3.  **OpenAI API Key**: Required for generating embeddings and LLM responses.

## Option 1: Quick Start with Docker (Recommended)

This is the easiest way to get everything running.

### 1. Navigate to the Service Directory
Open your terminal and move to the `rag-service` directory:
```bash
cd rag-service
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
Open `.env` in a text editor and set your OpenAI API key:
```ini
OPENAI_API_KEY=sk-your-actual-api-key-here
```
*Note: You can leave other settings as defaults for local testing.*

### 3. Start Services
Run the following command to start all services (API, Database, Redis, Vector Store, Worker):
```bash
docker-compose up -d
```
Wait about 30-60 seconds for all services to initialize.

### 4. Initialize the Database
Run migrations to set up the database schema:
```bash
docker-compose exec rag-api alembic upgrade head
```
Seed sample data (creates test users and data):
```bash
docker-compose exec rag-api python scripts/seed_data.py
```
**Important:** The seed script will output a **JWT Token** for the sample employee. Copy this token; you will need it to make API requests.

### 5. Verify Installation
Check if the service is running:
```bash
curl http://localhost:8001/health
```
You should see `{"status":"healthy"}`.

---

## Option 2: Local Python Development

Use this method if you want to modify the code and run the API directly on your machine (while keeping DB/Redis/Chroma in Docker).

### 1. Start Infrastructure Only
Start Postgres, Redis, and Chroma using Docker:
```bash
docker-compose up -d postgres redis chroma
```

### 2. Set Up Python Environment
Create and activate a virtual environment:
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
Ensure your `.env` file points to localhost ports (default in `.env.example` usually works, but verify):
```ini
DATABASE_URL=postgresql://rag_user:rag_password@localhost:5433/rag_db
REDIS_URL=redis://localhost:6381/0
CHROMA_URL=http://localhost:8000
OPENAI_API_KEY=sk-your-key
```

### 5. Run Migrations & Seed
```bash
alembic upgrade head
python scripts/seed_data.py
```

### 6. Run the Application
Start the API server:
```bash
uvicorn app.main:app --reload --port 8001
```
Start the Celery worker (in a separate terminal):
```bash
celery -A app.celery_app worker --loglevel=info
```

## Testing the Service

You can test the API using `curl` or Postman.

**Example Query:**
```bash
# Replace YOUR_TOKEN with the JWT token from the seed step
curl -X POST http://localhost:8001/api/v1/query \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is my leave balance?",
    "use_tools": true
  }'
```

## Troubleshooting

-   **Services not starting?** Check logs: `docker-compose logs -f`
-   **Database connection failed?** Ensure port 5433 is not occupied or blocked.
-   **OpenAI errors?** Verify your API key in `.env` and ensure you have credits.
