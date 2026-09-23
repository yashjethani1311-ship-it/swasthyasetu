# SwasthyaSetu

Fresh implementation using the visual language/workflow style of V1, but **ZERO seeded healthcare data**.

## Non-negotiable rules
- No hardcoded doctor, lab, pharmacy, facility, medicine, price, insurance, report, diagnosis, prescription or patient history.
- Patient citizen flow is ABHA-first. Until official ABDM sandbox is connected, development uses a Temporary Care ID via Supabase Anonymous Auth. No fake ABHA success.
- Providers register dynamically and remain `PENDING` until verified.
- Patient-uploaded health records are private Supabase Storage objects and start `UNVERIFIED`.
- Insurance records are entered by the patient and start `UNVERIFIED`; there are no fake plans.
- Empty database = empty UI.

## Setup
1. Create/use your Supabase project.
2. SQL Editor: run `supabase/001_clean_core.sql`.
3. Supabase Dashboard -> Authentication -> Providers -> enable **Anonymous Sign-Ins** for Temporary Care ID development.
4. For fast prototype provider registration, either disable email confirmation temporarily or confirm provider emails before login.
5. Copy `.env.example` to `.env.local` and add your project URL + publishable key.
6. `npm install`
7. `npm run dev`

## First real test
1. Open Citizen access -> Temporary Care ID.
2. Create your patient profile from scratch.
3. Upload a PDF/image under Health Records. It is stored privately and appears as UNVERIFIED.
4. Add an insurance policy only if you really have one; otherwise page stays empty.
5. Register a real/test doctor through Healthcare professional -> Register.
6. Approve that provider deliberately via admin workflow/SQL (admin UI comes next).
7. After approval, the patient can see that doctor in the live directory and request an appointment.

## Next build order
1. Admin verification UI for providers/facilities.
2. Consultation/encounter workspace.
3. Doctor-written prescription and pharmacy dispense.
4. Doctor lab order -> lab processing -> report -> review CareGap.
5. CareGraph / CareGap / Resolution Engine.
6. AI/OCR/voice stack on actual stored records.
7. Official ABDM sandbox adapter.
