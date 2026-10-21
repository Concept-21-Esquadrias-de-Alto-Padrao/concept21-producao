-- REVERSAO DIRECIONADA: executar somente se a reversao for autorizada.
-- Projeto validado: loqmvdiegizwmpzjthhm (Producao).
-- Captura: 2026-10-21 10:29:59.5581+00. Nao e um backup integral do banco.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop policy if exists transport_module_isolated on public.freights;
drop policy if exists transport_module_isolated on public.freight_demands;
drop policy if exists transport_module_isolated on public.freight_stops;
drop policy if exists transport_module_isolated on public.freight_stop_prods;
drop policy if exists transport_module_isolated on public.freight_route_helpers;
drop policy if exists transport_module_isolated on public.logistics_recipients;
drop policy if exists transport_module_isolated on public.logistics_drivers;
drop policy if exists transport_module_isolated on public.logistics_vehicles;
drop policy if exists transport_module_isolated on public.logistics_settings;
drop policy if exists transport_module_isolated on public.extra_service_catalog;
drop policy if exists transport_module_isolated on public.extra_service_requests;
update public.production_stages set active = true where id = 'a407fc9b-4138-42e7-a4c5-0820b1779a0a';
alter table public.production_prods enable trigger production_prods_create_freight_demand;
commit;
-- Restaurar tambem a versao compativel da aplicacao; nao gerar fretes retroativos.

