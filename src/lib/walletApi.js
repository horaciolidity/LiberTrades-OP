import { supabase } from '@/lib/supabaseClient';

export const walletApi = {
  buyPlan: async ({ userId, planName, amount, dailyReturn }) => {
    return supabase.rpc('process_plan_purchase', {
      p_user_id: userId,
      p_plan_name: planName,
      p_amount: amount,
      p_daily_return: dailyReturn,
    });
  },

  buyProject: async ({ userId, projectName, amount }) => {
    return supabase.rpc('process_project_purchase', {
      p_user_id: userId,
      p_project_name: projectName,
      p_amount: amount,
    });
  },

  activateBot: async ({ userId, botName, fee }) => {
    return supabase.rpc('process_bot_activation', {
      p_user_id: userId,
      p_bot_name: botName,
      p_fee: fee,
    });
  },

  executeTradeReal: async ({ userId, symbol, side, size, price }) => {
    return supabase.rpc('process_trade_execute', {
      p_user_id: userId,
      p_symbol: symbol,
      p_side: side,
      p_size: size,
      p_price: price,
    });
  },

  // Lecturas
  fetchBalances: async (userId) => {
    return supabase.from('balances').select('*').eq('user_id', userId).single();
  },

  fetchTransactions: async (userId) => {
    return supabase.from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  },

  fetchInvestments: async (userId) => {
    return supabase.from('investments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  },

  fetchTrades: async (userId, mode) => {
    const q = supabase.from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('opened_at', { ascending: false });
    if (mode) q.eq('mode', mode);
    return q;
  },
};
