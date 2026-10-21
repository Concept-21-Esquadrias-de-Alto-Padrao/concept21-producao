"use client";

import { RotateCcw } from "lucide-react";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-5 text-red-900">
      <h1 className="text-lg font-semibold">Não foi possível carregar esta tela</h1>
      <p className="mt-2 text-sm">Tente novamente. Se o problema persistir, peça ao administrador para verificar a conexão e a atualização do banco.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white"
      >
        <RotateCcw className="size-4" />
        Tentar novamente
      </button>
    </div>
  );
}
