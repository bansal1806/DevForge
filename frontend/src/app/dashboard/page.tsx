import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';

export const metadata = {
  title: 'Dashboard — DevForge',
  description: 'Your DevForge dashboard. Manage repositories, track activity, and start building.',
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch user's repositories
  const { data: repos } = await supabase
    .from('repositories')
    .select('*')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });

  return (
    <DashboardClient
      user={{
        id: user.id,
        email: user.email || '',
        name: user.user_metadata?.full_name || user.email || '',
        avatar_url: user.user_metadata?.avatar_url || '',
      }}
      repositories={repos || []}
    />
  );
}
