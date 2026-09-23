function cleanInputString(raw, unitRegex) {
  if (raw === null || raw === undefined) return '';
  let str = String(raw).trim();
  if (unitRegex) {
    str = str.replace(unitRegex, '').trim();
  }
  return str;
}

export function normalizeVitalInteger(raw, options, hindi = false) {
  const { fieldName, hindiFieldName, min, max, allowZero = true, unitRegex } = options;
  const name = hindi && hindiFieldName ? hindiFieldName : fieldName;

  const cleaned = cleanInputString(raw, unitRegex);
  if (!cleaned) {
    return { value: null, error: null };
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return {
      value: null,
      error: hindi ? `${name} एक मान्य संख्या होनी चाहिए।` : `${name} must be a valid number.`
    };
  }

  const intVal = Math.round(num);

  if (!allowZero && intVal === 0) {
    return {
      value: null,
      error: hindi ? `${name} शून्य नहीं हो सकता।` : `${name} cannot be zero.`
    };
  }

  if (min !== undefined && intVal < min) {
    return {
      value: null,
      error: hindi
        ? `${name} ${min}${max !== undefined ? ` से ${max}` : ' या अधिक'} होना चाहिए।`
        : `${name} must be ${max !== undefined ? `between ${min} and ${max}` : `at least ${min}`}.`
    };
  }

  if (max !== undefined && intVal > max) {
    return {
      value: null,
      error: hindi
        ? `${name} ${min !== undefined ? `${min} से ` : ''}${max} से अधिक नहीं हो सकता।`
        : `${name} must be ${min !== undefined ? `between ${min} and ${max}` : `at most ${max}`}.`
    };
  }

  return { value: intVal, error: null };
}

export function normalizeVitalDecimal(raw, options, hindi = false) {
  const { fieldName, hindiFieldName, min, max, precision = 1, allowZero = true, unitRegex } = options;
  const name = hindi && hindiFieldName ? hindiFieldName : fieldName;

  const cleaned = cleanInputString(raw, unitRegex);
  if (!cleaned) {
    return { value: null, error: null };
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return {
      value: null,
      error: hindi ? `${name} एक मान्य संख्या होनी चाहिए।` : `${name} must be a valid number.`
    };
  }

  const factor = Math.pow(10, precision);
  const rounded = Math.round(num * factor) / factor;

  if (!allowZero && rounded === 0) {
    return {
      value: null,
      error: hindi ? `${name} शून्य नहीं हो सकता।` : `${name} cannot be zero.`
    };
  }

  if (min !== undefined && rounded < min) {
    return {
      value: null,
      error: hindi
        ? `${name} ${min}${max !== undefined ? ` से ${max}` : ' या अधिक'} होना चाहिए।`
        : `${name} must be ${max !== undefined ? `between ${min} and ${max}` : `at least ${min}`}.`
    };
  }

  if (max !== undefined && rounded > max) {
    return {
      value: null,
      error: hindi
        ? `${name} ${min !== undefined ? `${min} से ` : ''}${max} से अधिक नहीं हो सकता।`
        : `${name} must be ${min !== undefined ? `between ${min} and ${max}` : `at most ${max}`}.`
    };
  }

  return { value: rounded, error: null };
}

export function normalizeSpO2(raw, hindi = false) {
  return normalizeVitalInteger(
    raw,
    {
      fieldName: 'SpO₂',
      hindiFieldName: 'SpO₂',
      min: 0,
      max: 100,
      allowZero: true,
      unitRegex: /%|percent/gi
    },
    hindi
  );
}

export function normalizePulse(raw, hindi = false) {
  return normalizeVitalInteger(
    raw,
    {
      fieldName: 'Pulse rate',
      hindiFieldName: 'नाड़ी दर',
      min: 0,
      max: 300,
      allowZero: true,
      unitRegex: /bpm|\/min/gi
    },
    hindi
  );
}

export function normalizeSystolicBP(raw, hindi = false) {
  return normalizeVitalInteger(
    raw,
    {
      fieldName: 'Systolic blood pressure',
      hindiFieldName: 'सिस्टोलिक रक्तचाप',
      min: 0,
      max: 350,
      allowZero: true,
      unitRegex: /mmhg/gi
    },
    hindi
  );
}

export function normalizeDiastolicBP(raw, systolic, hindi = false) {
  const result = normalizeVitalInteger(
    raw,
    {
      fieldName: 'Diastolic blood pressure',
      hindiFieldName: 'डायस्टोलिक रक्तचाप',
      min: 0,
      max: 250,
      allowZero: true,
      unitRegex: /mmhg/gi
    },
    hindi
  );

  if (result.value !== null && systolic !== null && systolic !== undefined && result.value > systolic) {
    return {
      value: result.value,
      error: hindi
        ? 'डायस्टोलिक रक्तचाप सिस्टोलिक से अधिक नहीं हो सकता।'
        : 'Diastolic blood pressure cannot exceed systolic blood pressure.'
    };
  }

  return result;
}

