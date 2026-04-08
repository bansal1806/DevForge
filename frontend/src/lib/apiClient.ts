import axios from 'axios'
import { supabase } from './supabase'

const rawBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050'
const baseURL = rawBaseURL.endsWith('/') ? rawBaseURL.slice(0, -1) : rawBaseURL

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Unified path joining to prevent double /api
apiClient.interceptors.request.use((config) => {
  if (config.url?.startsWith('/api') && baseURL.endsWith('/api')) {
    config.url = config.url.replace('/api', '')
  }
  return config
})

// Add a request interceptor to attach the Supabase access token
apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

export default apiClient
