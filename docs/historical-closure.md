# Declarações de conclusão histórica

O ciclo de vida novo exige fabricação, carga e saída física comprovadas para concluir uma PROD. Registros anteriores a esse fluxo podem ser declarados concluídos por um responsável após uma conferência nominal da carteira. A declaração tem campos próprios: data de registro, data da revisão, nome do declarante e texto. **Nenhum desses campos representa a data real de entrega**, que pode ser desconhecida.

Uma declaração histórica aparece em **Concluídos (histórico)** e sai das filas operacionais. A fabricação, expedição, romaneios e conclusão oficial continuam com seus valores originais. Relatórios de conclusão operacional não contam declarações históricas como saídas comprovadas. Os eventos de histórico registram a declaração sem alterar os apontamentos anteriores.

Nova PROD num contrato historicamente concluído reabre o contrato e preserva as PRODs antigas. Um administrador pode reabrir uma PROD historicamente concluída, registrando o motivo. Enquanto fechada, as ações operacionais e o arquivamento dessa PROD ficam bloqueados no banco e na interface. Um contrato antigo sem PROD pode receber sua primeira PROD normalmente e reabre na mesma operação.

## Implantação de um lote conferido

1. Confirmar backup recuperável e preservar o recorte de dados da carteira; conferir os IDs e a declaração nominal em arquivo privado. Evitar escritas concorrentes durante a aplicação.
2. Aplicar `supabase/migrations/20261027150000_historical_production_closure.sql` antes do aplicativo atualizado.
3. Publicar o aplicativo; executar o lote nominal privado numa única transação com verificações de UUID, escopo e exceções. Qualquer divergência deve provocar rollback.
4. Conferir contagens por aba, histórico, ausência de saídas físicas artificiais e a carteira que continua aberta. Testar a reabertura com dados fictícios num ambiente isolado, sem gerar uma PROD fictícia em produção.

O ensaio `npm run test:lifecycle-db` usa PostgreSQL efêmero com dados fictícios e cobre declaração, bloqueio de edição, reabertura de contrato com e sem PROD e reabertura de PROD antiga. Ele não substitui um teste de interface com sessão real nem uma restauração de backup.

## Correção e reversão

Antes do lote, o schema aditivo não declara nenhum registro. Se o lote falhar, a transação inteira volta. Após o lote, os eventos permanecem imutáveis; reabra um registro pelo aplicativo com motivo, se uma declaração individual estiver errada. Para erro sistêmico, preserve o histórico e reconcilie alterações posteriores antes de qualquer restauração.
