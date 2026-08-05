create index chapters_purchase_id_idx on public.chapters(purchase_id)
where purchase_id is not null;
