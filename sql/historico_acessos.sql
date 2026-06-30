-- WESAFER TOOLS v2.5
-- Histórico de movimentações com retenção de 30 dias

create table if not exists public.historico_acessos (
    id bigserial primary key,
    data_hora timestamptz not null default now(),
    tecnico text not null default '',
    site text not null default '',
    ticket text not null default '',
    empresa text not null default '',
    solicitante text not null default '',
    acao text not null default '',
    tipo_atividade text not null default '',
    status text not null default '',
    origem text not null default 'wesafer-tools',
    usuario text not null default '',
    acesso_id bigint,
    criado_em timestamptz not null default now()
);

create index if not exists idx_historico_acessos_data_hora
on public.historico_acessos (data_hora desc);

create index if not exists idx_historico_acessos_ticket
on public.historico_acessos (ticket);

create index if not exists idx_historico_acessos_status
on public.historico_acessos (status);

alter table public.historico_acessos enable row level security;

drop policy if exists "historico_acessos_select" on public.historico_acessos;
create policy "historico_acessos_select"
on public.historico_acessos
for select
to anon, authenticated
using (true);

drop policy if exists "historico_acessos_insert" on public.historico_acessos;
create policy "historico_acessos_insert"
on public.historico_acessos
for insert
to anon, authenticated
with check (true);

drop policy if exists "historico_acessos_delete" on public.historico_acessos;
create policy "historico_acessos_delete"
on public.historico_acessos
for delete
to anon, authenticated
using (true);

-- Limpeza manual/automática dos últimos 30 dias.
-- Pode ser executado pelo sistema ao abrir:
-- delete from public.historico_acessos
-- where data_hora < now() - interval '30 days';
