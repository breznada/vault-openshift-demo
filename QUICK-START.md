# 🚀 Quick Start Guide

Get the Vault Secrets Operator demo running in minutes!

## Prerequisites Checklist

- [ ] OpenShift cluster with ArgoCD installed
- [ ] Vault Secrets Operator installed
- [ ] HashiCorp Vault accessible at `http://vault.tec.cz.ibm.com:8200`
- [ ] `vault` CLI configured and authenticated
- [ ] `kubectl` or `oc` CLI configured
- [ ] Container registry access (e.g., Quay.io)

## Step 1: Configure Vault (5 minutes)

### Quick Setup Commands

```bash
# Set Vault address
export VAULT_ADDR=http://vault.tec.cz.ibm.com:8200
vault login

# Enable engines
vault secrets enable -path=secret kv-v2
vault secrets enable database
vault secrets enable pki

# Configure PKI
vault secrets tune -max-lease-ttl=87600h pki
vault write -field=certificate pki/root/generate/internal \
    common_name="Demo Root CA" \
    issuer_name="root-2024" \
    ttl=87600h

vault write pki/config/urls \
    issuing_certificates="http://vault.tec.cz.ibm.com:8200/v1/pki/ca" \
    crl_distribution_points="http://vault.tec.cz.ibm.com:8200/v1/pki/crl"

vault write pki/roles/tec-role \
    allowed_domains="apps.ocp18.tec.cz.ibm.com" \
    allow_subdomains=true \
    max_ttl="720h" \
    ttl="5m" \
    key_type="rsa" \
    key_bits=2048

# Create secrets
vault kv put secret/demo/static \
    api_key="demo-api-key-12345" \
    environment="production" \
    created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

vault kv put secret/demo/csi \
    top_secret="This is a TOP SECRET value from CSI mount!" \
    access_level="classified" \
    mounted_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Configure database (mock for demo)
vault write database/config/demo-db \
    plugin_name=postgresql-database-plugin \
    allowed_roles="demo-role" \
    connection_url="postgresql://{{username}}:{{password}}@localhost:5432/demo?sslmode=disable" \
    username="demo" \
    password="demo"

vault write database/roles/demo-role \
    db_name=demo-db \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';" \
    default_ttl="1h" \
    max_ttl="24h"

# Enable Kubernetes auth
vault auth enable kubernetes

# Create policy
vault policy write vault-demo-role - <<EOF
path "secret/data/demo/static" {
  capabilities = ["read"]
}
path "secret/data/demo/csi" {
  capabilities = ["read"]
}
path "database/creds/demo-role" {
  capabilities = ["read"]
}
path "pki/issue/tec-role" {
  capabilities = ["create", "update"]
}
path "pki/revoke" {
  capabilities = ["create", "update"]
}
EOF

# Create Kubernetes auth role
vault write auth/kubernetes/role/vault-demo-role \
    bound_service_account_names=vault-demo-app \
    bound_service_account_namespaces=vault-demo \
    policies=vault-demo-role \
    ttl=24h
```

## Step 2: Build Application Image (3 minutes)

```bash
# Clone or navigate to the project
cd vault-openshift-demo/app

# Build image
docker build -t quay.io/YOUR_ORG/vault-demo-app:latest .

# Push to registry
docker push quay.io/YOUR_ORG/vault-demo-app:latest
```

**Important**: Update the image reference in `k8s/app/07-deployment.yaml`:
```yaml
image: quay.io/YOUR_ORG/vault-demo-app:latest
```

## Step 3: Deploy with ArgoCD (2 minutes)

```bash
# Apply RBAC for ArgoCD
kubectl apply -f k8s/argocd/argocd-vault-rbac.yaml

# Deploy the application
kubectl apply -f k8s/argocd/vault-secrets-app.yaml

# Watch the sync
kubectl get application vault-secrets -n openshift-gitops -w
```

## Step 4: Complete Kubernetes Auth (2 minutes)

**Wait for the namespace and service account to be created**, then:

