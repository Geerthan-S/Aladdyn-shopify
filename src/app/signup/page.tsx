import { AuthForm } from "@/components/auth/auth-form";
import { AuthLink, AuthShell } from "@/components/auth/auth-shell";
export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Your Aladdyn account controls who can access each store connection."
      footer={
        <>
          Already registered? <AuthLink href="/login">Log in</AuthLink>
        </>
      }
    >
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
