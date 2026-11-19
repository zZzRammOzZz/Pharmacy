# PharmacyOS

Multi-tenant pharmacy platform. You run one API and an owner console. Each pharmacy is a tenant. You issue a signed license, usually for 12 months, and that pharmacy signs in with the file.

The Windows installer comes later. The counter app and `@pharmacyos/license-sdk` are what that installer will ship. The license file is already something you can hand to a client.

## Layout

- `apps/api` — NestJS API. Tenants, licenses, stock, sales, patients, prescriptions.
- `apps/admin` — Next.js console for you, the platform owner. http://localhost:3000
- `apps/counter` — Next.js counter a pharmacy uses with its license. http://localhost:3001
- `packages/license-sdk` — verifies a license offline (signature and expiry). The API also checks revocation.

Data is SQLite for local use (`apps/api/prisma/dev.db`). Production can move the same Prisma schema to Postgres.

## Run

Node.js 22 or newer.

```bash
npm install
npm run setup
npm run dev
```

`setup` builds the SDK, creates the database, and seeds a demo pharmacy.

| Who | Where | Sign in |
| --- | --- | --- |
| You | http://localhost:3000 | `admin@pharmacyos.local` / `ChangeMe123!` |
| Demo pharmacy | http://localhost:3001 | code `green-cross`, `pharmacist@green-cross.local` / `Pharmacy123!`, license file `apps/api/data/green-cross.lic` |

These passwords are for the local demo only. Change `JWT_SECRET` in `apps/api/.env` before any real deployment.

## How a client gets a year

1. In the owner console, create a pharmacy. That creates the tenant and its owner.
2. Issue a license. Term defaults to 12 months. Standard includes stock, sales, and patients. Professional adds prescriptions and suppliers.
3. Download the `.lic` file.
4. The pharmacy opens the counter, chooses that file, and signs in.

The file is signed with an Ed25519 key kept in `apps/api/data/keys`. Do not delete that folder after licenses have been issued. The counter sends the license on every request. A revoked, expired, or suspended tenant is refused. Seat count blocks extra staff logins once the license is full.

## SDK

The client package checks a license without calling the API. Revocation still requires the API.

```ts
import { verifyLicense } from "@pharmacyos/license-sdk";

const file = JSON.parse(licenseJson);
const result = verifyLicense(file, publicKeyPem);
```

The vendor public key is `GET /api/license/public-key`.
