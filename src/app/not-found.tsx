import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-md border border-border bg-card p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-charcoal">Registro não encontrado</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O item solicitado não existe ou você não possui permissão para acessá-lo.
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
      >
        Voltar ao dashboard
      </Link>
    </div>
  );
}
