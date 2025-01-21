# Door Entry Management System

Web app for managing authorised users and RFID for the door entry system.

## Development

Run both `backend` and `frontend` with:

    deno i
    deno task dev

Apply a schema change to Postgres:

    deno task --filter backend push

Installing a new package:

    deno add --filter frontend PACKAGE_NAME_HERE

OR:

    deno add --filter backend PACKAGE_NAME_HERE

## Deployment

Test deployment with:

    nix shell

This will automatically build the flake (i.e. `nix build`) and enter a shell where the binaries are available.

The binaries `door-entry-management-system-backend` and `door-entry-management-system-frontend` are now in the $PATH. Run the binaries prefixed with the needed environment variables:

    DE_BACKEND_PORT=3010 DE_DATABASE_URL=... DE_SECRET_KEY=... door-entry-management-system-backend
    DE_FRONTEND_PORT=3011 door-entry-management-system-frontend
