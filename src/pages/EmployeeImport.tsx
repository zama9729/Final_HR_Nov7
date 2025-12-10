import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { useMemo, useState } from "react";

const headerExamples = (field: string) => {
  const camel = field.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
  const noUnderscore = field.replace(/_/g, "");
  const variants = Array.from(new Set([field, camel, noUnderscore]));
  return variants.join(", ");
};
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function EmployeeImport() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [apiError, setApiError] = useState<string|null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [mapping, setMapping] = useState<Record<string,string>>({});
  const { toast } = useToast();
  const columnGuide = useMemo(() => [
    { field: 'first_name', required: true, description: 'Given name' },
    { field: 'last_name', required: true, description: 'Surname' },
    { field: 'email', required: true, description: 'Work email (must be unique)' },
    { field: 'employee_id', required: true, description: 'Company employee code (unique)' },
    { field: 'role', required: false, description: "Profile role (CEO, HR, Admin, Manager, Employee; defaults to 'employee')" },
    { field: 'designation', required: false, description: 'Designation/position (use names from Org Setup)' },
    { field: 'grade', required: false, description: 'Grade/level (A4, A5, B1, etc.)' },
    { field: 'department', required: false, description: 'Department name (e.g., Engineering)' },
    { field: 'department_code', required: false, description: 'Department code (used if provided)' },
    { field: 'branch_name', required: false, description: 'Branch / site name' },
    { field: 'branch_code', required: false, description: 'Branch code (preferred if available)' },
    { field: 'team_name', required: false, description: 'Team name (within branch/department)' },
    { field: 'work_location', required: false, description: 'Free-text work location (or one saved in Org Setup)' },
    { field: 'join_date', required: false, description: 'Date format YYYY-MM-DD or DD-MM-YYYY' },
    { field: 'manager_email', required: false, description: 'Reporting manager email' },
    { field: 'phone', required: false, description: 'Contact number' }
  ], []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResults(null);
      setApiError(null);
    }
  };

  const handleImport = async () => {
    console.log("EmployeeImport handleImport called!");
    setApiError(null);
    if (!file) return;
    const token = api.token || localStorage.getItem('auth_token');
    if (!token) {
      setApiError('You are not logged in. Please sign in and try again.');
      toast({ title: 'Unauthorized', description: 'Please log in first', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      // Get tenant_id from user's profile
      let orgId = '';
      try {
        const profile = await api.getProfile();
        orgId = profile?.tenant_id || '';
        if (!orgId) {
          setApiError('Could not resolve your organization. Please ensure your profile is properly set up.');
          setImporting(false);
          return;
        }
      } catch (error: any) {
        setApiError('Failed to fetch your profile: ' + (error.message || 'Unknown error'));
        setImporting(false);
        return;
      }

      const formData = new FormData();
      formData.append('csv', file);
      formData.append('mapping', JSON.stringify(mapping || {}));
      formData.append('preview', 'false');
      formData.append('fail_on_error', 'false');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/employees/import`, {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: formData
      });
      let data: any = undefined;
      try { data = await response.json(); } catch (e) { data = undefined; }
      setResults(data);
      if (!response.ok) {
        const errMsg = data?.error || (response.status === 401 ? 'Unauthorized: No or invalid token' : 'Import failed. Server error');
        setApiError(errMsg);
        toast({
          title: "Import failed",
          description: errMsg,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import complete",
          description: `${data?.imported_count} employees imported, ${data?.failed_count} failed`,
        });
      }
    } catch (error: any) {
      setApiError("Frontend JS error: " + (error.message || error));
      toast({
        title: "Import failed",
        description: "A browser/app error occurred during import",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handlePreview = async () => {
    setApiError(null);
    if (!file) return;
    const token = api.token || localStorage.getItem('auth_token');
    if (!token) {
      setApiError('You are not logged in. Please sign in and try again.');
      toast({ title: 'Unauthorized', description: 'Please log in first', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      // Get tenant_id from user's profile
      let orgId = '';
      try {
        const profile = await api.getProfile();
        orgId = profile?.tenant_id || '';
        if (!orgId) {
          setApiError('Could not resolve your organization. Please ensure your profile is properly set up.');
          setImporting(false);
          return;
        }
      } catch (error: any) {
        setApiError('Failed to fetch your profile: ' + (error.message || 'Unknown error'));
        setImporting(false);
        return;
      }

      const formData = new FormData();
      formData.append('csv', file);
      formData.append('preview', 'true');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/orgs/${orgId}/employees/import`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Preview failed');
      setPreview(data.preview || []);
      setMapping(data.mapping || {});
    } catch (e: any) {
      setApiError(e.message || 'Preview failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = `first_name,last_name,email,employee_id,role,department,department_code,branch_name,branch_code,team_name,work_location,join_date,manager_email,phone
John,Doe,john.doe@company.com,EMP001,employee,Engineering,ENG,Hyderabad Campus,HYD01,SRE,Hyderabad,2024-01-15,manager@company.com,+91-9876501234
Jane,Smith,jane.smith@company.com,EMP002,manager,Product,PROD,Bengaluru Tech Park,BLR02,Product Ops,Bengaluru,15-02-2024,ceo@company.com,+91-9876509999`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold">Import Employees</h1>
          <p className="text-muted-foreground">Bulk import employees from CSV or Excel files</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Column Mapping Reference</CardTitle>
            <CardDescription>
              Match each CSV header to the internal field name. Template already uses the recommended headers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {columnGuide.map((col) => (
                <div key={col.field} className="border rounded-lg p-3 bg-muted/40">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                    <span>{col.field}</span>
                    {col.required ? (
                      <span className="text-red-500 font-semibold">Required</span>
                    ) : (
                      <span className="text-muted-foreground">Optional</span>
                    )}
                  </div>
                  <p className="mt-2 text-muted-foreground">{col.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    Auto-mapped header examples: {headerExamples(col.field)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Download Template</CardTitle>
            <CardDescription>
              Start with our CSV template to ensure proper formatting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={downloadTemplate} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download CSV Template
            </Button>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Template columns (snake_case recommended):</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Required:</strong> first_name, last_name, email, employee_id</li>
                <li><strong>Role & Reporting:</strong> role, manager_email</li>
                <li><strong>Org placement:</strong> department / department_code, branch_name / branch_code, team_name</li>
                <li><strong>Dates & misc:</strong> join_date (YYYY-MM-DD or DD-MM-YYYY), work_location, phone</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Header names are case-insensitive — e.g. we map firstName ⇢ first_name automatically. Use the table below for exact mappings.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>
              Select a CSV or Excel file containing employee data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {file ? file.name : "Drop your CSV file here, or click to browse"}
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button variant="secondary" className="cursor-pointer" asChild>
                    <span>Select File</span>
                  </Button>
                </label>
              </div>
            </div>
            {file && (
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePreview} disabled={importing} variant="outline">{importing ? "..." : "Preview"}</Button>
                  <Button onClick={handleImport} disabled={importing} id="import-trigger-btn">
                    {importing ? "Importing..." : "Import"}
                  </Button>
                </div>
              </div>
            )}
            {preview && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Detected Mapping (editable)</div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {Object.entries(mapping).map(([k,v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <label className="w-40 text-sm text-muted-foreground">{k}</label>
                      <input className="border rounded px-2 py-1 text-sm w-full" value={v || ''} onChange={(e)=>setMapping({ ...mapping, [k]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div className="text-sm font-medium mb-2">Preview (first 10 rows)</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(preview, null, 2)}</pre>
              </div>
            )}
            {apiError && (
              <div className="p-4 bg-red-100 text-red-700 rounded mt-1">{apiError}</div>
            )}
            {results && (
              <div className="space-y-4">
                <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <p className="font-medium text-success">
                      {(results?.imported_count ?? results?.imported ?? 0)} employees imported successfully
                    </p>
                  </div>
                </div>
                {Array.isArray(results?.errors) && results.errors.length > 0 && (
                  <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-warning mb-2">
                          {results.errors.length} errors found
                        </p>
                        <ul className="text-sm space-y-1">
                          {results.errors.map((error: any, i: number) => {
                            const text = typeof error === 'string' ? error : (error?.error ? `Row ${error?.row ?? '?'}: ${error.error}` : JSON.stringify(error));
                            return <li key={i} className="text-muted-foreground">{text}</li>;
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
