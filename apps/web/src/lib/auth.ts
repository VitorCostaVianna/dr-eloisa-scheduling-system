import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface CurrentUser {
  id: string;
  role: 'DENTIST' | 'STAFF';
}

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const cookieStore = await cookies();
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (!response.ok) {
    redirect('/login');
  }

  return response.json();
});
