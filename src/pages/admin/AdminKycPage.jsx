import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, Loader2, RefreshCcw, Eye } from 'lucide-react';

export default function AdminKycPage() {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchVerifications();
  }, []);

  async function fetchVerifications() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kyc_verifications')
        .select(
          `
          id,
          user_id,
          status,
          doc_url,
          selfie_url,
          submitted_at,
          reviewed_at,
          notes,
          profiles(full_name, email)
        `
        )
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setVerifications(data || []);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'No se pudieron cargar las verificaciones', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, newStatus) {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('kyc_verifications')
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      toast({
        title: newStatus === 'verified' ? 'Aprobado' : 'Rechazado',
        description:
          newStatus === 'verified'
            ? 'El usuario fue verificado correctamente'
            : 'La verificación fue rechazada',
      });

      await fetchVerifications();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Panel de Verificaciones KYC</h1>
        <Button
          variant="outline"
          onClick={fetchVerifications}
          disabled={loading}
          className="text-white border-slate-600"
        >
          <RefreshCcw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando verificaciones...
        </div>
      ) : verifications.length === 0 ? (
        <p className="text-slate-400 text-center py-10">
          No hay verificaciones pendientes.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {verifications.map((v) => (
            <Card
              key={v.id}
              className="bg-slate-900/60 border-slate-700 hover:border-slate-600 transition-all duration-200"
            >
              <CardHeader>
                <CardTitle className="text-white text-lg">
                  {v.profiles?.full_name || 'Usuario sin nombre'}
                </CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  {v.profiles?.email}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-slate-300">
                  <p>
                    <span className="text-slate-400">Enviado: </span>
                    {new Date(v.submitted_at).toLocaleString()}
                  </p>
                  {v.reviewed_at && (
                    <p>
                      <span className="text-slate-400">Revisado: </span>
                      {new Date(v.reviewed_at).toLocaleString()}
                    </p>
                  )}
                  <p>
                    <span className="text-slate-400">Estado: </span>
                    <span
                      className={`font-semibold ${
                        v.status === 'verified'
                          ? 'text-green-400'
                          : v.status === 'rejected'
                          ? 'text-red-400'
                          : 'text-yellow-400'
                      }`}
                    >
                      {v.status.toUpperCase()}
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 mt-3">
                  <a
                    href={v.doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 flex items-center gap-1 hover:underline"
                  >
                    <Eye className="h-4 w-4" /> Documento
                  </a>
                  <a
                    href={v.selfie_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 flex items-center gap-1 hover:underline"
                  >
                    <Eye className="h-4 w-4" /> Selfie
                  </a>
                </div>

                <div className="flex items-center justify-between mt-4 gap-2">
                  <Button
                    onClick={() => updateStatus(v.id, 'verified')}
                    disabled={updating || v.status === 'verified'}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> Aprobar
                  </Button>
                  <Button
                    onClick={() => updateStatus(v.id, 'rejected')}
                    disabled={updating || v.status === 'rejected'}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Rechazar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