export function normalizeTemperature(raw, hindi = false) {
  return normalizeVitalDecimal(
    raw,
    {
      fieldName: 'Temperature',
      hindiFieldName: 'तापमान',
      min: 20.0,
      max: 50.0,
      precision: 1,
      allowZero: false,
      unitRegex: /°c|c|deg/gi
    },
    hindi
  );
}

export function normalizeWeight(raw, hindi = false) {
  return normalizeVitalDecimal(
    raw,
    {
      fieldName: 'Weight',
      hindiFieldName: 'वजन',
      min: 0.1,
      max: 500.0,
      precision: 1,
      allowZero: false,
      unitRegex: /kg|kgs/gi
    },
    hindi
  );
}

export function normalizeFollowUpDays(raw, hindi = false) {
  return normalizeVitalInteger(
    raw,
    {
      fieldName: 'Follow-up days',
      hindiFieldName: 'फॉलो-अप दिन',
      min: 0,
      max: 365,
      allowZero: true,
      unitRegex: /days|day/gi
    },
    hindi
  );
}

export function normalizeRespiratoryRate(raw, hindi = false) {
  return normalizeVitalInteger(
    raw,
    {
      fieldName: 'Respiratory rate',
      hindiFieldName: 'श्वसन दर',
      min: 0,
      max: 150,
      allowZero: true,
      unitRegex: /bpm|breaths\/min/gi
    },
    hindi
  );
}

export function normalizeHeight(raw, hindi = false) {
  return normalizeVitalDecimal(
    raw,
    {
      fieldName: 'Height',
      hindiFieldName: 'ऊंचाई',
      min: 10.0,
      max: 300.0,
      precision: 1,
      allowZero: false,
      unitRegex: /cm/gi
    },
    hindi
  );
}

export function normalizeGlucose(raw, hindi = false) {
  return normalizeVitalDecimal(
    raw,
    {
      fieldName: 'Blood glucose',
      hindiFieldName: 'रक्त शर्करा',
      min: 10.0,
      max: 1500.0,
      precision: 1,
      allowZero: false,
      unitRegex: /mg\/dl/gi
    },
    hindi
  );
}

export function validateAndNormalizeEncounterVitals(inputs, hindi = false) {
  const errors = {};

  const tempRes = normalizeTemperature(inputs.temperature, hindi);
  if (tempRes.error) errors.temperature = tempRes.error;

  const pulseRes = normalizePulse(inputs.pulse, hindi);
  if (pulseRes.error) errors.pulse = pulseRes.error;

  const sysRes = normalizeSystolicBP(inputs.systolic, hindi);
  if (sysRes.error) errors.systolic = sysRes.error;

  const diaRes = normalizeDiastolicBP(inputs.diastolic, sysRes.value, hindi);
  if (diaRes.error) errors.diastolic = diaRes.error;

  const spo2Res = normalizeSpO2(inputs.spo2, hindi);
  if (spo2Res.error) errors.spo2 = spo2Res.error;

  const weightRes = normalizeWeight(inputs.weight, hindi);
  if (weightRes.error) errors.weight = weightRes.error;

  const followUpRes = normalizeFollowUpDays(inputs.followUpDays, hindi);
  if (followUpRes.error) errors.followUpDays = followUpRes.error;

  return {
    values: {
      temperature_c: tempRes.value,
      pulse_bpm: pulseRes.value,
      systolic_bp: sysRes.value,
      diastolic_bp: diaRes.value,
      spo2_percent: spo2Res.value,
      weight_kg: weightRes.value,
      follow_up_in_days: followUpRes.value
    },
    errors,
    isValid: Object.keys(errors).length === 0
  };
}

export function formatDatabaseError(error, hindi = false) {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : error?.message ?? '';

  if (!msg) {
    return hindi ? 'एक अज्ञात त्रुटि हुई।' : 'An unexpected error occurred.';
  }

  if (msg.includes('valid_spo2') || msg.toLowerCase().includes('spo2')) {
    return hindi
      ? 'SpO₂ का मान 0% और 100% के बीच होना चाहिए।'
      : 'SpO₂ percentage must be between 0% and 100%.';
  }

  if (msg.includes('valid_follow_up') || msg.toLowerCase().includes('follow_up_in_days')) {
    return hindi
      ? 'फॉलो-अप दिन शून्य या उससे अधिक होने चाहिए।'
      : 'Follow-up in days must be 0 or greater.';
  }

  if (msg.includes('violates check constraint')) {
    return hindi
      ? 'दर्ज किए गए शारीरिक माप मान्य सीमा में नहीं हैं। कृपया जाँच कर पुनः प्रयास करें।'
      : 'Entered vital values are out of the allowed physiological range. Please correct and retry.';
  }

  return msg;
}
