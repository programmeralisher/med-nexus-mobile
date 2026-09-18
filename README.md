# Credit Ledger App (Production / SaaS branch)

A credit-ledger (khatta) app that runs on both laptop and mobile. This
`production` branch turns the original single-shop app into a multi-tenant
product: each shop signs up with its own phone number + password and
chooses its own shop name at signup (shown throughout the app and on PDF
exports) instead of a hardcoded shop identity.

This branch requires its own, separate Firebase project (new API keys via
`.env` — see `.env.example`). Do not point it at the original single-shop
Firebase project.

**Status of this patch:** sign up / sign in / forgot-password (contact
developer) screens and removal of all hardcoded shop branding are done.
Still to come in follow-up patches: the full multi-tenant Firestore data
model + security rules rewrite, multi-device linking between two accounts
of the same shop, the admin panel (list of shops/devices, block/unblock),
and self-service password reset via the security question.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://med-nexus-mobile.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8f43a33e-10dc-4a89-ac20-b9b125ac5345).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
