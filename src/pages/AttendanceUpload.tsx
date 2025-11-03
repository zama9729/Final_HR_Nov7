import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Upload, Download, FileSpreadsheet, FileText, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface ColumnMapping {
  employee_identifier?: string;
  employee_email?: string;
  date?: string;
  time_in?: string;
  time_out?: string;
  timezone?: string;
  device_id?: string;
  notes?: string;
}

interface PreviewRow {
  [key: string]: string;
}

export default function AttendanceUpload() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<PreviewRow[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [tenantTimezone, setTenantTimezone] = useState('Asia/Kolkata');

  // Required fields for mapping
  const requiredFields = [
    { key: 'employee_identifier', label: 'Employee Identifier', description: 'Employee ID or Code' },
    { key: 'date', label: 'Date', description: 'Work date (YYYY-MM-DD)' },
    { key: 'time_in', label: 'Time In', description: 'Punch in time (HH:MM)' },
  ];

  const optionalFields = [
    { key: 'employee_email', label: 'Employee Email', description: 'Email for lookup' },
    { key: 'time_out', label: 'Time Out', description: 'Punch out time (HH:MM)' },
    { key: 'timezone', label: 'Timezone', description: 'Timezone (e.g., Asia/Kolkata)' },
    { key: 'device_id', label: 'Device ID', description: 'Device identifier' },
    { key: 'notes', label: 'Notes', description: 'Additional notes' },
  ];

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExt || '')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV or Excel file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'File size must be less than 50MB',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);

    try {
      // Parse file to get preview (simplified - just read CSV as text)
      // For Excel files, we'll skip preview and let server handle it
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      
      if (fileExt === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          // Parse first few lines manually
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          setColumnHeaders(headers);
          
          // Parse first 10 data rows
          const previewRows: PreviewRow[] = [];
          for (let i = 1; i < Math.min(lines.length, 11); i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const row: PreviewRow = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            previewRows.push(row);
          }
          setFilePreview(previewRows);
          
          // Auto-detect column mapping
          if (previewRows.length > 0) {
            const autoMapping = inferColumnMapping(previewRows[0]);
            setMapping(autoMapping);
            
            // Show mapping dialog if required fields not detected
            const hasRequiredFields = requiredFields.every(f => autoMapping[f.key as keyof ColumnMapping]);
            if (!hasRequiredFields) {
              setShowMapping(true);
            }
          }
        }
      } else {
        // For Excel files, we'll skip preview and show mapping dialog
        setShowMapping(true);
        toast({
          title: 'Excel file detected',
          description: 'Please configure column mapping before uploading',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error reading file',
        description: error.message || 'Failed to read file',
        variant: 'destructive',
      });
    }
  };

  const inferColumnMapping = (firstRow: PreviewRow): ColumnMapping => {
    const mapping: ColumnMapping = {};
    const lowerRow = Object.keys(firstRow).reduce((acc, key) => {
      acc[key.toLowerCase()] = key;
      return acc;
    }, {} as { [key: string]: string });

    // Map common column name variations
    const columnMappings: { [key: string]: string[] } = {
      employee_identifier: ['employee_identifier', 'employee_id', 'emp_id', 'employee_code', 'emp_code', 'id'],
      employee_email: ['employee_email', 'email', 'emp_email'],
      date: ['date', 'work_date', 'attendance_date'],
      time_in: ['time_in', 'timein', 'check_in', 'punch_in', 'start_time', 'in'],
      time_out: ['time_out', 'timeout', 'check_out', 'punch_out', 'end_time', 'out'],
      timezone: ['timezone', 'tz', 'time_zone'],
      device_id: ['device_id', 'device', 'deviceid'],
      notes: ['notes', 'note', 'remarks', 'description']
    };

    for (const [key, variations] of Object.entries(columnMappings)) {
      for (const variation of variations) {
        if (lowerRow[variation]) {
          mapping[key as keyof ColumnMapping] = lowerRow[variation];
          break;
        }
      }
    }

    return mapping;
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    // Validate mapping
    const missingFields = requiredFields.filter(f => !mapping[f.key as keyof ColumnMapping]);
    if (missingFields.length > 0) {
      toast({
        title: 'Missing required fields',
        description: `Please map: ${missingFields.map(f => f.label).join(', ')}`,
        variant: 'destructive',
      });
      setShowMapping(true);
      return;
    }

    try {
      setIsProcessing(true);
      
      const result = await api.uploadAttendance(selectedFile, mapping);
      setUploadId(result.upload_id);
      
      toast({
        title: 'Upload started',
        description: 'File is being processed. You can check status below.',
      });

      // Poll for status
      pollUploadStatus(result.upload_id);
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  const pollUploadStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await api.getUploadStatus(id);
        setUploadStatus(status);

        if (['completed', 'partial', 'failed'].includes(status.status)) {
          clearInterval(interval);
          setIsProcessing(false);
          
          if (status.status === 'completed') {
            toast({
              title: 'Upload completed',
              description: `Successfully processed ${status.succeeded_rows} rows`,
            });
          } else if (status.status === 'partial') {
            toast({
              title: 'Upload partially completed',
              description: `${status.succeeded_rows} succeeded, ${status.failed_rows} failed`,
              variant: 'default',
            });
          } else {
            toast({
              title: 'Upload failed',
              description: 'All rows failed. Please check errors and retry.',
              variant: 'destructive',
            });
          }
        }
      } catch (error) {
        console.error('Error polling upload status:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Clean up after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        employee_identifier: 'E123',
        employee_email: 'jane.doe@acme.com',
        date: '2025-11-03',
        time_in: '09:00',
        time_out: '17:30',
        timezone: 'Asia/Kolkata',
        notes: 'onsite'
      },
      {
        employee_identifier: 'E124',
        employee_email: 'john.smith@acme.com',
        date: '2025-11-03',
        time_in: '08:50',
        time_out: '17:00',
        timezone: 'Asia/Kolkata',
        notes: ''
      }
    ];

    const csv = [
      Object.keys(templateData[0]).join(','),
      ...templateData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
      completed: 'default',
      partial: 'secondary',
      failed: 'destructive',
      processing: 'outline',
      pending: 'outline',
    };

    const icons = {
      completed: <CheckCircle2 className="h-4 w-4" />,
      partial: <AlertCircle className="h-4 w-4" />,
      failed: <XCircle className="h-4 w-4" />,
      processing: <Clock className="h-4 w-4 animate-spin" />,
      pending: <Clock className="h-4 w-4" />,
    };

    return (
      <Badge variant={variants[status] || 'outline'} className="gap-1">
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Attendance Upload</h1>
          <p className="text-muted-foreground mt-2">
            Upload CSV or Excel files to bulk import employee attendance records
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload Attendance File</CardTitle>
            <CardDescription>
              Supported formats: CSV, Excel (.xlsx, .xls). Maximum file size: 50MB
              {tenantTimezone && (
                <span className="block mt-1">Default timezone: {tenantTimezone}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <Label htmlFor="file-input">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <>
                        {selectedFile.name.endsWith('.csv') ? (
                          <FileText className="mr-2 h-4 w-4" />
                        ) : (
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                        )}
                        {selectedFile.name}
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Select file
                      </>
                    )}
                  </Button>
                </Label>
              </div>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
            </div>

            {filePreview.length > 0 && (
              <>
                <Dialog open={showMapping} onOpenChange={setShowMapping}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => setShowMapping(true)}>
                      Configure Column Mapping
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Column Mapping</DialogTitle>
                      <DialogDescription>
                        Map your file columns to the required attendance fields
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <h3 className="font-semibold mb-2">Required Fields</h3>
                        <div className="space-y-3">
                          {requiredFields.map((field) => (
                            <div key={field.key}>
                              <Label>{field.label}</Label>
                              <p className="text-xs text-muted-foreground mb-1">{field.description}</p>
                              <Select
                                value={mapping[field.key as keyof ColumnMapping] || ''}
                                onValueChange={(value) =>
                                  setMapping({ ...mapping, [field.key]: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">-- None --</SelectItem>
                                  {columnHeaders.map((header) => (
                                    <SelectItem key={header} value={header}>
                                      {header}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold mb-2">Optional Fields</h3>
                        <div className="space-y-3">
                          {optionalFields.map((field) => (
                            <div key={field.key}>
                              <Label>{field.label}</Label>
                              <p className="text-xs text-muted-foreground mb-1">{field.description}</p>
                              <Select
                                value={mapping[field.key as keyof ColumnMapping] || ''}
                                onValueChange={(value) =>
                                  setMapping({ ...mapping, [field.key]: value })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select column (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">-- None --</SelectItem>
                                  {columnHeaders.map((header) => (
                                    <SelectItem key={header} value={header}>
                                      {header}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <div>
                  <h3 className="font-semibold mb-2">Preview (First 10 rows)</h3>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {columnHeaders.map((header) => (
                            <th key={header} className="px-3 py-2 text-left font-medium">
                              {header}
                              {mapping.employee_identifier === header && (
                                <span className="ml-1 text-blue-600">(ID)</span>
                              )}
                              {mapping.date === header && (
                                <span className="ml-1 text-blue-600">(Date)</span>
                              )}
                              {mapping.time_in === header && (
                                <span className="ml-1 text-blue-600">(In)</span>
                              )}
                              {mapping.time_out === header && (
                                <span className="ml-1 text-blue-600">(Out)</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filePreview.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            {columnHeaders.map((header) => (
                              <td key={header} className="px-3 py-2">
                                {row[header] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload & Process
                    </>
                  )}
                </Button>
              </>
            )}

            {uploadStatus && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Upload Status</CardTitle>
                    {getStatusBadge(uploadStatus.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Rows</p>
                      <p className="text-2xl font-bold">{uploadStatus.total_rows || 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Succeeded</p>
                      <p className="text-2xl font-bold text-green-600">
                        {uploadStatus.succeeded_rows || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Failed</p>
                      <p className="text-2xl font-bold text-red-600">
                        {uploadStatus.failed_rows || 0}
                      </p>
                    </div>
                  </div>

                  {uploadStatus.status === 'processing' && (
                    <div>
                      <Progress value={uploadStatus.succeeded_rows ? (uploadStatus.succeeded_rows / uploadStatus.total_rows) * 100 : 0} />
                      <p className="text-xs text-muted-foreground mt-1">
                        Processing... Please wait
                      </p>
                    </div>
                  )}

                  {uploadStatus.failed_rows > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Failed Rows</h4>
                      <div className="max-h-40 overflow-y-auto border rounded p-2">
                        {uploadStatus.failed_rows_details?.slice(0, 20).map((row: any) => (
                          <div key={row.row_number} className="text-sm py-1 border-b last:border-0">
                            <span className="font-medium">Row {row.row_number}:</span>{' '}
                            <span className="text-red-600">{row.error_message}</span>
                          </div>
                        ))}
                        {uploadStatus.failed_rows > 20 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            ... and {uploadStatus.failed_rows - 20} more errors
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => uploadId && api.retryUpload(uploadId)}
                      >
                        Retry Failed Rows
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

