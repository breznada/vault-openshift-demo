# Vault Manual Setup Guide

Complete step-by-step manual configuration for the VSO Demo.

## Prerequisites

```bash
export VAULT_ADDR=http://vault.tec.cz.ibm.com:8200
vault login
```

---

## Part 1: KV-v2 Secrets Engine (Static Secrets)

### 1.1 Enable KV-v2 Engine

```bash
vault secrets enable -path=secret kv-v2
```

### 1.2 Create Static Secret

```bash
vault kv put secret/demo/static \
    api_key="demo-api-key-12345" \
    environment="production" \
    created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### 1.3 Verify

```bash
vault kv get secret/demo/static
```

---

## Part 2: Database Secrets Engine (Dynamic Secrets)

### 2.1 Enable Database Engine

```bash
vault secrets enable database
```

### 2.2 Configure Database Connection

**Option A: PostgreSQL**
```bash
vault write database/config/demo-db \
    plugin_name=postgresql-database-plugin \
    allowed_roles="demo-role" \
    connection_url="postgresql://{{username}}:{{password}}@postgres.vault-demo.svc.cluster.local:5432/demodb?sslmode=disable" \
    username="vault" \
    password="vault-password"
```

**Option B: MySQL**
```bash
vault write database/config/demo-db \
    plugin_name=mysql-database-plugin \
    allowed_roles="demo-role" \
    connection_url="{{username}}:{{password}}@tcp(mysql.vault-demo.svc.cluster.local:3306)/" \
    username="vault" \
    password="vault-password"
```

**Option C: Mock/Demo (No real database)**
```bash
# For demo purposes without a real database, you can still configure it
# The VSO will attempt to fetch credentials, but they won't be valid
vault write database/config/demo-db \
    plugin_name=postgresql-database-plugin \
    allowed_roles="demo-role" \
    connection_url="postgresql://{{username}}:{{password}}@localhost:5432/demo?sslmode=disable" \
    username="demo" \
    password="demo"
```

### 2.3 Create Database Role

```bash
vault write database/roles/demo-role \
    db_name=demo-db \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"
```

### 2.4 Test (Optional)

```bash
vault read database/creds/demo-role
```

---

## Part 3: PKI Secrets Engine (Certificates)

### 3.1 Enable PKI Engine

```bash
vault secrets enable pki
```

### 3.2 Tune Max Lease TTL

```bash
vault secrets tune -max-lease-ttl=87600h pki
```

### 3.3 Generate Root CA

```bash
vault write -field=certificate pki/root/generate/internal \
    common_name="Demo Root CA" \
    issuer_name="root-2024" \
    ttl=87600h
```

### 3.4 Configure CA and CRL URLs

```bash
vault write pki/config/urls \
    issuing_certificates="http://vault.tec.cz.ibm.com:8200/v1/pki/ca" \
    crl_distribution_points="http://vault.tec.cz.ibm.com:8200/v1/pki/crl"
```

### 3.5 Create PKI Role

```bash
vault write pki/roles/tec-role \
    allowed_domains="apps.ocp18.tec.cz.ibm.com" \
    allow_subdomains=true \
    allow_glob_domains=false \
    max_ttl="720h" \
    ttl="5m" \
    key_type="rsa" \
    key_bits=2048
```

**Note:** TTL is set to 5 minutes for demo purposes to show certificate rotation.

### 3.6 Test Certificate Issuance

```bash
vault write pki/issue/tec-role \
    common_name="test.apps.ocp18.tec.cz.ibm.com"
```

---

## Part 4: Kubernetes Authentication

### 4.1 Enable Kubernetes Auth

```bash
vault auth enable kubernetes
```

### 4.2 Get Kubernetes Cluster Information

**Important:** You need to get the service account token AFTER ArgoCD creates the namespace and service account. For now, we'll prepare the Kubernetes auth configuration, but you'll need to complete step 4.3 after deploying ArgoCD.

```bash
# Get Kubernetes API server address
K8S_HOST=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.server}')

# Get CA certificate
K8S_CA_CERT=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d)

# Save these for later
echo "K8S_HOST=$K8S_HOST"
echo "K8S_CA_CERT saved"
```

### 4.3 Configure Kubernetes Auth (Do this AFTER ArgoCD deployment)

**After you deploy the ArgoCD application**, run these commands:

```bash
# Wait for ArgoCD to create the namespace and service account
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=vault-secrets-operator -n vault-secrets-operator-system --timeout=300s

