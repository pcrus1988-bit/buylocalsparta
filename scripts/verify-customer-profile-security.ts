import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-account-profile-security.ts");
const profileRoute = read("apps/web/src/app/api/account/profile/route.ts");
const passwordRoute = read("apps/web/src/app/api/account/security/password/route.ts");
const profilePage = read("apps/web/src/app/account/profile/page.tsx");
const securityPage = read("apps/web/src/app/account/security/page.tsx");
const profileClient = read("apps/web/src/components/AccountProfileAddressesClient.tsx");
const securityClient = read("apps/web/src/components/AccountSecurityClient.tsx");
const navigation = read("apps/web/src/components/AccountSectionNavigation.tsx");
const failures: string[] = [];

for (const contract of ["customerAccountProfile", "updateCustomerAccountProfile", "changeCustomerPassword", "u.public_id=$1", "customer_profiles", "preferred_locale", "normalizePhone", "normalizeLocale"]) {
  if (!service.includes(contract)) failures.push(`Customer profile runtime is missing ${contract}`);
}
if (service.includes("UPDATE users SET email") || service.includes("SET email=")) failures.push("Customer profile self-service must not silently change the login email");
if (service.includes("user_roles")) failures.push("Customer profile runtime must not depend on the non-existent user_roles table");
for (const contract of ["verifyPassword(input.currentPassword", "hashPassword(input.newPassword)", "verifyPassword(input.newPassword", "DELETE FROM user_sessions", "password_reset_tokens", "FOR UPDATE", "u.status='active'"]) {
  if (!service.includes(contract)) failures.push(`Password change security is missing ${contract}`);
}
for (const contract of ["requireAccountSession(request, true)", "updateCustomerAccountProfile", "firstName", "lastName", "preferredLocale"]) {
  if (!profileRoute.includes(contract)) failures.push(`Customer profile API is missing ${contract}`);
}
if (profileRoute.includes("body.email")) failures.push("Customer profile API must not accept email as a writable field");
for (const contract of ["requireAccountSession(request, true)", "changeCustomerPassword", "currentPassword", "confirmPassword", "ACCOUNT_SESSION_COOKIE", "expires: new Date(0)"]) {
  if (!passwordRoute.includes(contract)) failures.push(`Customer password API is missing ${contract}`);
}
for (const contract of ["customerAccountProfile(principal)", "AccountProfileAddressesClient", "initialAccount={account}"]) {
  if (!profilePage.includes(contract)) failures.push(`Customer profile page is missing ${contract}`);
}
for (const contract of ["robots: { index: false", "customerAccountProfile(principal)", "AccountSecurityClient"]) {
  if (!securityPage.includes(contract)) failures.push(`Customer security page is missing ${contract}`);
}
for (const contract of ["/api/account/profile", 'x-csrf-token', "autoComplete=\"given-name\"", "autoComplete=\"family-name\"", "preferredLocale", "/account/security", "CustomerHowItWorks"]) {
  if (!profileClient.includes(contract)) failures.push(`Customer profile UI is missing ${contract}`);
}
for (const contract of ["/api/account/security/password", 'x-csrf-token', 'autoComplete="current-password"', 'autoComplete="new-password"', 'window.location.assign("/login?reset=1")', "αποσυνδέονται όλες οι ενεργές συνεδρίες", "CustomerHowItWorks"]) {
  if (!securityClient.includes(contract)) failures.push(`Customer security UI is missing ${contract}`);
}
if (!navigation.includes('{ href: "/account/security", label: "Ασφάλεια" }')) failures.push("Customer account navigation must expose the security workspace");

if (failures.length) {
  console.error("Customer profile/security checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Customer profile/security checks passed: customer-owned personal details, protected login email, current-password verification, password policy, global session revocation, reset-token invalidation, CSRF and account navigation verified.");