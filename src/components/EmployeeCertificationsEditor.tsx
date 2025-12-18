import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Trash2, Edit, Plus, Award, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export default function EmployeeCertificationsEditor({ employeeId, canEdit = false }: { employeeId: string; canEdit?: boolean }) {
  const [certs, setCerts] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', issuer: '', issue_date: '', expiry_date: '', file_url: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/certifications`, { 
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } 
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data)) {
        setCerts(data);
      } else {
        console.error('Failed to load certifications:', data);
        setCerts([]);
      }
    } catch (error) {
      console.error('Error loading certifications:', error);
      setCerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const resetForm = () => {
    setForm({ name: '', issuer: '', issue_date: '', expiry_date: '', file_url: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const addCertification = async () => {
    if (!employeeId || !form.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Certification name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload: any = {
        name: form.name.trim(),
        issuer: form.issuer.trim() || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        file_url: form.file_url.trim() || null,
      };

      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/certifications`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` 
        },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (resp.ok && data) {
        await load();
        resetForm();
        toast({
          title: 'Success',
          description: 'Certification added successfully',
        });
      } else {
        throw new Error(data.error || 'Failed to add certification');
      }
    } catch (error: any) {
      console.error('Error adding certification:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add certification',
        variant: 'destructive',
      });
    }
  };

  const updateCertification = async (certId: string) => {
    if (!form.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Certification name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload: any = {
        name: form.name.trim(),
        issuer: form.issuer.trim() || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        file_url: form.file_url.trim() || null,
      };

      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/certifications/${certId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` 
        },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (resp.ok) {
        await load();
        resetForm();
        toast({
          title: 'Success',
          description: 'Certification updated successfully',
        });
      } else {
        throw new Error(data.error || 'Failed to update certification');
      }
    } catch (error: any) {
      console.error('Error updating certification:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update certification',
        variant: 'destructive',
      });
    }
  };

  const deleteCertification = async (certId: string) => {
    if (!confirm('Are you sure you want to delete this certification?')) return;

    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/certifications/${certId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` }
      });

      if (resp.ok) {
        await load();
        toast({
          title: 'Success',
          description: 'Certification deleted successfully',
        });
      } else {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to delete certification');
      }
    } catch (error: any) {
      console.error('Error deleting certification:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete certification',
        variant: 'destructive',
      });
    }
  };

  const startEdit = (cert: any) => {
    setForm({
      name: cert.name || '',
      issuer: cert.issuer || '',
      issue_date: cert.issue_date ? format(parseISO(cert.issue_date), 'yyyy-MM-dd') : '',
      expiry_date: cert.expiry_date ? format(parseISO(cert.expiry_date), 'yyyy-MM-dd') : '',
      file_url: cert.file_url || '',
    });
    setEditingId(cert.id);
    setShowForm(true);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    try {
      return new Date(expiryDate) < new Date();
    } catch {
      return false;
    }
  };

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    try {
      const expiry = new Date(expiryDate);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry > 0 && daysUntilExpiry <= 90;
    } catch {
      return false;
    }
  };

  if (loading && certs.length === 0) {
    return <p className="text-xs text-gray-400">Loading certifications...</p>;
  }

  return (
    <div className="space-y-3">
      {canEdit && showForm && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">
                {editingId ? 'Edit Certification' : 'Add New Certification'}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetForm}
                className="h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Input
                placeholder="Certification Name *"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="text-xs h-8"
              />
              <Input
                placeholder="Issuer"
                value={form.issuer}
                onChange={e => setForm({ ...form, issuer: e.target.value })}
                className="text-xs h-8"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  placeholder="Issue Date"
                  value={form.issue_date}
                  onChange={e => setForm({ ...form, issue_date: e.target.value })}
                  className="text-xs h-8"
                />
                <Input
                  type="date"
                  placeholder="Expiry Date"
                  value={form.expiry_date}
                  onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
              <Input
                placeholder="Certificate URL (optional)"
                value={form.file_url}
                onChange={e => setForm({ ...form, file_url: e.target.value })}
                className="text-xs h-8"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => editingId ? updateCertification(editingId) : addCertification()}
                  className="h-7 text-xs"
                >
                  {editingId ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {certs.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center">
          <Award className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-xs text-gray-500 mb-3">No certifications added yet</p>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Certification
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {certs.map((cert) => (
            <Card key={cert.id} className="border-gray-200">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Award className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <p className="text-xs font-semibold text-gray-900 truncate">{cert.name}</p>
                      {cert.expiry_date && (
                        <>
                          {isExpired(cert.expiry_date) && (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                              Expired
                            </Badge>
                          )}
                          {!isExpired(cert.expiry_date) && isExpiringSoon(cert.expiry_date) && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-amber-300 text-amber-700">
                              Expiring Soon
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-600 space-y-0.5">
                      {cert.issuer && <p>Issuer: {cert.issuer}</p>}
                      <div className="flex items-center gap-2">
                        <span>Issued: {formatDate(cert.issue_date)}</span>
                        {cert.expiry_date && (
                          <>
                            <span>•</span>
                            <span>Expires: {formatDate(cert.expiry_date)}</span>
                          </>
                        )}
                      </div>
                      {cert.file_url && (
                        <a
                          href={cert.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Certificate
                        </a>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => startEdit(cert)}
                        className="h-6 w-6 p-0"
                      >
                        <Edit className="h-3 w-3 text-gray-600" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCertification(cert.id)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {canEdit && !showForm && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="w-full h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Certification
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