# Create a long-lived token for the service account
SA_TOKEN=$(kubectl create token vault-demo-app -n vault-demo --duration=87600h)

# Now configure Kubernetes auth
vault write auth/kubernetes/config \
    kubernetes_host="$K8S_HOST" \
    kubernetes_ca_cert="$K8S_CA_CERT" \
    token_reviewer_jwt="$SA_TOKEN"
```

### 4.4 Verify Configuration

```bash
vault read auth/kubernetes/config
```

---

## Part 5: Vault Policy and Role

### 5.1 Create Vault Policy

```bash
vault policy write vault-demo-role - <<EOF
# Allow reading static secrets
path "secret/data/demo/static" {
  capabilities = ["read"]
}

# Allow reading database credentials
path "database/creds/demo-role" {
  capabilities = ["read"]
}

# Allow issuing certificates
path "pki/issue/tec-role" {
  capabilities = ["create", "update"]
}

# Allow revoking certificates
path "pki/revoke" {
  capabilities = ["create", "update"]
}
EOF
```

### 5.2 Create Kubernetes Auth Role

```bash
vault write auth/kubernetes/role/vault-demo-role \
    bound_service_account_names=vault-demo-app \
    bound_service_account_namespaces=vault-demo \
    policies=vault-demo-role \
    ttl=24h
```

### 5.3 Verify Role

```bash
vault read auth/kubernetes/role/vault-demo-role
```

---

## Verification Checklist

Run these commands to verify everything is configured correctly:

```bash
# 1. Check KV secret
vault kv get secret/demo/static

# 2. Check database credentials (if database is configured)
vault read database/creds/demo-role

# 3. Check PKI certificate issuance
vault write pki/issue/tec-role common_name="test.apps.ocp18.tec.cz.ibm.com" ttl="5m"

# 4. List auth methods
vault auth list

# 5. Check policy
vault policy read vault-demo-role

# 6. Check Kubernetes role
vault read auth/kubernetes/role/vault-demo-role
```

---

## Summary

After completing Parts 1-3 and 5 (skip 4.3 for now), you should have:

✅ **KV-v2 Engine** at `secret/` with demo data at `secret/demo/static`  
✅ **Database Engine** at `database/` with role `demo-role`  
✅ **PKI Engine** at `pki/` with role `tec-role` (5-minute TTL)  
✅ **Kubernetes Auth** enabled (configuration pending)  
✅ **Policy** `vault-demo-role` with appropriate permissions  
✅ **Kubernetes Auth Role** `vault-demo-role` created  

---

## Next Steps

1. **Deploy the ArgoCD Application (this creates everything):**
   ```bash
   kubectl apply -f k8s/argocd/vault-secrets-app.yaml
   ```

2. **Complete Kubernetes Auth Configuration (Part 4.3 above)**

3. **Monitor ArgoCD sync:**
   - Check ArgoCD UI
   - Or use: `kubectl get application vault-secrets -n openshift-gitops`

4. **Verify secrets are created:**
   ```bash
   kubectl get secrets -n vault-demo
   kubectl get vaultconnection,vaultauth,vaultstaticsecret,vaultdynamicsecret,vaultpkisecret -n vault-demo
   ```

Expected secrets:
- `vault-static-secret` - Contains the API key
- `vault-dynamic-secret` - Contains database credentials
- `vault-pki-cert` - Contains TLS certificate (type: kubernetes.io/tls)

---

## Troubleshooting

### Check VSO Operator Logs
```bash
kubectl logs -n vault-secrets-operator-system deployment/vault-secrets-operator-controller-manager -f
```

### Check CRD Status
```bash
kubectl describe vaultconnection vault-connection -n vault-demo
kubectl describe vaultauth vault-auth -n vault-demo
kubectl describe vaultstaticsecret vault-static-secret -n vault-demo
kubectl describe vaultdynamicsecret vault-dynamic-secret -n vault-demo
kubectl describe vaultpkisecret vault-pki-secret -n vault-demo
```

### Common Issues

1. **Authentication fails**: Complete Part 4.3 after ArgoCD creates the service account
2. **Secrets not syncing**: Check VSO operator logs and CRD status conditions
3. **PKI certificate issues**: Verify the domain names match and the role allows them