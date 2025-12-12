import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { OrgSetupProvider } from "./contexts/OrgSetupContext";
import { ProtectedRoute, PublicRoute } from "./components/ProtectedRoute";

// Pages
import Login from "./pages/auth/Login";
import FirstTimeLogin from "./pages/auth/FirstTimeLogin";
import FirstLoginWithToken from "./pages/auth/FirstLoginWithToken";
import Signup from "./pages/auth/Signup";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Appraisals from "./pages/Appraisals";
import MyAppraisal from "./pages/MyAppraisal";
import ShiftManagement from "./pages/ShiftManagement";
import StaffScheduling from "./pages/StaffScheduling";
import AIAssistantPage from "./pages/AIAssistantPage";
import RAGDocumentUpload from "./pages/RAGDocumentUpload";
import EmployeeImport from "./pages/EmployeeImport";
import ClockInOut from "./pages/ClockInOut";
import Workflows from "./pages/Workflows";
import WorkflowEditor from "./pages/WorkflowEditor";
import Timesheets from "./pages/Timesheets";
import TimesheetApprovals from "./pages/TimesheetApprovals";
import TimesheetGenerator from "./pages/TimesheetGenerator";
import Analytics from "./pages/Analytics";
import AttendanceAnalytics from "./pages/AttendanceAnalytics";
import AttendanceUpload from "./pages/AttendanceUpload";
import AttendanceUploadHistory from "./pages/AttendanceUploadHistory";
import HrProfileRequests from "./pages/HrProfileRequests";
import NotFound from "./pages/NotFound";
import AddEmployee from "./pages/AddEmployee";
import LeavePolicies from "./pages/LeavePolicies";
import ProbationPolicies from "./pages/ProbationPolicies";
import Promotions from "./pages/Promotions";
import PromotionForm from "./pages/PromotionForm";
import LeaveRequests from "./pages/LeaveRequests";
import Onboarding from "./pages/Onboarding";
import OnboardingNextStep from "./pages/OnboardingNextStep";
import ChangePassword from "./pages/ChangePassword";
import OrgChart from "./pages/OrgChart";
import SetupPassword from "./pages/SetupPassword";
import OnboardingTracker from "./pages/OnboardingTracker";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/AdminDashboard";
import ProfileSkills from "./pages/ProfileSkills";
import ProjectNew from "./pages/ProjectNew";
import ProjectSuggestions from "./pages/ProjectSuggestions";
import CEODashboard from "./pages/CEODashboard";
import EmployeeDetail from "./pages/EmployeeDetail";
import MyProfile from "./pages/MyProfile";
import HolidayManagement from "./pages/HolidayManagement";
import EmployeeStats from "./pages/EmployeeStats";
import Payroll from "./pages/Payroll";
import PayrollAdjustments from "./pages/PayrollAdjustments";
import BackgroundChecks from "./pages/BackgroundChecks";
import DocumentInbox from "./pages/DocumentInbox";
import OffboardingNew from "./pages/OffboardingNew";
import OffboardingQueue from "./pages/OffboardingQueue";
import OffboardingDetail from "./pages/OffboardingDetail";
import OffboardingPolicies from "./pages/OffboardingPolicies";
import PoliciesManagement from "./pages/PoliciesManagement";
import PolicyEditor from "./pages/PolicyEditor";
import UnifiedPolicyManagement from "./pages/UnifiedPolicyManagement";
import PolicyLibrary from "./pages/PolicyLibrary";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import TeamSchedule from "./pages/TeamSchedule";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import PromotionCycles from "./pages/PromotionCycles";
import TaxDeclaration from "./pages/TaxDeclaration";
import TaxDeclarationReview from "./pages/TaxDeclarationReview";
import Form16 from "./pages/Form16";
import OrganizationSetup from "./pages/OrganizationSetup";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import AuditLogs from "./pages/AuditLogs";
import OnboardingWizardPage from "./pages/OnboardingWizardPage";
import OrganizationSetupEdit from "./pages/OrganizationSetupEdit";
import OrganizationHierarchy from "./pages/OrganizationHierarchy";

const queryClient = new QueryClient();

