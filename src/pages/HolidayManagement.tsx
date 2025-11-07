import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Calendar, Plus, Upload, Check, Lock, Unlock, Trash2, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface HolidayList {
  id: string;
  org_id: string;
  region: string;
  year: number;
  name: string;
  is_national: boolean;
  published: boolean;
  locked: boolean;
  created_at: string;
  published_at?: string;
  locked_at?: string;
}

interface Holiday {
  id: string;
  list_id: string;
  date: string;
  name: string;
  is_national: boolean;
  notes?: string;
}

export default function HolidayManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [lists, setLists] = useState<HolidayList[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<HolidayList | null>(null);
  const [holidays, setHolidays] = useState<Record<string, Holiday[]>>({});
  
  // Create form state
  const [newList, setNewList] = useState({
    region: '',
    year: new Date().getFullYear(),
    name: '',
    is_national: false
  });

  useEffect(() => {
    fetchOrgId();
  }, [user]);

  useEffect(() => {
    if (orgId) {
      fetchLists();
    }
  }, [orgId]);

  const fetchOrgId = async () => {
    try {
      // Get tenant_id from profile
      const profile = await api.getProfile();
      const tenantId = (profile as any)?.tenant_id;
      if (tenantId) {
        setOrgId(tenantId);
      } else {
        // Try to get organization
        try {
          const org = await api.getOrganization();
          if (org && org.id) {
            setOrgId(org.id);
          }
        } catch (e) {
          console.error('Error fetching organization:', e);
        }
      }
    } catch (error) {
      console.error('Error fetching org:', error);
    }
  };

  const fetchLists = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/holiday-lists`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      if (resp.ok) {
        const data = await resp.json();
        setLists(data || []);
        
        // Fetch holidays for each list
        const holidaysMap: Record<string, Holiday[]> = {};
        for (const list of data) {
          await fetchHolidaysForList(list.id, holidaysMap);
        }
        setHolidays(holidaysMap);
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
      toast({
        title: "Error",
        description: "Failed to fetch holiday lists",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHolidaysForList = async (listId: string, holidaysMap?: Record<string, Holiday[]>) => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/holidays/lists/${listId}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (holidaysMap) {
          holidaysMap[listId] = data || [];
        } else {
          setHolidays(prev => ({ ...prev, [listId]: data || [] }));
        }
      }
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  const createList = async () => {
    if (!orgId || !newList.region || !newList.name) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/holiday-lists`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify(newList)
        }
      );

      if (resp.ok) {
        toast({
          title: "Success",
          description: "Holiday list created successfully",
        });
        setCreateDialogOpen(false);
        setNewList({ region: '', year: new Date().getFullYear(), name: '', is_national: false });
        fetchLists();
      } else {
        const error = await resp.json();
        throw new Error(error.error || 'Failed to create list');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create holiday list",
        variant: "destructive",
      });
    }
  };

  const publishList = async (listId: string) => {
    if (!orgId) return;
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/holiday-lists/${listId}/publish`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}`
          }
        }
      );

      if (resp.ok) {
        toast({
          title: "Success",
          description: "Holiday list published successfully",
        });
        fetchLists();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to publish list",
        variant: "destructive",
      });
    }
  };

  const lockList = async (listId: string) => {
    if (!orgId) return;
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/holiday-lists/${listId}/lock`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}`
          }
        }
      );

      if (resp.ok) {
        toast({
          title: "Success",
          description: "Holiday list locked successfully",
        });
        fetchLists();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to lock list",
        variant: "destructive",
      });
    }
  };

  const handleImport = async (file: File) => {
    if (!orgId || !selectedList) return;

    try {
      // Upload file to backend for parsing (supports both CSV and Excel)
      const formData = new FormData();
      formData.append('file', file);

      // Get preview from backend (backend handles both CSV and Excel)
      const previewResp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/holiday-lists/${selectedList.id}/import`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}`
          },
          body: formData
        }
      );

      if (!previewResp.ok) {
        const error = await previewResp.json();
        throw new Error(error.error || 'Failed to parse file');
      }

      const preview = await previewResp.json();

      if (preview.total === 0) {
        toast({
          title: "Error",
          description: "No valid holidays found in file",
          variant: "destructive",
        });
        return;
      }
      
      // Show preview and confirm
      const previewText = preview.preview.slice(0, 10).map((r: any) => 
        `${r.date} - ${r.name}${r.is_national ? ' (National)' : ''}`
      ).join('\n');
      
      const confirmed = window.confirm(
        `Found ${preview.total} holidays in file.\n\nFirst 10:\n${previewText}\n\nProceed with import of all ${preview.total} holidays?`
      );

      if (confirmed) {
        // Re-upload file to backend for full import (backend will parse all rows)
        const formData = new FormData();
        formData.append('file', file);
        
        const confirmResp = await fetch(
          `${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/holiday-lists/${selectedList.id}/import/confirm`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}`
            },
            body: formData
          }
        );

        if (confirmResp.ok) {
          const result = await confirmResp.json();
          toast({
            title: "Success",
            description: `Imported ${result.imported || preview.total} holidays successfully`,
          });
          setImportDialogOpen(false);
          fetchLists(); // Refresh the lists
        } else {
          const error = await confirmResp.json();
          throw new Error(error.error || 'Failed to import holidays');
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import holidays",
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Holiday Management</h1>
            <p className="text-muted-foreground">Manage state-wise holiday lists (10 days yearly per state)</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Holiday List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Holiday List</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>State/Region</Label>
                  <Input
                    placeholder="e.g., CA, NY, TX"
                    value={newList.region}
                    onChange={(e) => setNewList({ ...newList, region: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Year</Label>
                  <Input
                    type="number"
                    value={newList.year}
                    onChange={(e) => setNewList({ ...newList, year: parseInt(e.target.value) || new Date().getFullYear() })}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., California Holidays 2025"
                    value={newList.name}
                    onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newList.is_national}
                    onChange={(e) => setNewList({ ...newList, is_national: e.target.checked })}
                  />
                  <Label>National Holiday List</Label>
                </div>
                <Button onClick={createList} className="w-full">Create List</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-8 text-center">Loading holiday lists...</CardContent>
          </Card>
        ) : lists.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No holiday lists found. Create your first holiday list to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {lists.map((list) => (
              <Card key={list.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {list.name}
                        {list.published && (
                          <Badge variant="outline" className="bg-green-100 text-green-700">
                            <Check className="h-3 w-3 mr-1" />
                            Published
                          </Badge>
                        )}
                        {list.locked && (
                          <Badge variant="outline" className="bg-gray-100 text-gray-700">
                            <Lock className="h-3 w-3 mr-1" />
                            Locked
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {list.region} • {list.year} • {holidays[list.id]?.length || 0} holidays
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!list.published && (
                        <Button size="sm" variant="outline" onClick={() => publishList(list.id)}>
                          <Check className="h-4 w-4 mr-1" />
                          Publish
                        </Button>
                      )}
                      {!list.locked && (
                        <Button size="sm" variant="outline" onClick={() => lockList(list.id)}>
                          <Lock className="h-4 w-4 mr-1" />
                          Lock
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedList(list);
                          setImportDialogOpen(true);
                        }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Import CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {holidays[list.id] && holidays[list.id].length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {holidays[list.id].map((holiday) => (
                        <div key={holiday.id} className="p-2 border rounded text-sm">
                          <div className="font-medium">{holiday.name}</div>
                          <div className="text-muted-foreground text-xs">
                            {format(new Date(holiday.date), 'MMM dd, yyyy')}
                          </div>
                          {holiday.is_national && (
                            <Badge variant="outline" className="mt-1 text-xs">National</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No holidays added yet. Import a CSV to add holidays.</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import Holidays from CSV</DialogTitle>
            </DialogHeader>
            {selectedList && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Import holidays for: <strong>{selectedList.name}</strong>
                </p>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium mb-2">File Format (CSV or Excel):</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Columns: <code className="bg-background px-1 rounded">date</code>, <code className="bg-background px-1 rounded">name</code>, <code className="bg-background px-1 rounded">is_national</code>, <code className="bg-background px-1 rounded">notes</code>
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">Example (CSV):</p>
                  <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
{`date,name,is_national,notes
2025-01-01,New Year,true,New Year's Day
2025-07-04,Independence Day,true,Fourth of July
2025-12-25,Christmas,true,Christmas Day`}
                  </pre>
                  <p className="text-xs text-muted-foreground mt-2">
                    For Excel files, use the same columns in the first sheet. Headers are case-insensitive.
                  </p>
                </div>
                <div>
                  <Label htmlFor="csv-file">Select CSV or Excel File</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleImport(file);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Supported formats: CSV (.csv), Excel (.xlsx, .xls)
                  </p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
