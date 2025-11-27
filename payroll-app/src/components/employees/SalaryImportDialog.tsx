import { useState, useRef } from "react";
import { api } from "../../lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Download, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SalaryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const SalaryImportDialog = ({ open, onOpenChange, onSuccess }: SalaryImportDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setReport(null); // Reset report on new file selection
    }
  };

  const downloadTemplate = () => {
    // Complete CSV template with all salary components including new allowances
    const headers = [
      "Employee ID",
      "Basic",
      "HRA",
      "Special Allowance",
      "DA",
      "LTA",
      "Bonus",
      "CCA",
      "Conveyance",
      "Medical Allowance",
      "PF",
      "ESI"
    ];
    const dummyRow = ["EMP001", "50000", "20000", "15000", "0", "0", "0", "5000", "2000", "3000", "6000", "0"];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), dummyRow.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "salary_structure_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template downloaded successfully");
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      // Use the bulk import API method
      const result = await api.employees.bulkImportSalary(file);

      setReport(result);
      if (result.success) {
        toast.success(`Successfully updated ${result.report.updated} employees`);
        onSuccess();
      } else {
        toast.error("Import failed with errors");
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Salary Structures</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to update salary components for multiple employees at once.
            The file must include an "Employee ID" column and salary component columns (Basic, HRA, CCA, Conveyance, Medical Allowance, etc.).
          </DialogDescription>
        </DialogHeader>

        {!report ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Data Template</Label>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download CSV Template
              </Button>
            </div>
            
            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-accent/5 transition-colors cursor-pointer"
                 onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                {file ? file.name : "Click to select a file"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .csv, .xlsx (Max 10MB)
              </p>
              <Input 
                ref={fileInputRef}
                type="file" 
                accept=".csv, .xlsx, .xls" 
                className="hidden" 
                onChange={handleFileChange}
              />
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div className="flex gap-4 text-sm">
              <div className="text-green-600 font-medium">Updated: {report.report.updated}</div>
              <div className="text-red-600 font-medium">Failed: {report.report.failed}</div>
            </div>
            
            {report.report.errors && report.report.errors.length > 0 && (
              <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                <h4 className="mb-2 text-sm font-semibold text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Error Log
                </h4>
                {report.report.errors.map((err: string, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground border-b last:border-0 py-2">
                    {err}
                  </div>
                ))}
              </ScrollArea>
            )}
          </div>
        )}

        <DialogFooter>
          {report ? (
            <Button onClick={() => { setReport(null); setFile(null); onOpenChange(false); }}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={!file || isUploading}>
                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload & Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};