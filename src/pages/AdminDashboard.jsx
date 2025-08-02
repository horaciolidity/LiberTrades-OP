import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Activity,
  UserCheck,
  Wallet,
  Settings,
  AlertTriangle
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    // Cargar datos del localStorage
    setUsers(JSON.parse(localStorage.getItem('cryptoinvest_users') || '[]'));
    setInvestments(JSON.parse(localStorage.getItem('cryptoinvest_investments') || '[]'));
    setTransactions(JSON.parse(localStorage.getItem('cryptoinvest_transactions') || '[]'));
  }, []);

  const totalUsers = users.length;
  const totalInvestments = investments.reduce((sum, inv) => sum + inv.amount, 0);
  const totalTransactions = transactions.length;
  const activeUsers = users.filter(user => {
    const lastActivity = new Date(user.createdAt);
    const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceActivity <= 30;
  }).length;

  const adminStats = [
    {
      title: 'Total Usuarios',
      value: totalUsers.toString(),
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Usuarios Activos',
      value: activeUsers.toString(),
      icon: UserCheck,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Total Invertido',
      value: `${totalInvestments.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Transacciones',
      value: totalTransactions.toString(),
      icon: Activity,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10'
    }
  ];

  const handleUserStatusChange = (userId, newStatus) => {
    const updatedUsers = users.map(user => 
      user.id === userId ? { ...user, status: newStatus } : user
    );
    setUsers(updatedUsers);
    localStorage.setItem('cryptoinvest_users', JSON.stringify(updatedUsers));
  };

  const handleBalanceUpdate = (userId, newBalance) => {
    const updatedUsers = users.map(user => 
      user.id === userId ? { ...user, balance: parseFloat(newBalance) } : user
    );
    setUsers(updatedUsers);
    localStorage.setItem('cryptoinvest_users', JSON.stringify(updatedUsers));
  };

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Panel de Administración
          </h1>
          <p className="text-slate-300">
            Gestiona usuarios, inversiones y configuraciones del sistema
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {adminStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
              >
                <Card className="crypto-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                        <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Admin Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <Tabs defaultValue="users" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 bg-slate-800">
              <TabsTrigger value="users" className="text-white">Usuarios</TabsTrigger>
              <TabsTrigger value="investments" className="text-white">Inversiones</TabsTrigger>
              <TabsTrigger value="transactions" className="text-white">Transacciones</TabsTrigger>
              <TabsTrigger value="settings" className="text-white">Configuración</TabsTrigger>
            </TabsList>

            {/* Users Tab */}
            <TabsContent value="users">
              <Card className="crypto-card">
                <CardHeader>
                  <CardTitle className="text-white">Gestión de Usuarios</CardTitle>
                  <CardDescription className="text-slate-300">
                    Administra todos los usuarios registrados
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {users.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center space-x-4">
                            <div>
                              <p className="text-white font-medium">{user.name}</p>
                              <p className="text-slate-400 text-sm">{user.email}</p>
                            </div>
                            <div className="text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                user.role === 'admin' 
                                  ? 'bg-red-500/20 text-red-400' 
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {user.role || 'user'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="text-white font-medium">${(user.balance || 0).toFixed(2)}</p>
                            <p className="text-slate-400 text-sm">Saldo</p>
                          </div>
                          <div className="flex space-x-2">
                            <Input
                              type="number"
                              placeholder="Nuevo saldo"
                              className="w-32 bg-slate-700 border-slate-600 text-white"
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleBalanceUpdate(user.id, e.target.value);
                                  e.target.value = '';
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant={user.status === 'blocked' ? 'destructive' : 'outline'}
                              onClick={() => handleUserStatusChange(
                                user.id, 
                                user.status === 'blocked' ? 'active' : 'blocked'
                              )}
                            >
                              {user.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Investments Tab */}
            <TabsContent value="investments">
              <Card className="crypto-card">
                <CardHeader>
                  <CardTitle className="text-white">Inversiones Activas</CardTitle>
                  <CardDescription className="text-slate-300">
                    Monitorea todas las inversiones del sistema
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {investments.map((investment) => {
                      const user = users.find(u => u.id === investment.userId);
                      return (
                        <div key={investment.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                          <div>
                            <p className="text-white font-medium">{user?.name || 'Usuario desconocido'}</p>
                            <p className="text-slate-400 text-sm">{investment.planName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-medium">${investment.amount.toFixed(2)}</p>
                            <p className="text-green-400 text-sm">{investment.dailyReturn}% diario</p>
                          </div>
                          <div className="text-right">
                            <p className="text-slate-300 text-sm">
                              {new Date(investment.createdAt).toLocaleDateString()}
                            </p>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              investment.status === 'active' 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {investment.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions">
              <Card className="crypto-card">
                <CardHeader>
                  <CardTitle className="text-white">Historial de Transacciones</CardTitle>
                  <CardDescription className="text-slate-300">
                    Todas las transacciones del sistema
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {transactions.map((transaction) => {
                      const user = users.find(u => u.id === transaction.userId);
                      return (
                        <div key={transaction.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                          <div>
                            <p className="text-white font-medium">{user?.name || 'Usuario desconocido'}</p>
                            <p className="text-slate-400 text-sm">{transaction.type}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-medium ${
                              transaction.type === 'deposit' ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {transaction.type === 'deposit' ? '+' : '-'}${transaction.amount.toFixed(2)}
                            </p>
                            <p className="text-slate-400 text-sm">
                              {new Date(transaction.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            transaction.status === 'completed' 
                              ? 'bg-green-500/20 text-green-400' 
                              : transaction.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {transaction.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <Card className="crypto-card">
                <CardHeader>
                  <CardTitle className="text-white">Configuración del Sistema</CardTitle>
                  <CardDescription className="text-slate-300">
                    Ajustes generales de la plataforma
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-white">Comisión de Referidos (%)</Label>
                        <Input 
                          type="number" 
                          defaultValue="10"
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-white">Mínimo Retiro ($)</Label>
                        <Input 
                          type="number" 
                          defaultValue="50"
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-white">Máximo Retiro Diario ($)</Label>
                        <Input 
                          type="number" 
                          defaultValue="10000"
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-white">Tiempo de Procesamiento (horas)</Label>
                        <Input 
                          type="number" 
                          defaultValue="24"
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-white">Mantenimiento del Sistema</Label>
                        <select className="w-full p-2 bg-slate-800 border border-slate-600 rounded-md text-white">
                          <option value="active">Activo</option>
                          <option value="maintenance">Mantenimiento</option>
                        </select>
                      </div>
                      <Button className="w-full bg-gradient-to-r from-green-500 to-blue-500">
                        Guardar Configuración
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </Layout>
  );
};

export default AdminDashboard;