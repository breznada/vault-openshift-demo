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

