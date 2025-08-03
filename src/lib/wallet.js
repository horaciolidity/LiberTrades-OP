import { supabase } from '@/lib/supabaseClient';

export async function getUserBalance(userId) {
  const { data, error } = await supabase
    .from('balances')
    .select('balance, demo_balance')
    .eq('user_id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function rechargeDemoBalance(userId, amount = 1000) {
  const { error } = await supabase
    .from('balances')
    .update({ demo_balance: amount, updated_at: new Date() })
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}
