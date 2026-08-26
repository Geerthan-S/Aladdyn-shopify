import { AuthForm } from "@/components/auth/auth-form";
import { AuthLink, AuthShell } from "@/components/auth/auth-shell";
export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      description="Log in to manage your Shopify connection."
      footer={
        <>
          New to Aladdyn? <AuthLink href="/signup">Create an account</AuthLink>
        </>
      }
    >
      <AuthForm mode="login" />
      <div className="mt-4 text-right text-sm">
        <AuthLink href="/forgot-password">Forgot password?</AuthLink>
      </div>
    </AuthShell>
  );
}
