## Running Final Migrations from PowerShell

These steps assume:

- You have `psql` (PostgreSQL client) installed and available in your `PATH`.
- Your HR app and Payroll DB connection strings are available as environment variables.

---

### 1. Set connection strings (once per PowerShell session)

```powershell
$env:POSTGRES_URL = "postgres://user:password@host:5432/hr_db_name"
$env:PAYROLL_POSTGRES_URL = "postgres://user:password@host:5432/payroll_db_name"
```

Replace `user`, `password`, `host`, and database names with your actual values.

---

### 2. Run the **HR app** final bootstrap migration

From the project root (`Final_HR_Nov7`):

```powershell
psql $env:POSTGRES_URL -f "server/db/migrations/20260102_final_bootstrap.sql"
```

You should see `CREATE TABLE`, `ALTER TABLE`, or `DO` messages; re-running is safe (migration is idempotent).

---

### 3. Run the **Payroll app** final bootstrap migration

From the same project root (`Final_HR_Nov7`):

```powershell
psql $env:PAYROLL_POSTGRES_URL -f "payroll-app/server/migrations/20260102_final_bootstrap.sql"
```

Again, it is safe to run multiple times.

---

### 4. Restart Kubernetes deployments (optional but recommended)

After applying migrations, restart the API pods so they see the updated schema:

```powershell
kubectl rollout restart deployment/api -n hr-suite
kubectl rollout restart deployment/frontend -n hr-suite
kubectl rollout restart deployment/payroll-api -n hr-suite
kubectl rollout restart deployment/payroll-frontend -n hr-suite
```

Then check pod status:

```powershell
kubectl get pods -n hr-suite
```


