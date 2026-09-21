// Test-only entry point. Production never loads this file or test environment variables.
const { app } = require('electron');
const path = require('node:path');
if (!process.env.TARE_TEST_DIR) throw new Error('TARE_TEST_DIR is required');
app.setPath('userData', path.join(process.env.TARE_TEST_DIR, 'user-data'));
app.disableHardwareAcceleration();
require('../src/main');
