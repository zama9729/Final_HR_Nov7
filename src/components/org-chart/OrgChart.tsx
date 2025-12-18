import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "lucide-react";
import { api } from "@/lib/api";

interface Employee {
  id: string;
  employee_id: string;
  position: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
  reporting_manager_id: string | null;
}

interface TreeNode extends Employee {
  children: TreeNode[];
}

interface OrgChartProps {
  searchQuery?: string;
}

export default function OrgChart({ searchQuery = "" }: OrgChartProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    fetchOrgStructure();
  }, []);

  const fetchOrgStructure = async () => {
    try {
      const data = await api.getOrgStructure();
      if (data) {
        const validEmployees = (data as Employee[]).filter((emp) => emp.profiles);
        setEmployees(validEmployees);
      }
    } catch (error) {
      console.error('Error fetching org structure:', error);
    }
    setLoading(false);
  };

  const buildTree = (list: Employee[]): TreeNode[] => {
    const map: Record<string, TreeNode> = {};
    const roots: TreeNode[] = [];

    // Create all nodes
    list.forEach(emp => {
      map[emp.id] = { ...emp, children: [] };
    });

    // Build tree structure
    list.forEach(emp => {
      const node = map[emp.id];
      if (emp.reporting_manager_id && map[emp.reporting_manager_id]) {
        map[emp.reporting_manager_id].children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const filteredEmployees = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((emp) => {
      const fullName = `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.toLowerCase();
      const email = (emp.profiles?.email || "").toLowerCase();
      const dept = (emp.department || emp.home_assignment?.department_name || "").toLowerCase();
      const pos = (emp.position || "").toLowerCase();

      return (
        fullName.includes(term) ||
        email.includes(term) ||
        dept.includes(term) ||
        pos.includes(term)
      );
    });
  }, [employees, searchQuery]);

  useEffect(() => {
    if (employees.length === 0) return;
    const orgTree = buildTree(filteredEmployees);
    setTree(orgTree);
  }, [employees, filteredEmployees]);

  const renderNode = (node: TreeNode, level: number = 0) => {
    if (!node.profiles) {
      console.error('Node missing profile data:', node);
      return null;
    }
    
    const initials = `${node.profiles.first_name[0]}${node.profiles.last_name[0]}`;
    const hasChildren = node.children.length > 0;
    
    return (
      <div key={node.id} className="flex flex-col items-center">
        {/* Employee Card */}
        <Card className="w-72 mb-6 transition-all hover:shadow-lg border-2 hover:border-primary/50">
          <CardContent className="p-5">
            <div className="flex flex-col items-center text-center gap-3">
              <Avatar className="h-16 w-16 border-2 border-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-lg font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="font-bold text-base">
                  {node.profiles.first_name} {node.profiles.last_name}
                </p>
                <p className="text-sm text-primary font-medium">{node.position}</p>
                <p className="text-xs text-muted-foreground">{node.employee_id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Children Section */}
        {hasChildren && (
          <div className="flex flex-col items-center">
            {/* Vertical line down to children */}
            <div className="w-0.5 h-12 bg-gradient-to-b from-border to-transparent" />
            
            {/* Horizontal connector and children */}
            <div className="relative">
              {/* Horizontal line connecting all children */}
              {node.children.length > 1 && (
                <div 
                  className="absolute top-0 bg-border h-0.5" 
                  style={{
                    left: '50%',
                    right: '50%',
                    transform: 'translateX(-50%)',
                    width: `${(node.children.length - 1) * 320 + 144}px`
                  }}
                />
              )}
              
              {/* Children containers */}
              <div className="flex gap-8 pt-12">
                {node.children.map((child, index) => (
                  <div key={child.id} className="relative flex flex-col items-center">
                    {/* Vertical line up to horizontal connector */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-border" />
                    
                    {/* Recursively render child node */}
                    {renderNode(child, level + 1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-12">Loading organization chart...</div>;
  }

  if (tree.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No organizational structure found</p>
        <p className="text-sm mt-2">Add employees and assign reporting managers to see the org chart</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto py-8">
      <div className="flex flex-col items-center gap-8 min-w-max px-8">
        {tree.map(node => renderNode(node))}
      </div>
    </div>
  );
}
