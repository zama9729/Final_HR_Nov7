Assumptions

- HR is the identity provider; Payroll does not expose signup/signin.
- Both apps use Express + Postgres. HR already has organizations; we add `subdomain`.
- JWT between HR→Payroll uses RS256 with env-provided keys.
- Multi-tenancy in Payroll is by `org_id`; routing uses subdomain `<sub>.payroll.app`.
- PIN is 6 digits, stored hashed (bcrypt). Argon2 can be dropped in later.


