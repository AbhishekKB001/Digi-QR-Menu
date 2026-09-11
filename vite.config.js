import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 🚨 Make sure this exactly matches your GitHub repo name, including slashes
  base: '/Digi-QR-Menu/', 
})