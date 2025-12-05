import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CheckCircle2, XCircle, Clock, Edit, ArrowUp } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Promotion {
  id: string;
  employee: {
    id: string;
    employee_id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  old_designation: string;
  new_designation: string;
  old_grade?: string;
  new_grade?: string;
  old_ctc?: number;
  new_ctc?: number;
  reason_text?: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  effective_date: string;
  appraisal?: {
    id: string;
    cycle_name: string;
    cycle_year: number;
    rating: number;
  };
  recommended_by_profile?: {
    first_name: string;
    last_name: string;
  };
  approved_by_profile?: {
    first_name: string;
    last_name: string;
  };
  created_at: string;
  approved_at?: string;
  rejection_reason?: string;
}

export default function Promotions() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);

  const canEdit = ['hr', 'ceo', 'admin', 'director'].includes(userRole || '');

  useEffect(() => {
    fetchPromotions();
    if (canEdit) {
      fetchEmployees();
    }
  }, [activeTab, canEdit]);

  const fetchPromotions = async () => {
    try {
      setLoading(true);
      const status = activeTab === 'all' ? undefined : 
                     activeTab === 'pending' ? 'PENDING_APPROVAL' :
                     activeTab === 'approved' ? 'APPROVED' :
                     activeTab === 'rejected' ? 'REJECTED' : 'DRAFT';
      const data = await api.getPromotions({ status });
      setPromotions(data.promotions || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch promotions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setLoading(true);
      await api.approvePromotion(id);
      toast({
        title: "Promotion approved",
        description: "Promotion has been approved and will be applied on the effective date",
      });
      fetchPromotions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve promotion",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string, reason?: string) => {
    const rejectionReason = reason || prompt("Enter rejection reason:");
    if (!rejectionReason) return;
    
    try {
      setLoading(true);
      await api.rejectPromotion(id, rejectionReason);
      toast({
        title: "Promotion rejected",
        description: "Promotion has been rejected",
      });
      fetchPromotions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject promotion",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive', className?: string }> = {
      'DRAFT': { variant: 'secondary', className: 'bg-gray-100 text-gray-800' },
      'PENDING_APPROVAL': { variant: 'secondary', className: 'bg-yellow-100 text-yellow-800' },
      'APPROVED': { variant: 'default', className: 'bg-green-100 text-green-800' },
      'REJECTED': { variant: 'destructive', className: 'bg-red-100 text-red-800' },
      'CANCELLED': { variant: 'secondary', className: 'bg-gray-100 text-gray-800' },
    };
    
    const config = variants[status] || { variant: 'secondary' };
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const filteredPromotions = promotions.filter(p => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return p.status === 'PENDING_APPROVAL';
    if (activeTab === 'approved') return p.status === 'APPROVED';
    if (activeTab === 'rejected') return p.status === 'REJECTED';
    return p.status === 'DRAFT';
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Promotions</h1>
            <p className="text-muted-foreground">
              Manage employee promotions and role changes
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => navigate('/promotions/new')} disabled={!canEdit}>
              <Plus className="h-4 w-4 mr-2" />
              New Promotion
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending">Pending Approval</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Promotions</CardTitle>
                <CardDescription>
                  {activeTab === 'pending' && 'Promotions awaiting approval'}
                  {activeTab === 'approved' && 'Approved and applied promotions'}
                  {activeTab === 'rejected' && 'Rejected promotions'}
                  {activeTab === 'draft' && 'Draft promotions'}
                  {activeTab === 'all' && 'All promotions'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : filteredPromotions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No promotions found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Promotion</TableHead>
                        <TableHead>Effective Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Linked Appraisal</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPromotions.map((promo) => (
                        <TableRow key={promo.id}>
                          <TableCell>
                            <div className="font-medium">
                              {promo.employee.first_name} {promo.employee.last_name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {promo.employee.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{promo.old_designation}</span>
                              <ArrowUp className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{promo.new_designation}</span>
                            </div>
                            {promo.new_grade && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Grade: {promo.old_grade || 'N/A'} → {promo.new_grade}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {format(new Date(promo.effective_date), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(promo.status)}
                          </TableCell>
                          <TableCell>
                            {promo.appraisal ? (
                              <div className="text-sm">
                                {promo.appraisal.cycle_name} {promo.appraisal.cycle_year}
                                {promo.appraisal.rating && (
                                  <div className="text-xs text-muted-foreground">
                                    Rating: {promo.appraisal.rating}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">None</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {promo.status === 'PENDING_APPROVAL' && canEdit && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={() => handleApprove(promo.id)}
                                    disabled={loading}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleReject(promo.id)}
                                    disabled={loading}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                              {promo.status === 'DRAFT' && canEdit && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/promotions/${promo.id}/edit`)}
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

