# Vault Demo Dashboard Application

Node.js web application that demonstrates four different secret delivery methods from HashiCorp Vault Secrets Operator.

## Features

### Four Secret Delivery Methods

1. **Static Secrets (Environment Variables)**
   - Source: VaultStaticSecret → Kubernetes Secret → Pod Env Vars
   - Path: `secret/demo/static`
   - Keys: `api_key`, `environment`, `created_at`

2. **Dynamic Secrets (File Mount)**
   - Source: VaultDynamicSecret → Kubernetes Secret → Volume Mount
   - Path: `database/creds/demo-role`
   - Mount: `/vault/secrets/dynamic`
   - Keys: `username`, `password`, rotation timestamp

3. **CSI Secrets (Direct Mount)**
   - Source: VaultStaticSecret → Volume Mount
   - Path: `secret/demo/csi`
   - Mount: `/mnt/secrets/vault-data`
   - Keys: `top_secret`, `access_level`, `mounted_at`

4. **PKI Certificates (TLS Inspection)**
   - Source: VaultPKISecret → TLS Secret → OpenShift Route
   - Inspects the application's own TLS certificate
   - Displays: Serial number, expiration, days remaining

## Architecture

```
┌─────────────────────────────────────────┐
│         Express Server (Port 8080)      │
├─────────────────────────────────────────┤
│  GET /                                  │
│    → Serves dashboard HTML              │
│                                         │
│  GET /api/secrets                       │
│    → Returns all 4 secret types as JSON│
│                                         │
│  GET /health                            │
│    → Health check endpoint              │
└─────────────────────────────────────────┘
```

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start
```

### Environment Variables

```bash
# Static secrets (Card 1)
API_KEY=demo-api-key-12345
ENVIRONMENT=production
CREATED_AT=2024-01-01T00:00:00Z

# Application config
PORT=8080
ROUTE_HOSTNAME=vault-demo-app-vault-demo.apps.ocp18.tec.cz.ibm.com
```

### Volume Mounts (for local testing)

Create test directories:
```bash
mkdir -p /vault/secrets/dynamic
mkdir -p /mnt/secrets/vault-data

# Add test files
echo "test-username" > /vault/secrets/dynamic/username
echo "test-password" > /vault/secrets/dynamic/password
echo "TOP SECRET DATA" > /mnt/secrets/vault-data/top_secret
```

## Building Container Image

```bash
# Build
docker build -t vault-demo-app:latest .

# Run locally
docker run -p 8080:8080 \
  -e API_KEY=test-key \
  -e ENVIRONMENT=development \
  vault-demo-app:latest

# Push to registry
docker tag vault-demo-app:latest quay.io/your-org/vault-demo-app:latest
docker push quay.io/your-org/vault-demo-app:latest
```

## API Endpoints

### GET /api/secrets

Returns all secrets in JSON format:

```json
{
  "static": {
    "status": "success",
    "method": "Environment Variable",
    "data": {
      "api_key": "demo-api-key-12345",
      "environment": "production",
      "created_at": "2024-01-01T00:00:00Z"
    }
  },
  "dynamic": {
    "status": "success",
    "method": "File Mount (Dynamic)",
    "data": {
      "username": "v-kubernetes-demo-role-abc123",
      "password": "A1b2C3d4E5f6",
      "_last_updated": "2024-01-01T12:00:00Z"
    }
  },
  "csi": {
    "status": "success",
    "method": "CSI Direct Mount (Memory-Only)",
    "data": {
      "top_secret": "This is a TOP SECRET value!",
      "access_level": "classified"
    }
  },
  "pki": {
    "status": "success",
    "method": "TLS Certificate (PKI)",
    "data": {
      "subject": "vault-demo-app-vault-demo.apps.ocp18.tec.cz.ibm.com",
      "issuer": "Demo Root CA",
      "serial_number": "1A:2B:3C:4D:5E:6F",
      "valid_from": "Jan 1 00:00:00 2024 GMT",
      "valid_to": "Jan 1 00:05:00 2024 GMT",
      "fingerprint": "AA:BB:CC:DD:EE:FF",
      "days_remaining": 0
    }
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /health

Health check endpoint:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Dashboard Features

- **Auto-refresh**: Updates every 5 seconds
- **Status indicators**: Visual success/error states
- **Masked secrets**: Sensitive data partially hidden
- **Responsive design**: Works on mobile and desktop
- **Real-time updates**: Shows rotation timestamps

## Security Features

- Runs as non-root user (UID 1001)
- Read-only root filesystem
- Drops all capabilities
- Health checks for liveness/readiness
- Secure secret handling (no logging)

## Troubleshooting

### Secrets not loading

Check if secret files exist:
```bash
ls -la /vault/secrets/dynamic/
ls -la /mnt/secrets/vault-data/
```

### Environment variables missing

Check pod environment:
```bash
kubectl exec -it <pod-name> -n vault-demo -- env | grep -E "API_KEY|ENVIRONMENT"
```

### Certificate inspection failing

Verify the Route hostname is correct:
```bash
oc get route vault-demo-app -n vault-demo
```

## License

MIT

---

**Made with Bob** 🤖