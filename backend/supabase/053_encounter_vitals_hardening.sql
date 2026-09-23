-- Migration 053: Defensive encounter vitals normalization and validation
-- Preserves existing valid_spo2 constraint while adding defensive trigger and RPC normalization
begin;

-- Function to validate and defensively normalize encounter vitals before insert or update
create or replace function c1_normalize_encounter_vitals()
returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
begin
  -- Validate SpO2 percentage range [0, 100] when provided
  if new.spo2_percent is not null then
    if new.spo2_percent < 0 or new.spo2_percent > 100 then
      raise exception 'SpO2 percentage must be between 0 and 100';
    end if;
  end if;

  -- Validate follow-up in days (>= 0) when provided
  if new.follow_up_in_days is not null then
    if new.follow_up_in_days < 0 then
      raise exception 'Follow-up in days must be 0 or greater';
    end if;
    if new.follow_up_in_days > 365 then
      raise exception 'Follow-up in days cannot exceed 365';
    end if;
  end if;

  -- Validate pulse rate
  if new.pulse_bpm is not null then
    if new.pulse_bpm < 0 or new.pulse_bpm > 300 then
      raise exception 'Pulse rate must be between 0 and 300 bpm';
    end if;
  end if;

  -- Validate systolic blood pressure
  if new.systolic_bp is not null then
    if new.systolic_bp < 0 or new.systolic_bp > 350 then
      raise exception 'Systolic blood pressure must be between 0 and 350 mmHg';
    end if;
  end if;

  -- Validate diastolic blood pressure
  if new.diastolic_bp is not null then
    if new.diastolic_bp < 0 or new.diastolic_bp > 250 then
      raise exception 'Diastolic blood pressure must be between 0 and 250 mmHg';
    end if;
    if new.systolic_bp is not null and new.diastolic_bp > new.systolic_bp then
      raise exception 'Diastolic blood pressure cannot exceed systolic blood pressure';
    end if;
  end if;

  -- Validate temperature in Celsius
  if new.temperature_c is not null then
    if new.temperature_c < 20.0 or new.temperature_c > 50.0 then
      raise exception 'Temperature must be between 20.0°C and 50.0°C';
    end if;
  end if;

  -- Validate weight in kg
  if new.weight_kg is not null then
    if new.weight_kg <= 0 or new.weight_kg > 500.0 then
      raise exception 'Weight must be between 0.1 and 500 kg';
    end if;
  end if;

  return new;
end $$;

-- Drop trigger if exists and recreate
drop trigger if exists c1_encounter_vitals_trigger on public.encounters;
create trigger c1_encounter_vitals_trigger
  before insert or update of spo2_percent, follow_up_in_days, pulse_bpm, systolic_bp, diastolic_bp, temperature_c, weight_kg
  on public.encounters
  for each row
  execute function c1_normalize_encounter_vitals();

-- Defensive RPC for updating encounter vitals
create or replace function c1_update_encounter_vitals(p_encounter uuid, p_vitals jsonb)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare
  e encounters;
  v_spo2 text;
  v_pulse text;
  v_sys text;
  v_dia text;
  v_temp text;
  v_weight text;
  v_fup text;

  n_spo2 integer := null;
  n_pulse integer := null;
  n_sys integer := null;
  n_dia integer := null;
  n_temp numeric := null;
  n_weight numeric := null;
  n_fup integer := null;
