# 🔐 HashiCorp Vault Secrets Operator Demo

A comprehensive demonstration of HashiCorp Vault Secrets Operator (VSO) on OpenShift, showcasing **four distinct secret delivery methods** side-by-side using a GitOps approach with ArgoCD.

## 🎯 Overview

This demo visualizes how Vault Secrets Operator can deliver secrets to applications using different methods:

1. **🔑 Static Secrets** - Environment Variables (VaultStaticSecret)
2. **🔄 Dynamic Secrets** - File Mount with Rotation (VaultDynamicSecret)
3. **💾 CSI Secrets** - Direct Mount, Memory-Only (VaultStaticSecret with volume)
4. **📜 PKI Certificates** - TLS Certificate Rotation (VaultPKISecret)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenShift Cluster                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              ArgoCD (GitOps)                       │    │
│  │  Manages: Namespace, CRDs, Deployment, Route      │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────┐    │
│  │         Vault Secrets Operator (VSO)              │    │
│  │  - VaultConnection                                 │    │
│  │  - VaultAuth (Kubernetes)                         │    │
│  │  - VaultStaticSecret (x2)                         │    │
│  │  - VaultDynamicSecret                             │    │
│  │  - VaultPKISecret                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────┐    │
│  │           Demo Dashboard Application               │    │
│  │  Card 1: Static API Key (Env Var)                │    │
│  │  Card 2: DB Credentials (File Mount)             │    │
│  │  Card 3: Top Secret (CSI Mount)                  │    │
│  │  Card 4: Certificate Info (TLS Inspection)       │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────┐    │
│  │         OpenShift Route (TLS)                      │    │
│  │  Uses certificate from VaultPKISecret             │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  HashiCorp Vault │
                  │  - KV-v2 Engine  │
                  │  - DB Engine     │
                  │  - PKI Engine    │
                  └──────────────────┘
```

## 📁 Project Structure

```
vault-openshift-demo/
├── app/                          # Application code
│   ├── Dockerfile               # Container image definition
│   ├── package.json             # Node.js dependencies
│   ├── server.js                # Express server with 4 secret readers
│   └── public/
│       └── index.html           # Dashboard UI
├── k8s/
│   ├── vault-crds/              # Vault CRD definitions
│   │   ├── 00-namespace.yaml           # Wave -1: Namespace
│   │   ├── 01-vaultconnection.yaml     # Wave 0: Connection
│   │   ├── 02-serviceaccount.yaml      # Wave 0: SA
│   │   ├── 03-vaultauth.yaml           # Wave 0: Auth
│   │   ├── 04-vaultstaticsecret.yaml   # Wave 1: Static (env)
│   │   ├── 05-vaultstaticsecret-csi.yaml # Wave 1: CSI mount
│   │   ├── 05-vaultdynamicsecret.yaml  # Wave 1: Dynamic
│   │   ├── 06-vaultpkisecret.yaml      # Wave 1: PKI
│   │   └── README.md
│   ├── app/                     # Application manifests
│   │   ├── 07-deployment.yaml          # Wave 2: Deployment
│   │   ├── 08-service.yaml             # Wave 2: Service
│   │   └── 09-route.yaml               # Wave 2: Route with TLS
│   └── argocd/                  # ArgoCD configuration
│       ├── argocd-vault-rbac.yaml      # RBAC for ArgoCD
│       └── vault-secrets-app.yaml      # ArgoCD Application
├── VAULT-SETUP.md               # Detailed Vault configuration
├── QUICK-START.md               # Quick deployment guide
└── README.md                    # This file
```

## 🚀 Quick Start

### Prerequisites

1. **OpenShift Cluster** with ArgoCD installed
2. **HashiCorp Vault** instance accessible from the cluster
3. **Vault Secrets Operator** installed in the cluster
4. **kubectl/oc** CLI configured
5. **vault** CLI installed and configured

### Step 1: Configure Vault

Follow the comprehensive guide in [VAULT-SETUP.md](./VAULT-SETUP.md) to:
- Enable KV-v2, Database, and PKI engines
- Create secrets and roles
- Configure Kubernetes authentication
- Set up policies

Or use the quick commands in [QUICK-START.md](./QUICK-START.md).

### Step 2: Build and Push Container Image

```bash
# Build the application image
cd app
docker build -t quay.io/your-org/vault-demo-app:latest .

# Push to your registry
docker push quay.io/your-org/vault-demo-app:latest
```

**Update the image reference** in `k8s/app/07-deployment.yaml`:
```yaml
image: quay.io/your-org/vault-demo-app:latest
```

### Step 3: Deploy with ArgoCD

```bash
# Apply ArgoCD RBAC (if needed)
kubectl apply -f k8s/argocd/argocd-vault-rbac.yaml

