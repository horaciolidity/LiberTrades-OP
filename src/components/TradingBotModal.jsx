// src/components/TradingBotModal.jsx
import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';

export default function TradingBotModal({ bot, onClose }) {
  const { canActivateBot, activateBot, getAvailableBalance } = useData();
  const [amount, setAmount] = useState(250);
  const [checking, setChecking] = useState(false);
  const [warn, setWarn] = useState(null);

  // chequeo en vivo al cambiar el monto
  useEffect(() => {
    let alive = true;
    (async () => {
      setChecking(true);
      const chk = await canActivateBot(amount, 'USDC');
      if (!alive) return;
      setWarn(chk.ok ? null : `Saldo insuficiente. Te faltan $${chk.needed.toFixed(2)} (disp: $${chk.available.toFixed(2)})`);
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [amount, canActivateBot]);

  const onActivate = async () => {
    setChecking(true);
    const chk = await canActivateBot(amount, 'USDC');
    if (!chk.ok) {
      setWarn(`Saldo insuficiente. Te faltan $${chk.needed.toFixed(2)} (disp: $${chk.available.toFixed(2)})`);
      setChecking(false);
      return;
    }

    const r = await activateBot({
      botId: bot.id,
      botName: bot.name,
      strategy: bot.strategy || 'default',
      amountUsd: amount,
    });

    setChecking(false);
    if (r?.ok !== false) onClose?.(); // éxito o fallback OK
    else setWarn('No se pudo activar el bot (ver consola).');
  };

  return (
    <div className="modal">
      {/* …tu UI… */}
      <input
        type="number"
        min={bot?.min || 10}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <button disabled={checking} onClick={onActivate}>
        {checking ? 'Verificando…' : 'Activar Bot'}
      </button>
      {warn && <div className="warn">{warn}</div>}
    </div>
  );
}
