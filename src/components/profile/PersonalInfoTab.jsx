// src/pages/PersonalInfoTab.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Save, Camera } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';

const PersonalInfoTab = () => {
  const { user, profile, updateUser, refreshProfile } = useAuth();
  const { playSound } = useSound();

  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState({
    name: profile?.full_name || '',
    email: user?.email || profile?.email || '',
    phone: profile?.phone || '',
    country: profile?.country || '',
    city: profile?.city || '',
  });

  // 🔁 Rehidratar el form cuando cambia el perfil (realtime/refresh)
  useEffect(() => {
    setProfileData({
      name: profile?.full_name || '',
      email: user?.email || profile?.email || '',
      phone: profile?.phone || '',
      country: profile?.country || '',
      city: profile?.city || '',
    });
  }, [profile?.full_name, profile?.phone, profile?.country, profile?.city, profile?.email, user?.email]);

  const handleProfileUpdate = async () => {
    if (!user?.id) {
      toast({ title: 'Sin sesión', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // ⬅️ mapear a columnas REALES de public.profiles
      const payload = {
        full_name: (profileData.name || '').trim() || null,
        phone: (profileData.phone || '').trim() || null,
        country: (profileData.country || '').trim() || null,
        city: (profileData.city || '').trim() || null,
      };
      await updateUser(payload);     // usa AuthContext (ya filtra columnas y setea updated_at)
      await refreshProfile();        // fuerza lectura por las dudas
      playSound?.('success');
      toast({ title: 'Perfil actualizado', description: 'Tus datos fueron guardados.' });
    } catch (e) {
      console.error('[handleProfileUpdate]', e);
      playSound?.('error');
      toast({ title: 'No se pudo guardar', description: e?.message || 'Intentá nuevamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = () => {
    playSound?.('click');
    toast({
      title: 'Función no implementada',
      description: '🚧 Carga de avatar en camino. Si querés la agrego ya mismo.',
    });
  };

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <User className="h-5 w-5 mr-2 text-blue-400" />
          Información Personal
        </CardTitle>
        <CardDescription className="text-slate-300">
          Actualizá tu información personal y de contacto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <img
              className="w-24 h-24 rounded-full object-cover border-2 border-blue-500"
              alt="Foto de perfil del usuario"
              src="https://images.unsplash.com/flagged/photo-1608632359963-5828fa3b4141"
            />
            <Button
              size="icon"
              variant="outline"
              className="absolute -bottom-2 -right-2 p-2 bg-slate-700 hover:bg-slate-600 rounded-full border-slate-500"
              onClick={handleImageUpload}
            >
              <Camera className="h-4 w-4 text-white" />
            </Button>
          </div>
          <div>
            <p className="text-xl font-semibold text-white">{profileData.name || '—'}</p>
            <p className="text-sm text-slate-400">{profileData.email || '—'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-white">Nombre Completo</Label>
            <Input
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Email (solo lectura)</Label>
            <Input
              type="email"
              value={profileData.email}
              readOnly
              className="bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Teléfono</Label>
            <Input
              type="tel"
              value={profileData.phone}
              onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
              placeholder="+54 11 2345 6789"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">País</Label>
            <Input
              value={profileData.country}
              onChange={(e) => setProfileData({ ...profileData, country: e.target.value })}
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Ciudad</Label>
            <Input
              value={profileData.city}
              onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Código de Referido</Label>
            <Input
              value={profile?.referral_code || ''}
              readOnly
              className="bg-slate-700 border-slate-600 text-slate-300 cursor-not-allowed"
            />
          </div>
        </div>

        <Button
          onClick={handleProfileUpdate}
          disabled={saving}
          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando…' : 'Guardar Cambios'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoTab;