# Deploy the application
kubectl apply -f k8s/argocd/vault-secrets-app.yaml
```

### Step 4: Complete Kubernetes Auth Configuration

After ArgoCD creates the namespace and service account:

```bash
# Get cluster info
K8S_HOST=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.server}')
K8S_CA_CERT=$(kubectl config view --raw --minify --flatten -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d)

# Create service account token
SA_TOKEN=$(kubectl create token vault-demo-app -n vault-demo --duration=87600h)

# Configure Vault
vault write auth/kubernetes/config \
    kubernetes_host="$K8S_HOST" \
    kubernetes_ca_cert="$K8S_CA_CERT" \
    token_reviewer_jwt="$SA_TOKEN"
```

### Step 5: Access the Dashboard

```bash
# Get the route URL
oc get route vault-demo-app -n vault-demo

# Open in browser
https://vault-demo-app-vault-demo.apps.ocp18.tec.cz.ibm.com
```

## 🎨 Dashboard Features

The web dashboard displays four cards, each demonstrating a different secret delivery method:

### Card 1: Static Secret (Environment Variable)
- **Method**: VaultStaticSecret → Kubernetes Secret → Environment Variable
- **Displays**: API Key, Environment, Creation Timestamp
- **Use Case**: Configuration values, API keys, static credentials

### Card 2: Dynamic Secret (File Mount)
- **Method**: VaultDynamicSecret → Kubernetes Secret → Volume Mount
- **Displays**: Database username, password, last rotation timestamp
- **Use Case**: Rotating database credentials, temporary access tokens

### Card 3: CSI Secret (Direct Mount)
- **Method**: VaultStaticSecret → Volume Mount (memory-only)
- **Displays**: Top secret value, access level
- **Use Case**: Sensitive data that should never touch disk

### Card 4: PKI Certificate (TLS Inspection)
- **Method**: VaultPKISecret → TLS Secret → Route Certificate
- **Displays**: Serial number, expiration date, days remaining
- **Use Case**: Automatic certificate rotation, mTLS

## 🔄 ArgoCD Sync Waves

The deployment uses sync waves to ensure proper ordering:

- **Wave -1**: Namespace creation
- **Wave 0**: VaultConnection, VaultAuth, ServiceAccount (plumbing)
- **Wave 1**: All secret CRDs (VaultStaticSecret, VaultDynamicSecret, VaultPKISecret)
- **Wave 2**: Application Deployment, Service, Route

## 🔐 Security Features

- **Non-root containers** with security context
- **Read-only file systems** where possible
- **Secret rotation** with automatic pod restarts
- **TLS encryption** for all external communication
- **Least privilege** Vault policies
- **Kubernetes RBAC** for ArgoCD

## 📊 Monitoring

### Check VSO Status

```bash
# Check VSO operator logs
kubectl logs -n vault-secrets-operator-system deployment/vault-secrets-operator-controller-manager -f

# Check CRD status
kubectl get vaultconnection,vaultauth,vaultstaticsecret,vaultdynamicsecret,vaultpkisecret -n vault-demo

# Check created secrets
kubectl get secrets -n vault-demo
```

### Check Application Status

```bash
# Check pod status
kubectl get pods -n vault-demo

# Check application logs
kubectl logs -n vault-demo deployment/vault-demo-app -f

# Check route
oc get route vault-demo-app -n vault-demo
```

## 🐛 Troubleshooting

### Secrets Not Syncing

1. Check VSO operator logs
2. Verify VaultConnection and VaultAuth status
3. Ensure Vault policies allow access
4. Verify Kubernetes auth is configured correctly

### Application Not Starting

1. Check if secrets exist: `kubectl get secrets -n vault-demo`
2. Verify image is accessible
3. Check pod events: `kubectl describe pod -n vault-demo`
4. Review application logs

### Certificate Issues

1. Verify PKI role configuration in Vault
2. Check VaultPKISecret status
3. Ensure domain names match
4. Verify Route is using the correct secret

## 🎓 Learning Resources

- [Vault Secrets Operator Documentation](https://developer.hashicorp.com/vault/docs/platform/k8s/vso)
- [Vault on Kubernetes](https://developer.hashicorp.com/vault/tutorials/kubernetes)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [OpenShift Routes](https://docs.openshift.com/container-platform/latest/networking/routes/route-configuration.html)

## 🤝 Contributing

This is a demo project. Feel free to:
- Report issues
- Suggest improvements
- Submit pull requests
- Use as a template for your own demos

## 📝 License

MIT License - feel free to use this demo for learning and presentations.

## 👨‍💻 Author

Created by the DevSecOps Team as a comprehensive demonstration of Vault Secrets Operator capabilities.

---

**Made with Bob** 🤖