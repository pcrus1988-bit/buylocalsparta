-- MAZI paid service allowance foundation. No paid periods are issued by this migration.
-- 1 token = EUR 1 of MAZI internal catalogue value; non-monetary, non-refundable, non-transferable.
-- Subscription payment must be independently verified before admin issues a billing period.
create table if not exists public.mazi_service_catalog (
  id text primary key check (id ~ '^[a-z0-9-]{3,64}$'),
  title text not null,
  category text not null,
  description text not null,
  deliverable text not null,
  turnaround_business_days integer not null check (turnaround_business_days between 1 and 30),
  revisions_included integer not null default 1 check (revisions_included between 0 and 3),
  tokens integer not null check (tokens between 5 and 250),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.mazi_service_catalog
(id,title,category,description,deliverable,turnaround_business_days,revisions_included,tokens) values
('consult-30','Συμβουλευτική ανάπτυξης · 30′','Στρατηγική','Ατομική τηλεσυνάντηση με συμβουλές για την επιχείρησή σου.','30 λεπτά και γραπτή λίστα 3 ενεργειών.',5,0,30),
('consult-60','Συμβουλευτική ανάπτυξης · 60′','Στρατηγική','Ανάλυση συγκεκριμένης επιχειρηματικής πρόκλησης.','60 λεπτά και συνοπτικό πλάνο ενεργειών.',5,0,55),
('competitor-mini','Μικρή ανάλυση ανταγωνισμού','Στρατηγική','Δημόσια στοιχεία για έως 3 άμεσους ανταγωνιστές.','PDF 2–3 σελίδων με ευκαιρίες διαφοροποίησης.',7,1,65),
('pricing-review','Έλεγχος τιμολόγησης 5 ειδών','Στρατηγική','Έλεγχος δημοσίων τιμών και τοποθέτησης έως 5 προϊόντων.','Πίνακας σύγκρισης και προτάσεις. Όχι λογιστική συμβουλή.',7,1,45),
('google-profile-audit','Έλεγχος Google Business Profile','Τοπική παρουσία','Έλεγχος δημόσιων στοιχείων, φωτογραφιών και περιγραφών.','Σύντομη λίστα έως 10 διορθώσεων.',5,1,30),
('google-profile-opt','Βελτίωση Google Business Profile','Τοπική παρουσία','Προτεινόμενα κείμενα, κατηγορίες και υπηρεσίες. Απαιτείται εξουσιοδοτημένη πρόσβαση για δημοσίευση.','Πακέτο βελτίωσης μιας καταχώρισης· καμία εγγύηση θέσης.',7,1,65),
('social-4','Πακέτο 4 αναρτήσεων social','Περιεχόμενο','4 δημιουργικά με λεζάντες από υλικό και οδηγίες του μέλους.','4 αρχεία εικόνας και 4 λεζάντες, 1 γύρος διορθώσεων.',7,1,60),
('social-8','Πακέτο 8 αναρτήσεων social','Περιεχόμενο','8 δημιουργικά και λεζάντες από υλικό του μέλους.','8 αρχεία εικόνας και 8 λεζάντες, 1 γύρος διορθώσεων.',10,1,110),
('social-stories-5','5 δημιουργικά Stories','Περιεχόμενο','Μικρό πακέτο Instagram/Facebook stories.','5 στατικά κάθετα δημιουργικά, 1 γύρος διορθώσεων.',7,1,40),
('reel-edit','Μοντάζ Reel έως 30″','Περιεχόμενο','Μοντάζ από πλάνα του μέλους· όχι επιτόπια βιντεοσκόπηση.','1 κάθετο βίντεο έως 30″ με υπότιτλους.',10,1,95),
('photo-edit-10','Επεξεργασία 10 φωτογραφιών','Περιεχόμενο','Βασική διόρθωση χρωμάτων και κάδρου σε φωτογραφίες του μέλους.','10 έτοιμες ψηφιακές εικόνες, χωρίς νέο φωτογραφικό υλικό.',7,1,40),
('flyer-design','Σχεδιασμός αφίσας A4','Design','Δημιουργία έντυπου ή ψηφιακού μονόφυλλου.','1 τελικό PDF/A4 και 1 αρχείο web, χωρίς εκτύπωση.',7,1,45),
('menu-2pages','Σχεδιασμός μενού 2 σελίδων','Design','Αισθητική διαμόρφωση μενού από έτοιμες τιμές και κείμενα του μέλους.','PDF έως 2 σελίδων, χωρίς εκτύπωση.',10,1,75),
('business-card','Σχεδιασμός επαγγελματικής κάρτας','Design','Διπλής όψης επαγγελματική κάρτα.','1 εκτυπώσιμο PDF και PNG προεπισκόπησης.',7,1,35),
('seo-mini-audit','SEO έλεγχος 5 σελίδων','Ψηφιακή παρουσία','Τεχνικός έλεγχος πέντε δημόσιων URL.','Λίστα 10 ενεργειών προτεραιότητας· όχι εγγύηση κατάταξης.',10,1,70),
('product-copy-5','Περιγραφές 5 προϊόντων','Ψηφιακή παρουσία','Περιγραφές για έως 5 υπάρχοντα προϊόντα με στοιχεία του μέλους.','5 κείμενα τίτλου και περιγραφής.',7,1,40),
('product-copy-15','Περιγραφές 15 προϊόντων','Ψηφιακή παρουσία','Βελτίωση τίτλων και περιγραφών 15 προϊόντων.','15 ζεύγη τίτλου/περιγραφής, 1 αναθεώρηση.',10,1,100),
('newsletter','Δημιουργία newsletter','Καμπάνιες','Σύνταξη και δημιουργικό μίας αποστολής από τις οδηγίες του μέλους.','1 θέμα, κείμενο και HTML/email mockup· χωρίς αποστολή.',7,1,65),
('meta-campaign-setup','Δομή καμπάνιας Meta Ads','Καμπάνιες','Σχεδιασμός μίας καμπάνιας, κοινών και έως 2 διαφημίσεων.','Πρόταση ή ρύθμιση κατόπιν πρόσβασης· εκτός διαφημιστικής δαπάνης.',10,1,90),
('google-ads-setup','Δομή καμπάνιας Google Ads','Καμπάνιες','Δομή μίας Search καμπάνιας και προτεινόμενες λέξεις κλειδιά.','Πρόταση ή ρύθμιση κατόπιν πρόσβασης· εκτός διαφημιστικής δαπάνης.',10,1,100),
('landing-copy','Κείμενο landing page','Ψηφιακή παρουσία','Σύνταξη μίας σελίδας προώθησης βάσει στοιχείων του μέλους.','Έως 650 λέξεις, τίτλοι, CTA και μετα-περιγραφή, χωρίς κατασκευή.',10,1,80),
('translation-500','Μετάφραση έως 500 λέξεων','Περιεχόμενο','Μετάφραση γενικού εμπορικού κειμένου Ελληνικά–Αγγλικά.','Ένα κείμενο έως 500 λέξεων· όχι πιστοποιημένη μετάφραση.',7,1,45)
on conflict (id) do nothing;

create table if not exists public.mazi_service_periods (
 id uuid primary key default gen_random_uuid(),
 member_user_id uuid not null references public.mazi_members(user_id),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 allowance_tokens integer not null default 250 check (allowance_tokens=250),
 verified_invoice_ref text not null unique check (char_length(trim(verified_invoice_ref)) between 8 and 160),
 issued_by uuid not null references auth.users(id),
 issued_at timestamptz not null default now(),
 check (ends_at>starts_at and ends_at <= starts_at + interval '32 days' and ends_at >= starts_at + interval '27 days')
);
create index if not exists mazi_service_period_member_idx on public.mazi_service_periods(member_user_id,ends_at desc);

create table if not exists public.mazi_service_requests (
 id uuid primary key default gen_random_uuid(),
 member_user_id uuid not null references public.mazi_members(user_id),
 period_id uuid not null references public.mazi_service_periods(id),
 service_id text not null references public.mazi_service_catalog(id),
 service_title_snapshot text not null,
 token_price integer not null check (token_price between 5 and 250),
 brief text not null check (char_length(trim(brief)) between 20 and 3000),
 idempotency_key uuid not null,
 status text not null default 'requested' check (status in ('requested','accepted','in_progress','completed','rejected','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 admin_note text,
 handled_by uuid references auth.users(id),
 unique(member_user_id,idempotency_key)
);
create index if not exists mazi_service_requests_period_idx on public.mazi_service_requests(period_id,status);
create index if not exists mazi_service_requests_member_idx on public.mazi_service_requests(member_user_id,created_at desc);

create table if not exists public.mazi_service_events (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.mazi_service_requests(id),
 actor_user_id uuid not null references auth.users(id),
 action text not null check (action in ('reserved','accepted','started','completed','rejected','cancelled')),
 token_delta integer not null,
 note text,
 occurred_at timestamptz not null default now()
);

alter table public.mazi_service_catalog enable row level security;
alter table public.mazi_service_periods enable row level security;
alter table public.mazi_service_requests enable row level security;
alter table public.mazi_service_events enable row level security;
revoke all on public.mazi_service_catalog,public.mazi_service_periods,public.mazi_service_requests,public.mazi_service_events from public,anon,authenticated;
grant select on public.mazi_service_catalog to anon,authenticated;
grant select on public.mazi_service_periods,public.mazi_service_requests,public.mazi_service_events to authenticated;

create policy "mazi_services_catalogue_read" on public.mazi_service_catalog
 for select to anon,authenticated using (is_active or (select public.mazi_is_administrator()));
create policy "mazi_services_period_private" on public.mazi_service_periods
 for select to authenticated using (member_user_id=(select auth.uid()) or (select public.mazi_is_administrator()));
create policy "mazi_services_requests_private" on public.mazi_service_requests
 for select to authenticated using (member_user_id=(select auth.uid()) or (select public.mazi_is_administrator()));
create policy "mazi_services_events_private" on public.mazi_service_events
 for select to authenticated using (
   exists(select 1 from public.mazi_service_requests r where r.id=request_id
    and (r.member_user_id=(select auth.uid()) or (select public.mazi_is_administrator())))
 );

-- Service periods are issued by a real administrator ONLY after independent invoice/payment verification.
-- Explicit member row lock serializes simultaneous period issuances.
create or replace function public.mazi_services_issue_period(
 p_member uuid,p_starts timestamptz,p_ends timestamptz,p_verified_invoice_ref text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_uid uuid := (select auth.uid());
begin
 if v_uid is null or not public.mazi_is_administrator() then raise exception 'not_authorized'; end if;
 if p_verified_invoice_ref is null or char_length(trim(p_verified_invoice_ref)) not between 8 and 160 then raise exception 'invoice_reference_required'; end if;
 if p_starts is null or p_ends is null or p_ends<=p_starts or p_ends>p_starts+interval '32 days' or p_ends<p_starts+interval '27 days' then
    raise exception 'invalid_billing_period';
 end if;
 perform 1 from public.mazi_members m join public.mazi_membership_applications a on a.id=m.application_id
  where m.user_id=p_member and m.status='verified' and m.identity_verified_at is not null
    and a.status='approved' for update of m;
 if not found then raise exception 'member_not_eligible'; end if;
 select id into v_id from public.mazi_service_periods where verified_invoice_ref=p_verified_invoice_ref;
 if found then
   if not exists(select 1 from public.mazi_service_periods where id=v_id and member_user_id=p_member and starts_at=p_starts and ends_at=p_ends)
    then raise exception 'invoice_reference_conflict'; end if;
   return v_id;
 end if;
 if exists(select 1 from public.mazi_service_periods where member_user_id=p_member
  and starts_at<p_ends and ends_at>p_starts) then raise exception 'overlapping_period'; end if;
 insert into public.mazi_service_periods(member_user_id,starts_at,ends_at,verified_invoice_ref,issued_by)
 values(p_member,p_starts,p_ends,trim(p_verified_invoice_ref),v_uid) returning id into v_id;
 insert into public.mazi_audit_events(actor_user_id,entity_type,entity_id,action,evidence)
 values(v_uid,'mazi_service_period',v_id,'issued',jsonb_build_object('member_user_id',p_member,'starts_at',p_starts,'ends_at',p_ends,'reference',p_verified_invoice_ref,'tokens',250));
 return v_id;
end $$;

create or replace function public.mazi_services_request(
 p_service_id text,p_brief text,p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_period uuid; v_price integer; v_title text; v_spent integer; v_id uuid;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if p_idempotency_key is null or char_length(trim(coalesce(p_brief,''))) not between 20 and 3000 then raise exception 'invalid_request'; end if;
 if not exists (
   select 1 from public.mazi_members m join public.mazi_membership_applications a on a.id=m.application_id
    where m.user_id=v_uid and m.status='verified' and m.identity_verified_at is not null and a.status='approved'
 ) then raise exception 'member_not_eligible'; end if;
 -- Serialize the balance by locking one paid period row for the whole request transaction.
 select id into v_period from public.mazi_service_periods where member_user_id=v_uid
  and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
  order by starts_at desc limit 1 for update;
 if v_period is null then raise exception 'allowance_inactive'; end if;
 select id into v_id from public.mazi_service_requests
  where member_user_id=v_uid and idempotency_key=p_idempotency_key;
 if found then return v_id; end if;
 select tokens,title into v_price,v_title from public.mazi_service_catalog where id=p_service_id and is_active=true;
 if v_price is null then raise exception 'unknown_service'; end if;
 select coalesce(sum(token_price),0)::integer into v_spent from public.mazi_service_requests
  where period_id=v_period and status in ('requested','accepted','in_progress','completed');
 if v_spent+v_price>250 then raise exception 'insufficient_tokens'; end if;
 insert into public.mazi_service_requests(member_user_id,period_id,service_id,service_title_snapshot,token_price,brief,idempotency_key)
 values(v_uid,v_period,p_service_id,v_title,v_price,trim(p_brief),p_idempotency_key) returning id into v_id;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta)
 values(v_id,v_uid,'reserved',-v_price);
 return v_id;
end $$;

create or replace function public.mazi_services_cancel_request(p_request uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_row public.mazi_service_requests%rowtype; v_uid uuid := (select auth.uid());
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 select * into v_row from public.mazi_service_requests where id=p_request for update;
 if not found or v_row.member_user_id<>v_uid or v_row.status<>'requested' then raise exception 'cannot_cancel'; end if;
 update public.mazi_service_requests set status='cancelled',updated_at=now() where id=p_request;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta)
 values(p_request,v_uid,'cancelled',v_row.token_price);
 return true;
end $$;

create or replace function public.mazi_services_admin_transition(
 p_request uuid,p_status text,p_note text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_row public.mazi_service_requests%rowtype; v_uid uuid := (select auth.uid()); v_event text; v_delta integer := 0;
begin
 if v_uid is null or not public.mazi_is_administrator() then raise exception 'not_authorized'; end if;
 if char_length(coalesce(p_note,''))>2000 then raise exception 'note_too_long'; end if;
 select * into v_row from public.mazi_service_requests where id=p_request for update;
 if not found then raise exception 'unknown_request'; end if;
 if not (
   (v_row.status='requested' and p_status in ('accepted','rejected')) or
   (v_row.status='accepted' and p_status in ('in_progress','completed','cancelled')) or
   (v_row.status='in_progress' and p_status in ('completed','cancelled'))
 ) then raise exception 'invalid_transition'; end if;
 if p_status in ('rejected','cancelled') and char_length(trim(coalesce(p_note,'')))<10 then
    raise exception 'reason_required';
 end if;
 v_delta := case when p_status in ('rejected','cancelled') then v_row.token_price else 0 end;
 v_event := case p_status when 'accepted' then 'accepted' when 'in_progress' then 'started' else p_status end;
 update public.mazi_service_requests
  set status=p_status,updated_at=now(),handled_by=v_uid,admin_note=nullif(trim(coalesce(p_note,'')),''),
      completed_at=case when p_status='completed' then now() else completed_at end
  where id=p_request;
 insert into public.mazi_service_events(request_id,actor_user_id,action,token_delta,note)
 values(p_request,v_uid,v_event,v_delta,p_note);
 return true;
end $$;

revoke all on function public.mazi_services_issue_period(uuid,timestamptz,timestamptz,text) from public,anon;
revoke all on function public.mazi_services_request(text,text,uuid) from public,anon;
revoke all on function public.mazi_services_cancel_request(uuid) from public,anon;
revoke all on function public.mazi_services_admin_transition(uuid,text,text) from public,anon;
grant execute on function public.mazi_services_issue_period(uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.mazi_services_request(text,text,uuid) to authenticated;
grant execute on function public.mazi_services_cancel_request(uuid) to authenticated;
grant execute on function public.mazi_services_admin_transition(uuid,text,text) to authenticated;