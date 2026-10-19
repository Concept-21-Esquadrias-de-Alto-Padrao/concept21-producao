"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/action-form";
import type { LogisticsRecipient } from "@/lib/types";

export function ExtraServiceRecipientField({
  recipients,
}: {
  recipients: LogisticsRecipient[];
}) {
  const [recipientId, setRecipientId] = useState("");
  const selectedRecipient =
    recipients.find((recipient) => recipient.id === recipientId) ?? null;

  return (
    <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
      <Field label="Nome do destinatário ou local">
        <select
          name="recipient_id"
          value={recipientId}
          onChange={(event) => setRecipientId(event.target.value)}
          className={inputClass}
          required
        >
          <option value="">Selecione</option>
          {recipients.map((recipient) => (
            <option key={recipient.id} value={recipient.id}>
              {recipient.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Endereço">
        <input
          className={inputClass}
          value={selectedRecipient?.address ?? ""}
          placeholder="Selecione um destinatário"
          readOnly
        />
      </Field>
    </div>
  );
}
