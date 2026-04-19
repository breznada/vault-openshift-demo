const express = require('express');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 8443;
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || '/vault/secrets/pki/tls.crt';
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || '/vault/secrets/pki/tls.key';

// Serve static files
app.use(express.static('public'));

// API endpoint to get all secrets data
app.get('/api/secrets', async (req, res) => {
  const secretsData = {
    static: getStaticSecret(),
    dynamic: getDynamicSecret(),
    csi: getCSISecret(),
    pki: getPKIInfo(),
    timestamp: new Date().toISOString()
  };
  
  res.json(secretsData);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Card 1: Static Secret from Environment Variable
function getStaticSecret() {
  try {
    const apiKey = process.env.API_KEY || 'NOT_FOUND';
    const environment = process.env.ENVIRONMENT || 'unknown';
    const createdAt = process.env.CREATED_AT || 'unknown';
    
    return {
      status: apiKey !== 'NOT_FOUND' ? 'success' : 'error',
      method: 'Environment Variable',
      data: {
        api_key: apiKey,
        environment: environment,
        created_at: createdAt
      }
    };
  } catch (error) {
    return {
      status: 'error',
      method: 'Environment Variable',
      error: error.message
    };
  }
}

// Card 2: Dynamic Secret from File Mount
function getDynamicSecret() {
  try {
    const secretPath = '/vault/secrets/dynamic';
    
    if (!fs.existsSync(secretPath)) {
      return {
        status: 'error',
        method: 'File Mount (Dynamic)',
        error: 'Secret path not found'
      };
    }
    
    const files = fs.readdirSync(secretPath);
    const data = {};
    
    files.forEach(file => {
      const filePath = `${secretPath}/${file}`;
      if (fs.statSync(filePath).isFile()) {
        data[file] = fs.readFileSync(filePath, 'utf8').trim();
      }
    });
    
    // Get file modification time for rotation tracking
    const stats = fs.statSync(secretPath);
    const lastUpdated = stats.mtime;
    data.last_updated = lastUpdated.toISOString();
    
    // Calculate time until next rotation (90 second TTL, rotates at ~67% = 60s)
    const now = new Date();
    const ageSeconds = Math.floor((now - lastUpdated) / 1000);
    const rotationInterval = 60; // Rotates every ~60 seconds
    const secondsUntilRotation = Math.max(0, rotationInterval - ageSeconds);
    data.rotation_in = `${secondsUntilRotation}s`;
    
    return {
      status: 'success',
      method: 'File Mount (Dynamic)',
      data: data
    };
  } catch (error) {
    return {
      status: 'error',
      method: 'File Mount (Dynamic)',
      error: error.message
    };
  }
}

// Card 3: CSI Secret from Direct Mount
function getCSISecret() {
  try {
    const csiPath = '/mnt/secrets/vault-data';
    
    if (!fs.existsSync(csiPath)) {
      return {
        status: 'error',
        method: 'CSI Direct Mount',
        error: 'CSI mount path not found'
      };
    }
    
    const files = fs.readdirSync(csiPath);
    const data = {};
    
    files.forEach(file => {
      const filePath = `${csiPath}/${file}`;
      if (fs.statSync(filePath).isFile()) {
        data[file] = fs.readFileSync(filePath, 'utf8').trim();
      }
    });
    
    return {
      status: 'success',
      method: 'CSI Direct Mount (Memory-Only)',
      data: data
    };
  } catch (error) {
    return {
      status: 'error',
      method: 'CSI Direct Mount (Memory-Only)',
      error: error.message
    };
  }
}

// Card 4: PKI Certificate Information (from mounted Vault cert)
function getPKIInfo() {
  try {
    if (!fs.existsSync(TLS_CERT_PATH)) {
      return {
        status: 'error',
        method: 'PKI Certificate (Vault-Managed TLS)',
        error: 'Certificate file not found at ' + TLS_CERT_PATH
      };
    }
    
    const certContent = fs.readFileSync(TLS_CERT_PATH, 'utf8');
    const keyExists = fs.existsSync(TLS_KEY_PATH);
    
    // Get file stats for rotation tracking
    const certStats = fs.statSync(TLS_CERT_PATH);
    const issuedAt = certStats.mtime;
    const now = new Date();
    const ageSeconds = Math.floor((now - issuedAt) / 1000);
    
    // Calculate expiration (5 minutes TTL for demo)
    const expiresAt = new Date(issuedAt.getTime() + (5 * 60 * 1000));
    const secondsRemaining = Math.floor((expiresAt - now) / 1000);
    
    // Extract cert info
    const certLines = certContent.split('\n');
    const certData = certLines.filter(line => 
      !line.includes('BEGIN CERTIFICATE') && 
      !line.includes('END CERTIFICATE') &&
      line.trim() !== ''
    ).join('');
    
    return {
      status: 'success',
      method: 'PKI Certificate (Vault-Managed TLS)',
      data: {
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        cert_size_bytes: certContent.length,
        has_private_key: keyExists ? 'Yes' : 'No',
        actively_serving: 'Yes - This HTTPS connection uses this cert!'
      }
    };
  } catch (error) {
    return {
      status: 'error',
      method: 'PKI Certificate (Vault-Managed TLS)',
      error: error.message
    };
  }
}

// Start HTTPS server with Vault certificate
function startServer() {
  try {
    // Check if certificate files exist
    if (!fs.existsSync(TLS_CERT_PATH) || !fs.existsSync(TLS_KEY_PATH)) {
      console.error('❌ TLS certificate or key not found!');
      console.error(`   Certificate: ${TLS_CERT_PATH}`);
      console.error(`   Key: ${TLS_KEY_PATH}`);
      console.error('   Waiting for Vault PKI secret to be mounted...');
      
      // Retry after 5 seconds
      setTimeout(startServer, 5000);
      return;
    }
    
    const httpsOptions = {
      cert: fs.readFileSync(TLS_CERT_PATH),
      key: fs.readFileSync(TLS_KEY_PATH)
    };
    
    const server = https.createServer(httpsOptions, app);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log('🔐 Vault Demo Dashboard (HTTPS) running');
      console.log(`📊 Dashboard: https://localhost:${PORT}`);
      console.log(`🔍 API: https://localhost:${PORT}/api/secrets`);
      console.log(`💚 Health: https://localhost:${PORT}/health`);
      console.log(`🔑 Using Vault PKI Certificate from: ${TLS_CERT_PATH}`);
      console.log('✨ Certificate rotates automatically every ~5 minutes!');
    });
    
    // Watch for certificate changes and reload
    fs.watch(TLS_CERT_PATH, (eventType) => {
      if (eventType === 'change') {
        console.log('🔄 Certificate changed! Reloading...');
        server.close(() => {
          console.log('♻️  Server restarted with new certificate');
          startServer();
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start HTTPS server:', error.message);
    console.error('   Retrying in 5 seconds...');
    setTimeout(startServer, 5000);
  }
}

// Start the server
startServer();

// Made with Bob
