import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value ?? 0);
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const displayTextReplacements = [
  ["Producao", "Produção"],
  ["producao", "produção"],
  ["Relatorios", "Relatórios"],
  ["relatorios", "relatórios"],
  ["Configuracoes", "Configurações"],
  ["configuracoes", "configurações"],
  ["Configuracao", "Configuração"],
  ["configuracao", "configuração"],
  ["Solicitacoes", "Solicitações"],
  ["solicitacoes", "solicitações"],
  ["Solicitacao", "Solicitação"],
  ["solicitacao", "solicitação"],
  ["Observacoes", "Observações"],
  ["observacoes", "observações"],
  ["Descricao", "Descrição"],
  ["descricao", "descrição"],
  ["Previsao", "Previsão"],
  ["previsao", "previsão"],
  ["Confirmacao", "Confirmação"],
  ["confirmacao", "confirmação"],
  ["Separacao", "Separação"],
  ["separacao", "separação"],
  ["Preparacao", "Preparação"],
  ["preparacao", "preparação"],
  ["Expedicao", "Expedição"],
  ["expedicao", "expedição"],
  ["Nao", "Não"],
  ["nao", "não"],
  ["Usuarios", "Usuários"],
  ["usuarios", "usuários"],
  ["Usuario", "Usuário"],
  ["usuario", "usuário"],
  ["Permissoes", "Permissões"],
  ["permissoes", "permissões"],
  ["Permissao", "Permissão"],
  ["permissao", "permissão"],
  ["Seguranca", "Segurança"],
  ["seguranca", "segurança"],
  ["Acoes", "Ações"],
  ["acoes", "ações"],
  ["Acao", "Ação"],
  ["acao", "ação"],
  ["Recem", "Recém"],
  ["recem", "recém"],
  ["Liberacao", "Liberação"],
  ["liberacao", "liberação"],
  ["Possivel", "Possível"],
  ["possivel", "possível"],
  ["Indisponivel", "Indisponível"],
  ["indisponivel", "indisponível"],
  ["Disponivel", "Disponível"],
  ["disponivel", "disponível"],
  ["Organizacao", "Organização"],
  ["organizacao", "organização"],
  ["Gerencia", "Gerência"],
  ["gerencia", "gerência"],
  ["Modulo", "Módulo"],
  ["modulo", "módulo"],
  ["Codigo", "Código"],
  ["codigo", "código"],
  ["Saida", "Saída"],
  ["saida", "saída"],
  ["Localizacao", "Localização"],
  ["localizacao", "localização"],
  ["Localizacoes", "Localizações"],
  ["localizacoes", "localizações"],
  ["Servico", "Serviço"],
  ["servico", "serviço"],
  ["servicos", "serviços"],
  ["Destinatario", "Destinatário"],
  ["destinatario", "destinatário"],
  ["Endereco", "Endereço"],
  ["endereco", "endereço"],
  ["Veiculo", "Veículo"],
  ["veiculo", "veículo"],
  ["Caminhao", "Caminhão"],
  ["Sao Paulo", "São Paulo"],
  ["Joao", "João"],
  ["Patricia", "Patrícia"],
  ["Residencia", "Residência"],
  ["Revisao", "Revisão"],
  ["Pivo", "Pivô"],
  ["pivo", "pivô"],
  ["Pecas", "Peças"],
  ["pecas", "peças"],
  ["tecnicos", "técnicos"],
  ["acessorios", "acessórios"],
  ["Acessorios", "Acessórios"],
  ["conferencia", "conferência"],
  ["fisica", "física"],
  ["area", "área"],
  ["terreo", "térreo"],
  ["selecionavel", "selecionável"],
  ["Master", "Administrador"],
] as const;

export function accentDisplayText<T extends string | null | undefined>(value: T): T {
  if (!value) return value;
  let text = value as string;
  for (const [from, to] of displayTextReplacements) {
    text = text.replaceAll(from, to);
  }
  return text as T;
}