// Scroll restoration component for hash navigation
function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    // If there's a hash in the URL, scroll to that element
    if (location.hash) {
      const id = location.hash.substring(1); // Remove the #
      const element = document.getElementById(id);
      if (element) {
        // Use setTimeout to ensure the element is rendered
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } else {
      // Scroll to top on route change (without hash)
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* SVG Filters for Liquid Glass Distortion Effect */}
      <svg className="liquid-filters" aria-hidden="true">
        <defs>
          {/* Turbulence for liquid distortion */}
          <filter id="liquid-distortion" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              baseFrequency="0.02 0.03"
              numOctaves="3"
              result="turbulence"
              seed="2"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale="2"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          {/* Subtle blur for glass effect */}
          <filter id="glass-blur">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>
      </svg>
      <BrowserRouter>
        <AuthProvider>
          <OrgSetupProvider>
          <ScrollToHash />
          <Routes>
            {/* Public routes */}
            <Route path="/auth/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/auth/signup" element={<PublicRoute><Signup /></PublicRoute>} />
            <Route path="/auth/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/auth/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
            <Route path="/auth/first-time-login" element={<FirstTimeLogin />} />
            <Route path="/auth/first-login" element={<FirstLoginWithToken />} />
            <Route path="/setup-password" element={<SetupPassword />} />
              <Route path="/onboarding-wizard" element={<ProtectedRoute><OnboardingWizardPage /></ProtectedRoute>} />
              {/* Old setup route - now points to onboarding wizard */}
              <Route path="/setup" element={<ProtectedRoute><OnboardingWizardPage /></ProtectedRoute>} />
            <Route path="/super/dashboard" element={<ProtectedRoute allowedRoles={['super_user']}><SuperAdminDashboard /></ProtectedRoute>} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
            <Route path="/employees/:id" element={<ProtectedRoute><EmployeeDetail /></ProtectedRoute>} />
            <Route path="/my/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
            <Route path="/profile/skills" element={<ProtectedRoute><ProfileSkills /></ProtectedRoute>} />
            
            {/* HR-only routes */}
            <Route path="/employees/new" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><AddEmployee /></ProtectedRoute>} />
            <Route path="/employees/import" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><EmployeeImport /></ProtectedRoute>} />
            <Route path="/onboarding-tracker" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><OnboardingTracker /></ProtectedRoute>} />
            <Route path="/workflows" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><Workflows /></ProtectedRoute>} />
            <Route path="/workflows/new" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><WorkflowEditor /></ProtectedRoute>} />
            <Route path="/workflows/:id/edit" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><WorkflowEditor /></ProtectedRoute>} />
            <Route path="/policies" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><LeavePolicies /></ProtectedRoute>} />
            <Route path="/probation-policies" element={<ProtectedRoute allowedRoles={['hr', 'ceo', 'admin']}><ProbationPolicies /></ProtectedRoute>} />
            <Route path="/promotions" element={<ProtectedRoute allowedRoles={['hr', 'ceo', 'admin', 'director', 'manager']}><Promotions /></ProtectedRoute>} />
            <Route path="/promotions/new" element={<ProtectedRoute allowedRoles={['hr', 'ceo', 'admin', 'director', 'manager']}><PromotionForm /></ProtectedRoute>} />
            <Route path="/promotions/:id/edit" element={<ProtectedRoute allowedRoles={['hr', 'ceo', 'admin', 'director', 'manager']}><PromotionForm /></ProtectedRoute>} />
            <Route path="/holidays" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><HolidayManagement /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin', 'manager']}><Analytics /></ProtectedRoute>} />
            <Route path="/employee-stats" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin', 'manager']}><EmployeeStats /></ProtectedRoute>} />
            <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={['ceo', 'hr', 'admin']}><AuditLogs /></ProtectedRoute>} />
            <Route path="/ceo/dashboard" element={<ProtectedRoute allowedRoles={['hr','director','ceo','admin','manager']}><CEODashboard /></ProtectedRoute>} />
            <Route path="/projects/new" element={<ProtectedRoute allowedRoles={['hr','director','ceo','admin']}><ProjectNew /></ProtectedRoute>} />
            <Route path="/projects/:id/suggestions" element={<ProtectedRoute allowedRoles={['hr','director','ceo','admin']}><ProjectSuggestions /></ProtectedRoute>} />
            {/* Admin page: login required; backend enforces superadmin */}
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            
            {/* Common routes */}
            <Route path="/timesheets" element={<ProtectedRoute><Timesheets /></ProtectedRoute>} />
            <Route path="/timesheet-approvals" element={<ProtectedRoute allowedRoles={['manager', 'hr', 'director', 'ceo', 'admin']}><TimesheetApprovals /></ProtectedRoute>} />
            <Route path="/timesheet-generator/:employeeId?" element={<ProtectedRoute><TimesheetGenerator /></ProtectedRoute>} />
            <Route path="/leaves" element={<ProtectedRoute><LeaveRequests /></ProtectedRoute>} />
            <Route path="/org-chart" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/onboarding/next-step" element={<ProtectedRoute><OnboardingNextStep /></ProtectedRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/settings/organization-setup" element={<ProtectedRoute allowedRoles={['hr','ceo','admin']}><OrganizationSetupEdit /></ProtectedRoute>} />
            <Route path="/appraisals" element={<ProtectedRoute allowedRoles={['manager', 'hr', 'director', 'ceo', 'admin']}><Appraisals /></ProtectedRoute>} />
            <Route path="/my-appraisal" element={<ProtectedRoute><MyAppraisal /></ProtectedRoute>} />
            <Route path="/shifts" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><ShiftManagement /></ProtectedRoute>} />
            <Route path="/scheduling" element={<ProtectedRoute allowedRoles={['hr', 'ceo', 'admin']}><StaffScheduling /></ProtectedRoute>} />
            <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistantPage /></ProtectedRoute>} />
            <Route path="/rag/upload" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><RAGDocumentUpload /></ProtectedRoute>} />
            <Route path="/attendance/clock" element={<ProtectedRoute><ClockInOut /></ProtectedRoute>} />
            <Route path="/hr/profile-requests" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><HrProfileRequests /></ProtectedRoute>} />
            <Route path="/attendance/upload" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><AttendanceUpload /></ProtectedRoute>} />
            <Route path="/attendance/history" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><AttendanceUploadHistory /></ProtectedRoute>} />
            <Route path="/analytics/attendance" element={<ProtectedRoute allowedRoles={['ceo', 'hr', 'director', 'admin', 'manager']}><AttendanceAnalytics /></ProtectedRoute>} />
            <Route path="/payroll" element={<ProtectedRoute allowedRoles={['accountant', 'ceo', 'admin', 'manager']}><Payroll /></ProtectedRoute>} />
            <Route path="/tax/declaration" element={<ProtectedRoute><TaxDeclaration /></ProtectedRoute>} />
            <Route path="/tax/declarations/review" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin', 'accountant']}><TaxDeclarationReview /></ProtectedRoute>} />
            <Route path="/reports/form16" element={<ProtectedRoute><Form16 /></ProtectedRoute>} />
            <Route path="/payroll/adjustments" element={<ProtectedRoute allowedRoles={['accountant', 'ceo', 'admin']}><PayrollAdjustments /></ProtectedRoute>} />
            <Route path="/background-checks" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><BackgroundChecks /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><DocumentInbox /></ProtectedRoute>} />
            <Route path="/offboarding/new" element={<ProtectedRoute><OffboardingNew /></ProtectedRoute>} />
            <Route path="/offboarding/policies" element={<ProtectedRoute allowedRoles={['hr', 'ceo', 'admin']}><OffboardingPolicies /></ProtectedRoute>} />
            <Route path="/offboarding" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin', 'manager']}><OffboardingQueue /></ProtectedRoute>} />
            <Route path="/offboarding/:id" element={<ProtectedRoute><OffboardingDetail /></ProtectedRoute>} />
            
            {/* Multi-tenant routes */}
            <Route path="/policies/management" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><PoliciesManagement /></ProtectedRoute>} />
            <Route path="/policies/editor/:id" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><PolicyEditor /></ProtectedRoute>} />
            <Route path="/policies/unified" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><UnifiedPolicyManagement /></ProtectedRoute>} />
            <Route path="/policies/library" element={<ProtectedRoute><PolicyLibrary /></ProtectedRoute>} />
            <Route path="/promotion/cycles" element={<ProtectedRoute><PromotionCycles /></ProtectedRoute>} />
            <Route path="/organization/hierarchy" element={<ProtectedRoute allowedRoles={['hr', 'director', 'ceo', 'admin']}><OrganizationHierarchy /></ProtectedRoute>} />
            
            {/* Teams & Projects routes */}
            <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
            <Route path="/teams/:id" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
            <Route path="/team-schedule" element={<ProtectedRoute><TeamSchedule /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
            
            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" />} />
            
            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </OrgSetupProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
