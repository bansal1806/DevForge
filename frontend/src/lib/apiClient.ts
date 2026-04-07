import axios from 'axios'
import { supabase } from './supabase'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050',
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
