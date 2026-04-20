# Vault Secrets Operator CSI Driver Setup

This guide explains how to set up and use the Vault Secrets Operator CSI driver for dynamic secret updates without pod restarts.

## Overview

The CSI driver provides:
- **Dynamic secret updates** without pod restarts (based on `refreshInterval`)
- **Ephemeral volumes** mounted directly from Vault
- **File-based secret access** with indexed naming

## Prerequisites

1. Vault Secrets Operator installed
2. Vault server accessible from the cluster
3. Kubernetes auth method configured in Vault

## Step 1: Enable CSI Driver

Update your Vault Secrets Operator Helm installation to enable the CSI driver:

```bash
helm upgrade vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace openshift-operators \
  --set "csi.enabled=true" \
  --reuse-values
```

Or if installing fresh:

```bash
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault-secrets-operator-system \
  --create-namespace \
  --set "csi.enabled=true"
```

This deploys the CSI driver as a DaemonSet on every node.

## Step 2: Verify CSI Driver Installation

Check that the CSI driver pods are running:

```bash
kubectl get pods -n vault-secrets-operator-system -l app.kubernetes.io/name=vault-secrets-operator-csi-provider
```

You should see one pod per node in your cluster.

## Step 3: Verify Vault Policies

The CSI driver uses the same authentication as the regular Vault Secrets Operator resources, so it needs the same permissions.

**Good news**: If you followed the VAULT-SETUP.md guide, your existing `vault-demo-role` policy already includes access to `secret/data/demo/csi`:

```hcl
# Allow reading CSI secrets
path "secret/data/demo/csi" {
  capabilities = ["read"]
}
```

You can verify this:

```bash
vault policy read vault-demo-role
```

**No additional policy configuration is needed!** The CSISecrets resource references the existing VaultAuth, which uses the `vault-demo-role` policy that already has the necessary permissions.

## Step 4: Create CSISecrets Resource

Create a `CSISecrets` resource that defines which secrets to fetch:

```yaml
apiVersion: secrets.hashicorp.com/v1beta1
kind: CSISecrets
metadata:
  name: vault-csi-secrets
  namespace: vault-demo
spec:
  # Reference existing VaultAuth
  vaultAuthRef:
    name: vault-auth
  
  # Define secrets to fetch
  secrets:
    vaultStaticSecrets:
      - mount: secret
        path: demo/csi
        type: kv-v2
  
  # Access control - which pods can use this
  accessControl:
    serviceAccountPattern: "^vault-demo-app$"
    namespacePatterns:
      - "^vault-demo$"
    podNamePatterns:
      - "^vault-demo-app-.*"
  
  # Sync configuration for dynamic updates
  syncConfig:
    containerState:
      namePattern: "^vault-demo-app$"
    refreshInterval: 1s  # Check Vault every 1 second
```

Apply it:

```bash
kubectl apply -f k8s/vault-crds/06-csisecrets.yaml
```

## Step 5: Update Deployment to Use CSI Volume

Modify your deployment to mount the CSI volume:

```yaml
spec:
  template:
    spec:
      containers:
      - name: vault-demo-app
        volumeMounts:
        - name: csi-secrets
          mountPath: /mnt/secrets/vault-data
          readOnly: true
      
      volumes:
      - name: csi-secrets
        csi:
          driver: csi.vso.hashicorp.com
          volumeAttributes:
            csiSecretsName: vault-csi-secrets
            csiSecretsNamespace: vault-demo
```

## Step 6: Access Secrets in Your Application

The CSI driver creates files with indexed names:

```
/mnt/secrets/vault-data/
├── static_secret_0_api_key
├── static_secret_0_environment
└── static_secret_0_created_at
```

Read them in your application:

```javascript
const fs = require('fs');

const apiKey = fs.readFileSync('/mnt/secrets/vault-data/static_secret_0_api_key', 'utf8').trim();
const environment = fs.readFileSync('/mnt/secrets/vault-data/static_secret_0_environment', 'utf8').trim();
```

## How It Works

1. **Pod starts**: Kubelet requests the CSI driver to mount the volume
2. **CSI driver authenticates**: Uses the VaultAuth configuration to authenticate to Vault
3. **Secrets fetched**: CSI driver fetches secrets from Vault and creates files
4. **Continuous sync**: Based on `refreshInterval`, the CSI driver checks Vault for updates
5. **Files updated**: When secrets change in Vault, files are updated **without pod restart**
6. **Application reads**: Your application reads the updated files on next access

## Key Differences from Regular Secrets

| Feature | Regular K8s Secret | CSI Driver |
|---------|-------------------|------------|
| Pod restart needed | Yes (for env vars) | No |
| Update frequency | Kubelet sync (~60s) | Configurable (1s+) |
| Storage | etcd | Ephemeral (memory) |
| File naming | Original keys | Indexed (static_secret_0_key) |
| Rollout restart | Supported | Not needed |

## Troubleshooting

### Check CSI driver logs

```bash
kubectl logs -n vault-secrets-operator-system -l app.kubernetes.io/name=vault-secrets-operator-csi-provider
```

### Verify CSISecrets status

```bash
kubectl describe csisecrets vault-csi-secrets -n vault-demo
```

### Check pod events

```bash
kubectl describe pod <pod-name> -n vault-demo
```

### Common issues

1. **Volume mount fails**: Check that CSI driver is running on the node
2. **Authentication fails**: Verify VaultAuth configuration and Vault policies
3. **Files not updating**: Check `refreshInterval` and Vault connectivity
4. **Access denied**: Verify `accessControl` patterns match your pod

## Testing Dynamic Updates

1. Update a secret in Vault:
   ```bash
   vault kv put secret/demo/csi api_key="new-value-$(date +%s)"
   ```

2. Watch the file update (without pod restart):
   ```bash
   kubectl exec -it <pod-name> -n vault-demo -- watch cat /mnt/secrets/vault-data/static_secret_0_api_key
   ```

3. The value should update within 1-2 seconds!

## Best Practices

1. **Use appropriate refresh intervals**: Balance between freshness and Vault load
2. **Implement file watchers**: Have your app react to file changes
3. **Handle read errors gracefully**: Files may be temporarily unavailable during updates
4. **Use access control**: Restrict which pods can access which CSISecrets
5. **Monitor CSI driver**: Watch for authentication or connectivity issues

## References

- [Vault Secrets Operator CSI Documentation](https://developer.hashicorp.com/vault/docs/platform/k8s/vso/csi)
- [CSISecrets API Reference](https://developer.hashicorp.com/vault/docs/platform/k8s/vso/api-reference)

---
Made with Bob