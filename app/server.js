const express = require('express');
const fs = require('fs');
const https = require('https');
const tls = require('tls');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static('public'));

// API endpoint to get all secrets data
app.get('/api/secrets', (req, res) => {
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
    data._last_updated = stats.mtime.toISOString();
    
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

// Card 4: PKI Certificate Information
function getPKIInfo() {
  try {
    const routeHostname = process.env.ROUTE_HOSTNAME || 'vault-demo-app-vault-demo.apps.ocp18.tec.cz.ibm.com';
    
    return new Promise((resolve) => {
      const options = {
        host: routeHostname,
        port: 443,
        method: 'GET',
        rejectUnauthorized: false // For demo purposes
      };
      
      const req = https.request(options, (res) => {
        const cert = res.socket.getPeerCertificate();
        
        if (cert && Object.keys(cert).length > 0) {
          resolve({
            status: 'success',
            method: 'TLS Certificate (PKI)',
            data: {
              subject: cert.subject.CN,
              issuer: cert.issuer.CN,
              serial_number: cert.serialNumber,
              valid_from: cert.valid_from,
              valid_to: cert.valid_to,
              fingerprint: cert.fingerprint,
              days_remaining: Math.floor((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24))
            }
          });
        } else {
          resolve({
            status: 'error',
            method: 'TLS Certificate (PKI)',
            error: 'No certificate found'
          });
        }
      });
      
      req.on('error', (error) => {
        resolve({
          status: 'error',
          method: 'TLS Certificate (PKI)',
          error: error.message
        });
      });
      
      req.end();
    });
  } catch (error) {
    return Promise.resolve({
      status: 'error',
      method: 'TLS Certificate (PKI)',
      error: error.message
    });
  }
}

// Modified API endpoint to handle async PKI
app.get('/api/secrets', async (req, res) => {
  const secretsData = {
    static: getStaticSecret(),
    dynamic: getDynamicSecret(),
    csi: getCSISecret(),
    pki: await getPKIInfo(),
    timestamp: new Date().toISOString()
  };
  
  res.json(secretsData);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Vault Demo Dashboard running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔍 API: http://localhost:${PORT}/api/secrets`);
  console.log(`💚 Health: http://localhost:${PORT}/health`);
});

// Made with Bob
