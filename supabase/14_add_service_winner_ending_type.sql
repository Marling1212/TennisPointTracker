-- Allow "Service Winner" (serve in play, point won by server — not an ace).

alter table public.points drop constraint if exists points_ending_type_check;

alter table public.points
add constraint points_ending_type_check
check (
  ending_type is null
  or ending_type in (
    'Winner',
    'Unforced Error',
    'Forced Error',
    'Ace',
    'Service Winner',
    'Double Fault'
  )
);
