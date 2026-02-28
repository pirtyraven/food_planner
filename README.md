# Veckoplanering Mat

En enkel dashboard för familjens veckoplanering av mat.

## Funktioner
- Välj vecka (`YYYY-Www`)
- Lägg till nya maträtter i veckokortet (namn + ingredienser)
- Välj exakt 4 rätter för veckan
- Automatisk inköpslista baserat på ingredienser
- Lägg till/radera maträtter
- Klickbar `ingredienser`-text per maträtt som öppnar popup med detaljer
- 20 exempelrätter inlagda från start
- Viktad slump för veckans standardrätter (prioriterar rätter som inte valts på länge)
- Checkbox-val i maträttslistan för snabb i/ur-markering
- Autogenererad inköpslista som kan justeras manuellt (lägg till/ta bort)
- Återställning av ingredienslistan till autogenererat läge
- Checkbox i inköpslistan för att markera köpta ingredienser (gråas ut)

## Starta lokalt
Öppna `index.html` direkt i webbläsaren.

Om ni vill köra via lokal server:

```bash
python3 -m http.server 8000
```

Öppna sedan `http://localhost:8000`.

## Gemensam synk (Supabase)
Appen är konfigurerad för Supabase-projektet `fpjxossedqvcetgoppwg` och delar data via `family_id` = `per-familj`.

Kör detta en gång i Supabase SQL Editor:

```sql
create table if not exists public.family_plans (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.family_plans enable row level security;

drop policy if exists "family_plans_public_rw" on public.family_plans;
create policy "family_plans_public_rw"
on public.family_plans
for all
to anon
using (id = 'per-familj')
with check (id = 'per-familj');
```

När tabellen/policyn finns:
- Publicera filerna (t.ex. GitHub Pages).
- Öppna samma URL på båda enheterna.
- Ändringar synkas automatiskt (sparas direkt och hämtas periodiskt).

## Rullande schema
- Varje vecka får automatiskt en slumpad standardkombination.
- Slumpen viktas så att rätter som inte valts på länge har större chans att komma med.
- I `Maträtter` kan ni checka i/ur rätter för att anpassa veckan.
- Knappen `Återställ till standard för veckan` återställer veckans val till standardkombinationen.

## Ingredienser
- Inköpslistan skapas automatiskt från veckans valda rätter.
- Du kan lägga till en egen ingrediens i inköpskortet.
- `Ta bort` på en ingrediens döljer den för aktuell vecka.
- Checkbox på ingrediens markerar den som köpt och gråar ut raden.
- Knappen `Återställ ingredienser` tar bort manuella justeringar och visar bara autogenererade ingredienser igen.
