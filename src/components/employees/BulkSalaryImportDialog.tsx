import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileSpreadsheet, Loader2 } from "lucide-react";

interface BulkSalaryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const BulkSalaryImportDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: BulkSalaryImportDialogProps) => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
        toast({
          title: "Invalid file format",
          description: "Please select a CSV or Excel file (.csv, .xlsx, .xls)",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDownloadTemplate = () => {
    // Generate CSV template
    const headers = [
      "Employee ID",
      "Basic",
      "HRA",
      "CCA",
      "Conveyance",
      "Medical Allowance",
      "Special Allowance",
      "DA",
      "LTA",
      "Bonus",
      "PF",
      "ESI",
    ];
    
    const csvContent = headers.join(',') + '\n' + 
      'EMP001,50000,20000,5000,2000,3000,15000,0,0,0,6000,0';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'salary_structure_template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Template downloaded",
      description: "Salary structure template has been downloaded",
    });
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      // Call payroll app API
      const payrollApiUrl = import.meta.env.VITE_PAYROLL_API_URL || "http://localhost:4000";
      const response = await fetch(`${payrollApiUrl}/api/imports/bulk-salary-structure`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "API error" }));
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const result = await response.json();
      
      toast({
        title: "Import successful",
        description: result.message || `Successfully updated ${result.report?.updated || 0} employee(s)`,
      });

      if (result.report?.errors && result.report.errors.length > 0) {
        console.warn("Import errors:", result.report.errors);
        const errorPreview = result.report.errors.slice(0, 3).join('; ');
        if (result.report.errors.length > 3) {
          toast({
            title: "Some errors occurred",
            description: `First few errors: ${errorPreview}...`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Import completed with errors",
            description: `Errors: ${errorPreview}`,
            variant: "destructive",
          });
        }
      }

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Bulk import error:", error);
      toast({
        title: "Import failed",
        description: error.message || "Failed to import salary structures",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileSpreadsheet className="mr-2 h-5 w-5" />
            Bulk Import Salary Structures
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to update salary structures for multiple employees at once.
            The file must include an "Employee ID" column and salary component columns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">Download Template</p>
              <p className="text-sm text-muted-foreground">
                Get a sample CSV file with the correct format
              </p>
            </div>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-upload">Select File (CSV or Excel)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                disabled={uploading}
                className="flex-1"
              />
            </div>
            {file && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(file.size / 1024).toFixed(2)} KB)
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Supported formats: CSV, Excel (.xlsx, .xls). Maximum file size: 10MB
            </p>
          </div>

          <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
            <p className="text-sm font-medium mb-2">File Format Requirements:</p>
            <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
              <li>First row must contain column headers</li>
              <li>Must include "Employee ID" column (required)</li>
              <li>Other columns can include: Basic, HRA, CCA, Conveyance, Medical Allowance, Special Allowance, DA, LTA, Bonus, PF, ESI</li>
              <li>Column names are case-insensitive and spaces are ignored</li>
              <li>Empty or invalid values will be treated as 0</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
              onOpenChange(false);
            }}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

