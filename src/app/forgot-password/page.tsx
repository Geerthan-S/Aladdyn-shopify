import { AuthForm } from "@/components/auth/auth-form";
import { AuthLink, AuthShell } from "@/components/auth/auth-shell";
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="We’ll email a secure recovery link if the account exists."
      footer={<AuthLink href="/login">Back to log in</AuthLink>}
    >
      <AuthForm mode="forgot" />
    </AuthShell>
  );
}
