import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import { Upload, Download, FileSpreadsheet, FileText, CheckCircle2, XCircle, Clock, AlertCircle, Save, Play } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import * as XLSX from 'xlsx';

// Enhanced interfaces for Dynamic ETL
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

interface TransformationRule {
  field: string;
  type: 'format' | 'parse' | 'default' | 'custom';
  config: any;
}

interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'custom';
  message?: string;
  config?: any;
}

interface MappingTemplate {
  id?: string;
  name: string;
  description?: string;
  mapping: ColumnMapping;
  transformations?: TransformationRule[];
  validations?: ValidationRule[];
  created_at?: string;
}

interface PreviewRow {
  [key: string]: string;
  _transformed?: any;
  _errors?: string[];
  _warnings?: string[];
}

interface ETLPipeline {
  extract: {
    fileType: string;
    headers: string[];
    rowCount: number;
  };
  transform: {
    mapping: ColumnMapping;
    transformations: TransformationRule[];
    applied: boolean;
  };
  load: {
    validated: number;
    errors: number;
    warnings: number;
  };
}

const DATE_COLUMN_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIME_IN = '09:00';
const DEFAULT_TIME_OUT = '18:00';
const WORKING_STATUS_CODES = ['P', 'PR', 'PRESENT', 'WFH', 'OD', 'ON DUTY', 'ONDUTY', 'TRAVEL', 'FIELD'];

