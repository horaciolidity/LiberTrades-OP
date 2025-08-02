import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Settings, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';

const PreferencesTab = () => {
  const { user, updateUser } = useAuth();
  const { playSound } = useSound();
  const [preferences, setPreferences] = useState({
    timezone: user?.preferences?.timezone || 'UTC-5',
    language: user?.preferences?.language || 'es',
    currency: user?.preferences?.currency || 'USD',
    theme: user?.preferences?.theme || 'dark'
  });

  const handlePreferencesUpdate = () => {
    updateUser({ preferences });
    playSound('success');
    toast({
      title: "Preferencias actualizadas",
      description: "Tus preferencias de cuenta han sido guardadas.",
    });
  };

  const timezones = [
    { value: "UTC-12", label: "UTC-12:00" },
    { value: "UTC-11", label: "UTC-11:00" },
    { value: "UTC-10", label: "UTC-10:00 (Hawái)" },
    { value: "UTC-9", label: "UTC-09:00 (Alaska)" },
    { value: "UTC-8", label: "UTC-08:00 (Hora del Pacífico)" },
    { value: "UTC-7", label: "UTC-07:00 (Hora de la Montaña)" },
    { value: "UTC-6", label: "UTC-06:00 (Hora Central, Ciudad de México)" },
    { value: "UTC-5", label: "UTC-05:00 (Hora del Este, Bogotá)" },
    { value: "UTC-4", label: "UTC-04:00 (Hora del Atlántico, Caracas)" },
    { value: "UTC-3", label: "UTC-03:00 (Buenos Aires, São Paulo)" },
    { value: "UTC-2", label: "UTC-02:00" },
    { value: "UTC-1", label: "UTC-01:00" },
    { value: "UTC", label: "UTC (Tiempo Universal Coordinado)" },
    { value: "UTC+1", label: "UTC+01:00 (Europa Central, Madrid)" },
    { value: "UTC+2", label: "UTC+02:00 (Europa del Este)" },
  ];

  const languages = [
    { value: "es", label: "Español" },
    { value: "en", label: "English" },
    { value: "pt", label: "Português" },
    { value: "fr", label: "Français" },
  ];

  const currencies = [
    { value: "USD", label: "USD - Dólar Americano" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "GBP", label: "GBP - Libra Esterlina" },
    { value: "JPY", label: "JPY - Yen Japonés" },
    { value: "BTC", label: "BTC - Bitcoin" },
    { value: "ETH", label: "ETH - Ethereum" },
  ];

  const themes = [
    { value: "dark", label: "Oscuro" },
    { value: "light", label: "Claro (Próximamente)" },
    { value: "auto", label: "Automático (Sistema)" },
  ];

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Settings className="h-5 w-5 mr-2 text-purple-400" />
          Preferencias de la Cuenta
        </CardTitle>
        <CardDescription className="text-slate-300">
          Configuraciones adicionales de tu cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-white">Zona Horaria</Label>
            <select
              value={preferences.timezone}
              onChange={(e) => setPreferences({...preferences, timezone: e.target.value})}
              className="w-full p-2 bg-slate-800 border border-slate-600 rounded-md text-white"
            >
              {timezones.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Idioma</Label>
            <select
              value={preferences.language}
              onChange={(e) => setPreferences({...preferences, language: e.target.value})}
              className="w-full p-2 bg-slate-800 border border-slate-600 rounded-md text-white"
            >
              {languages.map(lang => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Moneda Preferida</Label>
            <select
              value={preferences.currency}
              onChange={(e) => setPreferences({...preferences, currency: e.target.value})}
              className="w-full p-2 bg-slate-800 border border-slate-600 rounded-md text-white"
            >
              {currencies.map(curr => <option key={curr.value} value={curr.value}>{curr.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-white">Tema Visual</Label>
            <select
              value={preferences.theme}
              onChange={(e) => setPreferences({...preferences, theme: e.target.value})}
              className="w-full p-2 bg-slate-800 border border-slate-600 rounded-md text-white"
            >
              {themes.map(theme => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
            </select>
          </div>
        </div>
        <Button
          onClick={handlePreferencesUpdate}
          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
        >
          <Save className="h-4 w-4 mr-2" />
          Guardar Preferencias
        </Button>
      </CardContent>
    </Card>
  );
};

export default PreferencesTab;