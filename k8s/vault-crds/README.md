# Vault Secrets Operator CRDs

This directory contains the Vault Secrets Operator Custom Resource Definitions for the demo application.

## Structure

The manifests are organized with ArgoCD sync waves to ensure proper ordering:

### Wave -1: Namespace
- `00-namespace.yaml` - Creates the `vault-demo` namespace

### Wave 0: Authentication & Connection
- `01-vaultconnection.yaml` - Configures connection to Vault at `http://vault.tec.cz.ibm.com:8200`
- `02-serviceaccount.yaml` - Service account `vault-demo-app` for Kubernetes authentication
- `03-vaultauth.yaml` - Configures Kubernetes auth method using the service account

### Wave 1: Secret Definitions
- `04-vaultstaticsecret.yaml` - Static secret from KV-v2 (`secret/demo/static`)
- `05-vaultdynamicsecret.yaml` - Dynamic database credentials (`database/creds/demo-role`)
- `06-vaultpkisecret.yaml` - PKI certificate for TLS (`pki/role/tec-role`)

## Prerequisites

Before deploying these CRDs, ensure:

1. **Vault Secrets Operator is installed** in your OpenShift cluster
2. **Vault is configured** with:
   - Kubernetes auth method enabled at `kubernetes/`
   - Role `vault-demo-role` configured for the service account
   - KV-v2 engine enabled at `secret/`
   - Database engine enabled at `database/`
   - PKI engine enabled at `pki/`
   - PKI role `tec-role` configured

## Deployment

### Option 1: Using ArgoCD (Recommended)

Apply the ArgoCD Application:

```bash
kubectl apply -f ../argocd/vault-secrets-app.yaml
```

### Option 2: Manual Deployment

```bash
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-vaultconnection.yaml
kubectl apply -f 02-serviceaccount.yaml
kubectl apply -f 03-vaultauth.yaml
kubectl apply -f 04-vaultstaticsecret.yaml
kubectl apply -f 05-vaultdynamicsecret.yaml
kubectl apply -f 06-vaultpkisecret.yaml
```

## Verification

Check the status of the Vault CRDs:

```bash
# Check VaultConnection
kubectl get vaultconnection -n vault-demo

# Check VaultAuth
kubectl get vaultauth -n vault-demo

# Check VaultStaticSecret
kubectl get vaultstaticsecret -n vault-demo

# Check VaultDynamicSecret
kubectl get vaultdynamicsecret -n vault-demo

# Check VaultPKISecret
kubectl get vaultpkisecret -n vault-demo

# Check created secrets
kubectl get secrets -n vault-demo
```

Expected secrets:
- `vault-static-secret` - Contains static API key
- `vault-dynamic-secret` - Contains dynamic database credentials
- `vault-pki-cert` - Contains TLS certificate (type: kubernetes.io/tls)

## Troubleshooting

### Check VSO logs
```bash
kubectl logs -n vault-secrets-operator-system deployment/vault-secrets-operator-controller-manager
```

### Check CRD status
```bash
kubectl describe vaultconnection vault-connection -n vault-demo
kubectl describe vaultauth vault-auth -n vault-demo
```

### Common Issues

1. **Authentication fails**: Ensure the Kubernetes auth role in Vault is properly configured
2. **Secrets not created**: Check VSO operator logs and CRD status conditions
3. **Certificate issues**: Verify PKI role configuration and domain names match