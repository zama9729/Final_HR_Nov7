# Setting Up OpenAI API Key

## Quick Setup

### Option 1: Using .env file (Recommended)

1. **Edit the `.env` file** in the `rag-service` directory:

```bash
cd rag-service
# Open .env file and replace this line:
OPENAI_API_KEY=your-openai-api-key-here
# With your actual API key:
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

2. **Restart the RAG service**:

```bash
docker-compose down
docker-compose up -d
```

### Option 2: Using Environment Variable

Set the environment variable before starting Docker:

**On Linux/Mac:**
```bash
export OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
docker-compose up -d
```

**On Windows (PowerShell):**
```powershell
$env:OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
docker-compose up -d
```

**On Windows (CMD):**
```cmd
set OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
docker-compose up -d
```

### Option 3: Direct in docker-compose.yml

Edit `docker-compose.yml` and replace:
```yaml
- OPENAI_API_KEY=${OPENAI_API_KEY:-}
```

With:
```yaml
- OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **Warning**: Don't commit this to git! Use `.env` file instead.

## Verify Setup

1. **Check if the key is loaded**:
```bash
docker-compose exec rag-api env | grep OPENAI_API_KEY
```

2. **Test the API**:
```bash
# After seeding data and getting a JWT token
curl -X POST http://localhost:8001/api/v1/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "test query"}'
```

If you see an error about API key, check:
- The key is correctly set in `.env`
- The service was restarted after setting the key
- The key is valid and has credits

## Using Azure OpenAI (Alternative)

If you're using Azure OpenAI instead:

1. **Set in `.env`**:
```bash
OPENAI_API_KEY=your-azure-key
OPENAI_BASE_URL=https://your-resource.openai.azure.com
OPENAI_API_VERSION=2023-12-01-preview
```

2. **Update docker-compose.yml** to include:
```yaml
- OPENAI_BASE_URL=${OPENAI_BASE_URL:-https://api.openai.com/v1}
- OPENAI_API_VERSION=${OPENAI_API_VERSION:-}
```

## Security Notes

- ✅ Never commit `.env` file to git (it's in `.gitignore`)
- ✅ Use environment variables in production
- ✅ Rotate keys periodically
- ✅ Monitor API usage to avoid unexpected costs

## Troubleshooting

### "Invalid API key" error
- Verify the key starts with `sk-` (OpenAI) or is your Azure key
- Check for extra spaces or quotes
- Ensure the service was restarted after setting the key

### "Insufficient quota" error
- Check your OpenAI account billing
- Verify you have credits/quota available
- Consider using a different model or reducing usage

### Key not loading
- Check `.env` file is in `rag-service/` directory
- Verify docker-compose is reading from `.env`
- Check logs: `docker-compose logs rag-api | grep OPENAI`

