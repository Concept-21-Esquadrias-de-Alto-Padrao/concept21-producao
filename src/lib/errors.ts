const defaultFallback =
  "Não foi possível concluir a operação. Tente novamente e, se o problema continuar, avise o responsável pelo sistema.";

function normalizeMessage(value: unknown) {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }

  return "";
}

function isLikelyTechnicalMessage(lowerMessage: string) {
  const technicalMarkers = [
    "cannot read properties",
    "is not a function",
    "is not defined",
    "undefined",
    "null",
    "syntax error",
    "database error",
    "server error",
    "internal server error",
    "column ",
    "relation ",
    "function ",
    "schema ",
    "rpc",
    "sql",
    "rest/v1",
    "auth/v1",
    "supabase",
    "postgrest",
    "pgrst",
    "constraint",
    "violates",
  ];

  return technicalMarkers.some((marker) => lowerMessage.includes(marker));
}

export function toUserFriendlyErrorMessage(error: unknown, fallback = defaultFallback) {
  const message = normalizeMessage(error).trim();
  const lowerMessage = message.toLowerCase();

  if (!message) {
    return fallback;
  }

  if (
    lowerMessage.includes("request_access_review") ||
    (lowerMessage.includes("could not find the function") && lowerMessage.includes("schema cache"))
  ) {
    return (
      "Seu cadastro foi confirmado, mas ainda precisa de liberação de acesso. " +
      "Peça a um usuário Administrador para vincular um perfil ao seu cadastro."
    );
  }

  if (lowerMessage.includes("company_id is required")) {
    return "Não foi possível identificar a empresa do usuário logado. Entre novamente ou confirme se seu usuário está ativo.";
  }

  if (lowerMessage.includes("schema cache")) {
    return (
      "O sistema está concluindo uma atualização interna. Tente novamente em instantes. " +
      "Se continuar, avise o administrador para verificar as atualizações do banco."
    );
  }

  if (
    lowerMessage.includes("row-level security") ||
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("not authorized") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("sem permissao") ||
    lowerMessage.includes("sem permissão")
  ) {
    return "Você não tem permissão para realizar esta ação. Solicite liberação a um usuário Administrador.";
  }

  if (
    lowerMessage.includes("auth session missing") ||
    lowerMessage.includes("jwt expired") ||
    lowerMessage.includes("invalid jwt")
  ) {
    return "Sua sessão expirou. Saia da plataforma e entre novamente.";
  }

  if (lowerMessage.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos. Confira os dados e tente novamente.";
  }

  if (lowerMessage.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de acessar a plataforma.";
  }

  if (
    lowerMessage.includes("user already registered") ||
    lowerMessage.includes("already registered") ||
    lowerMessage.includes("already exists") ||
    lowerMessage.includes("duplicate key")
  ) {
    return "Já existe um cadastro com essas informações. Confira os dados ou solicite ajuda ao responsável.";
  }

  if (lowerMessage.includes("violates foreign key constraint")) {
    return "Este registro está vinculado a outros dados e não pode ser removido agora.";
  }

  if (lowerMessage.includes("invalid input syntax")) {
    return "Alguma informação está em formato inválido. Recarregue a página e tente novamente.";
  }

  if (lowerMessage.includes("failed to fetch") || lowerMessage.includes("networkerror")) {
    return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
  }

  if (lowerMessage.includes("storage") && lowerMessage.includes("not found")) {
    return "Não foi possível localizar o arquivo solicitado. Ele pode ter sido removido ou não estar mais disponível.";
  }

  if (isLikelyTechnicalMessage(lowerMessage)) {
    return fallback;
  }

  return message;
}