export default function AttendanceUpload() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<PreviewRow[]>([]);
  const [transformedPreview, setTransformedPreview] = useState<PreviewRow[]>([]);
  const [columnHeaders, setColumnHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [transformations, setTransformations] = useState<TransformationRule[]>([]);
  const [validations, setValidations] = useState<ValidationRule[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showETLPipeline, setShowETLPipeline] = useState(false);
  const [tenantTimezone, setTenantTimezone] = useState('Asia/Kolkata');
  const [savedTemplates, setSavedTemplates] = useState<MappingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateName, setTemplateName] = useState('');
  const [showPreview, setShowPreview] = useState<'raw' | 'transformed'>('raw');
  const [etlPipeline, setEtlPipeline] = useState<ETLPipeline | null>(null);
  const [matrixDetected, setMatrixDetected] = useState(false);

  const columnOptions = useMemo(() => {
    return columnHeaders.map((header, index) => {
      const raw = header ?? '';
      const isBlank = raw.trim() === '';
      return {
        raw,
        value: isBlank ? `__blank__${index}` : raw,
        label: isBlank ? `Unnamed Column ${index + 1}` : raw,
        index,
      };
    });
  }, [columnHeaders]);

  const toSelectValue = useCallback(
    (raw: string | undefined) => {
      if (!raw) return '__none__';
      const match = columnOptions.find((option) => option.raw === raw);
      return match ? match.value : raw;
    },
    [columnOptions]
  );

  const fromSelectValue = useCallback(
    (value: string) => {
      if (value === '__none__') return '';
      const match = columnOptions.find((option) => option.value === value);
      return match ? match.raw : value;
    },
    [columnOptions]
  );

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

  // Load saved templates on mount
  useEffect(() => {
    loadSavedTemplates();
  }, []);

  const loadSavedTemplates = async () => {
    try {
      const templates = await api.getAttendanceMappingTemplates?.() || [];
      setSavedTemplates(templates);
    } catch (error) {
      // Templates API might not exist yet, that's okay
      console.log('Templates API not available');
    }
  };

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
    setTransformedPreview([]);
    setEtlPipeline(null);

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      let headers: string[] = [];
      let previewRows: PreviewRow[] = [];

      if (fileExt === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          for (let i = 1; i < Math.min(lines.length, 11); i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const row: PreviewRow = {};
            headers.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });
            previewRows.push(row);
          }
        }
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false });
        if (json.length > 0) {
          headers = (json[0] as string[]).map((h) => (h || '').trim());
          for (let i = 1; i < Math.min(json.length, 11); i++) {
            const rowValues = json[i] as string[] || [];
            const row: PreviewRow = {};
            headers.forEach((header, idx) => {
              row[header] = rowValues[idx] || '';
            });
            previewRows.push(row);
          }
        }
      }

      if (headers.length === 0) {
        toast({
          title: 'Unable to read headers',
          description: 'Please ensure the file has a header row on the first line.',
          variant: 'destructive',
        });
        return;
      }

      const matrixPreview = convertMatrixPreview(headers, previewRows, tenantTimezone);

      if (matrixPreview) {
        setMatrixDetected(true);
        setColumnHeaders(matrixPreview.headers);
        setFilePreview(matrixPreview.rows);
        setMapping(matrixPreview.mapping);
        setTransformations([]);
      } else {
        setMatrixDetected(false);
        setColumnHeaders(headers);
        setFilePreview(previewRows);

        const autoMapping = previewRows.length > 0 ? inferColumnMapping(previewRows[0]) : {};
        setMapping(autoMapping);
        if (previewRows.length > 0) {
          setupDefaultTransformations(autoMapping);
        } else {
          setTransformations([]);
        }
      }

      const effectiveHeaders = matrixPreview ? matrixPreview.headers : headers;
      const effectiveRows = matrixPreview ? matrixPreview.rows : previewRows;
      const effectiveMapping = matrixPreview
        ? matrixPreview.mapping
        : (previewRows.length > 0 ? inferColumnMapping(previewRows[0]) : {});

      setEtlPipeline({
        extract: {
          fileType: fileExt?.toUpperCase() || 'CSV',
          headers: effectiveHeaders,
          rowCount: effectiveRows.length,
        },
        transform: {
          mapping: effectiveMapping,
          transformations: [],
          applied: false,
        },
        load: {
          validated: 0,
          errors: 0,
          warnings: 0,
        },
      });
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

    const columnMappings: { [key: string]: string[] } = {
      employee_identifier: ['employee_identifier', 'employee_id', 'emp_id', 'employee_code', 'emp_code', 'id', 'empid'],
      employee_email: ['employee_email', 'email', 'emp_email'],
      date: ['date', 'work_date', 'attendance_date', 'punch_date'],
      time_in: ['time_in', 'timein', 'check_in', 'punch_in', 'start_time', 'in', 'in_time'],
      time_out: ['time_out', 'timeout', 'check_out', 'punch_out', 'end_time', 'out', 'out_time'],
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

  const setupDefaultTransformations = (mapping: ColumnMapping) => {
    const defaultTransformations: TransformationRule[] = [];
    
    if (mapping.date) {
      defaultTransformations.push({
        field: 'date',
        type: 'format',
        config: { format: 'YYYY-MM-DD', inputFormats: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'] }
      });
    }
    
    if (mapping.time_in) {
      defaultTransformations.push({
        field: 'time_in',
        type: 'format',
        config: { format: 'HH:MM', inputFormats: ['HH:MM', 'HH:MM:SS', 'h:mm A'] }
      });
    }
    
    if (mapping.time_out) {
      defaultTransformations.push({
        field: 'time_out',
        type: 'format',
        config: { format: 'HH:MM', inputFormats: ['HH:MM', 'HH:MM:SS', 'h:mm A'] }
      });
    }

    setTransformations(defaultTransformations);
  };

  const applyTransformations = useCallback(() => {
    if (!filePreview.length || !mapping) return;

    const transformed = filePreview.map((row) => {
      const transformedRow: PreviewRow = { ...row };
      const errors: string[] = [];
      const warnings: string[] = [];

      // Apply transformations
      transformations.forEach((transform) => {
        const sourceColumn = mapping[transform.field as keyof ColumnMapping];
        if (!sourceColumn || !row[sourceColumn]) return;

        let value = row[sourceColumn];

        try {
          switch (transform.type) {
            case 'format':
              if (transform.field === 'date') {
                // Date formatting
                const dateFormats = transform.config.inputFormats || ['YYYY-MM-DD'];
                let parsed = false;
                for (const fmt of dateFormats) {
                  try {
                    if (fmt === 'DD/MM/YYYY') {
                      const [d, m, y] = value.split('/');
                      if (d && m && y) {
                        transformedRow[sourceColumn] = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                        parsed = true;
                        break;
                      }
                    } else if (fmt === 'MM/DD/YYYY') {
                      const [m, d, y] = value.split('/');
                      if (m && d && y) {
                        transformedRow[sourceColumn] = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                        parsed = true;
                        break;
                      }
                    } else if (fmt === 'YYYY-MM-DD') {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        parsed = true;
                        break;
                      }
                    }
                  } catch (e) {
                    // Try next format
                  }
                }
                if (!parsed) {
                  warnings.push(`Date format may be invalid: ${value}`);
                }
              } else if (transform.field === 'time_in' || transform.field === 'time_out') {
                // Time formatting
                if (value.includes('AM') || value.includes('PM')) {
                  // 12-hour format
                  const [time, period] = value.split(/\s+/);
                  const [h, m] = time.split(':');
                  let hour = parseInt(h);
                  if (period === 'PM' && hour !== 12) hour += 12;
                  if (period === 'AM' && hour === 12) hour = 0;
                  transformedRow[sourceColumn] = `${hour.toString().padStart(2, '0')}:${m || '00'}`;
                } else if (value.includes(':')) {
                  // Already in HH:MM or HH:MM:SS
                  const parts = value.split(':');
                  transformedRow[sourceColumn] = `${parts[0].padStart(2, '0')}:${parts[1] || '00'}`;
                }
              }
              break;
            case 'default':
              if (!value || value.trim() === '') {
                transformedRow[sourceColumn] = transform.config.value || '';
              }
              break;
          }
        } catch (error: any) {
          errors.push(`Transform error for ${transform.field}: ${error.message}`);
        }
      });

      // Apply validations
      validations.forEach((validation) => {
        const sourceColumn = mapping[validation.field as keyof ColumnMapping];
        if (!sourceColumn) return;

        const value = transformedRow[sourceColumn];

        switch (validation.type) {
          case 'required':
            if (!value || value.trim() === '') {
              errors.push(validation.message || `${validation.field} is required`);
            }
            break;
          case 'format':
            if (value && validation.config?.pattern) {
              const regex = new RegExp(validation.config.pattern);
              if (!regex.test(value)) {
                errors.push(validation.message || `${validation.field} format is invalid`);
              }
            }
            break;
        }
      });

      transformedRow._transformed = true;
      transformedRow._errors = errors;
      transformedRow._warnings = warnings;

      return transformedRow;
    });

    setTransformedPreview(transformed);

    // Update ETL Pipeline
    if (etlPipeline) {
      const errorCount = transformed.reduce((sum, row) => sum + (row._errors?.length || 0), 0);
      const warningCount = transformed.reduce((sum, row) => sum + (row._warnings?.length || 0), 0);
      const validatedCount = transformed.length - errorCount;

      setEtlPipeline({
        ...etlPipeline,
        transform: {
          ...etlPipeline.transform,
          mapping,
          transformations,
          applied: true,
        },
        load: {
          validated: validatedCount,
          errors: errorCount,
          warnings: warningCount,
        },
      });
    }
  }, [filePreview, mapping, transformations, validations, etlPipeline]);

  useEffect(() => {
    if (filePreview.length > 0 && mapping && Object.keys(mapping).length > 0) {
      applyTransformations();
    }
  }, [filePreview, mapping, transformations, validations, applyTransformations]);

  const handleLoadTemplate = (templateId: string) => {
    const template = savedTemplates.find(t => t.id === templateId);
    if (template) {
      setMapping(template.mapping);
      setTransformations(template.transformations || []);
      setValidations(template.validations || []);
      setSelectedTemplate(templateId);
      toast({
        title: 'Template loaded',
        description: `Loaded template: ${template.name}`,
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: 'Template name required',
        description: 'Please enter a name for the template',
        variant: 'destructive',
      });
      return;
    }

    try {
      const template: MappingTemplate = {
        name: templateName,
        mapping,
        transformations,
        validations,
      };

      await api.saveAttendanceMappingTemplate?.(template);
      toast({
        title: 'Template saved',
        description: `Template "${templateName}" has been saved`,
      });
      setTemplateName('');
      loadSavedTemplates();
    } catch (error: any) {
      toast({
        title: 'Failed to save template',
        description: error.message || 'Could not save template',
        variant: 'destructive',
      });
    }
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
      
      const etlConfig = {
        mapping,
        transformations,
        validations,
        matrixDetected,
      };

      const result = await api.uploadAttendance(selectedFile, etlConfig);
      setUploadId(result.upload_id);
      
      toast({
        title: 'Upload started',
        description: 'File is being processed. You can check status below.',
      });

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
    }, 2000);

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
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold">Dynamic ETL Attendance Upload</h1>
          <p className="text-muted-foreground mt-2">
            Upload CSV or Excel files with intelligent mapping, transformations, and validation
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
                Template
              </Button>
            </div>

            {filePreview.length > 0 && (
              <>
                <Tabs defaultValue="mapping" className="w-full">
                  <TabsList>
                    <TabsTrigger value="mapping">Column Mapping</TabsTrigger>
                    <TabsTrigger value="transformations">Transformations</TabsTrigger>
                    <TabsTrigger value="validations">Validations</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="pipeline">ETL Pipeline</TabsTrigger>
                  </TabsList>

                  <TabsContent value="mapping" className="space-y-4">
                    <div className="flex flex-wrap gap-3 items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Column Mapping</h3>
                        <p className="text-sm text-muted-foreground">
                          Map your file headers to the expected attendance fields. Use Smart Auto-Map to let us detect the best match.
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {savedTemplates.length > 0 && (
                          <Select value={selectedTemplate} onValueChange={handleLoadTemplate}>
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Load Template" />
                            </SelectTrigger>
                            <SelectContent>
                              {savedTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id || ''}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (filePreview.length > 0) {
                              const auto = inferColumnMapping(filePreview[0]);
                              setMapping(auto);
                              setupDefaultTransformations(auto);
                              toast({
                                title: 'Smart auto-map applied',
                                description: 'We matched columns based on header similarities.',
                              });
                            }
                          }}
                        >
                          Smart Auto-Map
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline">
                              <Save className="mr-2 h-4 w-4" />
                              Save Template
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Save Mapping Template</DialogTitle>
                              <DialogDescription>
                                Save your mapping configuration for future use
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 mt-4">
                              <div>
                                <Label>Template Name</Label>
                                <Input
                                  value={templateName}
                                  onChange={(e) => setTemplateName(e.target.value)}
                                  placeholder="e.g., Biometric Export"
                                />
                              </div>
                              <Button onClick={handleSaveTemplate} className="w-full">
                                Save Template
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    {matrixDetected && (
                      <Alert>
                        <AlertTitle>Matrix-style sheet detected</AlertTitle>
                        <AlertDescription>
                          We converted each day column into individual attendance rows and applied default 09:00-18:00 times for present days.
                          You can still adjust mappings or transformations below.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="grid gap-6 md:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Required Fields</CardTitle>
                          <CardDescription>Must be mapped before uploading</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {requiredFields.map((field) => (
                            <div key={field.key} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{field.label}</p>
                                  <p className="text-xs text-muted-foreground">{field.description}</p>
                                </div>
                                {mapping[field.key as keyof ColumnMapping] ? (
                                  <Badge variant="outline">Mapped</Badge>
                                ) : (
                                  <Badge variant="destructive">Required</Badge>
                                )}
                              </div>
                              <Select
                                value={toSelectValue(mapping[field.key as keyof ColumnMapping])}
                                onValueChange={(value) =>
                                  setMapping({
                                    ...mapping,
                                    [field.key]: fromSelectValue(value),
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-- None --</SelectItem>
                                  {columnOptions.map((option) => (
                                    <SelectItem key={`${option.value}-${option.index}`} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Optional Fields</CardTitle>
                          <CardDescription>Map additional data for richer insights</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {optionalFields.map((field) => (
                            <div key={field.key} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{field.label}</p>
                                  <p className="text-xs text-muted-foreground">{field.description}</p>
                                </div>
                                {mapping[field.key as keyof ColumnMapping] ? (
                                  <Badge variant="outline">Mapped</Badge>
                                ) : (
                                  <Badge variant="secondary">Optional</Badge>
                                )}
                              </div>
                              <Select
                                value={toSelectValue(mapping[field.key as keyof ColumnMapping])}
                                onValueChange={(value) =>
                                  setMapping({
                                    ...mapping,
                                    [field.key]: fromSelectValue(value),
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">-- None --</SelectItem>
                                  {columnOptions.map((option) => (
                                    <SelectItem key={`${option.value}-${option.index}`} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="transformations" className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-2">Data Transformations</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Configure how data should be transformed before validation
                      </p>
                      <div className="space-y-3">
                        {transformations.map((transform, idx) => (
                          <Card key={idx}>
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{transform.field}</p>
                                  <p className="text-sm text-muted-foreground">{transform.type}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setTransformations(transformations.filter((_, i) => i !== idx));
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTransformations([...transformations, {
                              field: 'date',
                              type: 'format',
                              config: {}
                            }]);
                          }}
                        >
                          Add Transformation
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="validations" className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-2">Validation Rules</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Define rules to validate data before loading
                      </p>
                      <div className="space-y-3">
                        {validations.map((validation, idx) => (
                          <Card key={idx}>
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{validation.field}</p>
                                  <p className="text-sm text-muted-foreground">{validation.type}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setValidations(validations.filter((_, i) => i !== idx));
                                  }}
                                >
                                  Remove
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                        <Button
                          variant="outline"
                          onClick={() => {
                            setValidations([...validations, {
                              field: 'employee_identifier',
                              type: 'required',
                              message: 'Employee identifier is required'
                            }]);
                          }}
                        >
                          Add Validation
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="preview" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Data Preview</h3>
                      <div className="flex gap-2">
                        <Button
                          variant={showPreview === 'raw' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setShowPreview('raw')}
                        >
                          Raw Data
                        </Button>
                        <Button
                          variant={showPreview === 'transformed' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setShowPreview('transformed')}
                        >
                          Transformed
                        </Button>
                      </div>
                    </div>
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
                            {showPreview === 'transformed' && (
                              <>
                                <th className="px-3 py-2 text-left font-medium">Errors</th>
                                <th className="px-3 py-2 text-left font-medium">Warnings</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {(showPreview === 'raw' ? filePreview : transformedPreview).map((row, idx) => (
                            <tr key={idx} className={`border-t ${row._errors && row._errors.length > 0 ? 'bg-red-50' : ''}`}>
                              {columnHeaders.map((header) => (
                                <td key={header} className="px-3 py-2">
                                  {row[header] || '-'}
                                </td>
                              ))}
                              {showPreview === 'transformed' && (
                                <>
                                  <td className="px-3 py-2">
                                    {row._errors && row._errors.length > 0 ? (
                                      <div className="text-red-600 text-xs">
                                        {row._errors.join(', ')}
                                      </div>
                                    ) : '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {row._warnings && row._warnings.length > 0 ? (
                                      <div className="text-yellow-600 text-xs">
                                        {row._warnings.join(', ')}
                                      </div>
                                    ) : '-'}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  <TabsContent value="pipeline" className="space-y-4">
                    {etlPipeline && (
                      <div className="space-y-4">
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Play className="h-5 w-5" />
                              ETL Pipeline Status
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div>
                              <h4 className="font-semibold mb-2">Extract</h4>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">File Type</p>
                                  <p className="font-medium">{etlPipeline.extract.fileType}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Columns</p>
                                  <p className="font-medium">{etlPipeline.extract.headers.length}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Rows</p>
                                  <p className="font-medium">{etlPipeline.extract.rowCount}</p>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold mb-2">Transform</h4>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Mappings</p>
                                  <p className="font-medium">{Object.keys(etlPipeline.transform.mapping).length}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Transformations</p>
                                  <p className="font-medium">{etlPipeline.transform.transformations.length}</p>
                                </div>
                              </div>
                              <Badge variant={etlPipeline.transform.applied ? 'default' : 'outline'} className="mt-2">
                                {etlPipeline.transform.applied ? 'Applied' : 'Pending'}
                              </Badge>
                            </div>

                            <div>
                              <h4 className="font-semibold mb-2">Load</h4>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Validated</p>
                                  <p className="font-medium text-green-600">{etlPipeline.load.validated}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Errors</p>
                                  <p className="font-medium text-red-600">{etlPipeline.load.errors}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Warnings</p>
                                  <p className="font-medium text-yellow-600">{etlPipeline.load.warnings}</p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

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

function normalizeHeaderLabel(header: string) {
  return (header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findHeader(headers: string[], candidates: string[]) {
  const normalized = headers.map((header) => ({
    raw: header,
    norm: normalizeHeaderLabel(header),
  }));
  const target = candidates.map(normalizeHeaderLabel);
  const match = normalized.find((entry) => target.includes(entry.norm));
  return match?.raw || null;
}

function normalizeStatusValue(value: string) {
  return (value || '').replace(/[^a-z]/gi, '').toUpperCase();
}

function isWorkingStatus(value: string) {
  const normalized = normalizeStatusValue(value);
  return WORKING_STATUS_CODES.some((code) =>
    normalized.includes(code.replace(/\s/g, ''))
  );
}

function convertMatrixPreview(headers: string[], rows: PreviewRow[], tenantTimezone: string) {
  const dateColumns = headers.filter((header) =>
    DATE_COLUMN_REGEX.test((header || '').trim())
  );
  if (dateColumns.length === 0) {
    return null;
  }

  const identifierHeader = findHeader(headers, [
    'employee code',
    'employee_id',
    'employee id',
    'emp id',
    'emp code',
    'code',
  ]);
  if (!identifierHeader) {
    return null;
  }

  const emailHeader = findHeader(headers, ['employee email', 'email']);
  const timezoneHeader = findHeader(headers, ['timezone', 'tz', 'time zone']);

  const expandedRows: PreviewRow[] = [];
  rows.forEach((row) => {
    const identifier = (row[identifierHeader] || '').toString().trim();
    if (!identifier) return;

    dateColumns.forEach((dateCol) => {
      const statusValue = (row[dateCol] || '').toString().trim();
      if (!statusValue || !isWorkingStatus(statusValue)) return;

      expandedRows.push({
        employee_identifier: identifier,
        employee_email: emailHeader ? (row[emailHeader] || '').toString().trim() : '',
        date: dateCol,
        time_in: DEFAULT_TIME_IN,
        time_out: DEFAULT_TIME_OUT,
        timezone: timezoneHeader ? (row[timezoneHeader] || tenantTimezone) : tenantTimezone,
        notes: `Status: ${statusValue}`,
      });
    });
  });

  if (expandedRows.length === 0) {
    return null;
  }

  const canonicalHeaders = ['employee_identifier', 'employee_email', 'date', 'time_in', 'time_out', 'timezone', 'notes'];
  const defaultMapping: ColumnMapping = {
    employee_identifier: 'employee_identifier',
    employee_email: 'employee_email',
    date: 'date',
    time_in: 'time_in',
    time_out: 'time_out',
    timezone: 'timezone',
    notes: 'notes',
  };

  return {
    headers: canonicalHeaders,
    rows: expandedRows.slice(0, 50),
    mapping: defaultMapping,
  };
}
