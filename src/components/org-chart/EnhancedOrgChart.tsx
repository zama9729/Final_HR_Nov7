import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MapPin } from "lucide-react";

interface Employee {
  id: string;
  employee_id: string;
  user_id: string;
  position: string | null;
  department: string | null;
  work_location: string | null;
  reporting_manager_id: string | null;
  profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
  } | null;
}

interface TreeNode extends Employee {
  children: TreeNode[];
}

async function fetchOrgStructure(): Promise<Employee[]> {
  try {
    const data = await api.getOrgStructure();
    return (data || []).filter((emp: any) => emp.profiles);
  } catch (error) {
    console.error("Error fetching org structure:", error);
    return [];
  }
}

function buildTree(employees: Employee[]): TreeNode[] {
  const employeeMap = new Map<string, TreeNode>();
  
  employees.forEach(emp => {
    employeeMap.set(emp.id, { ...emp, children: [] });
  });

  const roots: TreeNode[] = [];
  
  employeeMap.forEach(node => {
    if (node.reporting_manager_id && employeeMap.has(node.reporting_manager_id)) {
      const parent = employeeMap.get(node.reporting_manager_id)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function renderNode(node: TreeNode, level: number = 0): JSX.Element {
  if (!node.profiles) return <></>;

  const initials = `${node.profiles.first_name?.[0] || ''}${node.profiles.last_name?.[0] || ''}`.toUpperCase();
  const fullName = `${node.profiles.first_name || ''} ${node.profiles.last_name || ''}`.trim();
  const hasChildren = node.children.length > 0;

  return (
    <div key={node.id} className="flex flex-col items-center">
      <Card className="w-80 hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/50 bg-gradient-to-br from-card to-card/80">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg text-foreground mb-1">{fullName}</h3>
              {node.position && (
                <p className="text-sm font-medium text-primary mb-2">{node.position}</p>
              )}
              {node.department && (
                <Badge variant="secondary" className="mb-3">{node.department}</Badge>
              )}
              
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{node.profiles.email}</span>
                </div>
                {node.profiles.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{node.profiles.phone}</span>
                  </div>
                )}
                {node.work_location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{node.work_location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {hasChildren && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {node.children.length} Direct Report{node.children.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {hasChildren && (
        <div className="relative mt-8">
          {/* Vertical line from parent */}
          <div className="absolute left-1/2 top-0 h-8 w-0.5 bg-border -translate-x-1/2 -translate-y-8" />
          
          <div className="flex gap-12 relative">
            {/* Horizontal connector line */}
            {node.children.length > 1 && (
              <div 
                className="absolute top-0 h-0.5 bg-border" 
                style={{
                  left: '50%',
                  right: '50%',
                  transform: `translateX(-${(node.children.length - 1) * 6}rem) scaleX(${node.children.length - 1})`,
                  transformOrigin: 'center',
                }}
              />
            )}
            
            {node.children.map((child, index) => (
              <div key={child.id} className="relative">
                {/* Vertical line to child */}
                <div className="absolute left-1/2 top-0 h-8 w-0.5 bg-border -translate-x-1/2" />
                {renderNode(child, level + 1)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EnhancedOrgChart() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrgChart();
  }, []);

  const loadOrgChart = async () => {
    const employees = await fetchOrgStructure();
    const orgTree = buildTree(employees);
    setTree(orgTree);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-pulse text-muted-foreground">Loading organization chart...</div>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">No organizational data found</p>
          <p className="text-sm text-muted-foreground mt-2">Add employees to see the organization structure</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto pb-12">
      <div className="inline-flex flex-col items-center gap-12 p-8 min-w-max">
        {tree.map(root => renderNode(root))}
      </div>
    </div>
  );
}