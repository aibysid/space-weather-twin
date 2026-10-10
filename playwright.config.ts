import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:45000,use:{baseURL:'http://127.0.0.1:4189/space-weather-twin/',browserName:'chromium'},webServer:{command:'npm run preview -- --port 4189',url:'http://127.0.0.1:4189/space-weather-twin/',reuseExistingServer:false},reporter:[['list'],['html',{open:'never'}]]});
