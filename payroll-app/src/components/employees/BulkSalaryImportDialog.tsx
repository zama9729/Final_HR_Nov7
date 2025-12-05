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
import { toast } from "sonner";
import { Upload, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";

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
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
        toast.error("Please select a CSV or Excel file (.csv, .xlsx, .xls)");
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
    
    toast.success("Template downloaded");
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    setUploading(true);
    try {
      const result = await api.employees.bulkImportSalary(file);
      
      toast.success(
        result.message || `Successfully updated ${result.report?.updated || 0} employee(s)`,
        {
          description: result.report?.failed 
            ? `${result.report.failed} employee(s) failed to update`
            : undefined,
        }
      );

      if (result.report?.errors && result.report.errors.length > 0) {
        console.warn("Import errors:", result.report.errors);
        // Show first few errors in a toast
        const errorPreview = result.report.errors.slice(0, 3).join('; ');
        if (result.report.errors.length > 3) {
          toast.warning(`Some errors occurred. First few: ${errorPreview}...`);
        } else {
          toast.warning(`Errors: ${errorPreview}`);
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
      toast.error(error.message || "Failed to import salary structures");
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

