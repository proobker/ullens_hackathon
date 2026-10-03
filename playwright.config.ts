import { defineConfig } from '@playwright/test';
// E2E runs use a throwaway database so registrations and saved faces never accumulate across runs.
const e2eDatabase='.data/e2e.sqlite';
export default defineConfig({
  testDir:'tests/browser',timeout:60000,workers:1,
  use:{baseURL:'http://localhost:5173',channel:'msedge',headless:true},
  webServer:{command:`node -e "for(const s of ['','-shm','-wal'])require('fs').rmSync('${e2eDatabase}'+s,{force:true})" && rtk npm.cmd run start`,url:'http://localhost:5173',reuseExistingServer:false,timeout:120000,env:{DATABASE_PATH:e2eDatabase}},
});
