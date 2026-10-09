import apiClient from './apiClient'
import { supabase } from './supabase'

/** Signs in to the shared demo account and installs the session locally. */
export async function signInToDemo(): Promise<void> {
  const { data } = await apiClient.post<{ session: { access_token: string, refresh_token: string } }>('/api/auth/demo')
  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
  if (error) throw error
}
