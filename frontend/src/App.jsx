import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoutes';
import DashboardLayout from './layouts/DashboardLayout';

import Home from './pages/Home';
import PublicDashboard from './pages/PublicDashboard';
import RaiseComplaint from './pages/RaiseComplaint';
import WorkerDashboard from './pages/WorkerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ComplaintDetails from './pages/ComplaintDetails';

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Landing Page */}
      <Route path="/" element={<Home />} />

      {/* Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Public Dashboard & Features */}
      <Route path="/user-dashboard" element={
        <ProtectedRoute allowedRoles={['public']}>
          <DashboardLayout><PublicDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/raise-complaint" element={
        <ProtectedRoute allowedRoles={['public']}>
          <DashboardLayout><RaiseComplaint /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/complaint/:id" element={
        <ProtectedRoute allowedRoles={['public', 'worker', 'admin']}>
          <DashboardLayout><ComplaintDetails /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Worker Routes */}
      <Route path="/worker-dashboard" element={
        <ProtectedRoute allowedRoles={['worker']}>
          <DashboardLayout><WorkerDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin-dashboard" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <DashboardLayout><AdminDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Catch All */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-background font-sans text-secondary selection:bg-blue-100 selection:text-primary">
          <AppRoutes />
          <ToastContainer 
            position="bottom-right" 
            autoClose={3000} 
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            toastClassName="!rounded-2xl !shadow-premium !border-slate-100 !font-bold !text-xs !uppercase !tracking-widest"
          />
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
