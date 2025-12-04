import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Loader2, Plus, Trash2 } from "lucide-react";
// Fix: Use relative path for the API client
import { PayrollLayout } from "@/components/layout/PayrollLayout";
import { api } from "../lib/api";
import { toast } from "sonner";

// Define the shape of the settings
type PayrollSettingsData = {
  pf_rate: string;
  esi_rate: string;
  pt_rate: string;
  tds_threshold: string;
  hra_percentage: string;
  special_allowance_percentage: string;
  basic_salary_percentage: string;
};

type TaxSlabForm = {
  from: string;
  to: string;
  rate: string;
};

type TaxRegimeForm = {
  standard_deduction: string;
  cess_percentage: string;
  slabs: TaxSlabForm[];
  surcharge_rules?: any[];
};

const getCurrentFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

const defaultSlabs: TaxSlabForm[] = [
  { from: "0", to: "300000", rate: "0" },
  { from: "300000", to: "600000", rate: "5" },
  { from: "600000", to: "900000", rate: "10" },
  { from: "900000", to: "1200000", rate: "15" },
  { from: "1200000", to: "1500000", rate: "20" },
  { from: "1500000", to: "", rate: "30" },
];

const buildDefaultRegime = (): TaxRegimeForm => ({
  standard_deduction: "75000",
  cess_percentage: "4",
  slabs: defaultSlabs.map((slab) => ({ ...slab })),
  surcharge_rules: [],
});

const financialYearOptions = () => {
  const currentStart = parseInt(getCurrentFinancialYear().split("-")[0], 10);
  return [currentStart - 1, currentStart, currentStart + 1].map((start) => `${start}-${start + 1}`);
};

const mapRegimeToState = (data: any): TaxRegimeForm => {
  const defaults = buildDefaultRegime();
  const standardDeduction =
    data && data.standard_deduction !== undefined
      ? Number(data.standard_deduction).toFixed(2)
      : defaults.standard_deduction;
  const cess =
    data && data.cess_percentage !== undefined
      ? Number(data.cess_percentage).toString()
      : defaults.cess_percentage;

  const slabsSource = Array.isArray(data?.slabs) ? data.slabs : defaults.slabs;

  const mappedSlabs = slabsSource.map((slab: any) => ({
    from: slab?.from !== undefined && slab?.from !== null ? String(slab.from) : "",
    to: slab?.to !== undefined && slab?.to !== null && slab.to !== "" ? String(slab.to) : "",
    rate: slab?.rate !== undefined && slab?.rate !== null ? String(slab.rate) : "0",
  }));

  return {
    standard_deduction: standardDeduction,
    cess_percentage: cess,
    slabs: mappedSlabs,
    surcharge_rules: Array.isArray(data?.surcharge_rules) ? data.surcharge_rules : defaults.surcharge_rules,
  };
};

const PayrollSettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [settings, setSettings] = useState<PayrollSettingsData>({
    pf_rate: "12.00",
    esi_rate: "3.25",
    pt_rate: "200.00",
    tds_threshold: "250000.00",
    hra_percentage: "35.00",
    special_allowance_percentage: "30.00",
    basic_salary_percentage: "35.00"
  });
  const [financialYear, setFinancialYear] = useState<string>(getCurrentFinancialYear());
  const [taxRegime, setTaxRegime] = useState<TaxRegimeForm>(buildDefaultRegime());
  const [savingRegimes, setSavingRegimes] = useState(false);

  // Helper function to format numbers from the DB
  const formatForInput = (data: any) => {
    const formatted: any = {};
    for (const key in settings) {
      const dataKey = key as keyof PayrollSettingsData;
      formatted[key] = data[dataKey] ? Number(data[dataKey]).toFixed(2) : settings[dataKey];
    }
    return formatted as PayrollSettingsData;
  };

  const fetchTaxRegimes = useCallback(async (fy: string) => {
    try {
      const result = await api.payrollSettings.getTaxRegimes(fy);
      const regime = result?.regime;
      setTaxRegime(mapRegimeToState(regime));
    } catch (error) {
      console.error("Error fetching tax regimes:", error);
      toast.error("Failed to load tax slab settings. Using defaults.");
      setTaxRegime(buildDefaultRegime());
    }
  }, []);


  useEffect(() => {
    const fetchData = async () => {
      try {
        const { settings: fetchedSettings } = await api.payrollSettings.get();
        if (fetchedSettings) {
          setSettings(formatForInput(fetchedSettings));
        } else {
          toast.info("No existing settings found. Using defaults.");
        }
      } catch (error: any) {
        console.error("Error fetching settings:", error);
        if (!error.message.includes("404")) {
          toast.error("Failed to load settings");
        }
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    fetchTaxRegimes(financialYear);
  }, [financialYear, fetchTaxRegimes]);

  const handleSave = async () => {
    // Validate percentage sum before submitting
    const total = (parseFloat(settings.basic_salary_percentage || '0') + 
                   parseFloat(settings.hra_percentage || '0') + 
                   parseFloat(settings.special_allowance_percentage || '0'));
    
    if (Math.abs(total - 100) > 0.01) {
      toast.error(`Salary component percentages must sum to 100%. Current sum: ${total.toFixed(2)}%`);
      return;
    }

    setLoading(true);
    try {
      // Convert string values back to numbers for the DB
      const payload: any = {};
      for (const key in settings) {
        payload[key] = parseFloat(settings[key as keyof PayrollSettingsData]);
      }
      
      await api.payrollSettings.save(payload);
      toast.success("Payroll settings saved successfully!");
      navigate("/payroll");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setSettings(prev => ({ ...prev, [id]: value }));
  };

  const handleRegimeFieldChange = (
    field: "standard_deduction" | "cess_percentage",
    value: string
  ) => {
    setTaxRegime((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSlabChange = (index: number, field: keyof TaxSlabForm, value: string) => {
    setTaxRegime((prev) => {
      const slabs = [...prev.slabs];
      slabs[index] = { ...slabs[index], [field]: value };
      return {
        ...prev,
        slabs,
      };
    });
  };

  const handleAddSlab = () => {
    setTaxRegime((prev) => {
      const slabs = [
        ...prev.slabs,
        {
          from: prev.slabs.length ? prev.slabs[prev.slabs.length - 1].to || "0" : "0",
          to: "",
          rate: "0",
        },
      ];
      return {
        ...prev,
        slabs,
      };
    });
  };

  const handleRemoveSlab = (index: number) => {
    setTaxRegime((prev) => {
      if (prev.slabs.length <= 1) {
        return prev;
      }
      const slabs = prev.slabs.filter((_, idx) => idx !== index);
      return {
        ...prev,
        slabs,
      };
    });
  };

  const handleSaveTaxRegimes = async () => {
    setSavingRegimes(true);
    try {
      const payload = {
        financial_year: financialYear,
        regime: {
          standard_deduction: parseFloat(taxRegime.standard_deduction || "0"),
          cess_percentage: parseFloat(taxRegime.cess_percentage || "0"),
          slabs: taxRegime.slabs
            .map((slab) => ({
              from: slab.from ? Number(slab.from) : 0,
              to: slab.to ? Number(slab.to) : null,
              rate: slab.rate ? Number(slab.rate) : 0,
            }))
            .sort((a, b) => a.from - b.from),
          surcharge_rules: Array.isArray(taxRegime.surcharge_rules)
            ? taxRegime.surcharge_rules
            : [],
        },
      };

      await api.payrollSettings.saveTaxRegimes(payload);
      toast.success("Tax slabs saved successfully!");
    } catch (error: any) {
      console.error("Error saving tax regimes:", error);
      toast.error(error?.message || "Failed to save tax slabs");
    } finally {
      setSavingRegimes(false);
    }
  };

  if (isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <PayrollLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate("/payroll")} className="mb-2 liquid-glass-nav-item">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Payroll
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Payroll Configuration</h1>
              <p className="text-muted-foreground">Configure payroll rules and statutory compliance</p>
            </div>
            <Button onClick={handleSave} disabled={loading} className="liquid-glass-nav-item">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Statutory Deductions */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Statutory Deductions</CardTitle>
              <CardDescription>Configure PF, ESI, PT, and TDS rates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pf_rate">PF Rate (%)</Label>
                <Input
                  id="pf_rate"
                  type="number"
                  step="0.01"
                  value={settings.pf_rate}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Standard PF rate is 12%</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="esi_rate">ESI Rate (%)</Label>
                <Input
                  id="esi_rate"
                  type="number"
                  step="0.01"
                  value={settings.esi_rate}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Standard ESI rate is 3.25%</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pt_rate">Professional Tax (₹)</Label>
                <Input
                  id="pt_rate"
                  type="number"
                  step="0.01"
                  value={settings.pt_rate}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Varies by state (e.g., ₹200.00/month in Karnataka)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tds_threshold">TDS Threshold (₹)</Label>
                <Input
                  id="tds_threshold"
                  type="number"
                  step="0.01"
                  value={settings.tds_threshold}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Annual income threshold for TDS applicability</p>
              </div>
            </CardContent>
          </Card>

          {/* Salary Structure Defaults */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Salary Structure Defaults</CardTitle>
              <CardDescription>Default percentages for salary components</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="basic_salary_percentage">Basic Salary (%)</Label>
                <Input
                  id="basic_salary_percentage"
                  type="number"
                  step="0.01"
                  value={settings.basic_salary_percentage}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Percentage of CTC for basic salary</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hra_percentage">HRA (%)</Label>
                <Input
                  id="hra_percentage"
                  type="number"
                  step="0.01"
                  value={settings.hra_percentage}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Percentage of CTC for House Rent Allowance</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="special_allowance_percentage">Special Allowance (%)</Label>
                <Input
                  id="special_allowance_percentage"
                  type="number"
                  step="0.01"
                  value={settings.special_allowance_percentage}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Percentage of CTC for special allowance</p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Quick Calculation Example:</p>
                <p className="text-xs text-muted-foreground">
                  For CTC of ₹5,00,000:
                  <br />• Basic: ₹{(500000 * parseFloat(settings.basic_salary_percentage || '0') / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  <br />• HRA: ₹{(500000 * parseFloat(settings.hra_percentage || '0') / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  <br />• Special: ₹{(500000 * parseFloat(settings.special_allowance_percentage || '0') / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
                {(() => {
                  const total = (parseFloat(settings.basic_salary_percentage || '0') + 
                                parseFloat(settings.hra_percentage || '0') + 
                                parseFloat(settings.special_allowance_percentage || '0'));
                  const isInvalid = Math.abs(total - 100) > 0.01;
                  return (
                    <div className={`mt-3 p-2 rounded text-xs ${isInvalid ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'}`}>
                      <p className="font-medium">Total: {total.toFixed(2)}%</p>
                      {isInvalid && (
                        <p className="mt-1">⚠️ Salary components must sum to exactly 100%</p>
                      )}
                      {!isInvalid && (
                        <p className="mt-1">✓ All components sum to 100%</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Tax Slabs Configuration */}
          <Card className="shadow-md md:col-span-2">
            <CardHeader>
              <div className="space-y-2">
                <CardTitle>Tax Slabs</CardTitle>
                <CardDescription>Configure the slabs and deductions used for monthly TDS calculations</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="w-full max-w-xs">
                <Label htmlFor="fy">Financial Year</Label>
                <Select value={financialYear} onValueChange={setFinancialYear}>
                  <SelectTrigger id="fy">
                    <SelectValue placeholder="Select FY" />
                  </SelectTrigger>
                  <SelectContent>
                    {financialYearOptions().map((fy) => (
                      <SelectItem key={fy} value={fy}>
                        {fy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Standard Deduction (₹)</Label>
                  <Input
                    value={taxRegime.standard_deduction}
                    onChange={(event) => handleRegimeFieldChange("standard_deduction", event.target.value)}
                    type="number"
                    step="0.01"
                  />
                </div>
                <div>
                  <Label>Cess (%)</Label>
                  <Input
                    value={taxRegime.cess_percentage}
                    onChange={(event) => handleRegimeFieldChange("cess_percentage", event.target.value)}
                    type="number"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Tax Slabs</Label>
                  <Button variant="outline" size="sm" onClick={handleAddSlab}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Slab
                  </Button>
                </div>
                <div className="space-y-3">
                  {taxRegime.slabs.map((slab, index) => (
                    <div
                      key={`slab-${index}`}
                      className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end"
                    >
                      <div>
                        <Label>From (₹)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={slab.from}
                          onChange={(event) => handleSlabChange(index, "from", event.target.value)}
                        />
                      </div>
                      <div>
                        <Label>To (₹)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Leave blank for no limit"
                          value={slab.to}
                          onChange={(event) => handleSlabChange(index, "to", event.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Rate (%)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={slab.rate}
                          onChange={(event) => handleSlabChange(index, "rate", event.target.value)}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveSlab(index)}
                        disabled={taxRegime.slabs.length <= 1}
                        className="h-10 w-10"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove slab</span>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveTaxRegimes} disabled={savingRegimes}>
                  {savingRegimes ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Tax Slabs
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Compliance Information */}
          <Card className="shadow-md md:col-span-2">
            <CardHeader>
              <CardTitle>Compliance Information</CardTitle>
              <CardDescription>Important guidelines for payroll compliance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-sm mb-2">PF Compliance</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Applicable for employees earning up to ₹15,000/month basic</li>
                    <li>• Employee contribution: 12% of basic</li>
                    <li>• Employer contribution: 12% of basic (3.67% to EPF, 8.33% to EPS)</li>
                    <li>• Due date: 15th of every month</li>
                  </ul>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <h4 className="font-semibold text-sm mb-2">ESI Compliance</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Applicable for employees earning up to ₹21,000/month</li>
                    <li>• Employee contribution: 0.75% of gross</li>
                    <li>• Employer contribution: 3.25% of gross</li>
                    <li>• Due date: 15th of every month</li>
                  </ul>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-semibold text-sm mb-2">TDS Compliance</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Deduct TDS based on employee's tax slab</li>
                    <li>• Consider employee declarations and investments</li>
                    <li>• Issue Form 16 by June 15th every year</li>
                    <li>• Due date: 7th of every month</li>
                  </ul>
                </div>

                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                  <h4 className="font-semibold text-sm mb-2">Professional Tax</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• State-specific tax (varies by state)</li>
                    <li>• Karnataka: ₹200/month (₹300 in February)</li>
                    <li>• Maharashtra: ₹200/month (₹300 in February)</li>
                    <li>• Due date: Varies by state</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PayrollLayout>
  );
};

export default PayrollSettings;

