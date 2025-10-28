import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute, PublicRoute } from "./components/ProtectedRoute";

// Pages
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeImport from "./pages/EmployeeImport";
import Workflows from "./pages/Workflows";
import WorkflowEditor from "./pages/WorkflowEditor";
import Timesheets from "./pages/Timesheets";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import AddEmployee from "./pages/AddEmployee";
import LeavePolicies from "./pages/LeavePolicies";
import Onboarding from "./pages/Onboarding";
import ChangePassword from "./pages/ChangePassword";
import OrgChart from "./pages/OrgChart";
import SetupPassword from "./pages/SetupPassword";
import OnboardingTracker from "./pages/OnboardingTracker";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/auth/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/auth/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/setup-password" element={<SetupPassword />} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
            
            {/* HR-only routes */}
            <Route path="/employees/new" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><AddEmployee /></ProtectedRoute>} />
            <Route path="/employees/import" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><EmployeeImport /></ProtectedRoute>} />
            <Route path="/onboarding-tracker" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><OnboardingTracker /></ProtectedRoute>} />
            <Route path="/workflows" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><Workflows /></ProtectedRoute>} />
            <Route path="/workflows/new" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><WorkflowEditor /></ProtectedRoute>} />
            <Route path="/workflows/:id/edit" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><WorkflowEditor /></ProtectedRoute>} />
            <Route path="/policies" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><LeavePolicies /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo']}><Analytics /></ProtectedRoute>} />
            
            {/* Common routes */}
            <Route path="/timesheets" element={<ProtectedRoute><Timesheets /></ProtectedRoute>} />
            <Route path="/org-chart" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
            
            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" />} />
            
            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
