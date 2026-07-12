import axios from 'axios'
import { supabase } from './supabase'

// Request paths always include the /api prefix, so the base URL must be the
// bare origin — strip any trailing slash or /api suffix from the env value.
const rawBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050'
const baseURL = rawBaseURL.replace(/\/+$/, '').replace(/\/api$/, '')

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
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
