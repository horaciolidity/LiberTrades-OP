import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Bell, Mail, Smartphone, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';

const NotificationsTab = () => {
  const { user, updateUser } = useAuth();
  const { playSound } = useSound();
  const [notifications, setNotifications] = useState({
    email: user?.notifications?.email ?? true,
    sms: user?.notifications?.sms ?? false,
    push: user?.notifications?.push ?? true,
    marketing: user?.notifications?.marketing ?? false
  });

  const handleNotificationUpdate = () => {
    updateUser({ notifications });
    playSound('success');
    toast({
      title: "Notificaciones actualizadas",
      description: "Tus preferencias de notificación han sido guardadas.",
    });
  };

  const NotificationToggle = ({ id, label, description, icon: Icon, checked, onChange }) => (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center space-x-3">
        <Icon className={`h-5 w-5 ${
          id === 'email' ? 'text-blue-400' :
          id === 'sms' ? 'text-green-400' :
          id === 'push' ? 'text-purple-400' : 'text-orange-400' 
        }`} />
        <div>
          <p className="text-white font-medium">{label}</p>
          <p className="text-slate-400 text-sm">{description}</p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
      </label>
    </div>
  );

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Bell className="h-5 w-5 mr-2 text-yellow-400" />
          Preferencias de Notificación
        </CardTitle>
        <CardDescription className="text-slate-300">
          Configura cómo y cuándo quieres recibir notificaciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <NotificationToggle
            id="email"
            label="Notificaciones por Email"
            description="Recibe actualizaciones importantes por email."
            icon={Mail}
            checked={notifications.email}
            onChange={(e) => setNotifications({...notifications, email: e.target.checked})}
          />
          <NotificationToggle
            id="sms"
            label="Notificaciones SMS"
            description="Recibe alertas importantes por SMS (requiere número verificado)."
            icon={Smartphone}
            checked={notifications.sms}
            onChange={(e) => setNotifications({...notifications, sms: e.target.checked})}
          />
          <NotificationToggle
            id="push"
            label="Notificaciones Push"
            description="Recibe notificaciones en tiempo real en la app y navegador."
            icon={Bell}
            checked={notifications.push}
            onChange={(e) => setNotifications({...notifications, push: e.target.checked})}
          />
          <NotificationToggle
            id="marketing"
            label="Marketing y Promociones"
            description="Recibe ofertas especiales, noticias y actualizaciones de productos."
            icon={Mail}
            checked={notifications.marketing}
            onChange={(e) => setNotifications({...notifications, marketing: e.target.checked})}
          />
        </div>
        <Button
          onClick={handleNotificationUpdate}
          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
        >
          <Save className="h-4 w-4 mr-2" />
          Guardar Preferencias
        </Button>
      </CardContent>
    </Card>
  );
};

export default NotificationsTab;