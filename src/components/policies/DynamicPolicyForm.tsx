import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PolicyTemplate, PolicyField } from '@/constants/policyTemplates';

interface DynamicPolicyFormProps {
  template: PolicyTemplate | null;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  errors?: Record<string, string>;
}

export function DynamicPolicyForm({ template, values, onChange, errors }: DynamicPolicyFormProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>(values);

  useEffect(() => {
    // Initialize with defaults when template changes
    if (template) {
      const defaults: Record<string, any> = {};
      template.fields.forEach(field => {
        if (field.default !== undefined && !(field.key in values)) {
          defaults[field.key] = field.default;
        }
      });
      if (Object.keys(defaults).length > 0) {
        const newValues = { ...values, ...defaults };
        setFormValues(newValues);
        onChange(newValues);
      } else {
        setFormValues(values);
      }
    } else {
      setFormValues(values);
    }
  }, [template]);

  const handleFieldChange = (key: string, value: any) => {
    const newValues = { ...formValues, [key]: value };
    setFormValues(newValues);
    onChange(newValues);
  };

  const renderField = (field: PolicyField) => {
    const fieldValue = formValues[field.key] ?? field.default ?? '';
    const hasError = errors && errors[field.key];

    switch (field.type) {
      case 'number':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.key}
              type="number"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.key, e.target.value ? Number(e.target.value) : '')}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              className={hasError ? 'border-red-500' : ''}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        );

      case 'text':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.key}
              type="text"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className={hasError ? 'border-red-500' : ''}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id={field.key}
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={field.key === 'content' ? 15 : 4}
              className={hasError ? 'border-red-500' : ''}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        );

      case 'boolean':
        return (
          <div key={field.key} className="flex items-center justify-between space-x-2 p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor={field.key} className="text-base">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
            </div>
            <Switch
              id={field.key}
              checked={fieldValue === true || fieldValue === 'true'}
              onCheckedChange={(checked) => handleFieldChange(field.key, checked)}
            />
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        );

      case 'select':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Select
              value={fieldValue || field.default || ''}
              onValueChange={(value) => handleFieldChange(field.key, value)}
            >
              <SelectTrigger id={field.key} className={hasError ? 'border-red-500' : ''}>
                <SelectValue placeholder={field.placeholder || 'Select an option'} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.key}
              type="date"
              value={fieldValue}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              className={hasError ? 'border-red-500' : ''}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {hasError && (
              <p className="text-xs text-red-500">{hasError}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (!template) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Please select a policy template
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">{template.description}</p>
      </div>
      {template.fields.map((field) => renderField(field))}
    </div>
  );
}

