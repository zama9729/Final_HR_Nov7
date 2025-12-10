import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, Settings, Receipt, FileText } from "lucide-react";
// Use relative paths assuming /pages is not in /src
import { api } from "../lib/api";
import { CreatePayrollDialog } from "@/components/payroll/CreatePayrollDialog";
import { PayrollCycleList } from "@/components/payroll/PayrollCycleList";
import { ReimbursementRunList } from "@/components/reimbursements/ReimbursementRunList";
import { PayrollAuditLogs } from "@/components/payroll/PayrollAuditLogs";
import { PayrollLayout } from "@/components/layout/PayrollLayout";
import { toast } from "sonner";

const Payroll = () => {
  const navigate = useNavigate();
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin] = useState(true);

  // Fetch user profile to check role for audit logs access
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const result = await api.me.profile();
      return result;
    },
  });

  // Check if user has access to audit logs (ceo, hr, or accountant)
  const canViewAuditLogs = () => {
    if (!profileData?.profile) return false;
    const allowedRoles = ["ceo", "hr", "accountant"];
    
    // Check hr_role if it exists
    const hrRole = profileData.profile.hr_role?.toLowerCase();
    if (hrRole && allowedRoles.includes(hrRole)) {
      return true;
    }
    
    // Check payroll_role if it exists
    const payrollRole = profileData.profile.payroll_role?.toLowerCase();
    if (payrollRole && allowedRoles.includes(payrollRole)) {
      return true;
    }
    
    return false;
  };

  const fetchCycles = async () => {
    setLoading(true);
    try {
      const res = await api.dashboard.cycles();
      setCycles(res.cycles || []);
    } catch (error: any) {
      toast.error(`Failed to fetch cycles: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCycles();
  }, []);

  return (
    <PayrollLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Payroll Cycles</h1>
              <p className="text-muted-foreground">Manage monthly payroll runs</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  sessionStorage.setItem("payroll_last_screen", "/payroll/settings");
                  navigate("/payroll/settings");
                }}
                className="bg-background border-border hover:bg-accent"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure Payroll
              </Button>
              {/* Remove tenantId and userId props */}
              {isAdmin && (
                <CreatePayrollDialog
                  onSuccess={() => fetchCycles()}
                />
              )}
            </div>
          </div>
        </div>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5 text-primary" />
              Payroll & Expense Management
            </CardTitle>
            <CardDescription>Manage payroll cycles and expense reimbursements</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="payroll" className="w-full">
              <TabsList className={`grid w-full ${canViewAuditLogs() ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="payroll">
                  <Calendar className="mr-2 h-4 w-4" />
                  Payroll Cycles
                </TabsTrigger>
                <TabsTrigger value="expenses">
                  <Receipt className="mr-2 h-4 w-4" />
                  Expense Payouts
                </TabsTrigger>
                {canViewAuditLogs() && (
                  <TabsTrigger value="audit-logs">
                    <FileText className="mr-2 h-4 w-4" />
                    Audit Logs
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="payroll" className="mt-4">
                {loading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground mt-4">Loading payroll cycles...</p>
                  </div>
                ) : (
                  <PayrollCycleList cycles={cycles} onRefresh={fetchCycles} />
                )}
              </TabsContent>
              <TabsContent value="expenses" className="mt-4">
                <ReimbursementRunList onRefresh={() => {}} />
              </TabsContent>
              {canViewAuditLogs() && (
                <TabsContent value="audit-logs" className="mt-4">
                  <PayrollAuditLogs />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </PayrollLayout>
  );
};

export default Payroll;

