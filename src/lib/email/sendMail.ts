import 'server-only';
import nodemailer from 'nodemailer';

type Mail = { to: string; subject: string; html: string; text: string };

// Prod uses the configured SMTP (OVH); dev falls back to the local Supabase
// Inbucket SMTP server so mails show up in `npm run sb:mail`. Selection is by
// presence of the prod host env var.
function buildTransport() {
	const host = process.env.SMTP_HOST;
	if (host) {
		return nodemailer.createTransport({
			host,
			port: Number(process.env.SMTP_PORT ?? 587),
			secure: Number(process.env.SMTP_PORT ?? 587) === 465,
			auth:
				process.env.SMTP_USER && process.env.SMTP_PASS
					? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
					: undefined,
		});
	}
	// Local Inbucket: no auth, plain SMTP. Port confirmed in Step 2 (54325).
	return nodemailer.createTransport({
		host: '127.0.0.1',
		port: Number(process.env.INBUCKET_SMTP_PORT ?? 54325),
		secure: false,
	});
}

export async function sendMail({ to, subject, html, text }: Mail): Promise<void> {
	const from = process.env.SMTP_FROM ?? 'Wizcard <noreply@wizcard.xyz>';
	await buildTransport().sendMail({ from, to, subject, html, text });
}
