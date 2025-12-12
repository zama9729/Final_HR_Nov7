import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingUp, Award, Building2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SkillNode {
  id: string;
  type: 'skill';
  name: string;
  size: number;
  count: number;
  avgLevel: number;
  totalEndorsements: number;
  employees: Array<{ id: string; name: string; email: string; level: number; department: string | null }>;
  departments: string[];
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

interface SkillLink {
  source: string | SkillNode;
  target: string | SkillNode;
  weight: number;
}

interface SkillsNetworkData {
  nodes: SkillNode[];
  links: SkillLink[];
  stats: {
    totalSkills: number;
    totalEmployees: number;
    totalConnections: number;
  };
}

interface SkillsNetworkGraphProps {
  data: SkillsNetworkData;
  width?: number;
  height?: number;
}

export function SkillsNetworkGraph({ data, width = 800, height = 600 }: SkillsNetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState({ width, height });
  const simulationRef = useRef<d3.Simulation<SkillNode, SkillLink> | null>(null);

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(600, rect.width - 32),
          height: Math.max(400, rect.height || 500),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeClick = useCallback((node: SkillNode) => {
    setSelectedNode(node);
    setIsDialogOpen(true);
  }, []);

  const handleZoomIn = useCallback(() => {
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const currentTransform = d3.zoomTransform(svg.node()!);
      svg.transition().call(
        d3.zoom().scaleBy as any,
        1.2
      );
      setZoom(currentTransform.k * 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const currentTransform = d3.zoomTransform(svg.node()!);
      svg.transition().call(
        d3.zoom().scaleBy as any,
        1 / 1.2
      );
      setZoom(currentTransform.k / 1.2);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      svg.transition().call(
        d3.zoom().transform as any,
        d3.zoomIdentity
      );
      setZoom(1);
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Update SVG dimensions
    svg.attr('width', dimensions.width).attr('height', dimensions.height);

    const container = svg.append('g');

    // Color scales - use a vibrant color scheme
    const skillColorScale = d3.scaleOrdinal([
      '#6366F1', '#A855F7', '#F472B6', '#FBBF24', '#34D399', 
      '#38BDF8', '#F97316', '#F43F5E', '#8B5CF6', '#EC4899'
    ]);

    // Create force simulation
    const simulation = d3
      .forceSimulation<SkillNode>(data.nodes)
      .force(
        'link',
        d3
          .forceLink<SkillNode, SkillLink>(data.links)
          .id((d) => d.id)
          .distance((d) => {
            const link = d as SkillLink;
            // Distance based on weight - stronger connections are closer
            return Math.max(80, 200 - (link.weight || 1) * 15);
          })
          .strength((d) => {
            const link = d as SkillLink;
            // Stronger connections have more strength
            return Math.min(0.8, 0.3 + (link.weight || 1) * 0.1);
          })
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', d3.forceCollide().radius((d) => (d.size || 15) + 5));

    simulationRef.current = simulation;

    // Create links
    const link = container
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', (d) => Math.min(0.6, 0.2 + (d.weight || 1) * 0.1))
      .attr('stroke-width', (d) => Math.max(1.5, Math.min(4, (d.weight || 1) * 0.8)));

    // Create nodes
    const node = container
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(data.nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, SkillNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        handleNodeClick(d);
      });

    // Add circles for nodes
    node
      .append('circle')
      .attr('r', (d) => d.size || 20)
      .attr('fill', (d) => skillColorScale(d.name))
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.15))')
      .style('cursor', 'pointer');

    // Add labels for all skills
    const labels = node
      .append('text')
      .text((d) => {
        const name = d.name.length > 15 ? d.name.substring(0, 13) + '...' : d.name;
        return name;
      })
      .attr('dx', (d) => (d.size || 20) + 6)
      .attr('dy', 4)
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', '#1e293b')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Tooltip on hover
    const tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

    node
      .on('mouseover', function (event, d) {
        tooltip.transition().duration(200).style('opacity', 0.95);
        tooltip
          .html(
            `<div class="p-3">
               <div class="font-semibold text-base mb-1">${d.name}</div>
               <div class="text-sm font-medium text-slate-700">${d.count || 0} ${d.count === 1 ? 'person' : 'people'}</div>
               <div class="text-xs text-slate-500 mt-1">Avg Level: ${(d.avgLevel || 0).toFixed(1)}</div>
               ${d.totalEndorsements ? `<div class="text-xs text-slate-500">${d.totalEndorsements} endorsements</div>` : ''}
             </div>`
          )
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY - 10 + 'px')
          .style('position', 'absolute')
          .style('background', 'white')
          .style('border', '1px solid #e2e8f0')
          .style('border-radius', '8px')
          .style('padding', '12px')
          .style('font-size', '12px')
          .style('box-shadow', '0 4px 12px rgba(0,0,0,0.15)')
          .style('z-index', '1000')
          .style('pointer-events', 'none')
          .style('min-width', '150px');
      })
      .on('mouseout', function () {
        tooltip.transition().duration(200).style('opacity', 0);
      });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SkillNode).x!)
        .attr('y1', (d) => (d.source as SkillNode).y!)
        .attr('x2', (d) => (d.target as SkillNode).x!)
        .attr('y2', (d) => (d.target as SkillNode).y!);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Add zoom behavior
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    // Cleanup
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [data, dimensions.width, dimensions.height, handleNodeClick]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: '500px' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full border rounded-lg bg-slate-50 dark:bg-slate-900" />
      
      {/* Controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Button size="sm" variant="outline" onClick={handleZoomIn} title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset} title="Reset View">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-3 border border-slate-200 dark:border-slate-700 shadow-lg">
        <div className="text-xs font-semibold mb-2 text-slate-700 dark:text-slate-300">Legend</div>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-indigo-500"></div>
            <span className="text-slate-600 dark:text-slate-400">Skills (size = popularity)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-slate-400"></div>
            <span className="text-slate-600 dark:text-slate-400">Connections (thickness = shared employees)</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            Hover for employee count • Click for details • Drag to move • Scroll to zoom
          </div>
        </div>
      </div>

      {/* Node Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-600" />
              {selectedNode?.name}
            </DialogTitle>
            <DialogDescription>
              Skill Details
            </DialogDescription>
          </DialogHeader>

          {selectedNode && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-slate-600 dark:text-slate-400">Total Employees</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {selectedNode.count || 0}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-slate-600 dark:text-slate-400">Avg Level</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {(selectedNode.avgLevel || 0).toFixed(1)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-slate-600 dark:text-slate-400">Endorsements</div>
                      <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {selectedNode.totalEndorsements || 0}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {selectedNode.departments && selectedNode.departments.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Departments
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedNode.departments.map((dept, idx) => (
                        <Badge key={idx} variant="secondary">
                          {dept}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedNode.employees && selectedNode.employees.length > 0 && (
                  <div>
                    <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Employees with this skill ({selectedNode.employees.length})
                    </div>
                    <div className="space-y-2">
                      {selectedNode.employees.map((emp) => (
                        <div
                          key={emp.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{emp.name}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-400">{emp.email}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {emp.department && (
                              <Badge variant="outline" className="text-xs">
                                {emp.department}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              Level {emp.level}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