```bash
# Get cluster information
K8S_HOST=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.server}')
K8S_CA_CERT=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d)

# Create service account token
SA_TOKEN=$(kubectl create token vault-demo-app -n vault-demo --duration=87600h)

# Configure Vault Kubernetes auth
vault write auth/kubernetes/config \
    kubernetes_host="$K8S_HOST" \
    kubernetes_ca_cert="$K8S_CA_CERT" \
    token_reviewer_jwt="$SA_TOKEN"
```

## Step 5: Verify Deployment (1 minute)

```bash
# Check all resources
kubectl get all -n vault-demo

# Check secrets are created
kubectl get secrets -n vault-demo

# Check VSO CRDs
kubectl get vaultconnection,vaultauth,vaultstaticsecret,vaultdynamicsecret,vaultpkisecret -n vault-demo

# Get the route URL
oc get route vault-demo-app -n vault-demo
```

Expected output:
```
NAME                              HOST/PORT
vault-demo-app   vault-demo-app-vault-demo.apps.ocp18.tec.cz.ibm.com
```

## Step 6: Access Dashboard

Open your browser to:
```
https://vault-demo-app-vault-demo.apps.ocp18.tec.cz.ibm.com
```

You should see 4 cards displaying:
- ✅ **Card 1**: Static API Key (from environment variable)
- ✅ **Card 2**: Dynamic DB credentials (from file mount)
- ✅ **Card 3**: CSI secret (from direct mount)
- ✅ **Card 4**: PKI certificate info (from Route TLS)

## 🎉 Success!

The dashboard auto-refreshes every 5 seconds to show:
- Secret values (partially masked)
- Rotation timestamps
- Certificate expiration
- Real-time status

## 🔍 Verification Commands

```bash
# Check VSO operator logs
kubectl logs -n vault-secrets-operator-system deployment/vault-secrets-operator-controller-manager -f

# Check application logs
kubectl logs -n vault-demo deployment/vault-demo-app -f

# Describe CRDs for status
kubectl describe vaultconnection vault-connection -n vault-demo
kubectl describe vaultauth vault-auth -n vault-demo
kubectl describe vaultstaticsecret -n vault-demo
kubectl describe vaultdynamicsecret -n vault-demo
kubectl describe vaultpkisecret -n vault-demo

# Check secret contents
kubectl get secret vault-static-secret -n vault-demo -o yaml
kubectl get secret vault-dynamic-secret -n vault-demo -o yaml
kubectl get secret vault-csi-secret -n vault-demo -o yaml
kubectl get secret vault-pki-cert -n vault-demo -o yaml
```

## 🐛 Troubleshooting

### Issue: Secrets not syncing

**Solution**: Check VSO operator logs and verify Vault policies:
```bash
kubectl logs -n vault-secrets-operator-system deployment/vault-secrets-operator-controller-manager
vault policy read vault-demo-role
```

### Issue: Authentication failed

**Solution**: Verify Kubernetes auth configuration:
```bash
vault read auth/kubernetes/config
vault read auth/kubernetes/role/vault-demo-role
```

### Issue: Pod not starting

**Solution**: Check if secrets exist:
```bash
kubectl get secrets -n vault-demo
kubectl describe pod -n vault-demo
```

### Issue: Certificate not rotating

**Solution**: Check PKI configuration:
```bash
vault read pki/roles/tec-role
kubectl describe vaultpkisecret vault-pki-secret -n vault-demo
```

## 📚 Next Steps

- Review [VAULT-SETUP.md](./VAULT-SETUP.md) for detailed explanations
- Check [README.md](./README.md) for architecture details
- Experiment with different TTL values for rotation
- Try modifying secrets in Vault and watch them sync

## 🎓 Demo Tips

1. **Show rotation**: Change the PKI TTL to 1 minute to demonstrate fast rotation
2. **Show sync**: Update a secret in Vault and watch the dashboard update
3. **Show restart**: Modify a secret and watch the pod restart automatically
4. **Show security**: Highlight the different delivery methods and their use cases

---

**Total Setup Time**: ~15 minutes

**Made with Bob** 🤖