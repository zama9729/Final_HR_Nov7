/**
 * Simplified Rule Editor Component
 * Easy-to-use interface for configuring scheduling rules
 */

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface Rule {
  id: string;
  name: string;
  type: 'hard' | 'soft';
  weight?: number;
  params?: Record<string, any>;
}

interface RuleEditorProps {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
}

// Simplified rule definitions with clear defaults
interface RuleConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  value?: number;
  type: 'hard' | 'soft';
}

const DEFAULT_RULES: RuleConfig[] = [
  {
    id: 'max_consecutive_nights',
    name: 'Max Consecutive Night Shifts',
    description: 'Maximum consecutive night shifts allowed',
    enabled: true,
    value: 2,
    type: 'hard'
  },
  {
    id: 'max_night_shifts_per_week',
    name: 'Max Night Shifts Per Week',
    description: 'Limit how many night shifts each employee can work per week',
    enabled: false,
    value: 2,
    type: 'hard'
  },
  {
    id: 'min_rest_hours_between_shifts',
    name: 'Minimum Rest Hours',
    description: 'Hours of rest required between shifts',
    enabled: true,
    value: 12,
    type: 'hard'
  },
  {
    id: 'max_consecutive_work_days',
    name: 'Max Consecutive Work Days',
    description: 'Maximum days an employee can work in a row',
    enabled: true,
    value: 6,
    type: 'hard'
  },
  {
    id: 'no_blackout_assignments',
    name: 'Respect Unavailable Times',
    description: 'Never schedule during employee blackout periods',
    enabled: true,
    type: 'hard'
  },
  {
    id: 'pinned_shifts_required',
    name: 'Assign Required Shifts',
    description: 'Always assign shifts employees have marked as required',
    enabled: true,
    type: 'hard'
  },
  {
    id: 'employee_shift_preferences',
    name: 'Match Employee Preferences',
    description: 'Try to honor employee shift preferences',
    enabled: true,
    type: 'soft'
  },
  {
    id: 'balance_total_hours',
    name: 'Balance Hours',
    description: 'Distribute work hours evenly among employees',
    enabled: true,
    type: 'soft'
  },
  {
    id: 'avoid_split_weekends',
    name: 'Avoid Split Weekends',
    description: 'Prefer full weekends off',
    enabled: false,
    type: 'soft'
  }
];

export function RuleEditor({ rules, onChange }: RuleEditorProps) {
  // Convert existing rules to simplified config format
  const [ruleConfigs, setRuleConfigs] = useState<RuleConfig[]>(() => {
    const configs = DEFAULT_RULES.map(defaultRule => {
      const existingRule = rules.find(r => 
        r.id.startsWith(defaultRule.id) || 
        r.name === defaultRule.name
      );
      
      if (existingRule) {
        return {
          ...defaultRule,
          enabled: true,
          value: existingRule.params?.max_shifts || 
                 existingRule.params?.min_hours || 
                 existingRule.params?.max_days || 
                 defaultRule.value
        };
      }
      return defaultRule;
    });
    return configs;
  });

  // Sync changes back to rules format
  useEffect(() => {
    const newRules: Rule[] = ruleConfigs
      .filter(config => config.enabled)
      .map(config => {
        const rule: Rule = {
          id: config.id, // Use the rule ID (e.g., 'max_night_shifts_per_week')
          name: config.id, // Use ID as name for rule engine lookup (display name is separate)
          type: config.type,
          weight: config.type === 'soft' ? 1 : undefined,
          params: {}
        };

        // Add value-based params
        if (config.value !== undefined) {
          if (config.id === 'max_consecutive_nights') {
            rule.params = { max_nights: config.value };
          } else if (config.id === 'max_night_shifts_per_week') {
            rule.params = { max_shifts: config.value };
          } else if (config.id === 'min_rest_hours_between_shifts') {
            rule.params = { min_hours: config.value };
          } else if (config.id === 'max_consecutive_work_days') {
            rule.params = { max_days: config.value };
          }
        }

        return rule;
      });

    // Only call onChange if rules actually changed
    const rulesChanged = JSON.stringify(newRules) !== JSON.stringify(rules);
    if (rulesChanged) {
      onChange(newRules);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleConfigs]);

  const updateRuleConfig = (ruleId: string, updates: Partial<RuleConfig>) => {
    setRuleConfigs(prev => prev.map(config => 
      config.id === ruleId ? { ...config, ...updates } : config
    ));
  };

  const allRules = ruleConfigs;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        Turn rules on or off. Rules with values can be adjusted.
      </div>

      <div className="space-y-3">
        {allRules.map((config, index) => (
          <div key={config.id}>
            <div className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => updateRuleConfig(config.id, { enabled: checked })}
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Label className="font-medium text-sm cursor-pointer" htmlFor={`rule-${config.id}`}>
                    {config.name}
                  </Label>
                  {config.type === 'hard' && (
                    <span className="text-xs text-red-600 font-medium">Required</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{config.description}</p>
                
                {config.value !== undefined && config.enabled && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      id={`rule-${config.id}`}
                      type="number"
                      value={config.value}
                      onChange={(e) => updateRuleConfig(config.id, { 
                        value: parseInt(e.target.value) || config.value 
                      })}
                      className="w-20 h-8 text-sm"
                      min={config.id === 'max_night_shifts_per_week' ? 0 : 1}
                      max={config.id === 'max_night_shifts_per_week' ? 7 : 
                           config.id === 'min_rest_hours_between_shifts' ? 24 : 14}
                    />
                    <span className="text-xs text-muted-foreground">
                      {config.id === 'max_consecutive_nights' && 'consecutive'}
                      {config.id === 'max_night_shifts_per_week' && 'per week'}
                      {config.id === 'min_rest_hours_between_shifts' && 'hours'}
                      {config.id === 'max_consecutive_work_days' && 'days'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {index < allRules.length - 1 && <Separator className="my-2" />}
          </div>
        ))}
      </div>
    </div>
  );
}

