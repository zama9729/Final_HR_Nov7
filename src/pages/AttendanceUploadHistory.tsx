import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Download, RefreshCw, FileText, CheckCircle2, XCircle, Clock, AlertCircle, Eye } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UploadRecord {
  id: string;
  original_filename: string;
  status: string;
  total_rows: number;
  succeeded_rows: number;
  failed_rows: number;
  ignored_rows: number;
  created_at: string;
  processed_at?: string;
  uploader_id: string;
}

export default function AttendanceUploadHistory() {
  const { toast } = useToast();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUpload, setSelectedUpload] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchUploadHistory();
  }, []);

  const fetchUploadHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getAttendanceUploads();
      setUploads(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch upload history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (uploadId: string) => {
    try {
      const status = await api.getUploadStatus(uploadId);
      setSelectedUpload(status);
      setShowDetails(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch upload details',
        variant: 'destructive',
      });
    }
  };

  const handleRetry = async (uploadId: string) => {
    try {
      await api.retryUpload(uploadId);
      toast({
        title: 'Retry initiated',
        description: 'Failed rows are being reprocessed',
      });
      fetchUploadHistory();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to retry upload',
        variant: 'destructive',
      });
    }
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Upload History</h1>
            <p className="text-muted-foreground mt-2">
              View and manage attendance file uploads
            </p>
          </div>
          <Button variant="outline" onClick={fetchUploadHistory}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Past Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : uploads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No uploads found. Start by uploading an attendance file.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Succeeded</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((upload) => (
                    <TableRow key={upload.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{upload.original_filename}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(upload.status)}</TableCell>
                      <TableCell>{upload.total_rows}</TableCell>
                      <TableCell className="text-green-600 font-medium">
                        {upload.succeeded_rows}
                      </TableCell>
                      <TableCell className="text-red-600 font-medium">
                        {upload.failed_rows}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(upload.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {upload.processed_at ? formatDate(upload.processed_at) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(upload.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {upload.failed_rows > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetry(upload.id)}
                            >
                              <RefreshCw className="h-4 w-4" />
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

        {/* Upload Details Dialog */}
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload Details</DialogTitle>
              <DialogDescription>
                Detailed information about the upload processing
              </DialogDescription>
            </DialogHeader>
            {selectedUpload && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Rows</p>
                    <p className="text-2xl font-bold">{selectedUpload.total_rows}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Succeeded</p>
                    <p className="text-2xl font-bold text-green-600">
                      {selectedUpload.succeeded_rows}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Failed</p>
                    <p className="text-2xl font-bold text-red-600">
                      {selectedUpload.failed_rows}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ignored</p>
                    <p className="text-2xl font-bold text-gray-600">
                      {selectedUpload.ignored_rows}
                    </p>
                  </div>
                </div>

                {selectedUpload.failed_rows_details && selectedUpload.failed_rows_details.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Failed Rows</h3>
                    <div className="max-h-60 overflow-y-auto border rounded p-2">
                      {selectedUpload.failed_rows_details.map((row: any) => (
                        <div key={row.row_number} className="text-sm py-2 border-b last:border-0">
                          <div className="flex items-start gap-2">
                            <span className="font-medium">Row {row.row_number}:</span>
                            <span className="text-red-600 flex-1">{row.error_message}</span>
                          </div>
                          {row.raw_data && (
                            <div className="text-xs text-muted-foreground mt-1 ml-4">
                              Data: {JSON.stringify(row.raw_data)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

