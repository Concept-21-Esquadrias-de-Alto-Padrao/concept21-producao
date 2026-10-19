import { formatProdIdentification } from "@/lib/production";
import type { Client, ProductionContract, ProductionProd } from "@/lib/types";

export function ProdIdentity({
  client,
  contract,
  prod,
  compact = false,
}: {
  client: Pick<Client, "name">;
  contract: Pick<ProductionContract, "contract_number">;
  prod: Pick<ProductionProd, "prod_number">;
  compact?: boolean;
}) {
  return (
    <span className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
      {formatProdIdentification(client, contract, prod)}
    </span>
  );
}
