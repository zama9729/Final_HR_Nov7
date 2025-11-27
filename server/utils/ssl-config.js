/**
 * SSL/HTTPS Configuration Helper
 * 
 * Provides utilities for SSL certificate management and HTTPS server setup
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load SSL certificates from file paths
 * @param {string} certPath - Path to certificate file
 * @param {string} keyPath - Path to private key file
 * @returns {Object|null} SSL options or null if files don't exist
 */
export function loadSSLCertificates(certPath, keyPath) {
  try {
    const cert = fs.readFileSync(certPath, 'utf8');
    const key = fs.readFileSync(keyPath, 'utf8');
    
    return {
      cert,
      key,
    };
  } catch (error) {
    console.warn(`[SSL] Could not load certificates: ${error.message}`);
    return null;
  }
}

/**
 * Get SSL certificate paths from environment or defaults
 * @returns {Object} Object with certPath and keyPath
 */
export function getSSLCertificatePaths() {
  const sslDir = process.env.SSL_CERT_DIR || path.join(__dirname, '../../nginx/ssl');
  
  return {
    certPath: process.env.SSL_CERT_PATH || path.join(sslDir, 'cert.pem'),
    keyPath: process.env.SSL_KEY_PATH || path.join(sslDir, 'key.pem'),
  };
}

/**
 * Check if SSL is enabled and certificates are available
 * @returns {boolean}
 */
export function isSSLEnabled() {
  const sslEnabled = process.env.SSL_ENABLED === 'true' || process.env.HTTPS_ENABLED === 'true';
  if (!sslEnabled) return false;

  const { certPath, keyPath } = getSSLCertificatePaths();
  return fs.existsSync(certPath) && fs.existsSync(keyPath);
}

/**
 * Create HTTPS server with SSL certificates
 * @param {Express} app - Express application
 * @param {number} port - Port to listen on
 * @returns {https.Server|null} HTTPS server or null if SSL not available
 */
export function createHTTPSServer(app, port) {
  if (!isSSLEnabled()) {
    console.log('[SSL] SSL is disabled. Use HTTP server.');
    return null;
  }

  const { certPath, keyPath } = getSSLCertificatePaths();
  const sslOptions = loadSSLCertificates(certPath, keyPath);

  if (!sslOptions) {
    console.warn('[SSL] SSL enabled but certificates not found. Falling back to HTTP.');
    return null;
  }

  const httpsServer = https.createServer(sslOptions, app);
  
  httpsServer.listen(port, '0.0.0.0', () => {
    console.log(`🔒 HTTPS server running on https://0.0.0.0:${port}`);
    console.log(`🌐 Accessible on your network at: https://192.168.0.121:${port}`);
  });

  return httpsServer;
}

/**
 * Redirect HTTP to HTTPS middleware
 * Use this if you want the Node.js server to handle redirects
 * (Otherwise, use nginx for better performance)
 */
export function redirectHTTPToHTTPS() {
  return (req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    return res.redirect(`https://${req.headers.host}${req.url}`);
  };
}

