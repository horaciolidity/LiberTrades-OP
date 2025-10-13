import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, CheckCircle, XCircle, Loader2, Image } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export default function KycVerificationTab() {
  const { user } = useAuth();
  const [docFile, setDocFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('checking');
  const docInputRef = useRef(null);
  const selfieInputRef = useRef(null);

  const uid = user?.id;

  // ---------------------- Cargar estado KYC ----------------------
  useEffect(() => {
    if (!uid) return;
    fetchStatus();
  }, [uid]);

  async function fetchStatus() {
    try {
      const { data, error } = await supabase
        .from('kyc_verifications')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      if (data) setStatus(data.status);
      else setStatus('none');
    } catch {
      setStatus('none');
    }
  }

  // ---------------------- Subir archivos ----------------------
  const handleFileChange = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast({ title: 'Formato no válido', description: 'Usa JPG, PNG o WebP', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Archivo muy grande', description: 'Máximo 5MB', variant: 'destructive' });
      return;
    }
    if (type === 'doc') setDocFile(file);
    if (type === 'selfie') setSelfieFile(file);
  };

  async function uploadKYC() {
    if (!uid) return;
    if (!docFile || !selfieFile) {
      toast({ title: 'Faltan archivos', description: 'Sube tu documento y tu selfie', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const docPath = `${uid}/document_${Date.now()}.jpg`;
      const selfiePath = `${uid}/selfie_${Date.now()}.jpg`;

      // Subir a bucket público 'kyc_docs'
      const { error: docErr } = await supabase.storage.from('kyc_docs').upload(docPath, docFile, { upsert: true });
      if (docErr) throw docErr;
      const { error: selfErr } = await supabase.storage.from('kyc_docs').upload(selfiePath, selfieFile, { upsert: true });
      if (selfErr) throw selfErr;

      const { data: docUrl } = supabase.storage.from('kyc_docs').getPublicUrl(docPath);
      const { data: selfieUrl } = supabase.storage.from('kyc_docs').getPublicUrl(selfiePath);

      // Guardar registro
      const { error } = await supabase.from('kyc_verifications').upsert({
        user_id: uid,
        doc_url: docUrl.publicUrl,
        selfie_url: selfieUrl.publicUrl,
        status: 'pending',
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;

      setStatus('pending');
      toast({
        title: 'KYC enviado',
        description: 'Tus archivos fueron enviados correctamente. El equipo revisará tu verificación en breve.',
      });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error al subir', description: 'Intenta nuevamente', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  // ---------------------- UI ----------------------
  const statusLabel = {
    none: 'No iniciado',
    pending: 'En revisión',
    verified: 'Verificado ✅',
    rejected: 'Rechazado ❌',
  };

  const statusColor = {
    none: 'text-slate-400',
    pending: 'text-yellow-400',
    verified: 'text-green-400',
    rejected: 'text-red-400',
  };

  return (
    <Card className="bg-slate-900/60 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Image className="h-5 w-5 text-blue-400" /> Verificación de identidad (KYC)
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="text-slate-300">
          <p>
            Sube una imagen clara de tu documento de identidad (DNI, pasaporte o licencia de conducir)
            y una selfie sosteniendo el documento. 
          </p>
          <p className="text-sm mt-2">Esto ayuda a proteger tu cuenta y habilitar retiros y funciones avanzadas.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-slate-300 text-sm mb-2">Documento</label>
            <Button
              variant="outline"
              onClick={() => docInputRef.current?.click()}
              className="w-full justify-center border-slate-600 text-slate-200"
            >
              <Upload className="h-4 w-4 mr-2" />
              {docFile ? docFile.name : 'Subir documento'}
            </Button>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              ref={docInputRef}
              onChange={(e) => handleFileChange(e, 'doc')}
              className="hidden"
            />
          </div>

          <div className="flex-1">
            <label className="block text-slate-300 text-sm mb-2">Selfie</label>
            <Button
              variant="outline"
              onClick={() => selfieInputRef.current?.click()}
              className="w-full justify-center border-slate-600 text-slate-200"
            >
              <Upload className="h-4 w-4 mr-2" />
              {selfieFile ? selfieFile.name : 'Subir selfie'}
            </Button>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              ref={selfieInputRef}
              onChange={(e) => handleFileChange(e, 'selfie')}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-3">
          <p className={`text-sm ${statusColor[status]}`}>
            Estado: <span className="font-semibold">{statusLabel[status]}</span>
          </p>
          <Button
            onClick={uploadKYC}
            disabled={uploading || status === 'pending'}
            className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
          >
            {uploading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
            {status === 'pending' ? 'En revisión' : 'Enviar verificación'}
          </Button>
        </div>

        {status === 'verified' && (
          <div className="flex items-center gap-2 text-green-400 mt-3">
            <CheckCircle className="h-5 w-5" /> Verificación completada. Tu cuenta está habilitada.
          </div>
        )}

        {status === 'rejected' && (
          <div className="flex items-center gap-2 text-red-400 mt-3">
            <XCircle className="h-5 w-5" /> Tu verificación fue rechazada. Reenvía los archivos nuevamente.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
