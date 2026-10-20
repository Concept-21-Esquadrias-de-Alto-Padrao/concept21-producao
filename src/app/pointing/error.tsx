"use client";

export default function PointingError({ reset }: { reset: () => void }) {
  return <div role="alert" className="rounded border border-border bg-white p-6">
    <h2 className="font-semibold">Não foi possível carregar a fila de apontamento</h2>
    <p className="mt-2 text-sm">Ocorreu uma falha ao consultar os dados. Isso não significa que a fila esteja vazia.</p>
    <button type="button" onClick={reset} className="mt-4 rounded bg-charcoal px-4 py-2 text-white">Tentar novamente</button>
  </div>;
}
