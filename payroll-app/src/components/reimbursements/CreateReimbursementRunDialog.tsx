import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

interface CreateReimbursementRunDialogProps {
  onSuccess?: () => void;
}

export const CreateReimbursementRunDialog = ({ onSuccess }: CreateReimbursementRunDialogProps) => {
  const [open, setOpen] = useState(false);
  const [runDate, setRunDate] = useState(new Date().toISOString().split("T")[0]);
  const [referenceNote, setReferenceNote] = useState("");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      return await api.reimbursementRuns.create({
        run_date: runDate,
        reference_note: referenceNote || undefined,
      });
    },
    onSuccess: (data) => {
      toast.success(
        `Reimbursement run created with ${data.summary.total_claims} claims totaling ${formatCurrency(data.summary.total_amount)}`
      );
      queryClient.invalidateQueries({ queryKey: ["reimbursement-runs"] });
      setOpen(false);
      setReferenceNote("");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create reimbursement run");
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Process New Reimbursement Batch
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Reimbursement Run</DialogTitle>
          <DialogDescription>
            Create a new batch to process approved expense claims. The system will automatically
            include all approved reimbursements that haven't been paid yet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="run_date">Run Date</Label>
              <Input
                id="run_date"
                type="date"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference_note">Reference Note (Optional)</Label>
              <Textarea
                id="reference_note"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder="Add a note for this reimbursement run..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Run"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

