// Creates a staff invite from the command line. Use this for the first owner:
//   npm run admin:invite -- --email you@honeydoo.com --name "Your Name" --role owner
import { inviteStaff } from '../src/server/staff';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg('email'), name = arg('name'), role = (arg('role') ?? 'analyst') as 'owner' | 'analyst';
if (!email || !name) { console.error('Usage: npm run admin:invite -- --email you@example.com --name "Your Name" [--role owner|analyst]'); process.exit(1); }
inviteStaff({ email, name, role }, null).then((r) => {
  console.log(`\nInvite created for ${email} (${role}). Open this link within 72 hours to set a password and authenticator:\n\n  ${r.setupUrl}\n\nThe link works once. It is not stored anywhere, so copy it now.\n`);
  process.exit(0);
}).catch((e) => { console.error(e.message); process.exit(1); });
