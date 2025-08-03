import { supabase } from '@/lib/supabaseClient';
import dayjs from 'dayjs';

export async function getUserInvestments(userId) {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Calcular ganancia acumulada
  const now = dayjs();
  return data.map(investment => {
    const start = dayjs(investment.created_at);
    const daysElapsed = Math.min(now.diff(start, 'day'), investment.duration);
    const earnings = investment.daily_return * daysElapsed;

    return {
      ...investment,
      daysElapsed,
      earnings
    };
  });
}
