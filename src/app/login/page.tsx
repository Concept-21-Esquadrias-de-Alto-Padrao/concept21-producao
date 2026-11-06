import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; auth_error?: string }>;
}) {
  const params = await searchParams;
  const notice =
    params.confirmed === "1"
      ? "E-mail confirmado. Entre com suas credenciais; se ainda não houver perfil de acesso, o sistema ficará restrito até a liberação pelo Administrador."
      : params.auth_error
        ? "Não foi possível concluir a confirmação. Solicite um novo link ou tente novamente."
        : undefined;

  return <AuthForm
    mode="login"
    notice={notice}
    centralLoginEnabled={process.env.CENTRAL_LOGIN_PILOT_ENABLED === "true"}
  />;
}
