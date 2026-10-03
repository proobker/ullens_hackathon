import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',timeout:60000,workers:1,
  use:{baseURL:'http://localhost:5173',channel:'msedge',headless:true},
  webServer:{command:'rtk npm.cmd run start',url:'http://localhost:5173',reuseExistingServer:false,timeout:120000},
});
