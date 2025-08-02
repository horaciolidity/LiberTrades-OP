import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Layout from '@/components/Layout';
import TradingChart from '@/components/trading/TradingChart';
import TradingPanel from '@/components/trading/TradingPanel';
import TradingStats from '@/components/trading/TradingStats';
import TradesHistory from '@/components/trading/TradesHistory';
import { useTradingLogic } from '@/hooks/useTradingLogic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext'; // Para obtener datos del usuario actual
import { useSound } from '@/contexts/SoundContext';

const countryFlags = {
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸', DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳',
  default: '🏳️'
};

const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈', advanced: '🥇', pro: '🏆', legend: '💎'
};

const getRandomCountry = () => {
  const countries = Object.keys(countryFlags).filter(c => c !== 'default');
  return countries[Math.floor(Math.random() * countries.length)];
}

const getRandomLevel = () => {
  const levels = Object.keys(userLevels);
  return levels[Math.floor(Math.random() * levels.length)];
}

const initialMessages = [
  { id: 1, user: 'TraderX', text: '¡BTC parece que va a subir!', country: 'US', level: 'pro', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  { id: 2, user: 'CryptoGirl', text: '¿Alguien más está viendo este volumen en ETH?', country: 'BR', level: 'advanced', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
  { id: 3, user: 'ElCriptoMaster', text: 'Cuidado con SOL, podría corregir.', country: 'MX', level: 'intermediate', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
];


const TradingSimulator = () => {
  const tradingLogic = useTradingLogic();
  const { user } = useAuth();
  const { playSound } = useSound();
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

  const handleSendMessage = () => {
    if (newMessage.trim() === '') return;
    playSound('click');
    const message = {
      id: chatMessages.length + 1,
      user: user?.name || 'UsuarioAnónimo',
      text: newMessage,
      country: user?.countryCode || getRandomCountry(), 
      level: user?.tradingLevel || getRandomLevel(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages([...chatMessages, message]);
    setNewMessage('');
  };


  return (
    <Layout>
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Simulador de Trading Avanzado
          </h1>
          <p className="text-slate-300">
            Opera con gráficos en tiempo real, dinero virtual y chatea con otros traders.
          </p>
        </motion.div>

        <TradingStats 
          virtualBalance={tradingLogic.virtualBalance}
          totalProfit={tradingLogic.totalProfit}
          openTradesCount={tradingLogic.openTrades.length}
          totalTradesCount={tradingLogic.trades.length}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="xl:col-span-9" 
          >
            <TradingChart 
              priceHistory={tradingLogic.priceHistory} 
              selectedPair={tradingLogic.selectedPair}
              cryptoPrices={tradingLogic.cryptoPrices}
            />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="xl:col-span-3" 
          >
            <Card className="crypto-card h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-white flex items-center text-lg">
                  <MessageSquare className="h-5 w-5 mr-2 text-blue-400" />
                  Chat de Traders
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto p-3 space-y-3 h-[300px] sm:h-[350px] md:h-[400px]">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col items-start">
                    <div className="flex items-center space-x-1 text-xs mb-0.5">
                      <span className="font-semibold text-purple-300">{msg.user}</span>
                      <span title={msg.country}>{countryFlags[msg.country] || countryFlags.default}</span>
                      <span title={msg.level}>{userLevels[msg.level] || ''}</span>
                      <span className="text-slate-500">{msg.time}</span>
                    </div>
                    <p className="text-sm text-slate-200 bg-slate-700/50 px-3 py-1.5 rounded-lg rounded-tl-none max-w-xs break-words">
                      {msg.text}
                    </p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </CardContent>
              <CardContent className="pt-2 pb-3 border-t border-slate-700">
                <div className="flex space-x-2">
                  <Input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="bg-slate-800 border-slate-600 text-white flex-grow"
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <Button onClick={handleSendMessage} size="icon" className="bg-blue-500 hover:bg-blue-600">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
        
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="w-full"
          >
             <TradingPanel {...tradingLogic} />
        </motion.div>


        <TradesHistory 
          trades={tradingLogic.trades} 
          cryptoPrices={tradingLogic.cryptoPrices} 
          closeTrade={tradingLogic.closeTrade}
        />
      </div>
    </Layout>
  );
};

export default TradingSimulator;