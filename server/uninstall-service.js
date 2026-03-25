const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'TDN Database Manager',
  script: path.join(__dirname, 'dist', 'index.js'),
});

svc.on('uninstall', () => {
  console.log('Service uninstalled');
});

svc.uninstall();
