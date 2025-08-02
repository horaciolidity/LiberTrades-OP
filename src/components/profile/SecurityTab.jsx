import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Shield, Eye, EyeOff, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';

const SecurityTab = () => {
  const { user, updateUser } = useAuth();
  const { playSound } = useSound();
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled || false);

  const handlePasswordChange = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      playSound('error');
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      playSound('error');
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }
    
    updateUser({ password: passwordData.newPassword }); 
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: ''});
    playSound('success');
    toast({
      title: "Contraseña actualizada",
      description: "Tu contraseña ha sido cambiada exitosamente",
    });
  };

  const toggleTwoFactor = () => {
    const newStatus = !twoFactorEnabled;
    setTwoFactorEnabled(newStatus);
    updateUser({ twoFactorEnabled: newStatus });
    playSound(newStatus ? 'success' : 'click');
    toast({
      title: newStatus ? "2FA Activado" : "2FA Desactivado",
      description: newStatus 
        ? "La autenticación de dos factores ha sido activada." 
        : "La autenticación de dos factores ha sido desactivada.",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Key className="h-5 w-5 mr-2 text-red-400" />
            Cambiar Contraseña
          </CardTitle>
          <CardDescription className="text-slate-300">
            Actualiza tu contraseña para mantener tu cuenta segura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">Contraseña Actual</Label>
              <div className="relative">
                <Input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPasswords({...showPasswords, current: !showPasswords.current})}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white h-8 w-8"
                >
                  {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPasswords({...showPasswords, new: !showPasswords.new})}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white h-8 w-8"
                >
                  {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white">Confirmar Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  className="bg-slate-800 border-slate-600 text-white pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white h-8 w-8"
                >
                  {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <Button
            onClick={handlePasswordChange}
            className="bg-red-600 hover:bg-red-700"
          >
            <Save className="h-4 w-4 mr-2" />
            Cambiar Contraseña
          </Button>
        </CardContent>
      </Card>

      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Shield className="h-5 w-5 mr-2 text-green-400" />
            Autenticación de Dos Factores (2FA)
          </CardTitle>
          <CardDescription className="text-slate-300">
            Añade una capa extra de seguridad a tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">
                {twoFactorEnabled ? '2FA Activado' : '2FA Desactivado'}
              </p>
              <p className="text-slate-400 text-sm">
                {twoFactorEnabled 
                  ? 'Tu cuenta está protegida con autenticación de dos factores.' 
                  : 'Activa 2FA para mayor seguridad.'
                }
              </p>
            </div>
            <Button
              onClick={toggleTwoFactor}
              variant={twoFactorEnabled ? 'destructive' : 'default'}
              className={twoFactorEnabled 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700'
              }
            >
              {twoFactorEnabled ? 'Desactivar' : 'Activar'} 2FA
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SecurityTab;