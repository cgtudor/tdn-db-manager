const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'TDN Database Manager',
  description: 'Web-based database manager for TDN persistent world',
  script: path.join(__dirname, 'dist', 'index.js'),
  nodeOptions: [],
  env: [{
    name: 'NODE_ENV',
    value: 'production'
  }]
});

svc.on('install', () => {
  svc.start();
  console.log('Service installed and started');
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

svc.install();