begin
  select * into e from encounters where id=p_encounter for update;
  if not found or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then
    raise exception 'Encounter not authorized';
  end if;
  if e.status <> 'IN_PROGRESS' then
    raise exception 'Encounter is not in progress';
  end if;

  if p_vitals is not null and jsonb_typeof(p_vitals) = 'object' then
    -- Normalize SpO2: convert blank, null, or empty string to NULL
    v_spo2 := trim(coalesce(p_vitals->>'spo2_percent', p_vitals->>'spo2', ''));
    v_spo2 := regexp_replace(v_spo2, '[% ]', '', 'g');
    if v_spo2 <> '' then
      begin
        n_spo2 := round(v_spo2::numeric)::integer;
      exception when others then
        raise exception 'SpO2 percentage must be a valid integer';
      end;
      if n_spo2 < 0 or n_spo2 > 100 then
        raise exception 'SpO2 percentage must be between 0 and 100';
      end if;
    end if;

    -- Normalize pulse
    v_pulse := trim(coalesce(p_vitals->>'pulse_bpm', p_vitals->>'pulse', ''));
    v_pulse := regexp_replace(v_pulse, '[^0-9.-]', '', 'g');
    if v_pulse <> '' then
      begin
        n_pulse := round(v_pulse::numeric)::integer;
      exception when others then
        raise exception 'Pulse must be a valid integer';
      end;
      if n_pulse < 0 or n_pulse > 300 then
        raise exception 'Pulse rate must be between 0 and 300 bpm';
      end if;
    end if;

    -- Normalize systolic
    v_sys := trim(coalesce(p_vitals->>'systolic_bp', p_vitals->>'systolic', ''));
    v_sys := regexp_replace(v_sys, '[^0-9.-]', '', 'g');
    if v_sys <> '' then
      begin
        n_sys := round(v_sys::numeric)::integer;
      exception when others then
        raise exception 'Systolic BP must be a valid integer';
      end;
      if n_sys < 0 or n_sys > 350 then
        raise exception 'Systolic blood pressure must be between 0 and 350 mmHg';
      end if;
    end if;

    -- Normalize diastolic
    v_dia := trim(coalesce(p_vitals->>'diastolic_bp', p_vitals->>'diastolic', ''));
    v_dia := regexp_replace(v_dia, '[^0-9.-]', '', 'g');
    if v_dia <> '' then
      begin
        n_dia := round(v_dia::numeric)::integer;
      exception when others then
        raise exception 'Diastolic BP must be a valid integer';
      end;
      if n_dia < 0 or n_dia > 250 then
        raise exception 'Diastolic blood pressure must be between 0 and 250 mmHg';
      end if;
      if n_sys is not null and n_dia > n_sys then
        raise exception 'Diastolic blood pressure cannot exceed systolic blood pressure';
      end if;
    end if;

    -- Normalize temperature
    v_temp := trim(coalesce(p_vitals->>'temperature_c', p_vitals->>'temperature', ''));
    v_temp := regexp_replace(v_temp, '[^0-9.-]', '', 'g');
    if v_temp <> '' then
      begin
        n_temp := round(v_temp::numeric, 1);
      exception when others then
        raise exception 'Temperature must be a valid number';
      end;
      if n_temp < 20.0 or n_temp > 50.0 then
        raise exception 'Temperature must be between 20.0°C and 50.0°C';
      end if;
    end if;

    -- Normalize weight
    v_weight := trim(coalesce(p_vitals->>'weight_kg', p_vitals->>'weight', ''));
    v_weight := regexp_replace(v_weight, '[^0-9.-]', '', 'g');
    if v_weight <> '' then
      begin
        n_weight := round(v_weight::numeric, 1);
      exception when others then
        raise exception 'Weight must be a valid number';
      end;
      if n_weight <= 0 or n_weight > 500.0 then
        raise exception 'Weight must be between 0.1 and 500 kg';
      end if;
    end if;

    -- Normalize follow_up_in_days
    v_fup := trim(coalesce(p_vitals->>'follow_up_in_days', p_vitals->>'followUpDays', ''));
    v_fup := regexp_replace(v_fup, '[^0-9.-]', '', 'g');
    if v_fup <> '' then
      begin
        n_fup := round(v_fup::numeric)::integer;
      exception when others then
        raise exception 'Follow-up days must be a valid integer';
      end;
      if n_fup < 0 or n_fup > 365 then
        raise exception 'Follow-up in days must be between 0 and 365';
      end if;
    end if;
  end if;

  update encounters set
    spo2_percent = n_spo2,
    pulse_bpm = n_pulse,
    systolic_bp = n_sys,
    diastolic_bp = n_dia,
    temperature_c = n_temp,
    weight_kg = n_weight,
    follow_up_in_days = n_fup,
    updated_at = now()
  where id = e.id
  returning * into e;

  return to_jsonb(e);
end $$;

revoke all on function c1_normalize_encounter_vitals() from public, anon, authenticated;
revoke all on function c1_update_encounter_vitals(uuid, jsonb) from public, anon;
grant execute on function c1_update_encounter_vitals(uuid, jsonb) to authenticated;

commit;
