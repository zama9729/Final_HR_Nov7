import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function ShiftManagement() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Shift Management</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Shift management functionality will be available soon. You'll be able to:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-muted-foreground">
            <li>Create and manage shift schedules</li>
            <li>Assign employees to shifts</li>
            <li>Track shift attendance</li>
            <li>Handle shift swaps and requests</li>
            <li>View shift analytics and reports</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
