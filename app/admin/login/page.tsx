import LoginForm from './LoginForm';
import {
  isForwardAuthEnabled,
  getForwardAuthProviderName,
  getForwardAuthPortalUrl,
} from '@/lib/auth/forward-auth';

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <LoginForm
      forwardAuthEnabled={isForwardAuthEnabled()}
      forwardAuthProviderName={getForwardAuthProviderName()}
      forwardAuthPortalUrl={getForwardAuthPortalUrl()}
    />
  );
}
