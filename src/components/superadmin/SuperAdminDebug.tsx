import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function SuperAdminDebug() {
  const { user } = useAuth();
  
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
  
  const isSuperadmin = user?.email && adminEmails.includes(user.email.toLowerCase());
  
  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Super Admin Access Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-2">Current User Email:</p>
          <Badge variant={user?.email ? "default" : "destructive"}>
            {user?.email || "Not logged in"}
          </Badge>
        </div>
        
        <div>
          <p className="text-sm font-medium mb-2">Configured Admin Emails:</p>
          <div className="space-y-1">
            {adminEmails.length > 0 ? (
              adminEmails.map((email, idx) => (
                <Badge key={idx} variant="outline" className="mr-1">
                  {email}
                </Badge>
              ))
            ) : (
              <Badge variant="destructive">No admin emails configured</Badge>
            )}
          </div>
        </div>
        
        <div>
          <p className="text-sm font-medium mb-2">VITE_ADMIN_EMAILS from env:</p>
          <code className="text-xs bg-muted p-2 rounded block">
            {import.meta.env.VITE_ADMIN_EMAILS || "(not set)"}
          </code>
          <p className="text-xs text-muted-foreground mt-1">
            Raw value: {JSON.stringify(import.meta.env.VITE_ADMIN_EMAILS)}
          </p>
        </div>
        
        <div>
          <p className="text-sm font-medium mb-2">Email Comparison:</p>
          <div className="text-xs space-y-1">
            <p>User email (lowercase): <code className="bg-muted px-1 rounded">{user?.email?.toLowerCase()}</code></p>
            <p>In admin list: <code className="bg-muted px-1 rounded">{isSuperadmin ? 'YES ✓' : 'NO ✗'}</code></p>
          </div>
        </div>
        
        <Alert variant={isSuperadmin ? "default" : "destructive"}>
          <AlertDescription>
            {isSuperadmin 
              ? "✅ You have Super Admin access! You should be able to access /superadmin"
              : "❌ You do NOT have Super Admin access. Make sure:"}
          </AlertDescription>
          {!isSuperadmin && (
            <ul className="list-disc list-inside mt-2 text-sm space-y-1">
              <li>You are logged in with email: {user?.email || "(not logged in)"}</li>
              <li>Your email matches one in VITE_ADMIN_EMAILS (case-insensitive)</li>
              <li>Frontend dev server was restarted after setting VITE_ADMIN_EMAILS</li>
              <li>VITE_ADMIN_EMAILS is set in the root .env file (not server/.env)</li>
            </ul>
          )}
        </Alert>
        
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            To fix: Make sure your email ({user?.email || "N/A"}) is in VITE_ADMIN_EMAILS and restart the dev server.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

