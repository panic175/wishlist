import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <LoginForm
      autheliaEnabled={process.env.AUTHELIA_ENABLED === 'true'}
      autheliaPortalUrl={process.env.AUTHELIA_PORTAL_URL}
    />
  );
}