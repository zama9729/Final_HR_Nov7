import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { RefreshCw } from "lucide-react";

const DEFAULT_SCOPE = ["identity", "employment"];

interface BackgroundCheckPanelProps {
  employeeId: string;
}

export function BackgroundCheckPanel({ employeeId }: BackgroundCheckPanelProps) {
  const { toast } = useToast();
  const [checks, setChecks] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    vendor_id: "",
    scope: DEFAULT_SCOPE,
    notes: "",
    attach_doc_ids: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [checksResponse, docsResponse] = await Promise.all([
        api.getBackgroundChecksForEmployee(employeeId),
        api.getOnboardingDocuments(employeeId, { status: "approved" }),
      ]);
      setChecks(checksResponse || []);
      setDocs(docsResponse.documents || []);
    } catch (error: any) {
      toast({
        title: "Unable to load background checks",
        description: error.message || "Please retry shortly.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employeeId) {
      loadData();
    }
  }, [employeeId]);

  const toggleScope = (value: string) => {
    setForm((prev) => ({
      ...prev,
      scope: prev.scope.includes(value) ? prev.scope.filter((s) => s !== value) : [...prev.scope, value],
    }));
  };

  const toggleDoc = (id: string) => {
    setForm((prev) => ({
      ...prev,
      attach_doc_ids: prev.attach_doc_ids.includes(id)
        ? prev.attach_doc_ids.filter((docId) => docId !== id)
        : [...prev.attach_doc_ids, id],
    }));
  };

  const handleCreate = async () => {
    if (!form.scope.length) {
      toast({ title: "Select scope", description: "Choose at least one check scope", variant: "destructive" });
      return;
    }
    try {
      setSubmitting(true);
      await api.createBackgroundCheck({
        employee_id: employeeId,
        type: "prehire",
        vendor_id: form.vendor_id || undefined,
        notes: form.notes,
        scope: form.scope,
        attach_doc_ids: form.attach_doc_ids,
      });
      toast({ title: "Background check created" });
      setForm({ vendor_id: "", scope: DEFAULT_SCOPE, notes: "", attach_doc_ids: [] });
      loadData();
    } catch (error: any) {
      toast({
        title: "Unable to create background check",
        description: error.message || "Try again later",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background Checks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Check Scope</Label>
          <div className="flex flex-wrap gap-3">
            {["identity", "employment", "education", "criminal"].map((scope) => (
              <div key={scope} className="flex items-center space-x-2">
                <Checkbox
                  id={`scope-${scope}`}
                  checked={form.scope.includes(scope)}
                  onCheckedChange={() => toggleScope(scope)}
                />
                <Label htmlFor={`scope-${scope}`} className="capitalize text-sm">{scope}</Label>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="vendor">Vendor (Optional)</Label>
            <Input
              id="vendor"
              value={form.vendor_id}
              onChange={(event) => setForm((prev) => ({ ...prev, vendor_id: event.target.value }))}
              placeholder="Vendor reference"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Attach Documents</Label>
          <div className="flex flex-wrap gap-2">
            {docs.map((doc) => (
              <Badge
                key={doc.id}
                variant={form.attach_doc_ids.includes(doc.id) ? "default" : "outline"}
                onClick={() => toggleDoc(doc.id)}
                className="cursor-pointer"
              >
                {doc.doc_label}
              </Badge>
            ))}
            {docs.length === 0 && <p className="text-xs text-muted-foreground">No approved documents yet.</p>}
          </div>
        </div>
        <Button onClick={handleCreate} disabled={submitting} className="w-full md:w-auto gap-2">
          {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
          Trigger Background Check
        </Button>
        <div className="space-y-3">
          <p className="text-sm font-medium">History</p>
          {loading && <p className="text-muted-foreground text-sm">Loading...</p>}
          {!loading && checks.length === 0 && (
            <p className="text-sm text-muted-foreground">No background checks yet.</p>
          )}
          {checks.map((check) => (
            <div key={check.id} className="border rounded-lg p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span>{new Date(check.created_at).toLocaleDateString()}</span>
                <Badge>{check.status}</Badge>
              </div>
              {check.verification_result && (
                <p className="text-xs text-muted-foreground">
                  Result: {check.verification_result}
                </p>
              )}
              {check.vendor_id && (
                <p className="text-xs text-muted-foreground">Vendor: {check.vendor_id}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

