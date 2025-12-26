import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function FeatureMatrixView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['superadmin', 'features'],
    queryFn: () => api.getSuperAdminFeatures(),
  });

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Error loading features: {(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Feature Matrix by Tier
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Basic</TableHead>
                  <TableHead className="text-center">Premium</TableHead>
                  <TableHead className="text-center">Enterprise</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.features?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      No features found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.features?.map((feature: any) => (
                    <TableRow key={feature.feature_key}>
                      <TableCell className="font-medium">{feature.feature_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {feature.description || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {feature.tier_basic ? (
                          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300">
                            <Check className="h-3 w-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-600">
                            <X className="h-3 w-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {feature.tier_premium ? (
                          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300">
                            <Check className="h-3 w-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-600">
                            <X className="h-3 w-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {feature.tier_enterprise ? (
                          <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300">
                            <Check className="h-3 w-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-600">
                            <X className="h-3 w-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

